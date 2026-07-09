import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SCHEMA_DIR = new URL("../schemas/", import.meta.url).pathname;
const EXPECTED = [
  "review-findings.schema.json",
  "verdict.schema.json",
  "task-report.schema.json",
  "patch-plan.schema.json",
];

// OpenAI strict structured-output contract: at every object node,
// `required` must list EVERY key in `properties` (optionality is
// expressed with nullable types, not by omission), and
// additionalProperties must be false.
function assertStrictNode(node, ctx) {
  if (node.type === "object" || (Array.isArray(node.type) && node.type.includes("object"))) {
    assert.ok(node.properties, `${ctx}: object node must declare properties`);
    assert.equal(node.additionalProperties, false, `${ctx}: additionalProperties must be false`);
    const keys = Object.keys(node.properties).sort();
    const required = [...(node.required ?? [])].sort();
    assert.deepEqual(required, keys, `${ctx}: required must include every property key`);
    for (const [k, v] of Object.entries(node.properties)) assertStrictNode(v, `${ctx}.${k}`);
  }
  if (node.items) assertStrictNode(node.items, `${ctx}[]`);
}

test("all four schemas exist, parse, and satisfy the strict-mode contract", () => {
  const files = readdirSync(SCHEMA_DIR).sort();
  assert.deepEqual(files, [...EXPECTED].sort());
  for (const f of EXPECTED) {
    const s = JSON.parse(readFileSync(path.join(SCHEMA_DIR, f), "utf8"));
    assert.equal(s.type, "object", `${f} root must be object`);
    assertStrictNode(s, f);
  }
});
