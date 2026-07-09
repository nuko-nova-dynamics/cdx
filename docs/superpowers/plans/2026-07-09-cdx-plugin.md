# cdx Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, test, install, and publish the `cdx` Claude Code plugin — a full-surface Codex CLI integration that replaces the official openai-codex plugin.

**Architecture:** Skill-first, no companion runtime. One Node runner script (`codex-run.mjs`) wraps `codex exec` to tame JSONL output; everything else is skills teaching Claude to drive the CLI directly, plus thin command aliases. Codex's own session store is the only state.

**Tech Stack:** Node ≥ 20 stdlib only (zero npm dependencies), bash for smoke tests, JSON Schema files, Claude Code plugin format (plugin.json + marketplace.json).

## Global Constraints

- Verified against **codex-cli 0.143.0**; the flag reference file stamps this version.
- **Zero runtime npm dependencies** — Node stdlib only.
- `codex exec` does **NOT** accept `-a/--ask-for-approval` (verified — it errors). Non-interactive safety is sandbox-only.
- Sandbox is always explicit. Runner errors if `--sandbox` missing. Map: `ro`→`read-only`, `write`→`workspace-write`, `full`→`danger-full-access`.
- Never use `--dangerously-bypass-approvals-and-sandbox` or `--dangerously-bypass-hook-trust` anywhere.
- Model alias: `spark` → `gpt-5.3-codex-spark`. Effort values: `none|minimal|low|medium|high|xhigh`, applied via `-c model_reasoning_effort="<v>"` (no `--effort` flag exists on exec).
- Known environment quirk: user's `~/.codex/config.toml` pins `model = "gpt-5.6-sol"` which codex-cli 0.143.0 rejects ("requires a newer version of Codex"). Smoke tests MUST pass an explicit supported model (`gpt-5.3-codex-spark`); the skill documents this failure signature.
- Runner honors `CDX_CODEX_BIN` env override so tests use a stub instead of real Codex.
- Verified JSONL event types from `codex exec --json`: `thread.started{thread_id}`, `turn.started`, `item.completed{item:{id,type,...}}` (item types seen: `agent_message{text}`, `error{message}`, `command_execution`), `turn.completed{usage{input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens}}`, `turn.failed{error{message}}`, top-level `error{message}`.
- Verified `~/.codex/session_index.jsonl` line format: `{"id":"<uuid>","thread_name":"<name>","updated_at":"<iso>"}`.
- License Apache-2.0; `NOTICE` attributes the adapted prompting references to openai/codex-plugin-cc (Apache-2.0).
- All commits in `~/Projects/cdx` end with the standard Co-Authored-By + Claude-Session trailer.

---

### Task 1: Plugin skeleton and manifests

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `LICENSE` (Apache-2.0 text)
- Create: `NOTICE`
- Create: `CHANGELOG.md`
- Create: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Produces: plugin name `cdx` (command namespace `/cdx:*`), marketplace name `cdx` — later tasks and install commands (`claude plugin install cdx@cdx`) rely on these exact names.

- [ ] **Step 1: Write `.claude-plugin/plugin.json`**

```json
{
  "name": "cdx",
  "version": "0.1.0",
  "description": "Full-surface Codex CLI integration: delegate, review, fan out, resume, and act on structured Codex results. Claude drives codex directly — no middleman runtime.",
  "author": {
    "name": "Nuko Nova Dynamics",
    "email": "hello@nukonova.com"
  },
  "homepage": "https://github.com/nuko-nova-dynamics/cdx",
  "repository": "https://github.com/nuko-nova-dynamics/cdx",
  "license": "Apache-2.0",
  "keywords": ["codex", "openai", "delegation", "code-review", "multi-model"]
}
```

- [ ] **Step 2: Write `.claude-plugin/marketplace.json`** (lets the repo itself act as a local marketplace for path-based install)

```json
{
  "$schema": "https://code.claude.com/marketplace.schema.json",
  "name": "cdx",
  "description": "cdx plugin self-marketplace for local/path installs.",
  "owner": {
    "name": "Nuko Nova Dynamics",
    "email": "hello@nukonova.com"
  },
  "plugins": [
    {
      "name": "cdx",
      "source": "./",
      "description": "Full-surface Codex CLI integration: delegate, review, fan out, resume, and act on structured Codex results.",
      "license": "Apache-2.0",
      "category": "agent-tooling",
      "tags": ["codex", "delegation", "review", "multi-model"]
    }
  ]
}
```

- [ ] **Step 3: Write `LICENSE`** — full Apache License 2.0 text (fetch verbatim from https://www.apache.org/licenses/LICENSE-2.0.txt via `curl -s -o LICENSE https://www.apache.org/licenses/LICENSE-2.0.txt`; verify first line reads `                                 Apache License`).

- [ ] **Step 4: Write `NOTICE`**

```
cdx — Claude Code plugin
Copyright 2026 Nuko Nova Dynamics

The prompting reference files under skills/prompting-codex/references/
are adapted from the "gpt-5-4-prompting" skill in openai/codex-plugin-cc
(https://github.com/openai/codex-plugin-cc), licensed under the
Apache License, Version 2.0.
```

- [ ] **Step 5: Write `CHANGELOG.md`**

```markdown
# Changelog

## 0.1.0 — 2026-07-09

Initial release: driving-codex / codex-structured-output / prompting-codex skills,
/cdx:task /cdx:review /cdx:fleet /cdx:session /cdx:cloud /cdx:setup commands,
4 bundled output schemas, codex-run.mjs runner, smoke tests.
```

- [ ] **Step 6: Write `README.md`** (stub — expanded in Task 9)

```markdown
# cdx

Full-surface Codex CLI integration for Claude Code. Skill-first: say
"spawn codex on X" and Claude picks the right flags, runs `codex exec`,
parses structured output, and acts on it. Replaces the official
openai-codex plugin's locked-down forwarder with a real two-model loop.

Verified against codex-cli 0.143.0. Requires Node >= 20 and a logged-in
Codex CLI (`codex login`).

## Install

```bash
claude plugin marketplace add nuko-nova-dynamics/cdx
claude plugin install cdx@cdx
```
```

- [ ] **Step 7: Write `.gitignore`**

```
node_modules/
*.log
.DS_Store
tests/scratch/
```

- [ ] **Step 8: Validate both manifests parse**

Run: `node -e 'JSON.parse(require("fs").readFileSync(".claude-plugin/plugin.json")); JSON.parse(require("fs").readFileSync(".claude-plugin/marketplace.json")); console.log("manifests OK")'`
Expected: `manifests OK`

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: plugin skeleton, manifests, license, notice"
```

---

### Task 2: Output schemas

**Files:**
- Create: `schemas/review-findings.schema.json`
- Create: `schemas/verdict.schema.json`
- Create: `schemas/task-report.schema.json`
- Create: `schemas/patch-plan.schema.json`
- Test: `tests/schemas.test.mjs`

**Interfaces:**
- Produces: four schema file paths under `schemas/` that commands and skills reference by name (`review-findings`, `verdict`, `task-report`, `patch-plan`). Keep schemas flat with minimal `required` — Codex fills flat schemas most reliably.

- [ ] **Step 1: Write the failing test `tests/schemas.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SCHEMA_DIR = new URL("../schemas/", import.meta.url).pathname;
const EXPECTED = [
  "review-findings.schema.json",
  "verdict.schema.json",
  "task-report.schema.json",
  "patch-plan.schema.json",
];

test("all four schemas exist, parse, and are object-typed", () => {
  const files = readdirSync(SCHEMA_DIR).sort();
  assert.deepEqual(files, [...EXPECTED].sort());
  for (const f of EXPECTED) {
    const s = JSON.parse(readFileSync(path.join(SCHEMA_DIR, f), "utf8"));
    assert.equal(s.type, "object", `${f} root must be object`);
    assert.ok(s.properties, `${f} must declare properties`);
    assert.ok(Array.isArray(s.required), `${f} must declare required[]`);
    assert.equal(s.additionalProperties, false, `${f} must forbid extra props`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/schemas.test.mjs`
Expected: FAIL (schemas dir missing)

- [ ] **Step 3: Write the four schemas**

`schemas/review-findings.schema.json`:

```json
{
  "type": "object",
  "properties": {
    "overall": { "type": "string", "description": "One-paragraph overall assessment of the change" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "file": { "type": "string" },
          "line": { "type": "integer" },
          "severity": { "type": "string", "enum": ["critical", "high", "medium", "low"] },
          "summary": { "type": "string", "description": "One-sentence statement of the defect" },
          "failure_scenario": { "type": "string", "description": "Concrete inputs/state that produce wrong output or a crash" }
        },
        "required": ["file", "severity", "summary", "failure_scenario"],
        "additionalProperties": false
      }
    }
  },
  "required": ["overall", "findings"],
  "additionalProperties": false
}
```

`schemas/verdict.schema.json`:

```json
{
  "type": "object",
  "properties": {
    "claim": { "type": "string" },
    "verdict": { "type": "string", "enum": ["confirmed", "refuted", "uncertain"] },
    "evidence": { "type": "string", "description": "File paths, line numbers, command output supporting the verdict" },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
  },
  "required": ["claim", "verdict", "evidence"],
  "additionalProperties": false
}
```

`schemas/task-report.schema.json`:

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "files_changed": { "type": "array", "items": { "type": "string" } },
    "commands_run": { "type": "array", "items": { "type": "string" } },
    "risks": { "type": "array", "items": { "type": "string" } },
    "follow_ups": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["summary", "files_changed"],
  "additionalProperties": false
}
```

`schemas/patch-plan.schema.json`:

```json
{
  "type": "object",
  "properties": {
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "file": { "type": "string" },
          "change": { "type": "string", "description": "What to change, concretely" },
          "rationale": { "type": "string" }
        },
        "required": ["file", "change"],
        "additionalProperties": false
      }
    },
    "notes": { "type": "string" }
  },
  "required": ["steps"],
  "additionalProperties": false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/schemas.test.mjs`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add schemas tests/schemas.test.mjs && git commit -m "feat: bundled output schemas for structured Codex results"
```

---

### Task 3: Runner script `codex-run.mjs`

**Files:**
- Create: `scripts/codex-run.mjs`
- Create: `tests/fixtures/fake-codex` (executable stub)
- Test: `tests/runner.test.mjs`

**Interfaces:**
- Consumes: JSONL event contract and sandbox/model/effort maps from Global Constraints.
- Produces: CLI contract used by every command and skill:
  `node scripts/codex-run.mjs --sandbox <ro|write|full> [--model <m|spark>] [--effort <e>] [--search] [--image <f>]... [--schema <path>] [--resume <id|last>] [--local [lmstudio|ollama]] [--add-dir <d>]... [--cd <dir>] [-c k=v]... [--ephemeral] [--scratch <dir>] -- <prompt...>`
  Prints: `session: <id>`, `status: <completed|failed>`, item counts, token usage, final message, artifact paths. Exit 0 only on `turn.completed` + child exit 0.

- [ ] **Step 1: Write the executable stub `tests/fixtures/fake-codex`**

```bash
#!/usr/bin/env bash
# Emits canned JSONL matching `codex exec --json`; honors -o <file>.
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
if [ "${FAKE_CODEX_MODE:-ok}" = "fail" ]; then
  echo '{"type":"thread.started","thread_id":"fake-thread-fail"}'
  echo '{"type":"turn.started"}'
  echo '{"type":"turn.failed","error":{"message":"boom: model exploded"}}'
  exit 1
fi
echo '{"type":"thread.started","thread_id":"fake-thread-123"}'
echo '{"type":"turn.started"}'
echo '{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"ls"}}'
echo 'not json garbage line'
echo '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"fake done"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":2,"output_tokens":5,"reasoning_output_tokens":3}}'
if [ -n "$out" ]; then printf 'fake done' > "$out"; fi
exit 0
```

Then: `chmod +x tests/fixtures/fake-codex`

- [ ] **Step 2: Write the failing test `tests/runner.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const RUNNER = new URL("../scripts/codex-run.mjs", import.meta.url).pathname;
const FAKE = new URL("./fixtures/fake-codex", import.meta.url).pathname;

function run(args, extraEnv = {}) {
  return spawnSync("node", [RUNNER, ...args], {
    env: { ...process.env, CDX_CODEX_BIN: FAKE, ...extraEnv },
    encoding: "utf8",
  });
}

test("success run prints session, counts, tokens, final message; exit 0", () => {
  const r = run(["--sandbox", "ro", "--", "say hi"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /session: fake-thread-123/);
  assert.match(r.stdout, /status: completed/);
  assert.match(r.stdout, /command_execution=1/);
  assert.match(r.stdout, /input=10/);
  assert.match(r.stdout, /fake done/);
  assert.match(r.stdout, /events\.jsonl/);
});

test("failed run surfaces error and exits 1", () => {
  const r = run(["--sandbox", "write", "--", "do thing"], { FAKE_CODEX_MODE: "fail" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /status: failed/);
  assert.match(r.stdout, /boom: model exploded/);
});

test("missing --sandbox is a usage error", () => {
  const r = run(["--", "hello"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--sandbox/);
});

test("missing prompt without --resume is a usage error", () => {
  const r = run(["--sandbox", "ro"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /prompt/i);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/runner.test.mjs`
Expected: FAIL (`scripts/codex-run.mjs` not found)

- [ ] **Step 4: Write `scripts/codex-run.mjs`**

```js
#!/usr/bin/env node
// cdx runner: composes `codex exec`, tees the --json JSONL event stream to a
// scratch file, and prints a compact context-safe summary.
// Contract: exit 0 only when a turn.completed event was seen and codex exited 0.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, createWriteStream, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";

const SANDBOX_MAP = { ro: "read-only", write: "workspace-write", full: "danger-full-access" };
const MODEL_ALIASES = { spark: "gpt-5.3-codex-spark" };
const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);
const LOCAL_PROVIDERS = new Set(["lmstudio", "ollama"]);

function die(msg) {
  process.stderr.write(`codex-run: ${msg}\n`);
  process.stderr.write(
    "usage: codex-run.mjs --sandbox <ro|write|full> [--model <m|spark>] [--effort <e>] [--search] " +
      "[--image <f>]... [--schema <path>] [--resume <id|last>] [--local [lmstudio|ollama]] " +
      "[--add-dir <d>]... [--cd <dir>] [-c k=v]... [--ephemeral] [--scratch <dir>] -- <prompt...>\n"
  );
  process.exit(2);
}

function parseArgs(argv) {
  const o = { images: [], addDirs: [], overrides: [], promptParts: [] };
  let i = 0;
  let afterDashes = false;
  const next = (flag) => {
    i += 1;
    if (i >= argv.length) die(`${flag} requires a value`);
    return argv[i];
  };
  while (i < argv.length) {
    const a = argv[i];
    if (afterDashes) {
      o.promptParts.push(a);
    } else if (a === "--") {
      afterDashes = true;
    } else if (a === "--sandbox") {
      o.sandbox = next(a);
    } else if (a === "--model") {
      o.model = next(a);
    } else if (a === "--effort") {
      o.effort = next(a);
    } else if (a === "--search") {
      o.search = true;
    } else if (a === "--image") {
      o.images.push(next(a));
    } else if (a === "--schema") {
      o.schema = next(a);
    } else if (a === "--resume") {
      o.resume = next(a);
    } else if (a === "--local") {
      o.local = true;
      if (i + 1 < argv.length && LOCAL_PROVIDERS.has(argv[i + 1])) o.localProvider = argv[++i];
    } else if (a === "--add-dir") {
      o.addDirs.push(next(a));
    } else if (a === "--cd") {
      o.cd = next(a);
    } else if (a === "-c") {
      o.overrides.push(next(a));
    } else if (a === "--ephemeral") {
      o.ephemeral = true;
    } else if (a === "--scratch") {
      o.scratch = next(a);
    } else if (a.startsWith("-")) {
      die(`unknown flag: ${a}`);
    } else {
      o.promptParts.push(a);
    }
    i += 1;
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.sandbox) die("--sandbox is required (ro|write|full)");
const sandbox = SANDBOX_MAP[opts.sandbox] ?? opts.sandbox;
if (!Object.values(SANDBOX_MAP).includes(sandbox)) die(`invalid --sandbox: ${opts.sandbox}`);
if (opts.effort && !EFFORTS.has(opts.effort)) die(`invalid --effort: ${opts.effort}`);
const prompt = opts.promptParts.join(" ").trim();
if (!prompt && !opts.resume) die("a prompt is required (or --resume <id|last>)");

const scratch = opts.scratch ?? mkdtempSync(path.join(tmpdir(), "cdx-"));
mkdirSync(scratch, { recursive: true });
const lastMsgPath = path.join(scratch, "last-message.txt");
const eventsPath = path.join(scratch, "events.jsonl");
const stderrPath = path.join(scratch, "stderr.log");

const argv = ["exec"];
if (opts.resume) argv.push("resume", opts.resume === "last" ? "--last" : opts.resume);
argv.push("--json", "-o", lastMsgPath, "--sandbox", sandbox);
if (opts.model) argv.push("-m", MODEL_ALIASES[opts.model] ?? opts.model);
if (opts.effort) argv.push("-c", `model_reasoning_effort="${opts.effort}"`);
if (opts.search) argv.push("--search");
if (opts.schema) argv.push("--output-schema", opts.schema);
if (opts.local) {
  argv.push("--oss");
  if (opts.localProvider) argv.push("--local-provider", opts.localProvider);
}
for (const img of opts.images) argv.push("-i", img);
for (const d of opts.addDirs) argv.push("--add-dir", d);
if (opts.cd) argv.push("-C", opts.cd);
for (const c of opts.overrides) argv.push("-c", c);
if (opts.ephemeral) argv.push("--ephemeral");
if (prompt) argv.push(prompt);

const bin = process.env.CDX_CODEX_BIN || "codex";
const child = spawn(bin, argv, { stdio: ["ignore", "pipe", "pipe"] });

const eventsOut = createWriteStream(eventsPath);
const stderrOut = createWriteStream(stderrPath);
let stderrTail = "";
child.stderr.on("data", (buf) => {
  stderrOut.write(buf);
  stderrTail = (stderrTail + buf.toString()).slice(-2000);
});

const state = {
  threadId: null,
  completed: false,
  finalMessage: null,
  usage: null,
  errors: [],
  itemCounts: {},
};

const rl = readline.createInterface({ input: child.stdout });
rl.on("line", (line) => {
  eventsOut.write(line + "\n");
  let ev;
  try {
    ev = JSON.parse(line);
  } catch {
    return; // non-JSON noise
  }
  if (ev.type === "thread.started") state.threadId = ev.thread_id;
  else if (ev.type === "turn.completed") {
    state.completed = true;
    state.usage = ev.usage ?? null;
  } else if (ev.type === "turn.failed") state.errors.push(ev.error?.message ?? "turn failed");
  else if (ev.type === "error") state.errors.push(ev.message ?? "unknown error");
  else if (ev.type === "item.completed" && ev.item) {
    const t = ev.item.type ?? "unknown";
    state.itemCounts[t] = (state.itemCounts[t] ?? 0) + 1;
    if (t === "agent_message") state.finalMessage = ev.item.text ?? state.finalMessage;
    if (t === "error") state.errors.push(ev.item.message ?? "item error");
  }
});

child.on("close", (code) => {
  eventsOut.end();
  stderrOut.end();
  const ok = state.completed && code === 0;
  const lines = [];
  lines.push(`session: ${state.threadId ?? "unknown"}`);
  lines.push(`status: ${ok ? "completed" : `failed (exit ${code})`}`);
  const counts = Object.entries(state.itemCounts)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  if (counts) lines.push(`items: ${counts}`);
  if (state.usage) {
    const u = state.usage;
    lines.push(
      `tokens: input=${u.input_tokens ?? 0} cached=${u.cached_input_tokens ?? 0} output=${u.output_tokens ?? 0}`
    );
  }
  let finalMsg = state.finalMessage;
  if (!finalMsg && existsSync(lastMsgPath)) {
    try {
      finalMsg = readFileSync(lastMsgPath, "utf8");
    } catch {}
  }
  lines.push("--- final message ---");
  lines.push(finalMsg?.trim() || "(no final message)");
  if (state.errors.length) {
    lines.push("--- errors ---");
    for (const e of state.errors) lines.push(`- ${e}`);
    if (stderrTail.trim()) lines.push(`stderr tail: ${stderrTail.trim().slice(-400)}`);
  }
  lines.push("--- artifacts ---");
  lines.push(`events: ${eventsPath}`);
  lines.push(`last-message: ${lastMsgPath}`);
  lines.push(`stderr: ${stderrPath}`);
  process.stdout.write(lines.join("\n") + "\n");
  process.exit(ok ? 0 : 1);
});

child.on("error", (err) => {
  process.stderr.write(`codex-run: failed to spawn ${bin}: ${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/runner.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add scripts tests/fixtures tests/runner.test.mjs && git commit -m "feat: codex-run.mjs runner with JSONL taming and stub-backed tests"
```

---

### Task 4: `driving-codex` skill (the product)

**Files:**
- Create: `skills/driving-codex/SKILL.md`
- Create: `skills/driving-codex/references/flag-map.md`

**Interfaces:**
- Consumes: runner CLI contract (Task 3), schema names (Task 2).
- Produces: the natural-language entry point. Commands (Task 7) defer to this skill's heuristics.

- [ ] **Step 1: Write `skills/driving-codex/SKILL.md`**

```markdown
---
name: driving-codex
description: Drive the OpenAI Codex CLI as a full collaborator — delegate tasks, run reviews, fan out parallel workers, resume sessions, and act on structured results. Use whenever the user mentions Codex in any form: "spawn codex", "ask codex", "use codex", "have/let codex do X", "send this to codex", "codex second opinion", "what does codex think", "delegate to codex", "codex review/fix/investigate", resuming or checking a Codex run, comparing Claude's work against Codex, or any request to run another coding agent on the task.
---

# Driving Codex

You are a full collaborator with Codex, not a forwarder. You choose the
flags, you parse the results, you verify claims against the repo, you
apply and test patches, you iterate. The user should never need to know
a single Codex flag.

## Invocation contract

Every non-interactive run goes through the bundled runner (never raw
`codex exec` — its `--json` stream floods context):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.mjs" --sandbox <ro|write|full> [flags] -- <prompt>
```

The runner prints: session id, status, item counts, token usage, the
final message, and artifact paths (full event log, last message,
stderr). It exits 0 only on a completed turn. `codex exec` takes no
approval flag — it is inherently non-interactive; sandbox is the only
control, which is why the runner makes it mandatory.

For long tasks run it with Bash `run_in_background: true` and collect
output when it finishes. Short probes (< ~1 min) can run foreground.

## Choosing flags (your job, never the user's)

- **--sandbox**: `ro` for review/diagnosis/research/second-opinion;
  `write` for fix/implement/refactor (default for mutating asks);
  `full` ONLY when the user explicitly asks for full access — confirm
  once per session before first use.
- **--model**: leave unset by default. "spark" → pass `--model spark`
  (runner maps to gpt-5.3-codex-spark) — good for quick/cheap probes.
  Pass through any explicit model the user names.
- **--effort**: leave unset by default. `xhigh` when the user signals
  hard ("really dig", "think hard", gnarly bug). `low`/`minimal` for
  mechanical bulk edits.
- **--search**: add when the task needs current external knowledge —
  library versions, API docs, error messages worth googling.
- **--image <file>**: attach screenshots/mocks when they exist.
- **--schema <path>**: add whenever you will ACT on the result rather
  than just read it. Bundled schemas (see codex-structured-output
  skill): `${CLAUDE_PLUGIN_ROOT}/schemas/review-findings.schema.json`,
  `verdict.schema.json`, `task-report.schema.json`,
  `patch-plan.schema.json`.
- **--ephemeral**: throwaway probes that shouldn't pollute session
  history.
- **--local [lmstudio|ollama]**: only when the user says local/offline.
- **-c key=value**: escape hatch for anything else (see
  references/flag-map.md).

## Sessions: resume, fork, apply

- The runner prints `session: <id>` — remember it for the conversation.
- Follow-up on the same thread: `--resume <id> -- <delta instruction>`.
  Send only the delta, not the whole original prompt.
- "keep going" with exactly one recent thread: `--resume last`.
- List sessions: read `~/.codex/session_index.jsonl` (JSONL of
  `{id, thread_name, updated_at}`); filter/sort with jq or node.
- Diverge without losing the original: `codex fork <id>` (interactive
  picker exists; prefer explicit id).
- Land a session's diff: `codex apply <task_id>`.

## Fleet (parallel fan-out)

For decomposed subtasks, multi-angle second opinions, or A/B
implementations: launch N runner invocations, each via Bash
`run_in_background: true`, each with its own `--scratch` dir and (for
mutating work) NON-OVERLAPPING file scopes stated in the prompt — or
`--sandbox ro` angles that only report. Collect all outputs, then
synthesize: agree/disagree, dedupe findings, pick the best
implementation. 2–4 workers is the sweet spot; more rarely helps.

## Acting on results

- Parse schema output as JSON (it arrives as the final message).
- Verify substantive claims against the repo before presenting them —
  Codex can be confidently wrong. Findings you can't confirm get
  labeled as unverified.
- If the user asked for a fix and Codex wrote one (sandbox `write`),
  inspect the diff (`git diff`), run the relevant tests, then report.
- Never dump raw JSONL or the full event log into the conversation.

## Reviews

Default review path: `--sandbox ro --schema review-findings` with a
prompt containing the diff context (see /cdx:review command for the
template). Native alternative: `codex review [--uncommitted|--base
<ref>|--commit <sha>] [instructions]` — prose output, no schema, but
purpose-built. Use native when the user wants "codex's own review";
use the schema path when findings should be verified and acted on.

## Cloud

`codex cloud exec` submits a task to Codex Cloud; `list`, `status
<id>`, `diff <id>`, `apply <id>` manage it. Cloud tasks run on OpenAI
infra against the repo's GitHub remote — use for long jobs the user
wants off this machine.

## Failure handling

- Non-zero exit: read the errors section + stderr artifact. Common
  signatures:
  - "requires a newer version of Codex" → the user's config.toml pins
    a model this CLI doesn't know. Retry with an explicit supported
    `--model` (e.g. spark) and suggest `codex update`.
  - auth errors → tell the user to run `!codex login`.
  - "Exceeded skills context budget" items are warnings, not failures.
- Runner not found / codex missing → run `/cdx:setup` flow
  (`codex doctor`, install guidance).

## Safety

- Never use `--dangerously-bypass-approvals-and-sandbox` or
  `--dangerously-bypass-hook-trust`.
- `full` sandbox needs explicit user intent + one confirmation per
  session.
- Ask the user nothing else — flag choice is yours.

Full verified flag reference: [references/flag-map.md](references/flag-map.md).
```

- [ ] **Step 2: Write `skills/driving-codex/references/flag-map.md`**

```markdown
# Codex CLI flag map — verified against codex-cli 0.143.0 (2026-07-09)

Runner flags map to these. Anything not wrapped by the runner can be
passed with `-c key=value` or by calling `codex` directly.

## codex exec (non-interactive; NO approval flag exists)

| Flag | Notes |
|---|---|
| `--json` | JSONL events on stdout (runner always sets) |
| `-o, --output-last-message <file>` | final message to file (runner always sets) |
| `-s, --sandbox <read-only\|workspace-write\|danger-full-access>` | runner: ro/write/full |
| `-m, --model <model>` | runner `--model`; alias spark→gpt-5.3-codex-spark |
| `-c model_reasoning_effort="<none\|minimal\|low\|medium\|high\|xhigh>"` | runner `--effort` |
| `--search` | native web_search tool, no per-call approval |
| `-i, --image <file>...` | attach images |
| `--output-schema <file>` | JSON Schema for final response |
| `--oss` / `--local-provider <lmstudio\|ollama>` | runner `--local` |
| `-C, --cd <dir>` | working root |
| `--add-dir <dir>` | extra writable roots |
| `--ephemeral` | no session persistence |
| `--skip-git-repo-check` | allow outside a git repo |
| `-p, --profile <name>` | layer $CODEX_HOME/<name>.config.toml |
| `--enable <feature>` / `--disable <feature>` | feature flags (`codex features list`) |
| `--ignore-user-config` / `--ignore-rules` / `--strict-config` | config hygiene |
| `--color <always\|never\|auto>` | output color |

## codex exec resume

`codex exec resume [SESSION_ID] [PROMPT]` — UUID or thread name;
`--last` for most recent; `--all` disables cwd filtering. Accepts the
same config/model flags as exec.

## codex review (native reviewer, prose output)

`codex review [PROMPT]` with `--uncommitted` | `--base <branch>` |
`--commit <sha>`, optional `--title <t>`. `-c`/`--enable`/`--disable`
also accepted.

## codex cloud

`codex cloud exec|list|status|diff|apply` — submit/browse/apply Codex
Cloud tasks.

## Sessions on disk

`~/.codex/session_index.jsonl`: `{"id","thread_name","updated_at"}`
per line. Full transcripts under `~/.codex/sessions/<year>/...`.

## Other subcommands

`codex apply <task_id>` (git-apply latest agent diff), `codex fork`,
`codex doctor`, `codex features list`, `codex sandbox` (run arbitrary
commands inside Codex sandbox), `codex mcp-server` (Codex as MCP).

## Event stream (`--json`)

`thread.started{thread_id}` · `turn.started` ·
`item.completed{item:{id,type,...}}` with item types
`agent_message{text}` / `command_execution` / `error{message}` ·
`turn.completed{usage{input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens}}`
· `turn.failed{error{message}}` · top-level `error{message}`.

## Danger flags — NEVER USE

`--dangerously-bypass-approvals-and-sandbox`,
`--dangerously-bypass-hook-trust`.
```

- [ ] **Step 3: Verify skill frontmatter parses** (description on one line, valid YAML)

Run: `node -e 'const s=require("fs").readFileSync("skills/driving-codex/SKILL.md","utf8"); const m=s.match(/^---\n([\s\S]*?)\n---/); if(!m) throw new Error("no frontmatter"); if(!/^name: driving-codex$/m.test(m[1])) throw new Error("bad name"); console.log("frontmatter OK")'`
Expected: `frontmatter OK`

- [ ] **Step 4: Commit**

```bash
git add skills/driving-codex && git commit -m "feat: driving-codex skill — NL-first full-surface Codex operation"
```

---

### Task 5: `codex-structured-output` skill

**Files:**
- Create: `skills/codex-structured-output/SKILL.md`

**Interfaces:**
- Consumes: schema files from Task 2, runner `--schema` flag from Task 3.

- [ ] **Step 1: Write `skills/codex-structured-output/SKILL.md`**

```markdown
---
name: codex-structured-output
description: Get machine-readable JSON out of Codex runs using --output-schema — pick a bundled schema (review-findings, verdict, task-report, patch-plan) or author an ad-hoc one. Use when a Codex result should be parsed and acted on rather than read as prose.
---

# Structured output from Codex

`codex exec --output-schema <file>` forces the final agent message to
be JSON matching the given JSON Schema. The runner exposes it as
`--schema <path>`.

## Bundled schemas (`${CLAUDE_PLUGIN_ROOT}/schemas/`)

| Schema | Use for | Shape |
|---|---|---|
| `review-findings.schema.json` | code review | `{overall, findings[]: {file, line?, severity, summary, failure_scenario}}` |
| `verdict.schema.json` | fact-check a claim | `{claim, verdict: confirmed\|refuted\|uncertain, evidence, confidence?}` |
| `task-report.schema.json` | report after a mutating task | `{summary, files_changed[], commands_run[]?, risks[]?, follow_ups[]?}` |
| `patch-plan.schema.json` | plan before edits | `{steps[]: {file, change, rationale?}, notes?}` |

## Ad-hoc schemas

Write to the session scratchpad, then pass its path. Rules that make
Codex fill schemas reliably:

- Keep it FLAT — one level of nesting max (arrays of flat objects OK).
- Minimal `required`; optional fields get filled opportunistically.
- `additionalProperties: false` at every level.
- Use `enum` for anything categorical.
- Describe fields with `description` — Codex reads them.

## Parsing

The JSON arrives as the final message (also in the runner's
`last-message.txt` artifact). Parse it; on parse failure treat the run
as failed and retry once with the instruction "Return ONLY the JSON
object, no fences" appended.

Always verify substantive claims in parsed output against the repo
before acting — schema conformance is not truth.
```

- [ ] **Step 2: Commit**

```bash
git add skills/codex-structured-output && git commit -m "feat: codex-structured-output skill"
```

---

### Task 6: `prompting-codex` skill (adapted from upstream, Apache-2.0)

**Files:**
- Create: `skills/prompting-codex/SKILL.md`
- Create: `skills/prompting-codex/references/prompt-blocks.md` (copied)
- Create: `skills/prompting-codex/references/codex-prompt-recipes.md` (copied)
- Create: `skills/prompting-codex/references/codex-prompt-antipatterns.md` (copied)

**Interfaces:**
- Consumes: upstream files at `~/.claude/plugins/cache/openai-codex/codex/1.0.6/skills/gpt-5-4-prompting/references/` (Apache-2.0; NOTICE from Task 1 covers attribution).

- [ ] **Step 1: Copy the three reference files verbatim**

```bash
cp ~/.claude/plugins/cache/openai-codex/codex/1.0.6/skills/gpt-5-4-prompting/references/*.md skills/prompting-codex/references/
```

- [ ] **Step 2: Write the adapted `skills/prompting-codex/SKILL.md`** (rewritten for cdx: no rescue-subagent framing, no `task`-helper references; targets the runner)

```markdown
---
name: prompting-codex
description: Compose effective prompts for Codex (GPT-5.x-Codex models) — task framing, output contracts, verification blocks. Use before any non-trivial Codex delegation to tighten the prompt.
---

# Prompting Codex

Prompt Codex like an operator, not a collaborator. Compact,
block-structured prompts with XML tags: state the task, the output
contract, the follow-through defaults, and only the extra constraints
that matter.

Core rules:
- One clear task per run. Split unrelated asks into separate runs.
- Tell Codex what done looks like — it will not infer the end state.
- Add explicit grounding/verification rules wherever unsupported
  guesses would hurt.
- Tighten the prompt contract before raising reasoning effort.

Default recipe:
- `<task>`: the concrete job plus relevant repo/failure context.
- `<structured_output_contract>` or `<compact_output_contract>`:
  exact shape and brevity requirements (omit when the runner passes
  `--schema` — the schema IS the contract; still state field
  intent in the task).
- `<default_follow_through_policy>`: what to do instead of asking
  routine questions.
- `<verification_loop>` / `<completeness_contract>`: required for
  debugging, implementation, risky fixes.
- `<grounding_rules>` / `<citation_rules>`: required for review,
  research, or claim-heavy output.

Add blocks by task type:
- Coding/debugging: `completeness_contract`, `verification_loop`,
  `missing_context_gating`.
- Review: `grounding_rules`, `dig_deeper_nudge` (+ `--schema
  review-findings`).
- Research: `research_mode`, `citation_rules` (+ `--search`).
- Write-capable runs: `action_safety` — stay narrow, no unrelated
  refactors.

Resume follow-ups (`--resume <id>`): send only the delta instruction,
not the restated prompt, unless direction changed materially.

Reusable blocks: [references/prompt-blocks.md](references/prompt-blocks.md).
End-to-end templates: [references/codex-prompt-recipes.md](references/codex-prompt-recipes.md).
Failure modes: [references/codex-prompt-antipatterns.md](references/codex-prompt-antipatterns.md).

Adapted from openai/codex-plugin-cc's gpt-5-4-prompting skill
(Apache-2.0); see NOTICE.
```

- [ ] **Step 3: Verify the three reference files copied intact**

Run: `wc -l skills/prompting-codex/references/*.md`
Expected: `100`, `150`, `172` lines respectively (422 total)

- [ ] **Step 4: Commit**

```bash
git add skills/prompting-codex && git commit -m "feat: prompting-codex skill adapted from upstream (Apache-2.0, see NOTICE)"
```

---

### Task 7: Commands (6 thin aliases)

**Files:**
- Create: `commands/task.md`, `commands/review.md`, `commands/fleet.md`, `commands/session.md`, `commands/cloud.md`, `commands/setup.md`

**Interfaces:**
- Consumes: `driving-codex` skill heuristics, runner contract, schema paths.

- [ ] **Step 1: Write `commands/task.md`**

```markdown
---
description: Delegate a task to Codex with full flag control (model, effort, sandbox, search, images, schema, resume)
argument-hint: "[--bg|--wait] [--model m|spark] [--effort none|minimal|low|medium|high|xhigh] [--sandbox ro|write|full] [--search] [--image <f>] [--schema <name|file>] [--resume [id]|--fresh] [--local [lmstudio|ollama]] [-c k=v] <prompt>"
allowed-tools: Bash, Read, Grep, Glob
---

Use the cdx:driving-codex skill. Delegate the following to Codex via the runner:

$ARGUMENTS

Rules:
- `--bg`/`--wait` control Claude-side execution (background Bash vs foreground); strip them from the runner call. Default: background if the task looks > ~1 minute, else foreground.
- `--schema <name>` where name is one of review-findings|verdict|task-report|patch-plan maps to `${CLAUDE_PLUGIN_ROOT}/schemas/<name>.schema.json`; a path is passed through.
- `--resume` with no id means `--resume last`. `--fresh` means do not resume; strip it.
- Any flag the user did not set: choose per the driving-codex heuristics. Do not ask.
- After the run: parse/verify/act per driving-codex "Acting on results", then report outcome + session id.
```

- [ ] **Step 2: Write `commands/review.md`**

```markdown
---
description: Codex code review — structured findings Claude verifies, or Codex's native reviewer
argument-hint: "[--uncommitted|--base <ref>|--commit <sha>] [--native] [focus text]"
allowed-tools: Bash, Read, Grep, Glob
---

Use the cdx:driving-codex skill. Review request:

$ARGUMENTS

Default (structured) path:
1. Determine target: `--uncommitted` → staged+unstaged+untracked (also the default when no target flag is given and the working tree is dirty); `--base <ref>` → `git diff <ref>...HEAD`; `--commit <sha>` → that commit.
2. Run the runner with `--sandbox ro --schema ${CLAUDE_PLUGIN_ROOT}/schemas/review-findings.schema.json` and a prompt of the form:
   "Review the following change for correctness bugs, security issues, and broken edge cases. Focus: <focus text or 'general correctness'>. Repository root: <cwd>. Inspect the code in place; the diff target is: <target description>. Report only findings you can support with a concrete failure scenario."
3. Parse findings JSON. Verify each finding against the repo (read the cited file/line). Report confirmed findings first, then plausible-but-unverified, then Codex's overall assessment.

`--native` path: run `codex review` with the matching target flag (`--uncommitted`, `--base <ref>`, or `--commit <sha>`) and optional focus text as PROMPT; return its output with attribution to Codex, no verification pass.
This command never fixes anything — report only.
```

- [ ] **Step 3: Write `commands/fleet.md`**

```markdown
---
description: Fan out N parallel Codex workers on a task (decomposition, second opinions, or A/B implementations)
argument-hint: "[--n <2-4>] [--angles \"<a>;<b>;...\"] <task>"
allowed-tools: Bash, Read, Grep, Glob
---

Use the cdx:driving-codex skill, Fleet section. Task:

$ARGUMENTS

- Default `--n 2`; cap at 4 unless the user explicitly asks for more.
- With `--angles`, one worker per angle (each `--sandbox ro`, reporting via `--schema ${CLAUDE_PLUGIN_ROOT}/schemas/task-report.schema.json` or review-findings for review angles).
- Without `--angles`, decompose the task into non-overlapping subtasks yourself; mutating workers get `--sandbox write` and MUST have disjoint file scopes stated explicitly in their prompts.
- Launch every worker with Bash `run_in_background: true`, each with its own `--scratch` dir under the session scratchpad.
- When all report: synthesize — dedupe, note agreements/disagreements, pick winners. Present one unified result with per-worker session ids.
```

- [ ] **Step 4: Write `commands/session.md`**

```markdown
---
description: List, resume, fork Codex sessions or apply a session's diff
argument-hint: "list [--all] | resume <id|--last> [prompt] | fork <id> | apply <task_id>"
allowed-tools: Bash, Read
---

Use the cdx:driving-codex skill, Sessions section. Request:

$ARGUMENTS

- `list`: read `~/.codex/session_index.jsonl`, show the 15 most recent as a table (id prefix, thread name, updated). `--all` shows all.
- `resume <id|--last> [prompt]`: runner with `--resume <id|last>` and the prompt (ask what to send only if no prompt given and intent is unclear).
- `fork <id>`: run `codex fork <id>` and report the new session id.
- `apply <task_id>`: run `codex apply <task_id>`, then `git diff --stat` and report what landed. Warn if the working tree was dirty beforehand.
```

- [ ] **Step 5: Write `commands/cloud.md`**

```markdown
---
description: Submit and manage Codex Cloud tasks (exec, list, status, diff, apply)
argument-hint: "exec <prompt> | list | status <id> | diff <id> | apply <id>"
allowed-tools: Bash, Read
---

Use the cdx:driving-codex skill, Cloud section. Request:

$ARGUMENTS

Map directly to `codex cloud exec|list|status|diff|apply`. These commands are experimental upstream — surface their output faithfully, including errors. Before `apply`, show the diff (`codex cloud diff <id>`) and confirm with the user unless they already said to apply.
```

- [ ] **Step 6: Write `commands/setup.md`**

```markdown
---
description: Check Codex CLI health — install, auth, version, features, config pitfalls
argument-hint: ""
allowed-tools: Bash, Read, AskUserQuestion
---

Health-check the Codex integration:

1. `codex --version` — if missing, offer to `npm install -g @openai/codex` (AskUserQuestion, install first + "(Recommended)").
2. `codex doctor` — surface anything non-healthy.
3. Auth: if doctor reports auth problems, tell the user to run `!codex login`.
4. Version drift: compare `codex --version` to the verified version in `${CLAUDE_PLUGIN_ROOT}/skills/driving-codex/references/flag-map.md`; if newer, note that the flag map may lag and new flags may exist.
5. Config pitfalls: grep `~/.codex/config.toml` for `model =` — if the pinned model is rejected by this CLI (signature: "requires a newer version of Codex"), recommend `codex update` or removing the pin.
6. Smoke: run the runner with `--sandbox ro --model spark --ephemeral -- "Reply with exactly: ok"` and report pass/fail.

Report all findings compactly.
```

- [ ] **Step 7: Verify all six command files have valid frontmatter**

Run: `for f in commands/*.md; do node -e "const s=require('fs').readFileSync('$f','utf8'); if(!/^---\n[\s\S]*?\n---/.test(s)) {console.error('$f: bad frontmatter'); process.exit(1)}"; done && echo "commands OK"`
Expected: `commands OK`

- [ ] **Step 8: Commit**

```bash
git add commands && git commit -m "feat: six thin command aliases over driving-codex"
```

---

### Task 8: Real-Codex smoke tests

**Files:**
- Create: `tests/smoke.sh`

**Interfaces:**
- Consumes: runner, schemas. Requires a logged-in `codex` CLI; uses `--model spark` throughout (Global Constraints: user's default model is broken on 0.143.0) and `--ephemeral` where persistence isn't under test.

- [ ] **Step 1: Write `tests/smoke.sh`**

```bash
#!/usr/bin/env bash
# Real-Codex smoke tests. Requires logged-in codex CLI. Costs a few cheap spark calls.
set -euo pipefail
cd "$(dirname "$0")/.."
RUNNER="scripts/codex-run.mjs"
SCRATCH="tests/scratch"
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
PASS=0; FAIL=0
check() { # name, condition
  if eval "$2"; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi
}

# 1. Basic run captures session + final message
OUT1=$(node "$RUNNER" --sandbox ro --model spark --ephemeral --scratch "$SCRATCH/basic" --cd "$SCRATCH" -- "Reply with exactly the word: hello" || true)
check "basic: completed"        '[[ "$OUT1" == *"status: completed"* ]]'
check "basic: says hello"       '[[ "$OUT1" == *"hello"* ]]'
check "basic: session id shown" '[[ "$OUT1" == *"session: "* && "$OUT1" != *"session: unknown"* ]]'

# 2. Schema run returns parseable JSON matching verdict shape
OUT2=$(node "$RUNNER" --sandbox ro --model spark --ephemeral --scratch "$SCRATCH/schema" --cd "$SCRATCH" \
  --schema schemas/verdict.schema.json -- "Claim to evaluate: the sky is sometimes blue. Return your verdict." || true)
check "schema: completed" '[[ "$OUT2" == *"status: completed"* ]]'
check "schema: valid verdict JSON" 'node -e "const j=JSON.parse(require(\"fs\").readFileSync(\"$SCRATCH/schema/last-message.txt\",\"utf8\")); if(![\"confirmed\",\"refuted\",\"uncertain\"].includes(j.verdict)) process.exit(1)"'

# 3. Resume round-trip (persistent session, then continue it)
OUT3=$(node "$RUNNER" --sandbox ro --model spark --scratch "$SCRATCH/resume-a" --cd "$SCRATCH" -- "Remember the codeword: pineapple42. Reply: stored." || true)
SID=$(echo "$OUT3" | sed -n 's/^session: //p')
check "resume: first run completed" '[[ "$OUT3" == *"status: completed"* && -n "$SID" ]]'
OUT4=$(node "$RUNNER" --sandbox ro --model spark --scratch "$SCRATCH/resume-b" --cd "$SCRATCH" --resume "$SID" -- "What was the codeword? Reply with just the codeword." || true)
check "resume: codeword recalled" '[[ "$OUT4" == *"pineapple42"* ]]'

# 4. Fleet: two parallel workers both complete
node "$RUNNER" --sandbox ro --model spark --ephemeral --scratch "$SCRATCH/fleet-1" --cd "$SCRATCH" -- "Reply with exactly: worker one done" > "$SCRATCH/f1.out" 2>&1 &
P1=$!
node "$RUNNER" --sandbox ro --model spark --ephemeral --scratch "$SCRATCH/fleet-2" --cd "$SCRATCH" -- "Reply with exactly: worker two done" > "$SCRATCH/f2.out" 2>&1 &
P2=$!
wait $P1 || true; wait $P2 || true
check "fleet: worker one" 'grep -q "worker one done" "$SCRATCH/f1.out"'
check "fleet: worker two" 'grep -q "worker two done" "$SCRATCH/f2.out"'

echo "----"
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
```

Then: `chmod +x tests/smoke.sh`

- [ ] **Step 2: Run unit tests first (fast, free)**

Run: `node --test tests/`
Expected: PASS (all runner + schema tests)

- [ ] **Step 3: Run the smoke tests (real Codex, ~5 spark calls)**

Run: `bash tests/smoke.sh`
Expected: `smoke: 9 passed, 0 failed`, exit 0. If the resume test fails on cwd filtering, re-run — `exec resume` filters sessions by cwd; both runs use `--cd tests/scratch` so they match.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke.sh && git commit -m "test: real-Codex smoke suite (basic, schema, resume, fleet)"
```

---

### Task 9: Local install, replace official plugin, verify

**Files:**
- Modify: `README.md` (full documentation)

**Interfaces:**
- Consumes: marketplace.json (Task 1). Produces: installed `cdx@cdx` plugin; official `codex@openai-codex` removed.

- [ ] **Step 1: Install cdx from local path**

```bash
claude plugin marketplace add ~/Projects/cdx
claude plugin install cdx@cdx
```
Expected: install success message.

- [ ] **Step 2: Verify component inventory**

Run: `claude plugin details cdx`
Expected: lists 6 commands (task, review, fleet, session, cloud, setup), 3 skills (driving-codex, codex-structured-output, prompting-codex).

- [ ] **Step 3: Uninstall the official plugin and its marketplace**

```bash
claude plugin uninstall codex@openai-codex
claude plugin marketplace remove openai-codex
```
Expected: both succeed. (`claude plugin uninstall --help` first if the subcommand name differs; `remove`/`rm` are the marketplace aliases.)

- [ ] **Step 4: Verify no orphaned codex plugin remains**

Run: `claude plugin list | grep -i codex`
Expected: only `cdx` entries; no `codex@openai-codex`.

- [ ] **Step 5: Expand README.md** — document: philosophy (skill-first, NL invocation), the 6 commands with argument hints, the 3 skills, schema library, runner contract, safety model (sandbox defaults, no danger flags), verified-version policy, testing (`node --test tests/`, `tests/smoke.sh`), license/NOTICE. Include the natural-language examples ("spawn codex on the failing tests", "get a codex second opinion on this diff", "have codex fix this in the background").

- [ ] **Step 6: Commit**

```bash
git add README.md && git commit -m "docs: full README"
```

- [ ] **Step 7: Acceptance check (next session)** — in a NEW Claude Code session (plugins load at start), say "spawn codex to summarize this repo" and confirm the driving-codex skill triggers and picks `--sandbox ro`. Note this for the user; it cannot be verified from inside the current session.

---

### Task 10: Publish to GitHub + list in nuko marketplace

**Files:**
- Modify (external repo): `nuko-nova-dynamics/claude-marketplace` → `.claude-plugin/marketplace.json`

- [ ] **Step 1: Create and push the GitHub repo**

```bash
cd ~/Projects/cdx
gh repo create nuko-nova-dynamics/cdx --public --source . --push
```
Expected: repo created, main pushed. (Public matches the claude-goal precedent; it also lets marketplace installs work without auth.)

- [ ] **Step 2: Tag the release**

```bash
git tag cdx-marketplace-v0.1.0 && git push origin cdx-marketplace-v0.1.0
```

- [ ] **Step 3: Add cdx to the nuko-nova-tools marketplace** — clone `nuko-nova-dynamics/claude-marketplace` to `~/Projects/_reference/../claude-marketplace` (or a scratch clone), append to its `plugins` array (matching the claude-goal entry shape):

```json
{
  "name": "cdx",
  "source": {
    "source": "url",
    "url": "https://github.com/nuko-nova-dynamics/cdx.git",
    "ref": "cdx-marketplace-v0.1.0",
    "sha": "<tag commit sha>"
  },
  "description": "Full-surface Codex CLI integration: say \"spawn codex\" and Claude drives codex exec directly — flags chosen per task, structured JSON results, parallel fleets, session resume/fork/apply, Codex Cloud. Replaces the official openai-codex plugin's locked-down forwarder.",
  "author": { "name": "Nuko Nova Dynamics", "email": "hello@nukonova.com" },
  "homepage": "https://github.com/nuko-nova-dynamics/cdx",
  "repository": "https://github.com/nuko-nova-dynamics/cdx",
  "license": "Apache-2.0",
  "category": "agent-tooling",
  "tags": ["codex", "delegation", "review", "multi-model", "structured-output"]
}
```

Validate JSON parses, commit ("Add cdx v0.1.0"), push.

- [ ] **Step 4: Final commit of any local changes and report**

```bash
cd ~/Projects/cdx && git status --short
```
Expected: clean tree. Report install/publish state to the user.
