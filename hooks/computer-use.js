// Shared by the computer-use launcher (scripts/codex-cu-mcp.mjs) and the cdx
// mod: which tools are cdx's computer-use tools, and the Codex approval policy
// they follow. No `$` calls and no Node imports, so both can load it.

export const COMPUTER_USE_TOOL = /^mcp__plugin_cdx_computer-use__/;

// The top-level `approval_policy` in a Codex config.toml, or null. Values set
// inside a table (a profile) do not count.
export function approvalPolicyFromToml(text) {
  for (const line of String(text ?? "").split("\n")) {
    if (/^\s*\[/.test(line)) break;
    const m = /^\s*approval_policy\s*=\s*"([^"]*)"/.exec(line);
    if (m) return m[1];
  }
  return null;
}
