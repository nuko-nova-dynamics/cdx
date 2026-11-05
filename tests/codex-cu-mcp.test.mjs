import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { codexApprovalPolicy, codexBinary, findServerConfig, isComputerUseApproval, turnEndedArguments, withPersistedAccept, withTurnMetadata } from "../scripts/codex-cu-mcp.mjs";
import { approvalPolicyFromToml } from "../hooks/computer-use.js";

const LAUNCHER = new URL("../scripts/codex-cu-mcp.mjs", import.meta.url).pathname;
const FAKE_CODEX = new URL("./fixtures/fake-codex-app-server.mjs", import.meta.url).pathname;

const darwin = process.platform === "darwin";

function installPlugin(home, version, command, args = [`${version}.mjs`], env = { BROWSER_USE_CODEX_APP_VERSION: version }) {
  const dir = path.join(home, "plugins", "cache", "openai-bundled", "unified-computer-use", version);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { cua_repl: { command, args, env } } }));
}

function codexHome(versions) {
  const home = mkdtempSync(path.join(tmpdir(), "cdx-cu-"));
  for (const [version, command] of Object.entries(versions)) installPlugin(home, version, command);
  return home;
}

// Runs the launcher with CODEX_HOME=home and the fake Codex app-server, and
// returns a minimal client. Requests the launcher sends the client go to onRequest.
function launch(home, env = {}, onRequest = () => {}) {
  const proc = spawn(process.execPath, [LAUNCHER], { env: { ...process.env, CODEX_HOME: home, CDX_CODEX_BIN: FAKE_CODEX, ...env }, stdio: ["pipe", "pipe", "ignore"] });
  const waiting = new Map();
  let buf = "";
  proc.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (m.method) onRequest(m);
      else waiting.get(m.id)?.(m);
    }
  });
  const send = (m) => proc.stdin.write(JSON.stringify(m) + "\n");
  const call = (id, name, args) => new Promise((resolve) => {
    waiting.set(id, resolve);
    send({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args, _meta: { "claudecode/toolUseId": `toolu_${id}` } } });
  });
  send({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  return { proc, send, call, close: () => proc.stdin.end() };
}

test("the newest installed plugin version is the one found", { skip: !darwin }, () => {
  const home = codexHome({ "26.930.1": process.execPath, "26.1007.30912": process.execPath, "26.1007.4": process.execPath });
  assert.equal(findServerConfig(home).version, "26.1007.30912");
});

test("a missing plugin is an error to report, not a crash", { skip: !darwin }, () => {
  assert.match(findServerConfig(codexHome({})).error, /not installed/);
});

test("CDX_CODEX_BIN names the Codex CLI; otherwise it is the ChatGPT app's bundled one", () => {
  const saved = process.env.CDX_CODEX_BIN;
  try {
    process.env.CDX_CODEX_BIN = "/x/codex";
    assert.equal(codexBinary(), "/x/codex");
    delete process.env.CDX_CODEX_BIN;
    assert.equal(codexBinary("/nonexistent/ChatGPT.app"), null);
  } finally {
    if (saved === undefined) delete process.env.CDX_CODEX_BIN;
    else process.env.CDX_CODEX_BIN = saved;
  }
});

test("calls reach cua_repl through Codex's mcpServer/tool/call on one thread", { skip: !darwin }, async () => {
  const home = codexHome({ "1.0.0": process.execPath });
  const client = launch(home);
  try {
    const first = JSON.parse((await client.call(1, "js", { code: "await cua.getState();" })).result.content[0].text);
    const second = JSON.parse((await client.call(2, "js_reset", {})).result.content[0].text);
    assert.deepEqual([first.server, first.tool, first.arguments], ["cua_repl", "js", { code: "await cua.getState();" }]);
    assert.equal(second.tool, "js_reset");
    assert.equal(first.threadId, second.threadId);
  } finally {
    client.close();
  }
});

test("the approval policy is read from the top level of config.toml only", () => {
  const home = mkdtempSync(path.join(tmpdir(), "cdx-cu-policy-"));
  assert.equal(codexApprovalPolicy(home), null);
  writeFileSync(path.join(home, "config.toml"), 'model = "x"\napproval_policy = "never"\n[profiles.a]\napproval_policy = "on-request"\n');
  assert.equal(codexApprovalPolicy(home), "never");
  writeFileSync(path.join(home, "config.toml"), '[profiles.a]\napproval_policy = "never"\n');
  assert.equal(codexApprovalPolicy(home), null);
});

test("approval_policy never approves the app without asking the client", { skip: !darwin }, async () => {
  const home = codexHome({ "1.0.0": process.execPath });
  writeFileSync(path.join(home, "config.toml"), 'approval_policy = "never"\n');
  let asked = false;
  const client = launch(home, { FAKE_REQUIRE_ELICITATION: "1" }, () => (asked = true));
  try {
    const response = await client.call(1, "js", { code: "await cua.getApp('Calculator')" });
    assert.equal(response.result?.isError, false, JSON.stringify(response));
    assert.equal(JSON.parse(response.result.content[0].text).action, "accept");
    assert.equal(asked, false);
  } finally {
    client.close();
  }
});

test("otherwise the client is asked, and its accept reaches Codex as a persisted approval", { skip: !darwin }, async () => {
  const home = codexHome({ "1.0.0": process.execPath });
  let client;
  client = launch(home, { FAKE_REQUIRE_ELICITATION: "1" }, (req) => {
    assert.equal(req.method, "elicitation/create");
    assert.equal(req.params.message, "Allow Calculator?");
    client.send({ jsonrpc: "2.0", id: req.id, result: { action: "accept", content: {} } });
  });
  try {
    const response = await client.call(1, "js", { code: "await cua.getApp('Calculator')" });
    assert.deepEqual(JSON.parse(response.result.content[0].text), { action: "accept", content: {}, _meta: { persist: "session" } });
  } finally {
    client.close();
  }
});

test("only computer-use elicitations count as app approvals", () => {
  const approval = { method: "mcpServer/elicitation/request", params: { _meta: { connector_id: "computer-use" } } };
  assert.equal(isComputerUseApproval(approval), true);
  assert.equal(isComputerUseApproval({ method: "mcpServer/elicitation/request", params: { _meta: { connector_id: "browser" } } }), false);
  assert.equal(isComputerUseApproval({ method: "tools/call" }), false);
});

test("a user's accept of an app approval is sent as always allow, or session when always is not offered", () => {
  const accept = { jsonrpc: "2.0", id: 7, result: { action: "accept", content: {} } };
  assert.deepEqual(withPersistedAccept(accept, ["session", "always"]).result, { action: "accept", content: {}, _meta: { persist: "always" } });
  assert.deepEqual(withPersistedAccept(accept, undefined).result._meta, { persist: "always" });
  assert.deepEqual(withPersistedAccept(accept, ["session"]).result._meta, { persist: "session" });
  assert.equal(withPersistedAccept(accept, []), accept);
  const chosen = { jsonrpc: "2.0", id: 7, result: { action: "accept", _meta: { persist: "session" } } };
  assert.equal(withPersistedAccept(chosen, ["session", "always"]), chosen);
  const decline = { jsonrpc: "2.0", id: 7, result: { action: "decline" } };
  assert.equal(withPersistedAccept(decline, ["session", "always"]), decline);
});

test("calls carry the calling agent's turn metadata, and cdx_agent is removed", () => {
  const turnOf = (agent) => `turn-${agent}`;
  const call = (args) => ({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "js", arguments: args, _meta: { "claudecode/toolUseId": "toolu_1", progressToken: 4 } } });
  const main = withTurnMetadata(call({ code: "1", cdx_agent: "main" }), { sessionId: "s-1", turnOf });
  assert.deepEqual(JSON.parse(main.params._meta["x-codex-turn-metadata"]), { session_id: "s-1", turn_id: "turn-main", call_id: "toolu_1" });
  assert.deepEqual(main.params.arguments, { code: "1" });
  assert.equal(main.params._meta.progressToken, 4);
  const sub = withTurnMetadata(call({ code: "1", cdx_agent: "a7" }), { sessionId: "s-1", turnOf });
  assert.deepEqual(JSON.parse(sub.params._meta["x-codex-turn-metadata"]), {
    session_id: "s-1", turn_id: "turn-a7", thread_source: "subagent", thread_id: "a7", call_id: "toolu_1",
  });
  const plain = withTurnMetadata(call({ code: "1" }), { sessionId: "s-1", turnOf });
  assert.equal(JSON.parse(plain.params._meta["x-codex-turn-metadata"]).turn_id, "turn-main", "no cdx_agent means main");
});

test("turn_ended ends only the named agent's turn, keyed as Codex keys it", () => {
  const ended = [];
  const ids = { sessionId: "s-1", endTurn: (agent) => (ended.push(agent), `turn-${agent}`) };
  assert.deepEqual(turnEndedArguments({ hook_event_name: "Stop", session_id: "x", turn_id: "y", cdx_agent: "main" }, ids),
    { hook_event_name: "Stop", session_id: "s-1", turn_id: "turn-main" });
  assert.deepEqual(turnEndedArguments({ hook_event_name: "SubagentStop", session_id: "a7", turn_id: "y", cdx_agent: "a7" }, ids),
    { hook_event_name: "SubagentStop", session_id: "a7", turn_id: "turn-a7" });
  assert.deepEqual(ended, ["main", "a7"]);
});

test("an approval_policy line inside a multi-line string does not count", () => {
  assert.equal(approvalPolicyFromToml('developer_instructions = """\napproval_policy = "never"\n"""\napproval_policy = "on-request"\n'), "on-request");
  assert.equal(approvalPolicyFromToml("notes = '''\napproval_policy = \"never\"\n'''\n"), null);
  assert.equal(approvalPolicyFromToml('x = """one line"""\napproval_policy = \'never\' # set\n'), "never");
  // An escaped quote inside the string must not end it early.
  assert.equal(approvalPolicyFromToml('developer_instructions = """\nExample: \\"""\napproval_policy = "never"\n"""\napproval_policy = "on-request"\n'), "on-request");
});

test("a failed start is not cached: the next call starts the runtime once it is installed", { skip: !darwin }, async () => {
  const home = mkdtempSync(path.join(tmpdir(), "cdx-cu-retry-"));
  const client = launch(home);
  try {
    const first = await client.call(1, "js", { code: "1" });
    assert.equal(first.result.isError, true);
    assert.match(first.result.content[0].text, /not installed/);
    installPlugin(home, "1.0.0", process.execPath);
    const second = await client.call(2, "js", { code: "2" });
    assert.notEqual(second.result.isError, true, JSON.stringify(second));
  } finally {
    client.close();
  }
});

test("a call cancelled while the runtime starts never reaches it", { skip: !darwin }, async () => {
  const home = mkdtempSync(path.join(tmpdir(), "cdx-cu-cancel-"));
  const log = path.join(home, "calls.log");
  installPlugin(home, "1.0.0", process.execPath);
  const client = launch(home, { FAKE_CUA_LOG: log });
  try {
    let cancelledAnswered = false;
    client.call(5, "js", { code: "cancelled" }).then(() => (cancelledAnswered = true));
    client.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 5, reason: "test" } });
    const next = await client.call(6, "js", { code: "kept", cdx_agent: "a7" });
    const sent = JSON.parse(next.result.content[0].text);
    assert.deepEqual(sent.arguments, { code: "kept" });
    assert.equal(JSON.parse(sent._meta["x-codex-turn-metadata"]).thread_id, "a7");
    const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
    assert.doesNotMatch(calls, /cancelled/);
    assert.equal(cancelledAnswered, false);
  } finally {
    client.close();
  }
});
