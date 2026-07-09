---
description: Codex code review — structured findings Claude verifies, or Codex's native reviewer
argument-hint: "[--uncommitted|--base <ref>|--commit <sha>] [--native] [focus text]"
allowed-tools: Bash, Read, Grep, Glob
---

Use the cdx:driving-codex skill. Review request:

$ARGUMENTS

Default (structured) path:
1. Determine target: `--uncommitted` → staged+unstaged+untracked (also the default when no target flag is given and the working tree is dirty); `--base <ref>` → `git diff <ref>...HEAD`; `--commit <sha>` → that commit.
2. Run the runner with `--sandbox ro --schema ${CLAUDE_PLUGIN_ROOT}/schemas/review-findings.schema.json` and a prompt of the form:
   "Review the following change for correctness bugs, security issues, and broken edge cases. Focus: <focus text or 'general correctness'>. Repository root: <cwd>. Inspect the code in place; the diff target is: <target description>. Report only findings you can support with a concrete failure scenario."
3. Parse findings JSON. Verify each finding against the repo (read the cited file/line). Report confirmed findings first, then plausible-but-unverified, then Codex's overall assessment.

`--native` path: run `codex review` with the matching target flag (`--uncommitted`, `--base <ref>`, or `--commit <sha>`) and optional focus text as PROMPT; return its output with attribution to Codex, no verification pass.
This command never fixes anything — report only.
