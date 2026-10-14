// Shared by the computer-use launcher (scripts/codex-cu-mcp.mjs) and the cdx
// mod: which tools are cdx's computer-use tools, and the Codex approval policy
// they follow. No `$` calls and no Node imports, so both can load it.

export const COMPUTER_USE_TOOL = /^mcp__plugin_cdx_computer-use__/;

// The top-level `approval_policy` in a Codex config.toml, or null. Values set
// inside a table (a profile) do not count, and neither does text inside any
// string, such as an example in a multi-line developer_instructions. The text
// is scanned with TOML's string rules (basic and literal strings, their
// multi-line forms, backslash escapes, comments) rather than line by line.
export function approvalPolicyFromToml(text) {
  const s = String(text ?? "");
  let i = 0;
  let lineStart = true;
  while (i < s.length) {
    if (lineStart) {
      lineStart = false;
      const rest = s.slice(i);
      if (/^[ \t]*\[/.test(rest)) return null; // the first table ends the top level
      const m = /^[ \t]*approval_policy[ \t]*=[ \t]*(?:"([^"\\\n]*)"|'([^'\n]*)')[ \t]*(?:#[^\n]*)?(?:\r?\n|$)/.exec(rest);
      if (m) return m[1] ?? m[2];
    }
    const c = s[i];
    if (c === "\n") {
      lineStart = true;
      i += 1;
    } else if (c === "#") {
      while (i < s.length && s[i] !== "\n") i += 1;
    } else if (s.startsWith('"""', i) || s.startsWith("'''", i)) {
      const q = c;
      const escapes = q === '"';
      i += 3;
      while (i < s.length) {
        if (escapes && s[i] === "\\") {
          i += 2;
        } else if (s.startsWith(q.repeat(3), i)) {
          // Up to two more quotes may belong to the content before the close.
          let run = 0;
          while (s[i + run] === q) run += 1;
          i += run;
          break;
        } else {
          i += 1;
        }
      }
    } else if (c === '"' || c === "'") {
      const escapes = c === '"';
      i += 1;
      while (i < s.length && s[i] !== c && s[i] !== "\n") i += escapes && s[i] === "\\" ? 2 : 1;
      i += 1;
    } else {
      i += 1;
    }
  }
  return null;
}
