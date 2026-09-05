---
description: Review code with structured findings or Codex's native reviewer
argument-hint: "[--uncommitted|--base <ref>|--commit <sha>] [--native] [focus text]"
allowed-tools: Bash, Read, Grep, Glob
---

Use the cdx:driving-codex skill. Review request:

$ARGUMENTS

Determine one target from the request and current repository state:
- `--uncommitted`: staged, unstaged, and untracked changes. This is the
  default for a dirty working tree when no other target was requested.
- `--base <ref>`: changes from the merge base of `<ref>` and HEAD to the
  current working tree, including tracked staged and unstaged edits.
  Resolve `git merge-base <ref> HEAD`, then use `git diff <merge-base-sha>`
  consistently for structured and native reviews. This target alone does
  not include untracked files.
- `--commit <sha>`: changes introduced by that commit.

Reject conflicting target flags. If no target can be inferred from the
request or current context, ask for it before launching a review. Preserve
any supplied focus, and report the target used.

Default structured path:
1. Run the runner with `--sandbox ro --schema "${CLAUDE_PLUGIN_ROOT}/schemas/review-findings.schema.json"` and a prompt such as:
   "Review <exact target> in <repository root> for correctness bugs, security issues, and broken edge cases. Focus: <focus or general correctness>. Inspect the code in place, including untracked files if part of the target. Report only findings supported by a concrete failure scenario. Do not edit files."
2. Parse the findings and verify each against current source and the
   triggering scenario. Report confirmed findings first and label any
   remaining uncertainty. An empty findings array is a valid result.

`--native` path:
- Without focus text, run `codex review` with the selected target flag.
- With focus text, pass a single custom prompt containing both the exact
  target and focus, without any target flag. In CLI 0.153.4, target flags
  conflict with `[PROMPT]`; combining them fails before review starts.
- Attribute native output to Codex and state that it has not had an
  independent verification pass. Preserve the user's native choice.

For a focused review without an explicit native request, use the
structured path. This command reports findings; it does not apply fixes.
