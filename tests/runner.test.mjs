import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
