#!/usr/bin/env node
// Prints the model each Codex tier resolves to on this machine.
// usage: codex-tiers.mjs [--json] [-c key=value]... [tier...]
// Default tiers: sol luna astra. Exit 0 even when a tier is missing; a missing
// tier carries an `error`. Exit 2 on a usage error.
import { TIERS, loadCodexCatalog, resolveTiers } from "./model-tiers.mjs";

const args = process.argv.slice(2);
const overrides = [];
const tiers = [];
let json = false;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--json") json = true;
  else if (a === "-c" && i + 1 < args.length) overrides.push(args[++i]);
  else if (a === "--help" || a === "-h") {
    process.stdout.write(`usage: codex-tiers.mjs [--json] [-c key=value]... [${TIERS.join("|")}]...\n`);
    process.exit(0);
  } else if (TIERS.includes(a.toLowerCase())) tiers.push(a.toLowerCase());
  else {
    process.stderr.write(`codex-tiers: unknown argument ${a}; tiers are ${TIERS.join(", ")}\n`);
    process.exit(2);
  }
}

let catalog;
const load = () => (catalog ??= loadCodexCatalog({ overrides }));
const resolved = resolveTiers(tiers.length ? tiers : ["sol", "luna", "astra"], { load });
if (json) {
  process.stdout.write(JSON.stringify({ catalog: catalog?.error ? { error: catalog.error } : catalog ? { source: catalog.source } : null, tiers: resolved }) + "\n");
} else {
  for (const [tier, r] of Object.entries(resolved)) {
    process.stdout.write(r.error ? `${tier}: unavailable: ${r.error}\n` : `${tier}: ${r.model} (${r.source})\n`);
  }
}
