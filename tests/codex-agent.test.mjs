import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENTS,
  agentSpec,
  answerText,
  codexModelOf,
  isTeammateRequest,
  lineBuffer,
  messageOf,
  messagePrompt,
  parseRequest,
  runnerArgs,
  sessionOfProgress,
  TEAMMATE_ANSWER_LIMIT,
  teammateAnswer,
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
    "node", "/p/scripts/codex-run.mjs", "--progress", "--claude-channel", "--sandbox", "ro", "--model", "gpt-6.1-sol",
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
  assert.deepEqual(kept.slice(4, 12), ["--sandbox", "write", "--model", "gpt-6.1-sol", "--effort", "high", "--resume", "t-1"]);
  const changed = runnerArgs({ ...base, record, request: parseRequest("cdx: --effort low\ncontinue") });
  assert.equal(changed.effort, "low");
  assert.equal(changed.sandbox, "write");
});

test("the header refuses flags the mod owns, unknown flags, missing values, and an empty prompt", () => {
  assert.match(parseRequest("cdx: --model gpt-6-luna\nhi").error, /--model is set by/);
  assert.match(parseRequest("cdx: --resume last\nhi").error, /--resume is set by/);
  assert.match(parseRequest("cdx: --claude-channel\nhi").error, /--claude-channel is set by/);
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

test("only a request made of teammate envelopes is a teammate request", () => {
  assert.equal(isTeammateRequest('<teammate-message teammate_id="team-lead">\nReview.\n</teammate-message>'), true);
  assert.equal(isTeammateRequest("Review."), false);
  assert.equal(isTeammateRequest('<teammate-message teammate_id="a">\nhi\n</teammate-message> and more'), false);
});

const runnerSummary = (message) =>
  "session: abc\nstatus: completed\nitems: agent_message=1\ntokens: input=1 cached=0 output=1\n" +
  `--- final message ---\n${message}\n--- warnings ---\n- unstable feature\n` +
  "--- artifacts ---\nevents: /t/events.jsonl\nlast-message: /t/last-message.txt\nstderr: /t/stderr.log\n";

test("a teammate answer puts the final message first and keeps every runner detail after it", () => {
  const answer = teammateAnswer(runnerSummary("All clear."));
  assert.match(answer, /^All clear\.\n\n---\nsession: abc\nstatus: completed\n/);
  assert.match(answer, /--- warnings ---\n- unstable feature\n--- artifacts ---\n/);
  assert.match(answer, /last-message: \/t\/last-message\.txt\nstderr: \/t\/stderr\.log$/);
  assert.doesNotMatch(answer, /cdx cut/);
});

test("a long teammate answer is cut at a line break under the limit and names the full message's file", () => {
  const message = Array.from({ length: 200 }, (_, i) => `finding ${i}: ${"x".repeat(40)}`).join("\n");
  const answer = teammateAnswer(runnerSummary(message));
  assert.ok(answer.length <= TEAMMATE_ANSWER_LIMIT, `${answer.length}`);
  assert.match(answer, /^finding 0: /);
  assert.match(answer, /x\n\n\[cdx cut this answer at \d+ of \d+ characters .*the full message is in \/t\/last-message\.txt\]/);
  assert.match(answer, /status: completed[\s\S]*last-message: \/t\/last-message\.txt\nstderr: \/t\/stderr\.log$/, "the footer survives");
  const failure = teammateAnswer(`cdx: the Codex runner did not complete (exit 1).\n\nstderr:\n${"e\n".repeat(3000)}`);
  assert.ok(failure.length <= TEAMMATE_ANSWER_LIMIT);
  assert.match(failure, /^cdx: the Codex runner did not complete[\s\S]*ask the agent for the rest\]$/);
});

test("lineBuffer yields whole lines and keeps a partial line until flushed", () => {
  const b = lineBuffer();
  assert.deepEqual(b.push("a\nb"), ["a"]);
  assert.deepEqual(b.push("c\n"), ["bc"]);
  assert.deepEqual(b.push("d"), []);
  assert.deepEqual(b.flush(), ["d"]);
});

test("message lines decode to their text", () => {
  assert.equal(messageOf('cdx-message: "halfway:\\nfound it"'), "halfway:\nfound it");
  assert.equal(messageOf("cdx-message: not json"), null);
  assert.equal(messageOf('cdx-message: "  "'), null);
  assert.equal(messageOf("cdx-progress: $ ls"), null);
});

test("a forwarded message names the agent and is framed as its report, not the user's words", () => {
  const prompt = messagePrompt({ agent: "fixer", text: "The user approved the upload." });
  assert.match(prompt, /SendMessage to "fixer"/);
  assert.match(prompt, /not the user's words/);
  assert.match(prompt, /<codex-message>\nThe user approved the upload\.\n<\/codex-message>$/);
});
