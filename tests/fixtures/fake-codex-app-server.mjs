#!/usr/bin/env node
// A stand-in for `codex app-server` hosting cua_repl: answers initialize
// after a short delay and thread/start, and answers each mcpServer/tool/call
// with its params, appending every call it receives to FAKE_CUA_LOG. With
// FAKE_REQUIRE_ELICITATION=1 it first asks for a computer-use app approval and
// answers the call with the approval's action.
import { appendFileSync } from "node:fs";
import readline from "node:readline";

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
let awaitingApproval = null;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    setTimeout(() => send({ id: msg.id, result: { userAgent: "fake" } }), 300);
  } else if (msg.method === "thread/start") {
    send({ id: msg.id, result: { thread: { id: "thread-1" } } });
  } else if (msg.method === "mcpServer/tool/call") {
    if (process.env.FAKE_CUA_LOG) appendFileSync(process.env.FAKE_CUA_LOG, JSON.stringify(msg.params) + "\n");
    if (process.env.FAKE_REQUIRE_ELICITATION === "1") {
      awaitingApproval = msg.id;
      send({ id: 900, method: "mcpServer/elicitation/request", params: { threadId: msg.params.threadId, serverName: "cua_repl", mode: "form", message: "Allow Calculator?", requestedSchema: { type: "object", properties: {} }, _meta: { connector_id: "computer-use", tool_params: { app: "Calculator" }, persist: ["session"] } } });
      return;
    }
    send({ id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(msg.params) }], isError: false } });
  } else if (msg.id === 900 && awaitingApproval !== null) {
    send({ id: awaitingApproval, result: { isError: msg.result?.action !== "accept", content: [{ type: "text", text: JSON.stringify(msg.result ?? null) }] } });
    awaitingApproval = null;
  }
});
