import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENTS,
  agentSpec,
  answerText,
  codexModelOf,
  lineBuffer,
  parseRequest,
  runnerArgs,
  sessionOfProgress,
  threadIdOf,
} from "../hooks/codex-agent.js";

const base = { runner: "/p/scripts/codex-run.mjs", schemasDir: "/p/schemas", model: "gpt-6.1-sol" };

test("each agent type's model routes back to its Codex model; other models do not", () => {
  for (const agent of AGENTS) assert.equal(codexModelOf(agentSpec(agent).model), agent.model);
  assert.equal(codexModelOf("claude-opus-5-5"), null);
  assert.equal(codexModelOf("cdx-codex-"), null);
});

test("a plain prompt runs read-only at the agent type's default effort with progress", () => {
  const request = parseRequest("Fix the failing test");
  const { argv } = runnerArgs({ ...base, request });
  assert.deepEqual(argv, [
    "node", "/p/scripts/codex-run.mjs", "--progress", "--sandbox", "ro", "--model", "gpt-6.1-sol",
    "--effort", "xhigh", "--", "Fix the failing test",
  ]);
  assert.equal(runnerArgs({ ...base, model: "gpt-6-luna", request }).effort, "xhigh");
  assert.equal(runnerArgs({ ...base, model: "gpt-6-astra", request }).effort, "high");
});

test("a cdx: header sets flags, resolves bundled schema names, and is removed from the prompt", () => {
  const request = parseRequest('cdx: --sandbox write --effort high --search --schema verdict --add-dir "/a b"\nDo it\nnow');
  const { argv, sandbox, effort } = runnerArgs({ ...base, request });
  assert.equal(sandbox, "write");
  assert.equal(effort, "high");
  assert.deepEqual(argv.slice(-7), ["--search", "--schema", "/p/schemas/verdict.schema.json", "--add-dir", "/a b", "--", "Do it\nnow"]);
});

test("a follow-up resumes the recorded session with its sandbox and effort unless the header changes them", () => {
  const record = { thread: "t-1", sandbox: "write", effort: "high" };
  const kept = runnerArgs({ ...base, record, request: parseRequest("continue") }).argv;
  assert.deepEqual(kept.slice(3, 11), ["--sandbox", "write", "--model", "gpt-6.1-sol", "--effort", "high", "--resume", "t-1"]);
  const changed = runnerArgs({ ...base, record, request: parseRequest("cdx: --effort low\ncontinue") });
  assert.equal(changed.effort, "low");
  assert.equal(changed.sandbox, "write");
});

test("the header refuses flags the mod owns, unknown flags, missing values, and an empty prompt", () => {
  assert.match(parseRequest("cdx: --model gpt-6-luna\nhi").error, /--model is set by/);
  assert.match(parseRequest("cdx: --resume last\nhi").error, /--resume is set by/);
  assert.match(parseRequest("cdx: --bogus\nhi").error, /unknown cdx: header flag --bogus/);
  assert.match(parseRequest("cdx: --effort\nhi").error, /--effort requires a value/);
  assert.match(parseRequest("cdx: --search").error, /no prompt/);
});

test("the header refuses -c, which could replace the sandbox or approval policy", () => {
  for (const value of ['sandbox_mode="danger-full-access"', "default_permissions=:danger-full-access",
    '"\u0085sandbox_mode=danger-full-access"', 'model_verbosity="low"']) {
    assert.match(parseRequest(`cdx: -c ${value}\nhi`).error, /-c is set by/, value);
  }
});

test("a teammate envelope is unwrapped, so its cdx: header applies", () => {
  const wrapped = '<teammate-message teammate_id="team-lead" summary="x">\ncdx: --effort low\nReply ASTRA.\n</teammate-message>';
  assert.deepEqual(parseRequest(wrapped), { prompt: "Reply ASTRA.", flags: [], effort: "low" });
  const arrow = '<teammate-message teammate_id="team-lead" summary="v0.5.1 -> HEAD">\ncdx: --sandbox full --effort xhigh\nReview.\n</teammate-message>';
  assert.deepEqual(parseRequest(arrow), { prompt: "Review.", flags: [], sandbox: "full", effort: "xhigh" }, "a > inside a quoted attribute");
  const extra = '<teammate-message teammate_id="a">\nhi\n</teammate-message> and more';
  assert.match(parseRequest(extra).prompt, /^<teammate-message/, "text outside envelopes is left as is");
});

test("the answer is the runner summary, or the failure with stderr; the session id is read from it", () => {
  const summary = "session: abc\nstatus: completed\n--- final message ---\ndone\n";
  assert.equal(threadIdOf(summary), "abc");
  assert.equal(threadIdOf("session: unknown\n"), null);
  assert.equal(sessionOfProgress("session abc"), "abc");
  assert.equal(sessionOfProgress("$ ls"), null);
  assert.equal(answerText({ stdout: summary, stderrLines: [], code: 0, signal: null }), summary.trim());
  const failed = answerText({ stdout: "", stderrLines: ["codex-run: invalid --sandbox: x"], code: 2, signal: null });
  assert.match(failed, /did not complete \(exit 2\)/);
  assert.match(failed, /invalid --sandbox: x/);
});

test("lineBuffer yields whole lines and keeps a partial line until flushed", () => {
  const b = lineBuffer();
  assert.deepEqual(b.push("a\nb"), ["a"]);
  assert.deepEqual(b.push("c\n"), ["bc"]);
  assert.deepEqual(b.push("d"), []);
  assert.deepEqual(b.flush(), ["d"]);
});
