#!/usr/bin/env node
// A stand-in cua_repl runtime: answers initialize after a short delay, and
// answers each tools/call with its arguments and _meta, appending every call it
// receives to FAKE_CUA_LOG.
import { appendFileSync } from "node:fs";
import readline from "node:readline";

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
let canElicit = false;
let awaitingApproval = null;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    canElicit = !!msg.params?.capabilities?.elicitation?.form;
    setTimeout(() => send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "0" } } }), 300);
  } else if (msg.method === "tools/call") {
    if (process.env.FAKE_CUA_LOG) appendFileSync(process.env.FAKE_CUA_LOG, JSON.stringify(msg.params) + "\n");
    if (process.env.FAKE_REQUIRE_ELICITATION === "1") {
      if (!canElicit) {
        send({ jsonrpc: "2.0", id: msg.id, result: { isError: true, content: [{ type: "text", text: "nodeRepl.createElicitation is unavailable because the MCP client does not support form elicitation" }] } });
        return;
      }
      awaitingApproval = msg.id;
      send({ jsonrpc: "2.0", id: "fake-approval", method: "elicitation/create", params: { _meta: { connector_id: "computer-use", tool_params: { app: "Calculator" }, persist: ["session"] } } });
      return;
    }
    send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(msg.params) }] } });
  } else if (msg.id === "fake-approval" && awaitingApproval !== null) {
    send({ jsonrpc: "2.0", id: awaitingApproval, result: { isError: msg.result?.action !== "accept", content: [{ type: "text", text: msg.result?.action ?? "no approval" }] } });
    awaitingApproval = null;
  }
});
