// Resolves a Codex model tier (sol, luna, astra, ...) to the model ID the
// machine's Codex catalog actually lists, so cdx never sends a guessed name.
//
// Order: CDX_MODEL_<TIER> from the environment, then the catalog Codex itself
// uses. When config.toml (or a -c override) sets `model_catalog_json`, that
// file is the catalog and nothing else is consulted: a custom provider accepts
// only the names it lists, and some Codex versions print built-in models
// beside it. Otherwise `codex debug models` prints the catalog with the
// effective config applied; when that command fails (an older CLI),
// `models_cache.json` under CODEX_HOME is read instead.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// Tier names, not model IDs: the word a model's slug ends with.
export const TIERS = ["sol", "luna", "astra", "terra", "spark"];

export const tierEnvVar = (tier) => `CDX_MODEL_${tier.toUpperCase()}`;

export function isTier(name) {
  return TIERS.includes(String(name ?? "").toLowerCase());
}

// The part of a slug after a provider or proxy prefix such as `team/`.
function baseName(slug) {
  return String(slug).split(/[/:]/).pop().toLowerCase();
}

// The tier a slug belongs to: its tier word, followed by nothing but version
// or date parts (`gpt-6.1-sol`, `team/gpt-6-luna`, `gpt-6.1-sol-2026-09-29`).
export function tierOfSlug(slug) {
  const parts = baseName(slug).split("-");
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (TIERS.includes(parts[i])) {
      return parts.slice(i + 1).every((p) => /^(\d+(\.\d+)*|latest)$/.test(p)) ? parts[i] : null;
    }
  }
  return null;
}

function versionOf(slug) {
  const v = baseName(slug).split("-").find((p) => /^\d+(\.\d+)*$/.test(p));
  return v ? v.split(".").map(Number) : [];
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// The models in a catalog's JSON text: `{ "models": [...] }` or a bare array.
export function parseCatalog(text) {
  const data = JSON.parse(text);
  const models = Array.isArray(data) ? data : data?.models;
  if (!Array.isArray(models)) throw new Error("no models array");
  return models.filter((m) => m && typeof m.slug === "string" && m.slug);
}

// The catalog's model for a tier, or null. Listed models before hidden ones,
// then Codex's own `priority` (lower first), then the higher version.
export function pickTierModel(models, tier) {
  const candidates = models.filter((m) => tierOfSlug(m.slug) === tier);
  candidates.sort((a, b) =>
    (a.visibility === "hide") - (b.visibility === "hide") ||
    (a.priority ?? Infinity) - (b.priority ?? Infinity) ||
    compareVersions(versionOf(b.slug), versionOf(a.slug)) ||
    a.slug.localeCompare(b.slug));
  return candidates[0] ?? null;
}

// Each line of TOML text that can hold a key, with the [table] it sits under
// (null at the top level). Lines inside a multi-line string are skipped.
function tomlLines(text) {
  const out = [];
  let table = null;
  let open = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (open) {
      if (line.includes(open)) open = null;
      continue;
    }
    const header = /^\s*\[\[?\s*(.*?)\s*\]\]?\s*(#.*)?$/.exec(line);
    if (header) {
      table = header[1];
      continue;
    }
    out.push({ table, line });
    const multi = /=\s*("""|''')(.*)$/.exec(line);
    if (multi && !multi[2].includes(multi[1])) open = multi[1];
  }
  return out;
}

// A string value written as "basic" or 'literal'.
const STRING_VALUE = String.raw`(?:"((?:[^"\\]|\\.)*)"|'([^']*)')`;

// A top-level `model_catalog_json` from config.toml text (keys under a
// [table] belong to that table, and Codex ignores profile-level ones).
export function catalogPathFromToml(text) {
  const key = new RegExp(String.raw`^\s*model_catalog_json\s*=\s*` + STRING_VALUE);
  for (const { table, line } of tomlLines(text)) {
    if (table !== null) continue;
    const m = key.exec(line);
    if (m) return m[2] ?? unquoteBasic(m[1]);
  }
  return null;
}

// The project directories config.toml marks `trust_level = "trusted"`.
export function trustedProjectsFromToml(text) {
  const header = new RegExp(String.raw`^projects\.` + STRING_VALUE + "$");
  const trusted = new Set();
  for (const { table, line } of tomlLines(text)) {
    const t = table && header.exec(table);
    if (t && /^\s*trust_level\s*=\s*["']trusted["']/.test(line)) trusted.add(t[2] ?? unquoteBasic(t[1]));
  }
  return trusted;
}

// A TOML basic string's contents with escapes applied, or the raw contents
// when an escape is invalid (a Windows path written with single backslashes).
function unquoteBasic(inner) {
  try {
    return JSON.parse(`"${inner}"`);
  } catch {
    return inner;
  }
}

// A `-c model_catalog_json=<value>` override, as passed to the runner.
function catalogPathFromOverrides(overrides) {
  for (const o of [...(overrides ?? [])].reverse()) {
    const m = /^\s*model_catalog_json\s*=\s*(.+)$/.exec(o);
    if (!m) continue;
    const v = m[1].trim();
    return /^(".*"|'.*')$/.test(v) ? (v[0] === '"' ? unquoteBasic(v.slice(1, -1)) : v.slice(1, -1)) : v;
  }
  return null;
}

export function codexHome(env = process.env) {
  return env.CODEX_HOME || path.join(homedir(), ".codex");
}

function expandPath(p, home) {
  if (p === "~" || /^~[/\\]/.test(p)) return path.join(homedir(), p.slice(1));
  return path.isAbsolute(p) ? p : path.resolve(home, p);
}

function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function samePath(a, b) {
  const norm = (p) => {
    let r = path.resolve(p);
    try {
      r = realpathSync(r);
    } catch {}
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

// The directories whose .codex/config.toml Codex layers over the home config,
// closest first: from the working directory up to the project root (the
// nearest directory holding .git), or the working directory alone outside a
// repository.
function projectDirs(cwd) {
  const dirs = [];
  let dir = path.resolve(cwd);
  for (;;) {
    dirs.push(dir);
    if (existsSync(path.join(dir, ".git"))) return dirs;
    const up = path.dirname(dir);
    if (up === dir) return [path.resolve(cwd)];
    dir = up;
  }
}

// The model_catalog_json Codex would use: null when none is configured, else
// { file, models } or { file, error }. As Codex layers it, a -c override wins,
// then a trusted project's .codex/config.toml (closest to the working
// directory first), then CODEX_HOME/config.toml. Codex resolves a relative
// path against the working directory for -c (the runner's, since it starts
// Codex without changing directory, even with --cd), and against the
// directory holding the config.toml otherwise. An untrusted project's config
// is ignored, as Codex ignores it.
function configuredCatalog(overrides, env, cwd) {
  const home = codexHome(env);
  let named = catalogPathFromOverrides(overrides);
  let base = cwd;
  if (named == null) {
    const homeText = readText(path.join(home, "config.toml"));
    const trusted = [...trustedProjectsFromToml(homeText)];
    const dirs = projectDirs(cwd);
    if (dirs.some((d) => trusted.some((t) => samePath(d, t)))) {
      for (const dir of dirs) {
        const codexDir = path.join(dir, ".codex");
        if (samePath(codexDir, home)) continue;
        named = catalogPathFromToml(readText(path.join(codexDir, "config.toml")));
        if (named) {
          base = codexDir;
          break;
        }
      }
    }
    if (!named) {
      named = catalogPathFromToml(homeText);
      base = home;
    }
  }
  if (!named) return null;
  const file = expandPath(named, base);
  try {
    return { file, models: parseCatalog(readFileSync(file, "utf8")) };
  } catch (err) {
    return { file, error: err.code ?? err.message };
  }
}

// The catalog this machine's Codex uses: { models, source } or { error }.
// A configured model_catalog_json is read from its file alone: Codex 0.165
// lists its built-in models beside that catalog in `codex debug models`, and
// the provider behind the catalog may refuse those built-in names.
export function loadCodexCatalog({ bin = process.env.CDX_CODEX_BIN || "codex", overrides = [], env = process.env, cwd = process.cwd() } = {}) {
  const configured = configuredCatalog(overrides, env, cwd);
  if (configured?.error) {
    return { error: `the model_catalog_json file ${configured.file} could not be read (${configured.error})` };
  }
  if (configured) return { models: configured.models, source: configured.file };

  const argv = ["debug", "models", ...overrides.flatMap((c) => ["-c", c])];
  const r = spawnSync(bin, argv, { encoding: "utf8", env, cwd, timeout: 20_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  let cliProblem;
  if (r.error) cliProblem = r.error.message;
  else if (r.status !== 0) cliProblem = `exit ${r.status}: ${(r.stderr || "").trim().split("\n").pop()}`;
  else {
    try {
      const models = parseCatalog(r.stdout);
      if (models.length) return { models, source: `${bin} debug models` };
      cliProblem = "it listed no models";
    } catch (err) {
      cliProblem = `unreadable output (${err.message})`;
    }
  }

  const file = path.join(codexHome(env), "models_cache.json");
  try {
    return { models: parseCatalog(readFileSync(file, "utf8")), source: file };
  } catch (err) {
    return { error: `\`${bin} debug models\` failed (${cliProblem}) and ${file} could not be read (${err.code ?? err.message})` };
  }
}

// What a requested model means: a tier word resolves through the environment
// or the catalog; anything else is a model ID passed through unchanged.
// Returns { model, tier?, source? } or { error }.
export function resolveModel(requested, { env = process.env, load = () => loadCodexCatalog({ env }) } = {}) {
  if (!isTier(requested)) return { model: requested };
  const tier = requested.toLowerCase();
  const fromEnv = env[tierEnvVar(tier)]?.trim();
  if (fromEnv) return { model: fromEnv, tier, source: tierEnvVar(tier) };
  const catalog = load();
  if (catalog.error) {
    return { error: `cannot resolve the ${tier} tier: ${catalog.error}. Set ${tierEnvVar(tier)} or pass --model <id>.` };
  }
  // A catalog entry named exactly like the tier is a real model.
  const exact = catalog.models.find((m) => m.slug === requested);
  if (exact) return { model: exact.slug, tier, source: catalog.source };
  const picked = pickTierModel(catalog.models, tier);
  if (picked) return { model: picked.slug, tier, source: catalog.source };
  const seen = catalog.models.map((m) => m.slug).join(", ") || "none";
  return {
    error:
      `no ${tier} model in this machine's Codex catalog (${catalog.source}; models: ${seen}). ` +
      `Set ${tierEnvVar(tier)} or pass --model <id> to name one.`,
  };
}

// Every requested tier resolved against one catalog read.
export function resolveTiers(tiers, { env = process.env, load = () => loadCodexCatalog({ env }) } = {}) {
  let catalog;
  const once = () => (catalog ??= load());
  const out = {};
  for (const tier of tiers) out[tier] = resolveModel(tier, { env, load: once });
  return out;
}
