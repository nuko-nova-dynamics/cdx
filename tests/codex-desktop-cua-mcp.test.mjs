import { test } from "node:test";
import assert from "node:assert/strict";
import { browserPrompt, extractCuaResult } from "../scripts/codex-desktop-cua-mcp.mjs";

const line = (type, payload) => JSON.stringify({ type, payload });
const start = (turn_id) => line("event_msg", { type: "task_started", turn_id });
const call = (call_id, name, arguments_) => line("response_item", {
  type: "function_call", namespace: "mcp__cua_repl", name, call_id,
  arguments: JSON.stringify(arguments_),
});
const output = (call_id, text) => line("response_item", {
  type: "function_call_output", call_id, output: [{ type: "input_text", text }],
});

test("the desktop prompt carries JavaScript as an exact JSON string", () => {
  const code = "let x = `tab`;\nawait cua.getState();";
  const prompt = browserPrompt(code);
  assert.equal(JSON.parse(prompt.split("\n").find((part) => part.startsWith('{"code":'))).code, code);
});

test("extracts the exact CUA result from the requested turn", () => {
  const code = "await cua.getState();";
  const rollout = [
    start("earlier"), call("old", "js", { code }), output("old", "stale"),
    start("current"), call("now", "js", { code }), output("now", "Brave connected"),
    call("summary", "js", { completion_summary: "Checked browser" }), output("summary", "done"),
  ].join("\n");
  assert.deepEqual(extractCuaResult(rollout, "current", "js", code), [{ type: "text", text: "Brave connected" }]);
});

test("rejects a desktop turn that changes the requested code", () => {
  const rollout = [
    start("current"), call("now", "js", { code: "await cua.getApp('Brave');" }), output("now", "wrong"),
    call("summary", "js", { completion_summary: "Checked browser" }), output("summary", "done"),
  ].join("\n");
  assert.throws(() => extractCuaResult(rollout, "current", "js", "await cua.getState();"), /exactly the requested/);
});

test("accepts one recorded CUA reset", () => {
  const rollout = [start("current"), call("reset", "js_reset", {}), output("reset", "reset")].join("\n");
  assert.deepEqual(extractCuaResult(rollout, "current", "js_reset"), [{ type: "text", text: "reset" }]);
});
