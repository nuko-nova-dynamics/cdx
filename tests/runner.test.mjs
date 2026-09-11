import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const RUNNER = new URL("../scripts/codex-run.mjs", import.meta.url).pathname;
const FAKE = new URL("./fixtures/fake-codex", import.meta.url).pathname;

// Host defaults must not leak into the tests; each test sets them explicitly.
const { CDX_DEFAULT_MODEL: _m, CDX_DEFAULT_EFFORT: _e, ...BASE_ENV } = process.env;

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
  const env = { CDX_DEFAULT_MODEL: "gpt-5.6-luna", CDX_DEFAULT_EFFORT: "xhigh" };
  const r = isolatedRun(t, ["--sandbox", "ro", "--", "hello"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.args[r.args.indexOf("-m") + 1], "gpt-5.6-luna");
  assert.ok(r.args.includes('model_reasoning_effort="xhigh"'));
});

test("explicit --model and --effort override the host defaults", (t) => {
  const env = { CDX_DEFAULT_MODEL: "gpt-5.6-luna", CDX_DEFAULT_EFFORT: "xhigh" };
  const r = isolatedRun(t, ["--sandbox", "ro", "--model", "gpt-5.6-sol", "--effort", "medium", "--", "hello"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.args[r.args.indexOf("-m") + 1], "gpt-5.6-sol");
  assert.ok(r.args.includes('model_reasoning_effort="medium"'));
  assert.ok(!r.args.includes('model_reasoning_effort="xhigh"'));
});

test("--local ignores CDX_DEFAULT_MODEL and an invalid CDX_DEFAULT_EFFORT is a usage error", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--local", "--", "hello"], { CDX_DEFAULT_MODEL: "gpt-5.6-luna" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.args.includes("-m"));
  const bad = run(["--sandbox", "ro", "--", "hello"], { CDX_DEFAULT_EFFORT: "bogus" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /CDX_DEFAULT_EFFORT/);
});

for (const effort of ["max", "ultra"]) {
  for (const mode of [[], ["--resume", "abc-123"], ["--fork", "abc-123"]]) {
    test(`${effort} and explicit Astra survive ${mode[0] || "fresh"} invocation`, (t) => {
      const r = isolatedRun(t, ["--sandbox", "ro", ...mode, "--model", "gpt-6-astra", "--effort", effort, "--fast", "--", "check"]);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.args[r.args.indexOf("-m") + 1], "gpt-6-astra");
      assert.ok(r.args.includes(`model_reasoning_effort="${effort}"`));
      assert.ok(r.args.includes('service_tier="fast"'));
    });
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
  assert.equal(events.length, 106);
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
  const r = isolatedRun(t, ["--sandbox", "ro", "--lean", "--model", "gpt-5.6-luna", "--effort", "xhigh", "--", "hello"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.args.includes("--ignore-user-config"));
  assert.ok(r.args.includes("apps._default.enabled=false"));
  assert.equal(r.args[r.args.indexOf("-m") + 1], "gpt-5.6-luna");
  assert.ok(r.args.includes('model_reasoning_effort="xhigh"'));
});

test("--lean rejects continuation, --local, and a missing model", () => {
  const resume = run(["--sandbox", "ro", "--lean", "--model", "gpt-5.6-luna", "--resume", "abc-123", "--", "more"]);
  assert.notEqual(resume.status, 0);
  assert.match(resume.stderr, /--lean is only supported on a fresh run/);
  const local = run(["--sandbox", "ro", "--lean", "--local", "--model", "gpt-5.6-luna", "--", "hello"]);
  assert.notEqual(local.status, 0);
  assert.match(local.stderr, /--lean cannot be combined with --local/);
  const noModel = run(["--sandbox", "ro", "--lean", "--", "hello"]);
  assert.notEqual(noModel.status, 0);
  assert.match(noModel.stderr, /--lean requires --model/);
});

test("--lean accepts CDX_DEFAULT_MODEL in place of --model", (t) => {
  const r = isolatedRun(t, ["--sandbox", "ro", "--lean", "--", "hello"], { CDX_DEFAULT_MODEL: "gpt-5.6-luna", CDX_DEFAULT_EFFORT: "xhigh" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.args.includes("--ignore-user-config"));
  assert.equal(r.args[r.args.indexOf("-m") + 1], "gpt-5.6-luna");
});
