#!/usr/bin/env node
// A stand-in cua_repl runtime: answers initialize after a short delay, and
// answers each tools/call with its arguments and _meta, appending every call it
// receives to FAKE_CUA_LOG.
import { appendFileSync } from "node:fs";
import readline from "node:readline";

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    setTimeout(() => send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "0" } } }), 300);
  } else if (msg.method === "tools/call") {
    if (process.env.FAKE_CUA_LOG) appendFileSync(process.env.FAKE_CUA_LOG, JSON.stringify(msg.params) + "\n");
    send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(msg.params) }] } });
  }
});
