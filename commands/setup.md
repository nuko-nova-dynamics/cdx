---
description: Check Codex CLI installation, authentication, and runner compatibility
argument-hint: "[--smoke] [--model <name>]"
allowed-tools: Bash, Read, AskUserQuestion
---

Health-check the Codex integration:

$ARGUMENTS

1. Read `codex --version` and the CLI path. If missing, use the user's
   established installation method; verify the current stable release
   before installing or upgrading. Proceed if installation is already
   authorized, otherwise report the missing prerequisite and proposed
   install action.
2. Run `codex doctor` and `codex login status`. Surface actual failures
   without exposing credentials. If sign-in is needed, direct the user
   to `!codex login`.
3. Check `codex exec --help`, `codex exec resume --help`, and
   `codex exec fork --help` against the features needed. Compare with
   `${CLAUDE_PLUGIN_ROOT}/skills/driving-codex/references/flag-map.md`.
   A newer version may add flags; an older one may lack required ones.
4. Inspect only relevant model/config settings if diagnostics show a
   problem. For a rejected model or effort, check installed capabilities
   and account availability. Preserve an explicit model choice and the
   user's configuration; do not silently remove a pin or retry with Spark.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.mjs" --help` to verify
   the bundled runner loads without starting a model task.
6. If `--smoke` or a live smoke test was requested, run the runner with
   `--sandbox ro --ephemeral -- "Reply with exactly: ok"`. Inherit the
   configured model and effort unless the user supplied an override.
   Check status and final output. This verifies a live model call and
   consumes usage; an offline health check alone does not prove it.

Report CLI version, authentication, runner compatibility, and whether a
live smoke test passed, failed, or was not run. Keep the report compact.
