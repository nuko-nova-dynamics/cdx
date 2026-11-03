// Resolves a Codex model tier (sol, luna, astra, ...) to the model ID the
// machine's Codex catalog actually lists, so cdx never sends a guessed name.
//
// Order: CDX_MODEL_<TIER> from the environment, then the catalog Codex itself
// uses. `codex debug models` prints that catalog with the effective config
// applied, so a `model_catalog_json` (which replaces the catalog) or a proxy's
// prefixed names show up as Codex will accept them. When that command fails
// (an older CLI), the catalog is read from disk: `model_catalog_json` from
// config.toml if set, else `models_cache.json`, both under CODEX_HOME.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

// A top-level `model_catalog_json` from config.toml text (keys under a
// [table] belong to that table, and Codex ignores profile-level ones).
export function catalogPathFromToml(text) {
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break;
    const m = /^\s*model_catalog_json\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/.exec(line);
    if (m) return m[2] ?? JSON.parse(`"${m[1]}"`);
  }
  return null;
}

// A `-c model_catalog_json=<value>` override, as passed to the runner.
function catalogPathFromOverrides(overrides) {
  for (const o of [...(overrides ?? [])].reverse()) {
    const m = /^\s*model_catalog_json\s*=\s*(.+)$/.exec(o);
    if (!m) continue;
    const v = m[1].trim();
    return /^(".*"|'.*')$/.test(v) ? (v[0] === '"' ? JSON.parse(v) : v.slice(1, -1)) : v;
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

// The catalog this machine's Codex uses: { models, source } or { error }.
export function loadCodexCatalog({ bin = process.env.CDX_CODEX_BIN || "codex", overrides = [], env = process.env } = {}) {
  const argv = ["debug", "models", ...overrides.flatMap((c) => ["-c", c])];
  const r = spawnSync(bin, argv, { encoding: "utf8", env, timeout: 20_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
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

  const home = codexHome(env);
  let configText = null;
  try {
    configText = readFileSync(path.join(home, "config.toml"), "utf8");
  } catch {}
  const named = catalogPathFromOverrides(overrides) ?? catalogPathFromToml(configText);
  // A configured catalog is the only valid one: falling back to the cache
  // would offer names the provider may refuse.
  const file = named ? expandPath(named, home) : path.join(home, "models_cache.json");
  try {
    const models = parseCatalog(readFileSync(file, "utf8"));
    return { models, source: file };
  } catch (err) {
    const what = named ? `the model_catalog_json file ${file}` : file;
    return { error: `\`${bin} debug models\` failed (${cliProblem}) and ${what} could not be read (${err.code ?? err.message})` };
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
