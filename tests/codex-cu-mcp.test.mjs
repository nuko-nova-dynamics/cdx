import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { codexApprovalPolicy, findServerConfig, isComputerUseApproval } from "../scripts/codex-cu-mcp.mjs";

const darwin = process.platform === "darwin";

function codexHome(versions) {
  const home = mkdtempSync(path.join(tmpdir(), "cdx-cu-"));
  for (const [version, command] of Object.entries(versions)) {
    const dir = path.join(home, "plugins", "cache", "openai-bundled", "unified-computer-use", version);
    mkdirSync(dir, { recursive: true });
    const server = { command, args: [`${version}.mjs`], env: { BROWSER_USE_CODEX_APP_VERSION: version } };
    writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { cua_repl: server } }));
  }
  return home;
}

test("the newest installed plugin version supplies the command, args, and env", { skip: !darwin }, () => {
  const home = codexHome({ "26.930.1": process.execPath, "26.1007.30912": process.execPath, "26.1007.4": process.execPath });
  const config = findServerConfig(home);
  assert.equal(config.version, "26.1007.30912");
  assert.deepEqual(config.args, ["26.1007.30912.mjs"]);
  assert.equal(config.env.BROWSER_USE_CODEX_APP_VERSION, "26.1007.30912");
});

test("a missing plugin or runtime is an error to report, not a crash", { skip: !darwin }, () => {
  assert.match(findServerConfig(codexHome({})).error, /not installed/);
  assert.match(findServerConfig(codexHome({ "1.0.0": "/nonexistent/node" })).error, /runtime is missing/);
});

test("the approval policy is read from the top level of config.toml only", () => {
  const home = mkdtempSync(path.join(tmpdir(), "cdx-cu-policy-"));
  assert.equal(codexApprovalPolicy(home), null);
  writeFileSync(path.join(home, "config.toml"), 'model = "x"\napproval_policy = "never"\n[profiles.a]\napproval_policy = "on-request"\n');
  assert.equal(codexApprovalPolicy(home), "never");
  writeFileSync(path.join(home, "config.toml"), '[profiles.a]\napproval_policy = "never"\n');
  assert.equal(codexApprovalPolicy(home), null);
});

test("only computer-use elicitations count as app approvals", () => {
  const approval = { method: "elicitation/create", params: { _meta: { connector_id: "computer-use" } } };
  assert.equal(isComputerUseApproval(approval), true);
  assert.equal(isComputerUseApproval({ method: "elicitation/create", params: { _meta: { connector_id: "browser" } } }), false);
  assert.equal(isComputerUseApproval({ method: "tools/call" }), false);
});
