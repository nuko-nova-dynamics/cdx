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

test("all four schemas exist, parse, and are object-typed", () => {
  const files = readdirSync(SCHEMA_DIR).sort();
  assert.deepEqual(files, [...EXPECTED].sort());
  for (const f of EXPECTED) {
    const s = JSON.parse(readFileSync(path.join(SCHEMA_DIR, f), "utf8"));
    assert.equal(s.type, "object", `${f} root must be object`);
    assert.ok(s.properties, `${f} must declare properties`);
    assert.ok(Array.isArray(s.required), `${f} must declare required[]`);
    assert.equal(s.additionalProperties, false, `${f} must forbid extra props`);
  }
});
