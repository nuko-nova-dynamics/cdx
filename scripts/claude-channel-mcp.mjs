#!/usr/bin/env node
// A stdio MCP server Codex starts for the cdx agents: one tool, message_claude.
// The call itself only acknowledges. The runner reads the call's text from
// Codex's event stream and the cdx mod delivers it to the Claude session, so
// this server needs no channel of its own.
import { createInterface } from "node:readline";

// One server runs per Codex run, and the cdx mod delivers at most this many
// messages a run (MAX_MESSAGES in hooks/codex-agent.js); later calls fail, so
// Codex knows they did not arrive.
const MAX_MESSAGES = 20;
let sent = 0;

const TOOL = {
  name: "message_claude",
  description:
    "Send a short message to the Claude session that delegated this task, while you keep working. " +
    "Use it sparingly: a milestone Claude should know about, a blocker, or a question you can keep " +
    "working around. It does not wait for a reply; a reply, if any, arrives as your next task. " +
    "Your final answer reaches Claude anyway, so do not use this tool for it. " +
    `At most ${MAX_MESSAGES} messages per task.`,
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", maxLength: 4000, description: "The message, a few sentences at most." },
    },
    required: ["text"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
};

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
  if (msg.id === undefined) return; // notifications need no answer
  switch (msg.method) {
    case "initialize":
      return send({
        id: msg.id,
        result: {
          protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "cdx-claude", version: "1.0.0" },
        },
      });
    case "tools/list":
      return send({ id: msg.id, result: { tools: [TOOL] } });
    case "tools/call":
      if (msg.params?.name !== TOOL.name) {
        return send({ id: msg.id, error: { code: -32602, message: `unknown tool ${msg.params?.name}` } });
      }
      if (sent >= MAX_MESSAGES) {
        return send({
          id: msg.id,
          result: { content: [{ type: "text", text: `Not sent: the limit of ${MAX_MESSAGES} messages per task is reached.` }], isError: true },
        });
      }
      sent += 1;
      return send({ id: msg.id, result: { content: [{ type: "text", text: "Sent to Claude." }] } });
    case "ping":
      return send({ id: msg.id, result: {} });
    default:
      return send({ id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
});
