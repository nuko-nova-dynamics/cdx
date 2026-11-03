import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
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

const FAKE = new URL("./fixtures/fake-codex", import.meta.url).pathname;

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
