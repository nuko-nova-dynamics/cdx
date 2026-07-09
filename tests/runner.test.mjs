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
