import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const RUNNER = new URL("../scripts/codex-run.mjs", import.meta.url).pathname;
const FAKE = new URL("./fixtures/fake-codex", import.meta.url).pathname;

// Host defaults must not leak into the tests; each test sets them explicitly.
const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^CDX_(DEFAULT_MODEL|DEFAULT_EFFORT|MODEL_\w+)$/.test(k)),
);

function run(args, extraEnv = {}) {
  return spawnSync("node", [RUNNER, ...args], {
    env: { ...BASE_ENV, CDX_CODEX_BIN: FAKE, ...extraEnv },
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

test("resume builds the narrower exec-resume argv (no --sandbox; -c sandbox_mode instead)", () => {
  const argsFile = path.join(tmpdir(), `cdx-test-args-${process.pid}.txt`);
  const r = run(["--sandbox", "ro", "--resume", "abc-123", "--", "continue"], {
    FAKE_CODEX_ARGS_FILE: argsFile,
  });
  assert.equal(r.status, 0, r.stderr);
  const args = readFileSync(argsFile, "utf8").trim().split("\n");
  assert.deepEqual(args.slice(0, 2), ["exec", "resume"]);
  assert.ok(args.includes("abc-123"), "session id passed");
  assert.ok(!args.includes("--sandbox"), "--sandbox must not be passed to exec resume");
  assert.ok(args.includes('sandbox_mode="read-only"'), "sandbox mapped via -c sandbox_mode");
});

test("resume rejects flags exec-resume does not support", () => {
  const r = run(["--sandbox", "ro", "--resume", "abc-123", "--local", "--", "go"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--local.*not supported.*resume/i);
});

test("--search maps to the web_search config key, never a --search flag (removed in codex 0.144.0)", () => {
  const argsFile = path.join(tmpdir(), `cdx-test-search-args-${process.pid}.txt`);
  const r = run(["--sandbox", "ro", "--search", "--", "look this up"], {
    FAKE_CODEX_ARGS_FILE: argsFile,
  });
  assert.equal(r.status, 0, r.stderr);
  const args = readFileSync(argsFile, "utf8").trim().split("\n");
  assert.ok(!args.includes("--search"), "--search flag must not reach codex");
  assert.ok(args.includes('web_search="live"'), "search mapped via -c web_search");
});

test("non-git working dir auto-adds --skip-git-repo-check", () => {
  const argsFile = path.join(tmpdir(), `cdx-test-nogit-args-${process.pid}.txt`);
  const r = spawnSync("node", [RUNNER, "--sandbox", "ro", "--", "audit this"], {
    env: { ...process.env, CDX_CODEX_BIN: FAKE, FAKE_CODEX_ARGS_FILE: argsFile },
    cwd: tmpdir(),
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  const args = readFileSync(argsFile, "utf8").trim().split("\n");
  assert.ok(args.includes("--skip-git-repo-check"), "flag auto-added outside a git repo");
});

test("git working dir does not add --skip-git-repo-check", () => {
  const argsFile = path.join(tmpdir(), `cdx-test-git-args-${process.pid}.txt`);
  const r = run(["--sandbox", "ro", "--", "hello"], { FAKE_CODEX_ARGS_FILE: argsFile });
  assert.equal(r.status, 0, r.stderr);
  const args = readFileSync(argsFile, "utf8").trim().split("\n");
  assert.ok(!args.includes("--skip-git-repo-check"), "flag absent inside a git repo");
});

test("--cd target decides the git check, not the process cwd", () => {
  const argsFile = path.join(tmpdir(), `cdx-test-cd-args-${process.pid}.txt`);
  const r = spawnSync("node", [RUNNER, "--sandbox", "ro", "--cd", tmpdir(), "--", "go"], {
    env: { ...process.env, CDX_CODEX_BIN: FAKE, FAKE_CODEX_ARGS_FILE: argsFile },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  const args = readFileSync(argsFile, "utf8").trim().split("\n");
  assert.ok(args.includes("--skip-git-repo-check"), "flag added when --cd target is not a repo");
});

test("--fast maps to service_tier config key (works on exec and resume)", () => {
  const argsFile = path.join(tmpdir(), `cdx-test-fast-args-${process.pid}.txt`);
  const r = run(["--sandbox", "ro", "--fast", "--", "quick job"], {
    FAKE_CODEX_ARGS_FILE: argsFile,
  });
  assert.equal(r.status, 0, r.stderr);
  const args = readFileSync(argsFile, "utf8").trim().split("\n");
  assert.ok(args.includes('service_tier="fast"'), "fast tier mapped via -c service_tier");
});

test("--search works on resume too (config key is resume-safe)", () => {
  const argsFile = path.join(tmpdir(), `cdx-test-search-resume-args-${process.pid}.txt`);
  const r = run(["--sandbox", "ro", "--resume", "abc-123", "--search", "--", "go"], {
    FAKE_CODEX_ARGS_FILE: argsFile,
  });
  assert.equal(r.status, 0, r.stderr);
  const args = readFileSync(argsFile, "utf8").trim().split("\n");
  assert.ok(args.includes('web_search="live"'), "search mapped via -c web_search on resume");
});

function isolatedRun(t, args, extraEnv = {}) {
  const scratch = mkdtempSync(path.join(tmpdir(), "cdx-regression-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const argsFile = path.join(scratch, "argv.txt");
  const r = run(["--scratch", scratch, ...args], { FAKE_CODEX_ARGS_FILE: argsFile, ...extraEnv });
  return { ...r, scratch, args: r.status === 0 ? readFileSync(argsFile, "utf8").trim().split("\n") : [] };
}

test("help works without a sandbox, prompt, or installed Codex", () => {
  const r = run(["--help"], { CDX_CODEX_BIN: "/nonexistent/codex" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /max.*ultra/);
  assert.match(r.stdout, /--fork/);
});

test("model and effort remain inherited unless explicitly requested", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--", "hello"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.args.includes("-m"));
  assert.ok(!r.args.some((a) => a.startsWith("model_reasoning_effort=")));
  assert.ok(!r.args.includes("--approve-for-me"));
});

test("CDX_DEFAULT_MODEL and CDX_DEFAULT_EFFORT apply when flags are absent", (t) => {
  const env = { CDX_DEFAULT_MODEL: "gpt-6-luna", CDX_DEFAULT_EFFORT: "xhigh" };
  const r = isolatedRun(t, ["--sandbox", "ro", "--", "hello"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.args[r.args.indexOf("-m") + 1], "gpt-6-luna");
  assert.ok(r.args.includes('model_reasoning_effort="xhigh"'));
});

test("explicit --model and --effort override the host defaults", (t) => {
  const env = { CDX_DEFAULT_MODEL: "gpt-6-luna", CDX_DEFAULT_EFFORT: "xhigh" };
  const r = isolatedRun(t, ["--sandbox", "ro", "--model", "gpt-6.1-sol", "--effort", "medium", "--", "hello"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.args[r.args.indexOf("-m") + 1], "gpt-6.1-sol");
  assert.ok(r.args.includes('model_reasoning_effort="medium"'));
  assert.ok(!r.args.includes('model_reasoning_effort="xhigh"'));
});

test("--local ignores CDX_DEFAULT_MODEL and an invalid CDX_DEFAULT_EFFORT is a usage error", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--local", "--", "hello"], { CDX_DEFAULT_MODEL: "gpt-6-luna" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.args.includes("-m"));
  const bad = run(["--sandbox", "ro", "--", "hello"], { CDX_DEFAULT_EFFORT: "bogus" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /CDX_DEFAULT_EFFORT/);
});

for (const model of ["gpt-6.1-sol", "gpt-6-astra"]) {
  for (const effort of ["max", "ultra"]) {
    for (const mode of [[], ["--resume", "abc-123"], ["--fork", "abc-123"]]) {
      test(`${effort} and explicit ${model} survive ${mode[0] || "fresh"} invocation`, (t) => {
        const r = isolatedRun(t, ["--sandbox", "ro", ...mode, "--model", model, "--effort", effort, "--fast", "--", "check"]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.args[r.args.indexOf("-m") + 1], model);
        assert.ok(r.args.includes(`model_reasoning_effort="${effort}"`));
        assert.ok(r.args.includes('service_tier="fast"'));
      });
    }
  }
}

test("fork creates a noninteractive branch with sandbox and schema preserved", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--fork", "abc-123", "--schema", "schemas/verdict.schema.json", "--", "check"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.args.slice(0, 3), ["exec", "fork", "abc-123"]);
  assert.ok(r.args.includes('sandbox_mode="read-only"'));
  assert.ok(!r.args.includes("--sandbox"));
  assert.equal(r.args[r.args.indexOf("--output-schema") + 1], path.resolve("schemas/verdict.schema.json"));
});

test("conflicting session operations and unsupported continuation options fail before spawn", () => {
  for (const args of [
    ["--resume", "abc", "--fork", "def"],
    ["--fork", "abc", "--cd", tmpdir()],
    ["--fork", "abc", "--local"],
    ["--fork", "abc", "--add-dir", tmpdir()],
  ]) {
    const r = run(["--sandbox", "ro", ...args, "--", "hello"]);
    assert.equal(r.status, 2, r.stderr);
  }
});

test("fork without a prompt reports creation without requiring a completed turn", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--fork", "abc-123"], { FAKE_CODEX_MODE: "fork-only" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /status: forked/);
  assert.ok(!r.args.includes("-o"));
  assert.doesNotMatch(r.stdout, /status: completed/);
  for (const extra of [["--schema", "schema.json"], ["--image", "mock.png"], ["--ephemeral"]]) {
    const rejected = run(["--sandbox", "ro", "--fork", "abc-123", ...extra]);
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /requires a prompt/);
  }
});

test("automatic review is explicit and restricted to fresh workspace-write runs", (t) => {
  const r = isolatedRun(t, ["--sandbox", "write", "--approve-for-me", "--", "fix"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.args.includes("--approve-for-me"));
  assert.equal(r.args[r.args.indexOf("--sandbox") + 1], "workspace-write");
  for (const args of [
    ["--sandbox", "ro"], ["--sandbox", "full"],
    ["--sandbox", "write", "--resume", "abc"],
    ["--sandbox", "write", "--fork", "abc"],
  ]) {
    const rejected = run([...args, "--approve-for-me", "--", "fix"]);
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /requires a fresh --sandbox write/);
  }
});

test("option-looking prompts stay literal and attachment paths survive --cd", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--cd", tmpdir(), "--image", "mock.png", "--", "--help"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.args.slice(-2), ["--", "--help"]);
  assert.equal(r.args[r.args.indexOf("-i") + 1], path.resolve("mock.png"));
});

test("stderr-only CLI failures expose the actual cause", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--", "hello"], { FAKE_CODEX_MODE: "stderr-only" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /unsupported model for this account/);
});

test("a reused scratch directory cannot report an old answer", (t) => {
  const scratch = mkdtempSync(path.join(tmpdir(), "cdx-stale-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  writeFileSync(path.join(scratch, "last-message.txt"), "stale answer");
  const r = run(["--scratch", scratch, "--sandbox", "ro", "--", "hello"], { FAKE_CODEX_MODE: "empty-success" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\(no final message\)/);
  assert.doesNotMatch(r.stdout, /stale answer/);
});

test("a later failed turn cannot reuse an earlier completion status", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--", "hello"], { FAKE_CODEX_MODE: "failed-after-completed" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /later turn failed/);
});

test("large event and stderr artifacts are complete when the runner exits", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--", "hello"], { FAKE_CODEX_MODE: "large" });
  assert.equal(r.status, 0, r.stderr);
  const events = readFileSync(path.join(r.scratch, "events.jsonl"), "utf8").trim().split("\n");
  assert.equal(JSON.parse(events.at(-1)).type, "turn.completed");
  assert.equal(events.length, 107);
  const stderr = readFileSync(path.join(r.scratch, "stderr.log"), "utf8");
  assert.equal(stderr.length, 100 * 16385 + "stderr complete\n".length);
  assert.ok(stderr.endsWith("stderr complete\n"));
});

test("unwritable artifact destinations fail without an unhandled stream error", (t) => {
  const scratch = mkdtempSync(path.join(tmpdir(), "cdx-artifact-error-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  mkdirSync(path.join(scratch, "events.jsonl"));
  const r = run(["--scratch", scratch, "--sandbox", "ro", "--", "hello"]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /Could not write artifacts/);
  assert.doesNotMatch(r.stderr, /Unhandled/);
});

test("--lean skips user config and connector apps on a fresh run", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--lean", "--model", "gpt-6-luna", "--effort", "xhigh", "--", "hello"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.args.includes("--ignore-user-config"));
  assert.ok(r.args.includes("apps._default.enabled=false"));
  assert.equal(r.args[r.args.indexOf("-m") + 1], "gpt-6-luna");
  assert.ok(r.args.includes('model_reasoning_effort="xhigh"'));
});

test("--lean rejects continuation, --local, and a missing model", () => {
  const resume = run(["--sandbox", "ro", "--lean", "--model", "gpt-6-luna", "--resume", "abc-123", "--", "more"]);
  assert.notEqual(resume.status, 0);
  assert.match(resume.stderr, /--lean is only supported on a fresh run/);
  const local = run(["--sandbox", "ro", "--lean", "--local", "--model", "gpt-6-luna", "--", "hello"]);
  assert.notEqual(local.status, 0);
  assert.match(local.stderr, /--lean cannot be combined with --local/);
  const noModel = run(["--sandbox", "ro", "--lean", "--", "hello"]);
  assert.notEqual(noModel.status, 0);
  assert.match(noModel.stderr, /--lean requires --model/);
});

test("--lean accepts CDX_DEFAULT_MODEL in place of --model", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--lean", "--", "hello"], { CDX_DEFAULT_MODEL: "gpt-6-luna", CDX_DEFAULT_EFFORT: "xhigh" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.args.includes("--ignore-user-config"));
  assert.equal(r.args[r.args.indexOf("-m") + 1], "gpt-6-luna");
});

test("--progress writes the session id, then one stderr line per command, and keeps stdout unchanged", () => {
  const r = run(["--sandbox", "ro", "--progress", "--", "say hi"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "cdx-progress: session fake-thread-123\ncdx-progress: $ ls\n");
  assert.match(r.stdout, /fake done/);
  assert.equal(run(["--sandbox", "ro", "--", "say hi"]).stderr, "", "no progress without the flag");
});

test("error items are reported as warnings, not errors, and do not fail the run", () => {
  const r = run(["--sandbox", "ro", "--progress", "--", "say hi"], { FAKE_CODEX_MODE: "warning" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /status: completed/);
  assert.match(r.stdout, /--- warnings ---\n- Under-development features enabled: demo/);
  assert.doesNotMatch(r.stdout, /--- errors ---/);
  assert.match(r.stderr, /cdx-progress: warning Under-development features enabled: demo/);
});

test("--claude-channel gives Codex a pre-approved message_claude tool and reports each completed call", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--claude-channel", "--", "say hi"], { FAKE_CODEX_MODE: "message" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.args.some((a) => /^mcp_servers\.cdx_claude\.args=\[".*claude-channel-mcp\.mjs"\]$/.test(a)));
  assert.ok(r.args.includes('mcp_servers.cdx_claude.tools.message_claude.approval_mode="approve"'));
  assert.equal(r.stderr, 'cdx-message: "halfway:\\nfound it"\n', "one line per completed call, none for a failed one");
  const plain = isolatedRun(t, ["--sandbox", "ro", "--", "say hi"], { FAKE_CODEX_MODE: "message" });
  assert.equal(plain.stderr, "");
  assert.ok(!plain.args.some((a) => a.startsWith("mcp_servers.cdx_claude")));
});

test("a message over 4000 characters is cut at a code point and marked", () => {
  const text = "a".repeat(3999) + "\u{1F600}" + "tail";
  const r = run(["--sandbox", "ro", "--claude-channel", "--", "say hi"], { FAKE_CODEX_MODE: "message", FAKE_CODEX_MESSAGE: text });
  assert.equal(r.status, 0, r.stderr);
  const sent = JSON.parse(r.stderr.trim().slice("cdx-message: ".length));
  assert.equal(sent, "a".repeat(3999) + "\u{1F600} [cut at 4000 characters]");
});

test("the message_claude server ignores non-object input and refuses calls past its limit", () => {
  const server = new URL("../scripts/claude-channel-mcp.mjs", import.meta.url).pathname;
  const call = (id) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "message_claude", arguments: { text: "x" } } });
  const input = ["null", JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }), ...Array.from({ length: 21 }, (_, i) => call(i + 1))].join("\n") + "\n";
  const r = spawnSync("node", [server], { input, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const replies = r.stdout.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(replies[0], { jsonrpc: "2.0", id: 0, result: {} });
  assert.equal(replies.length, 22);
  assert.ok(replies.slice(1, 21).every((m) => !m.result.isError));
  assert.equal(replies[21].result.isError, true);
});

// Tier names resolve through the machine's Codex catalog. The prefixed slugs
// are test data for a proxy that refuses unprefixed names and has no Astra.
function proxyCatalog(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "cdx-catalog-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "catalog.json");
  writeFileSync(file, JSON.stringify({ models: [
    { slug: "cousin-full-service/gpt-6.1-sol", visibility: "list", priority: 1 },
    { slug: "cousin-full-service/gpt-6-luna", visibility: "list", priority: 5 },
  ] }));
  return { FAKE_CODEX_CATALOG: file, CODEX_HOME: dir };
}

test("--model <tier> sends the model the catalog lists, prefix included, and reports it", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--model", "sol", "--", "hello"], proxyCatalog(t));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.args[r.args.indexOf("-m") + 1], "cousin-full-service/gpt-6.1-sol");
  assert.match(r.stdout, /^model: cousin-full-service\/gpt-6\.1-sol \(sol tier, from .* debug models\)$/m);
  assert.match(r.stdout, /^session: /);
});

test("CDX_DEFAULT_MODEL may name a tier", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--", "hello"], { ...proxyCatalog(t), CDX_DEFAULT_MODEL: "luna" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.args[r.args.indexOf("-m") + 1], "cousin-full-service/gpt-6-luna");
});

test("a tier the catalog lacks stops the run before Codex starts, naming the override", (t) => {
  const scratchDir = mkdtempSync(path.join(tmpdir(), "cdx-regression-"));
  t.after(() => rmSync(scratchDir, { recursive: true, force: true }));
  const argsFile = path.join(scratchDir, "argv.txt");
  const r = run(["--sandbox", "ro", "--model", "astra", "--", "hello"], { ...proxyCatalog(t), FAKE_CODEX_ARGS_FILE: argsFile });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no astra model in this machine's Codex catalog/);
  assert.match(r.stderr, /CDX_MODEL_ASTRA/);
  assert.throws(() => readFileSync(argsFile), /ENOENT/, "codex exec must not run");
});

test("CDX_MODEL_<TIER> overrides the catalog; an explicit model id is passed unchanged", (t) => {
  const env = { ...proxyCatalog(t), CDX_MODEL_ASTRA: "cousin-full-service/astra-override" };
  const r = isolatedRun(t, ["--sandbox", "ro", "--model", "astra", "--", "hello"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.args[r.args.indexOf("-m") + 1], "cousin-full-service/astra-override");
  assert.match(r.stdout, /\(astra tier, from CDX_MODEL_ASTRA\)/);
  const direct = isolatedRun(t, ["--sandbox", "ro", "--model", "anything/as-given", "--", "hello"], { FAKE_CODEX_DEBUG: "fail" });
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(direct.args[direct.args.indexOf("-m") + 1], "anything/as-given");
});

test("the runner's -c overrides reach the catalog read", (t) => {
  const env = proxyCatalog(t);
  const debugArgs = path.join(env.CODEX_HOME, "debug-args.txt");
  const r = isolatedRun(t, ["--sandbox", "ro", "--model", "luna", "-c", 'model_provider="proxy"', "--", "hello"],
    { ...env, FAKE_CODEX_DEBUG_ARGS_FILE: debugArgs });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readFileSync(debugArgs, "utf8").trim().split("\n"), ["debug", "models", "-c", 'model_provider="proxy"']);
});

test("a tier with --local is a usage error", () => {
  const r = run(["--sandbox", "ro", "--local", "--model", "sol", "--", "hello"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /is a tier; with --local/);
});
