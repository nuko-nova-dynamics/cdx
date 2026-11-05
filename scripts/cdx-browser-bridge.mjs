#!/usr/bin/env node
// Starts under the ChatGPT app (as an MCP server from config.toml) so that its
// connection to the app's browser access host passes the app's peer check: the
// host only accepts a process that descends from the app.
//
// It listens on a local socket and forwards each browser/access frame to that
// host unchanged, except that it swaps the app's sentinel executor id
// ("<app-uuid>/native-browser-plugin") for the account executor id the host
// compares against the signed-in principal. With the account id the host signs
// an allowed grant for any session and turn, so a runtime that cdx started can
// use the browser with no thread and no model turn.
import { appendFileSync, chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import readline from "node:readline";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const PIPE = process.env.BROWSER_USE_ACCESS_PIPE_PATH;
const KEY = process.env.BROWSER_USE_ACCESS_VERIFYING_IDENTITY;
const SENTINEL = process.env.BROWSER_USE_ACCESS_EXECUTOR_ID;
const UID = process.getuid?.() ?? "u";
const createConnection = net.createConnection;
const SOCKET = process.env.CDX_BROWSER_BRIDGE_SOCKET || path.join(tmpdir(), `cdx-browser-${UID}-${process.pid}.sock`);
// The app kills and respawns its MCP servers freely, so the socket path is per
// process and a pointer file names the live one.
const POINTER = path.join(tmpdir(), `cdx-browser-${UID}.json`);
let executor = null;
const LOG = process.env.CDX_BROWSER_BRIDGE_LOG || path.join(tmpdir(), "cdx-browser-bridge.log");

const log = (line) => {
  if (LOG) {
    try {
      appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
    } catch {}
  }
};

// "<prefix>/api-key" and "<prefix>/native-browser-plugin" both start with the
// per-launch app uuid the host builds executor ids from.
function appPrefix(sentinel) {
  try {
    const parsed = JSON.parse(sentinel);
    return Array.isArray(parsed) ? parsed[0] : null;
  } catch {
    return null;
  }
}

// The account and user the app signs in as, from the same token the app reads.
export function accountExecutor(prefix, home = process.env.CODEX_HOME || path.join(homedir(), ".codex")) {
  let claims;
  try {
    const token = JSON.parse(readFileSync(path.join(home, "auth.json"), "utf8"))?.tokens?.id_token;
    const payload = token.split(".")[1];
    claims = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
  const auth = claims?.["https://api.openai.com/auth"] ?? {};
  const accountId = auth.chatgpt_account_id;
  const userId = auth.chatgpt_user_id ?? auth.user_id;
  return accountId && userId ? JSON.stringify([prefix, accountId, userId]) : null;
}

const frame = (obj) => {
  const body = Buffer.from(JSON.stringify(obj));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  return Buffer.concat([head, body]);
};

// Splits a byte stream into frames. Yields whole messages only.
function frames(onMessage) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < length + 4) return;
      const body = buffer.subarray(4, 4 + length).toString("utf8");
      buffer = buffer.subarray(4 + length);
      try {
        onMessage(JSON.parse(body));
      } catch {}
    }
  };
}

export function rewriteExecutor(message, executor) {
  if (message?.method !== "browser/access" || !executor) return message;
  return { ...message, params: { ...message.params, executorId: executor } };
}

// The app starts every configured server again for each thread, so several
// bridges run at once. One listener owns the socket; the rest only answer MCP.
function serving(socket) {
  return new Promise((resolve) => {
    const probe = net.connect(socket);
    const done = (ok) => {
      probe.destroy();
      resolve(ok);
    };
    probe.once("connect", () => done(true));
    probe.once("error", () => done(false));
    setTimeout(() => done(false), 300).unref();
  });
}

function announce(executor) {
  try {
    writeFileSync(POINTER, JSON.stringify({ pid: process.pid, socket: SOCKET, executor }));
  } catch {}
}

function pointerOwner() {
  try {
    return JSON.parse(readFileSync(POINTER, "utf8")).pid;
  } catch {
    return 0;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function startBridge() {
  const prefix = appPrefix(SENTINEL);
  executor = prefix && accountExecutor(prefix);
  log(`start pid=${process.pid} ppid=${process.ppid} socket=${SOCKET} executor=${executor ? "account" : "none"}`);
  const server = net.createServer((client) => {
    const upstream = createConnection(PIPE);
    upstream.on("error", (error) => {
      log(`upstream error ${error.message}`);
      client.destroy();
    });
    client.on("error", () => upstream.destroy());
    client.on("close", () => upstream.destroy());
    client.on("data", frames((message) => {
      const rewritten = rewriteExecutor(message, executor);
      if (message.method === "browser/access") log(`access executor=${rewritten.params?.executorId}`);
      upstream.write(frame(rewritten));
    }));
    upstream.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (text.includes("browserAccess.v1")) log(`reply ${text.includes('\\"allowed\\":true') ? "allowed" : "denied"} ${text.slice(0, 400)}`);
      client.write(chunk);
    });
  });
  server.listen(SOCKET, () => {
    try {
      if (process.platform !== "win32") chmodSync(SOCKET, 0o600);
    } catch {}
    if (executor) announce(executor);
  });
  server.on("error", (error) => log(`listen error ${error.message}`));
  return server;
}

// The app host also speaks MCP to this process over stdio. The bridge exposes
// no tools; it only needs to answer the handshake so the host keeps it alive.
function serveMcp() {
  const send = (message) => {
    if (process.stdout.writable) process.stdout.write(JSON.stringify(message) + "\n");
  };
  // The app stops MCP servers it sees as idle. This keeps traffic on the pipe.
  setInterval(() => send({ jsonrpc: "2.0", method: "notifications/message", params: { level: "debug", data: "cdx-browser-bridge" } }), 3000).unref();
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("close", () => log("stdin closed"));
  rl.on("line", (line) => {
    log(`mcp< ${line.slice(0, 120)}`);
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id === undefined) return;
    if (message.method === "initialize") {
      return send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "cdx-browser-bridge", version: "1" },
        },
      });
    }
    if (message.method === "tools/list") {
      // Answering late keeps the host's tool probe open, and the host stops a
      // server once it has the answers. The bridge's tools are not used anyway.
      return setTimeout(() => send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [
            {
              name: "browser_bridge_status",
              description: "Whether the cdx browser access bridge is up. The bridge is used by other tools, not called directly.",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      }), 120_000);
    }
    if (message.method === "tools/call") {
      return send({
        jsonrpc: "2.0",
        id: message.id,
        result: { content: [{ type: "text", text: `bridge up, pid ${process.pid}` }] },
      });
    }
    if (message.method === "ping") return send({ jsonrpc: "2.0", id: message.id, result: {} });
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `cdx does not handle ${message.method}` } });
  });
}

if (process.argv[1]?.endsWith("cdx-browser-bridge.mjs")) {
  startBridge();
  serveMcp();
  // The app stops its MCP servers when the launch that started them ends. The
  // bridge must outlive that: its parent is the app's Codex host, and the peer
  // check walks parents at connect time.
  process.on("SIGTERM", () => log("sigterm ignored"));
  // A bridge that lost its socket exits instead of lingering; the app starts a
  // fresh one, and cdx follows the pointer file.
  setInterval(async () => {
    const live = await serving(SOCKET);
    const pipe = existsSync(PIPE);
    if (!live || !pipe) {
      log(`exit live=${live} pipe=${pipe}`);
      process.exit(0);
    }
    // A bridge that outlives the app's stop signal keeps the socket named, so a
    // later runtime has something to connect to.
    const owner = pointerOwner();
    if (executor && (!owner || owner === process.pid || !alive(owner))) announce(executor);
  }, 5_000).unref();
  process.on("exit", () => {
    try { unlinkSync(SOCKET); } catch {}
    if (pointerOwner() !== process.pid) return;
    try { unlinkSync(POINTER); } catch {}
  });
}
