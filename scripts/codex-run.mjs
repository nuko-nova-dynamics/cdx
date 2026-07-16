#!/usr/bin/env node
// cdx runner: composes `codex exec`, tees the --json JSONL event stream to a
// scratch file, and prints a compact context-safe summary.
// Contract: exit 0 only when a turn.completed event was seen and codex exited 0.
import { spawn, spawnSync } from "node:child_process";
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
    "usage: codex-run.mjs --sandbox <ro|write|full> [--model <m|spark>] [--effort <e>] [--fast] [--search] " +
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
    } else if (a === "--fast") {
      o.fast = true;
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

// `codex exec resume` accepts a narrower flag set than `codex exec`
// (verified 0.143.0/0.144.0): no --sandbox/--oss/-C/--add-dir. Sandbox
// maps to the sandbox_mode config key; the rest are hard errors on resume.
// --search: the exec flag was removed in codex 0.144.0; the top-level
// web_search config key (disabled|cached|indexed|live) replaces it and
// works on both exec and resume.
const argv = ["exec"];
if (opts.resume) {
  for (const [flag, set] of [
    ["--local", opts.local],
    ["--cd", opts.cd],
    ["--add-dir", opts.addDirs.length > 0],
  ]) {
    if (set) die(`${flag} is not supported on resume (codex exec resume has no such flag)`);
  }
  argv.push("resume", opts.resume === "last" ? "--last" : opts.resume);
  argv.push("--json", "-o", lastMsgPath, "-c", `sandbox_mode="${sandbox}"`);
} else {
  argv.push("--json", "-o", lastMsgPath, "--sandbox", sandbox);
  if (opts.local) {
    argv.push("--oss");
    if (opts.localProvider) argv.push("--local-provider", opts.localProvider);
  }
  for (const d of opts.addDirs) argv.push("--add-dir", d);
  if (opts.cd) argv.push("-C", opts.cd);
}
// Codex refuses to run outside a git repo ("Not inside a trusted
// directory") unless --skip-git-repo-check is passed. The explicit
// --sandbox requirement is the real safety control here, so add the
// flag automatically when the effective working root isn't a repo.
const workRoot = opts.cd ?? process.cwd();
const gitCheck = spawnSync("git", ["-C", workRoot, "rev-parse", "--is-inside-work-tree"], {
  stdio: "ignore",
});
if (gitCheck.status !== 0) argv.push("--skip-git-repo-check");

if (opts.search) argv.push("-c", `web_search="live"`);
// Codex "Fast" service tier: 1.5x speed, increased usage burn. Config
// key service_tier="fast" maps to the request tier "priority".
if (opts.fast) argv.push("-c", `service_tier="fast"`);
if (opts.model) argv.push("-m", MODEL_ALIASES[opts.model] ?? opts.model);
if (opts.effort) argv.push("-c", `model_reasoning_effort="${opts.effort}"`);
if (opts.schema) argv.push("--output-schema", opts.schema);
for (const img of opts.images) argv.push("-i", img);
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
