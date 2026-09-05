#!/usr/bin/env node
// Real Codex integration checks. Uses the signed-in account and consumes usage.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const runner = path.join(root, "scripts/codex-run.mjs");
const scratch = mkdtempSync(path.join(tmpdir(), "cdx-smoke-"));
const overrides = [];
if (process.env.CDX_SMOKE_MODEL) overrides.push("--model", process.env.CDX_SMOKE_MODEL);
if (process.env.CDX_SMOKE_EFFORT) overrides.push("--effort", process.env.CDX_SMOKE_EFFORT);
const preface = "This is a cdx integration check. Do not use tools or modify files. ";

console.log(`Smoke artifacts: ${scratch}`);
console.log(`Model: ${process.env.CDX_SMOKE_MODEL || "inherited"}; effort: ${process.env.CDX_SMOKE_EFFORT || "inherited"}`);

async function run(name, args, prompt, expectedStatus = "completed") {
  const outDir = path.join(scratch, name);
  const argv = [runner, "--sandbox", "ro", "--scratch", outDir, ...overrides, ...args];
  if (prompt) argv.push("--", preface + prompt);
  const child = spawn(process.execPath, argv, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 180_000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.on("close", resolve);
      child.on("error", reject);
    });
    assert.equal(code, 0, `${name} failed:\n${stdout}\n${stderr}`);
    assert.ok(stdout.includes(`status: ${expectedStatus}\n`), `${name}: wrong status\n${stdout}`);
    const session = stdout.match(/^session: (.+)$/m)?.[1];
    assert.ok(session && session !== "unknown", `${name}: missing session id`);
    const message = readFileSync(path.join(outDir, "last-message.txt"), "utf8").trim();
    console.log(`PASS: ${name} (${session})`);
    return { session, message };
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const codeword = `cdx-${randomUUID()}`;
  const initial = await run("initial", ["--cd", scratch], `Remember this codeword for later: ${codeword}. Reply with exactly STORED.`);
  assert.equal(initial.message, "STORED");
  const resumed = await run("resume", ["--resume", initial.session], "Return only the codeword I asked you to remember.");
  assert.equal(resumed.session, initial.session);
  assert.equal(resumed.message, codeword);

  const forked = await run("fork-only", ["--fork", initial.session], null, "forked");
  assert.notEqual(forked.session, initial.session);
  const continued = await run("fork-recall", ["--resume", forked.session], "Return only the codeword I asked you to remember.");
  assert.equal(continued.session, forked.session);
  assert.equal(continued.message, codeword);

  const structured = await run("fork-schema", ["--fork", initial.session, "--ephemeral", "--schema", path.join(root, "schemas/verdict.schema.json")],
    "Evaluate the claim '2 + 2 = 4'. Use the required JSON format and explain the arithmetic briefly.");
  assert.notEqual(structured.session, initial.session);
  const verdict = JSON.parse(structured.message);
  assert.deepEqual(Object.keys(verdict).sort(), ["claim", "confidence", "evidence", "verdict"]);
  assert.equal(verdict.verdict, "confirmed");
  assert.equal(typeof verdict.claim, "string");
  assert.equal(typeof verdict.evidence, "string");
  assert.ok(verdict.confidence === null || (typeof verdict.confidence === "number" && verdict.confidence >= 0 && verdict.confidence <= 1));

  const workers = await Promise.allSettled(["one", "two"].map((label) => run(`worker-${label}`, ["--ephemeral", "--cd", scratch], `Reply with exactly: worker ${label} done`)));
  for (const [i, result] of workers.entries()) {
    if (result.status === "rejected") throw result.reason;
    assert.equal(result.value.message, `worker ${["one", "two"][i]} done`);
  }
  assert.notEqual(workers[0].value.session, workers[1].value.session);
  console.log("PASS: all live smoke checks completed");
} catch (error) {
  console.error(error.message);
  console.error(`Inspect artifacts in ${scratch}`);
  process.exitCode = 1;
}
