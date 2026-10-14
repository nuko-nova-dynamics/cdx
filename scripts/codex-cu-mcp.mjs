#!/usr/bin/env node
// cdx computer-use launcher: an MCP stdio server that gives Claude Codex's
// computer use (the ChatGPT app's `cua_repl` server) as its own tools.
//
// It answers initialize and tools/list itself, and starts the real server only
// on the first `js` or `js_reset` call, so sessions that never use computer use
// run no extra process, and machines without the ChatGPT app see a tool error
// instead of a startup failure. The real server's command, arguments, and
// environment come from the newest unified-computer-use plugin config that the
// ChatGPT app installs, read at spawn time so app updates keep working. These
// are unofficial OpenAI internals and may change with any app update.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { approvalPolicyFromToml } from "../hooks/computer-use.js";

const VERSION = "0.6.4";
const SUPPORTED_PROTOCOLS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];
const INIT_ID = "cdx-cu-init";

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

// The newest installed unified-computer-use config, or why there is none.
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
  if (!existsSync(server.command)) return { error: `The computer-use runtime is missing: ${server.command}` };
  return { version, file, command: server.command, args: server.args ?? [], env: server.env ?? {} };
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

export function isComputerUseApproval(msg) {
  return msg?.method === "elicitation/create" && msg.params?._meta?.connector_id === "computer-use";
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

let clientInit = null; // the client's initialize params, replayed to the real server
let child = null;
let starting = null;
const forwarded = new Map(); // client request id -> method, for requests the real server owes
const awaitingStart = new Set(); // ids of calls waiting for the runtime to start
const cancelledDuringStart = new Set();

function stopChild() {
  if (child && child.exitCode === null) child.kill("SIGTERM");
}

function startChild() {
  if (starting) return starting;
  const attempt = new Promise((resolve) => {
    const config = findServerConfig();
    if (config.error) {
      resolve({ error: config.error });
      return;
    }
    const proc = spawn(config.command, config.args, {
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const autoApprove = codexApprovalPolicy() === "never";
    let ready = false;
    const fail = (message) => {
      if (ready) return;
      ready = true; // settle once
      if (proc.exitCode === null) proc.kill("SIGTERM");
      resolve({ error: message });
    };
    const timer = setTimeout(() => fail("The computer-use runtime did not start within 120 seconds."), 120_000);
    proc.on("error", (err) => fail(`Could not start the computer-use runtime: ${err.message}`));
    proc.on("exit", (code, signal) => {
      clearTimeout(timer);
      fail(`The computer-use runtime exited during startup (${signal ?? `exit ${code}`}).`);
      if (child === proc) child = null;
      starting = null;
      // Answer every call the runtime still owed, so Claude is never left waiting.
      for (const [id] of forwarded) toolError(id, `The computer-use runtime stopped (${signal ?? `exit ${code}`}). Call js again to restart it.`);
      forwarded.clear();
    });
    readline.createInterface({ input: proc.stdout }).on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.id === INIT_ID && !ready) {
        clearTimeout(timer);
        if (msg.error) return fail(`The computer-use runtime refused to initialize: ${msg.error.message}`);
        ready = true;
        child = proc;
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
        resolve({ child: proc });
        return;
      }
      if (msg.method === "notifications/tools/list_changed") return; // the listed tools are fixed here
      if (autoApprove && isComputerUseApproval(msg)) {
        const app = msg.params?._meta?.tool_params?.app ?? "an app";
        process.stderr.write(`cdx computer-use: approved access to ${app} (Codex approval_policy is "never")\n`);
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { action: "accept", content: {}, _meta: { persist: "session" } } }) + "\n");
        return;
      }
      if (msg.id !== undefined && msg.method === undefined) forwarded.delete(msg.id);
      send(msg);
    });
    const init = clientInit ?? { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cdx", version: VERSION } };
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: INIT_ID, method: "initialize", params: init }) + "\n");
  });
  starting = attempt;
  // A failed start is not kept: the next call tries again, so installing the
  // ChatGPT app or its plugin mid-session works without a restart.
  attempt.then((result) => {
    if (result.error && starting === attempt) starting = null;
  });
  return attempt;
}

async function forwardCall(msg) {
  awaitingStart.add(msg.id);
  const started = child ? { child } : await startChild();
  awaitingStart.delete(msg.id);
  if (started.error) {
    if (cancelledDuringStart.delete(msg.id)) return;
    return toolError(msg.id, started.error);
  }
  // Cancelled while the runtime was starting: never send it.
  if (cancelledDuringStart.delete(msg.id)) return;
  forwarded.set(msg.id, msg.method);
  started.child.stdin.write(JSON.stringify(withTurnMetadata(msg, { sessionId, turnOf })) + "\n");
}

function handle(msg) {
  // Responses from the client answer the real server's requests (elicitations).
  if (msg.method === undefined) {
    if (child) child.stdin.write(JSON.stringify(msg) + "\n");
    return;
  }
  const isRequest = msg.id !== undefined;
  switch (msg.method) {
    case "initialize": {
      clientInit = msg.params ?? null;
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
        if (!child) return reply(msg.id, { content: [], isError: false });
        forwarded.set(msg.id, msg.method);
        child.stdin.write(JSON.stringify({ ...msg, params: { ...msg.params, arguments: args } }) + "\n");
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
        if (child && msg.method !== "notifications/initialized") child.stdin.write(JSON.stringify(msg) + "\n");
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
    stopChild();
    setTimeout(() => process.exit(0), 200).unref();
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopChild();
      process.exit(0);
    });
  }
}
