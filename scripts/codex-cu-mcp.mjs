#!/usr/bin/env node
// cdx computer-use launcher: an MCP stdio server that gives Claude Codex's
// computer use (the ChatGPT app's `cua_repl` server) as its own tools.
//
// It answers initialize and tools/list itself, and starts Codex only on the
// first `js` or `js_reset` call, so sessions that never use computer use run no
// extra process, and machines without the ChatGPT app see a tool error instead
// of a startup failure. The Computer Use service accepts a runtime only when
// the ChatGPT app or Codex launched it, so cdx runs `codex app-server`, which
// launches cua_repl from its plugin config, and calls the runtime's tools with
// the app-server's mcpServer/tool/call. That runs no model turn. These are
// unofficial OpenAI internals and may change with any app update.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { approvalPolicyFromToml } from "../hooks/computer-use.js";

const VERSION = JSON.parse(readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8")).version;
const SUPPORTED_PROTOCOLS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];

// Which agent made a call: set by the cdx mod's tool.call hook (the subagent's
// id, or "main"), stripped before the call reaches the runtime.
const CDX_AGENT_PROPERTY = { type: "string", description: "Set by the cdx plugin; leave it out." };

// `js` and `js_reset` are Claude's. `turn_ended` is listed only because the
// cdx mod's $.mcp.call reaches listed tools alone; Codex hides it, and the mod
// calls it at the end of each turn.
const TOOLS = [
  {
    name: "js",
    description: [
      "Control native macOS apps or browsers by running JavaScript against the `cua` API",
      "(Codex Computer Use from the ChatGPT app). Prefer purpose-built tools, APIs, or CLIs when they exist.",
      "",
      "On the first call, and after js_reset, run exactly one entry call, optionally assigned to a variable,",
      "and nothing else:",
      "- `await cua.getState()`: inventory of apps, browsers, and tabs",
      '- `let app = await cua.getApp("App name")`: an app by name, bundle ID, or path',
      '- `let tab = await cua.createBrowserTab("chrome", url, { sessionName: "🔎 Task" })`: a new tab in a named browser',
      "- `let tab = await cua.getTab(tabId, { browser: browserId })` or `cua.getTab({ url }, { browser: browserId })`: an existing tab",
      "- `let browser = await cua.getBrowser({ url })`: a browser for a URL when none was named",
      "",
      "That call's result contains the API documentation and the initial UI state. Read it before continuing,",
      "and use only the APIs it documents. Bindings persist between calls. Add text to a result with",
      "`nodeRepl.write(value)` and images with `await nodeRepl.emitImage(image)`. After a context summary",
      "of an earlier computer-use task, call `await cua.rewriteDocumentation()` first.",
    ].join("\n"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        code: { type: "string", description: "JavaScript to execute using the initialized cua_repl runtime." },
        timeout_ms: {
          type: "integer",
          minimum: 1,
          description: "Optional execution timeout in milliseconds. Defaults to 30000 (30 seconds) when omitted.",
        },
        title: { type: "string", minLength: 1, maxLength: 80, description: "Short user-facing description of what the code does." },
        cdx_agent: CDX_AGENT_PROPERTY,
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "js_reset",
    description:
      "Reset the persistent cua_repl JavaScript session. All JavaScript bindings are discarded, and the next js call " +
      "initializes a fresh runtime. This does not close browser tabs or native apps, or erase their state.",
    inputSchema: { type: "object", additionalProperties: false, properties: { cdx_agent: CDX_AGENT_PROPERTY } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "turn_ended",
    description:
      "Internal: the cdx plugin calls this automatically when a turn ends, so the runtime can release browser tabs. " +
      "Never call it yourself.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        hook_event_name: { type: "string", minLength: 1 },
        session_id: { type: "string", minLength: 1 },
        turn_id: { type: "string", minLength: 1 },
        cdx_agent: CDX_AGENT_PROPERTY,
      },
      required: ["hook_event_name", "session_id", "turn_id"],
    },
    annotations: { idempotentHint: true },
  },
];

// CDX_CU_TRACE=<file> appends each message from the client (<) and to it (>).
const traceFile = process.env.CDX_CU_TRACE;
const trace = (dir, msg) => {
  if (!traceFile) return;
  try {
    appendFileSync(traceFile, `${new Date().toISOString()} ${dir} ${JSON.stringify(msg).slice(0, 2000)}\n`);
  } catch {}
};
const send = (msg) => {
  trace(">", msg);
  process.stdout.write(JSON.stringify(msg) + "\n");
};
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const replyError = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const toolError = (id, text) => reply(id, { content: [{ type: "text", text }], isError: true });

const codexHome = () => process.env.CODEX_HOME || path.join(homedir(), ".codex");

function compareVersions(a, b) {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// Whether Codex computer use is installed: the newest unified-computer-use
// plugin config that the ChatGPT app installs, or why there is none. Codex
// itself launches the runtime from this config.
export function findServerConfig(home = codexHome()) {
  if (process.platform !== "darwin") return { error: "Codex computer use is only available on macOS." };
  const root = path.join(home, "plugins", "cache", "openai-bundled", "unified-computer-use");
  let versions = [];
  try {
    versions = readdirSync(root).filter((v) => existsSync(path.join(root, v, ".mcp.json")));
  } catch {}
  if (!versions.length) {
    return {
      error:
        "Codex computer use is not installed: no unified-computer-use plugin under " +
        `${root}. Install the ChatGPT desktop app and enable Computer Use in Codex.`,
    };
  }
  const version = versions.sort(compareVersions).at(-1);
  const file = path.join(root, version, ".mcp.json");
  let server;
  try {
    server = JSON.parse(readFileSync(file, "utf8"))?.mcpServers?.cua_repl;
  } catch (err) {
    return { error: `Could not read ${file}: ${err.message}` };
  }
  if (!server?.command) return { error: `${file} has no cua_repl server.` };
  return { version, file };
}

// The Codex CLI that hosts the runtime: CDX_CODEX_BIN, else the one bundled in
// the ChatGPT app. The Computer Use service accepts a runtime only when the
// ChatGPT app or Codex launched it, so cdx cannot launch the runtime itself.
export function codexBinary(app = process.env.CDX_CHATGPT_APP || "/Applications/ChatGPT.app") {
  if (process.env.CDX_CODEX_BIN) return process.env.CDX_CODEX_BIN;
  const bundled = path.join(app, "Contents", "Resources", "codex-cli", "CodexCLI.app", "Contents", "MacOS", "codex");
  return existsSync(bundled) ? bundled : null;
}

// Codex skips approval prompts when its top-level approval_policy is "never";
// computer-use app approvals follow the same setting here.
export function codexApprovalPolicy(home = codexHome()) {
  try {
    return approvalPolicyFromToml(readFileSync(path.join(home, "config.toml"), "utf8"));
  } catch {
    return null;
  }
}

// An app approval from the runtime, as the Codex app-server relays it.
export function isComputerUseApproval(msg) {
  return msg?.method === "mcpServer/elicitation/request" && msg.params?._meta?.connector_id === "computer-use";
}

// The user's answer to an app approval, sent on to the runtime. Claude Code
// offers only accept or decline, so an accept is sent as Codex's "always
// allow" (or "session" when the request does not offer "always"), and the
// runtime does not ask about that app again.
export function withPersistedAccept(response, offered) {
  if (response?.result?.action !== "accept" || response.result._meta?.persist) return response;
  const persist = !Array.isArray(offered) || offered.includes("always") ? "always" : offered.includes("session") ? "session" : null;
  if (!persist) return response;
  return { ...response, result: { ...response.result, _meta: { ...response.result._meta, persist } } };
}

// Codex sends turn metadata with every call, and the browser service requires
// it (session_id, turn_id) and releases a turn's tabs on turn_ended with the
// same ids. Claude Code sends neither, so the launcher owns them: one session
// for its life, and one turn per agent that ends at that agent's turn_ended.
// A subagent's calls carry thread_source "subagent" and its id as thread_id,
// as Codex's do, so its turn end releases only its own tabs.
const sessionId = randomUUID();
const turns = new Map(); // agent key ("main" or a subagent id) -> current turn id
const turnOf = (agent) => {
  if (!turns.has(agent)) turns.set(agent, randomUUID());
  return turns.get(agent);
};

// The call to send the runtime: cdx_agent taken out of the arguments, and
// that agent's turn metadata added to _meta.
export function withTurnMetadata(msg, ids) {
  const { cdx_agent: agent = "main", ...args } = msg.params?.arguments ?? {};
  const meta = { ...(msg.params?._meta ?? {}) };
  const callId = meta["claudecode/toolUseId"];
  meta["x-codex-turn-metadata"] = JSON.stringify({
    session_id: ids.sessionId,
    turn_id: ids.turnOf(agent),
    ...(agent === "main" ? {} : { thread_source: "subagent", thread_id: agent }),
    ...(typeof callId === "string" ? { call_id: callId } : {}),
  });
  return { ...msg, params: { ...msg.params, arguments: args, _meta: meta } };
}

// turn_ended for the agent that ended: its session key (the subagent's id, as
// Codex's SubagentStop sends it) and its current turn, which then ends.
export function turnEndedArguments(args, ids) {
  const { cdx_agent: agent = "main", ...rest } = args ?? {};
  return { ...rest, session_id: agent === "main" ? ids.sessionId : agent, turn_id: ids.endTurn(agent) };
}

let host = null; // { proc, threadId, request } once the Codex app-server is ready
let starting = null;
const pendingApprovals = new Map(); // approval id sent to the client -> { hostId, offered }
const awaitingStart = new Set(); // ids of calls waiting for the runtime to start
const cancelledDuringStart = new Set();

function stopHost() {
  if (host && host.proc.exitCode === null) host.proc.kill("SIGTERM");
}

// Starts `codex app-server` and one ephemeral thread. Codex launches the
// cua_repl runtime from its plugin config, and cdx calls the runtime's tools
// with mcpServer/tool/call, which runs no model turn.
function startHost() {
  if (starting) return starting;
  const attempt = new Promise(async (resolve) => {
    const config = findServerConfig();
    if (config.error) return resolve({ error: config.error });
    const bin = codexBinary();
    if (!bin) return resolve({ error: "No Codex CLI to host computer use: install the ChatGPT desktop app, or set CDX_CODEX_BIN." });
    const proc = spawn(bin, ["app-server"], { stdio: ["pipe", "pipe", "ignore"] });
    const autoApprove = codexApprovalPolicy() === "never";
    const write = (msg) => proc.stdin.writable && proc.stdin.write(JSON.stringify(msg) + "\n");
    let nextId = 0;
    const waiting = new Map(); // host request id -> resolve
    const request = (method, params) =>
      new Promise((res) => {
        const id = ++nextId;
        waiting.set(id, res);
        write({ id, method, params });
      });
    let settled = false;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      if (proc.exitCode === null) proc.kill("SIGTERM");
      resolve({ error: message });
    };
    const timer = setTimeout(() => fail("Codex did not start computer use within 120 seconds."), 120_000);
    proc.on("error", (err) => fail(`Could not start Codex (${bin}): ${err.message}`));
    proc.on("exit", (code, signal) => {
      clearTimeout(timer);
      const why = signal ?? `exit ${code}`;
      fail(`Codex exited while starting computer use (${why}).`);
      if (host?.proc === proc) host = null;
      if (starting === attempt) starting = null;
      // Answer every call Codex still owed, so Claude is never left waiting.
      for (const res of waiting.values()) res({ error: { message: `Codex stopped (${why}). Call js again to restart it.` } });
      waiting.clear();
      pendingApprovals.clear();
    });
    readline.createInterface({ input: proc.stdout }).on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.method === undefined) {
        waiting.get(msg.id)?.(msg);
        waiting.delete(msg.id);
        return;
      }
      if (msg.id === undefined) return; // notifications
      if (isComputerUseApproval(msg) && autoApprove) {
        const app = msg.params?._meta?.tool_params?.app ?? "an app";
        process.stderr.write(`cdx computer-use: approved access to ${app} (Codex approval_policy is "never")\n`);
        write({ id: msg.id, result: { action: "accept", content: {}, _meta: { persist: "session" } } });
        return;
      }
      if (msg.method === "mcpServer/elicitation/request") {
        const { message, requestedSchema, _meta } = msg.params ?? {};
        const clientId = `cdx-approval-${msg.id}`;
        pendingApprovals.set(clientId, { hostId: msg.id, offered: isComputerUseApproval(msg) ? (_meta?.persist ?? null) : undefined, write });
        send({ jsonrpc: "2.0", id: clientId, method: "elicitation/create", params: { message, requestedSchema: requestedSchema ?? { type: "object", properties: {} }, _meta } });
        return;
      }
      write({ id: msg.id, error: { code: -32601, message: `cdx does not handle ${msg.method}` } });
    });
    (async () => {
      const init = await request("initialize", { clientInfo: { name: "cdx", version: VERSION }, capabilities: { experimentalApi: true } });
      if (init.error) return fail(`Codex refused to initialize: ${init.error.message}`);
      write({ method: "initialized" });
      const thread = await request("thread/start", { ephemeral: true, cwd: process.cwd() });
      const threadId = thread.result?.thread?.id;
      if (!threadId) return fail(`Codex did not start a thread: ${thread.error?.message ?? JSON.stringify(thread.result)}`);
      clearTimeout(timer);
      settled = true;
      host = { proc, threadId, request };
      resolve({ host });
    })();
  });
  starting = attempt;
  // A failed start is not kept: the next call tries again, so installing the
  // ChatGPT app or its plugin mid-session works without a restart.
  attempt.then((result) => {
    if (result.error && starting === attempt) starting = null;
  });
  return attempt;
}

// Calls a cua_repl tool through Codex and answers the client's request.
async function callTool(id, tool, args, meta) {
  const res = await host.request("mcpServer/tool/call", { threadId: host.threadId, server: "cua_repl", tool, arguments: args, _meta: meta });
  if (res.error) return toolError(id, res.error.message ?? "Codex could not call the computer-use runtime.");
  reply(id, res.result);
}

async function forwardCall(msg) {
  awaitingStart.add(msg.id);
  const started = host ? { host } : await startHost();
  awaitingStart.delete(msg.id);
  if (started.error) {
    if (cancelledDuringStart.delete(msg.id)) return;
    return toolError(msg.id, started.error);
  }
  // Cancelled while the runtime was starting: never send it.
  if (cancelledDuringStart.delete(msg.id)) return;
  const call = withTurnMetadata(msg, { sessionId, turnOf });
  await callTool(msg.id, call.params.name, call.params.arguments, call.params._meta);
}

function handle(msg) {
  // Responses from the client answer Codex's approval requests.
  if (msg.method === undefined) {
    const pending = pendingApprovals.get(msg.id);
    if (!pending) return;
    pendingApprovals.delete(msg.id);
    const answer = pending.offered === undefined ? msg : withPersistedAccept(msg, pending.offered);
    pending.write({ id: pending.hostId, result: answer.result ?? { action: "decline" } });
    return;
  }
  const isRequest = msg.id !== undefined;
  switch (msg.method) {
    case "initialize": {
      const requested = msg.params?.protocolVersion;
      reply(msg.id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "cdx-computer-use", version: VERSION },
        instructions: "UI automation through Codex Computer Use (cua_repl), started on the first js call.",
      });
      return;
    }
    case "ping":
      if (isRequest) reply(msg.id, {});
      return;
    case "tools/list":
      reply(msg.id, { tools: TOOLS });
      return;
    case "tools/call": {
      const name = msg.params?.name;
      if (name === "turn_ended") {
        const endTurn = (agent) => {
          const ended = turnOf(agent);
          turns.delete(agent);
          return ended;
        };
        const args = turnEndedArguments(msg.params?.arguments, { sessionId, endTurn });
        // Nothing to clean up when the runtime never started.
        if (!host) return reply(msg.id, { content: [], isError: false });
        void callTool(msg.id, "turn_ended", args, msg.params?._meta);
        return;
      }
      if (name === "js" || name === "js_reset") {
        void forwardCall(msg);
        return;
      }
      return toolError(msg.id, `Unknown tool: ${name}`);
    }
    default:
      if (msg.method.startsWith("notifications/")) {
        const requestId = msg.params?.requestId;
        if (msg.method === "notifications/cancelled" && awaitingStart.has(requestId)) {
          cancelledDuringStart.add(requestId);
          return;
        }
        return;
      }
      if (isRequest) replyError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("codex-cu-mcp.mjs");
if (isMain) {
  const input = readline.createInterface({ input: process.stdin });
  input.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    trace("<", msg);
    handle(msg);
  });
  // The session closed the connection: stop the runtime with it.
  input.on("close", () => {
    stopHost();
    setTimeout(() => process.exit(0), 200).unref();
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopHost();
      process.exit(0);
    });
  }
}
