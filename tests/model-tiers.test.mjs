import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  catalogPathFromToml,
  codexHome,
  loadCodexCatalog,
  pickTierModel,
  resolveModel,
  resolveTiers,
  tierOfSlug,
} from "../scripts/model-tiers.mjs";
import { registrationPlan } from "../hooks/codex-agent.js";

const FAKE = new URL("./fixtures/fake-codex", import.meta.url).pathname;
const TIERS_CLI = new URL("../scripts/codex-tiers.mjs", import.meta.url).pathname;

// Example catalogs. These slugs are test data, not routing defaults.
const OPENAI = [
  { slug: "gpt-6.1-sol", visibility: "list", priority: 1 },
  { slug: "gpt-6-astra", visibility: "list", priority: 2 },
  { slug: "gpt-6-sol", visibility: "list", priority: 4 },
  { slug: "gpt-reserve", visibility: "hide", priority: 4 },
  { slug: "gpt-6-luna", visibility: "list", priority: 5 },
  { slug: "gpt-5.6-sol", visibility: "list", priority: 6 },
  { slug: "codex-auto-review", visibility: "hide", priority: 43 },
];
// A proxy that allows only prefixed names and has no Astra.
const PROXY = [
  { slug: "cousin-full-service/gpt-6.1-sol", visibility: "list", priority: 1 },
  { slug: "cousin-full-service/gpt-6-luna", visibility: "list", priority: 5 },
];
const loaded = (models) => () => ({ models, source: "test catalog" });

function scratch(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "cdx-tiers-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a slug's tier is its last word, after any provider prefix or version", () => {
  assert.equal(tierOfSlug("gpt-6.1-sol"), "sol");
  assert.equal(tierOfSlug("cousin-full-service/gpt-6-luna"), "luna");
  assert.equal(tierOfSlug("gpt-6.1-sol-2026-09-29"), "sol");
  assert.equal(tierOfSlug("gpt-5.3-codex-spark"), "spark");
  for (const slug of ["gpt-reserve", "codex-auto-review", "gpt-daybreak-blue-latest", "sol-rewriter-pro"]) {
    assert.equal(tierOfSlug(slug), null, slug);
  }
});

test("the catalog's first-priority model wins a tier, listed before hidden, newer version on a tie", () => {
  assert.equal(pickTierModel(OPENAI, "sol").slug, "gpt-6.1-sol");
  const tie = [{ slug: "gpt-6-sol" }, { slug: "gpt-6.1-sol" }, { slug: "gpt-7-sol", visibility: "hide" }];
  assert.equal(pickTierModel(tie, "sol").slug, "gpt-6.1-sol");
  assert.equal(pickTierModel(OPENAI, "terra"), null);
});

test("prefixed proxy names resolve Sol and Luna as the proxy lists them", () => {
  const r = resolveTiers(["sol", "luna"], { env: {}, load: loaded(PROXY) });
  assert.equal(r.sol.model, "cousin-full-service/gpt-6.1-sol");
  assert.equal(r.luna.model, "cousin-full-service/gpt-6-luna");
});

test("a missing tier is an error naming the catalog, its models, and the override", () => {
  const r = resolveModel("astra", { env: {}, load: loaded(PROXY) });
  assert.equal(r.model, undefined);
  assert.match(r.error, /no astra model in this machine's Codex catalog \(test catalog; models: cousin-full-service\/gpt-6\.1-sol/);
  assert.match(r.error, /CDX_MODEL_ASTRA/);
});

test("CDX_MODEL_<TIER> wins without reading the catalog; a model id passes through", () => {
  const never = () => assert.fail("catalog read");
  assert.deepEqual(resolveModel("astra", { env: { CDX_MODEL_ASTRA: "proxy/astra-x" }, load: never }),
    { model: "proxy/astra-x", tier: "astra", source: "CDX_MODEL_ASTRA" });
  assert.deepEqual(resolveModel("some-model-id", { env: {}, load: never }), { model: "some-model-id" });
});

test("an unreadable catalog is an error, never a guessed name", () => {
  const r = resolveModel("sol", { env: {}, load: () => ({ error: "codex not found" }) });
  assert.match(r.error, /cannot resolve the sol tier: codex not found/);
});

test("model_catalog_json is read from config.toml's top level, with Windows paths in either string form", () => {
  assert.equal(catalogPathFromToml('model = "x"\nmodel_catalog_json = "C:\\\\Users\\\\PC\\\\.codex\\\\proxy-model-catalog.json"\n'),
    "C:\\Users\\PC\\.codex\\proxy-model-catalog.json");
  assert.equal(catalogPathFromToml("model_catalog_json = 'C:\\Users\\PC\\.codex\\proxy-model-catalog.json'\r\n"),
    "C:\\Users\\PC\\.codex\\proxy-model-catalog.json");
  assert.equal(catalogPathFromToml('model_catalog_json = "C:\\Users\\PC\\catalog.json"\n'), "C:\\Users\\PC\\catalog.json");
  assert.equal(catalogPathFromToml('developer_instructions = """\nmodel_catalog_json = "example.json"\n[x]\n"""\nmodel = "m"\n'), null);
  assert.equal(catalogPathFromToml('[profiles.p]\nmodel_catalog_json = "p.json"\n'), null);
  assert.equal(catalogPathFromToml(null), null);
});

test("CODEX_HOME names the Codex home when set", () => {
  assert.equal(codexHome({ CODEX_HOME: "/x/codex" }), "/x/codex");
  assert.match(codexHome({}), /\.codex$/);
});

test("the catalog comes from `codex debug models`, with -c overrides passed through", (t) => {
  const dir = scratch(t);
  const catalog = path.join(dir, "catalog.json");
  writeFileSync(catalog, JSON.stringify({ models: PROXY }));
  const argsFile = path.join(dir, "args.txt");
  const env = { ...process.env, FAKE_CODEX_CATALOG: catalog, FAKE_CODEX_DEBUG_ARGS_FILE: argsFile, CODEX_HOME: dir };
  const r = loadCodexCatalog({ bin: FAKE, overrides: ['model="x"'], env });
  assert.equal(r.source, `${FAKE} debug models`);
  assert.deepEqual(r.models.map((m) => m.slug), PROXY.map((m) => m.slug));
});

// Codex 0.165 lists its built-in models beside a configured catalog.
function mixedCatalogHome(t) {
  const home = scratch(t);
  writeFileSync(path.join(home, "config.toml"), 'model = "cousin-full-service/gpt-6.1-sol"\nmodel_catalog_json = "proxy-model-catalog.json"\n');
  writeFileSync(path.join(home, "proxy-model-catalog.json"), JSON.stringify({ models: PROXY }));
  const debugList = path.join(home, "debug-models.json");
  writeFileSync(debugList, JSON.stringify({ models: [...OPENAI, ...PROXY] }));
  const argsFile = path.join(home, "debug-args.txt");
  const env = { ...process.env, CDX_CODEX_BIN: FAKE, CODEX_HOME: home, FAKE_CODEX_CATALOG: debugList, FAKE_CODEX_DEBUG_ARGS_FILE: argsFile };
  for (const tier of ["SOL", "LUNA", "ASTRA"]) delete env[`CDX_MODEL_${tier}`];
  return { home, env, argsFile };
}

test("a configured model_catalog_json is the whole catalog, even when `codex debug models` adds built-in names", (t) => {
  const { home, env, argsFile } = mixedCatalogHome(t);
  const r = spawnSync(process.execPath, [TIERS_CLI, "--json"], { encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const file = path.join(home, "proxy-model-catalog.json");
  assert.deepEqual(out.catalog, { source: file });
  assert.deepEqual(out.tiers.sol, { model: "cousin-full-service/gpt-6.1-sol", tier: "sol", source: file });
  assert.deepEqual(out.tiers.luna, { model: "cousin-full-service/gpt-6-luna", tier: "luna", source: file });
  assert.match(out.tiers.astra.error, /no astra model in this machine's Codex catalog/);
  assert.equal(existsSync(argsFile), false, "codex debug models ran");
  const plan = Object.fromEntries(registrationPlan(out).map((p) => [p.agent.tier, p]));
  assert.equal(plan.sol.register, true);
  assert.equal(plan.luna.register, true);
  assert.equal(plan.astra.register, false);
  assert.match(plan.astra.notice, /codex-astra is not registered/);
});

test("a -c catalog resolves relative to the working directory, and a quoted Windows path does not throw", (t) => {
  const { home, env } = mixedCatalogHome(t);
  const work = scratch(t);
  writeFileSync(path.join(work, "here.json"), JSON.stringify({ models: [{ slug: "work/gpt-6-astra", priority: 1 }] }));
  const r = loadCodexCatalog({ bin: FAKE, overrides: ['model_catalog_json="here.json"'], env, cwd: work });
  assert.equal(r.source, path.join(work, "here.json"));
  const win = loadCodexCatalog({ bin: FAKE, overrides: ['model_catalog_json="C:\\Users\\PC\\.codex\\missing.json"'], env, cwd: home });
  assert.match(win.error, /model_catalog_json file .*missing\.json could not be read/);
});

test("a trusted project's .codex/config.toml catalog wins over the home one; an untrusted project's is ignored", (t) => {
  const { home, env } = mixedCatalogHome(t);
  const repo = scratch(t);
  mkdirSync(path.join(repo, ".git"));
  mkdirSync(path.join(repo, ".codex"));
  mkdirSync(path.join(repo, "sub"));
  writeFileSync(path.join(repo, ".codex", "config.toml"), 'model_catalog_json = "project.json"\n');
  writeFileSync(path.join(repo, ".codex", "project.json"), JSON.stringify({ models: [{ slug: "project/gpt-6-astra", priority: 1 }] }));
  const cwd = path.join(repo, "sub");
  assert.equal(loadCodexCatalog({ bin: FAKE, env, cwd }).source, path.join(home, "proxy-model-catalog.json"));
  writeFileSync(path.join(home, "config.toml"),
    `model_catalog_json = "proxy-model-catalog.json"\n[projects.${JSON.stringify(repo)}]\ntrust_level = "trusted"\n`);
  const r = loadCodexCatalog({ bin: FAKE, env, cwd });
  assert.equal(r.source, path.join(repo, ".codex", "project.json"));
  assert.equal(resolveModel("astra", { env: {}, load: () => r }).model, "project/gpt-6-astra");
});

test("CDX_MODEL_<TIER> still wins over a configured catalog", (t) => {
  const { env } = mixedCatalogHome(t);
  const r = spawnSync(process.execPath, [TIERS_CLI, "--json", "astra"], { encoding: "utf8", env: { ...env, CDX_MODEL_ASTRA: "cousin-full-service/gpt-6-astra" } });
  assert.deepEqual(JSON.parse(r.stdout).tiers.astra, { model: "cousin-full-service/gpt-6-astra", tier: "astra", source: "CDX_MODEL_ASTRA" });
});

test("without `codex debug models`, a configured model_catalog_json is read relative to CODEX_HOME", (t) => {
  const home = scratch(t);
  writeFileSync(path.join(home, "config.toml"), 'model_catalog_json = "proxy-model-catalog.json"\n');
  writeFileSync(path.join(home, "proxy-model-catalog.json"), JSON.stringify({ models: PROXY }));
  writeFileSync(path.join(home, "models_cache.json"), JSON.stringify({ models: OPENAI }));
  const r = loadCodexCatalog({ bin: FAKE, env: { ...process.env, FAKE_CODEX_DEBUG: "fail", CODEX_HOME: home } });
  assert.equal(r.source, path.join(home, "proxy-model-catalog.json"));
  assert.equal(r.models[0].slug, "cousin-full-service/gpt-6.1-sol");
});

test("a configured catalog that cannot be read is an error, not a fall back to the cache", (t) => {
  const home = scratch(t);
  writeFileSync(path.join(home, "config.toml"), 'model_catalog_json = "missing.json"\n');
  writeFileSync(path.join(home, "models_cache.json"), JSON.stringify({ models: OPENAI }));
  const r = loadCodexCatalog({ bin: FAKE, env: { ...process.env, FAKE_CODEX_DEBUG: "fail", CODEX_HOME: home } });
  assert.match(r.error, /model_catalog_json file .*missing\.json could not be read \(ENOENT\)/);
});

test("with no configured catalog, models_cache.json is the fallback", (t) => {
  const home = scratch(t);
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, "models_cache.json"), JSON.stringify({ models: OPENAI }));
  const r = loadCodexCatalog({ bin: "/nonexistent/codex", env: { ...process.env, CODEX_HOME: home } });
  assert.equal(r.source, path.join(home, "models_cache.json"));
  assert.equal(pickTierModel(r.models, "luna").slug, "gpt-6-luna");
});
