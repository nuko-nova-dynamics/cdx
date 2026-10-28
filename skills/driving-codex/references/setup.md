# Codex health check

Run this when the Codex CLI or runner is missing, signed out, rejects a
model, effort, or flag, or when the user asks to check the setup. Add the
live smoke test (step 6) and the plugin check (step 7) only when the user
asks for them or the failure points there.

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
   [the flag map](flag-map.md).
   A newer version may add flags; an older one may lack required ones.
4. Inspect only relevant model/config settings if diagnostics show a
   problem. For a rejected model or effort, check installed capabilities
   and account availability. Preserve an explicit model choice and the
   user's configuration; do not silently remove a pin or retry with Spark.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.mjs" --help` to verify
   the bundled runner loads without starting a model task.
6. Live smoke test, without a plugin check:
   run the runner with `--sandbox ro --ephemeral -- "Reply with exactly: ok"`.
   Inherit the
   configured model and effort unless the user supplied an override.
   Check status and final output. This verifies a live model call and
   consumes usage; an offline health check alone does not prove it.
7. Plugin check, for Computer Use or browser access: read
   `cdx:codex-computer-use` and inspect `codex plugin list --json` for the
   relevant installed/enabled plugins and catalog errors. With a live smoke
   test as well, use one delegated non-mutating check of the requested
   capability/target. Require the
   actual tool and observed connection result. Do not operate unrelated
   tabs or apps, change permissions, or install plugins to pass a check.
   Also check cdx's own `computer-use` server: confirm
   `mcp__plugin_cdx_computer-use__js` is available, and with a live smoke test call it
   once with `await cua.getState();`. Report a tool error (no ChatGPT app or
   no unified-computer-use plugin) as the missing prerequisite. Report any
   entry in the result's `errors`; "The browser access host is unavailable"
   means the session runs cdx older than 0.7.4.

Report CLI version, authentication, runner compatibility, and whether a
live smoke test passed, failed, or was not run. Keep the report compact.
For plugin checks, distinguish installed/enabled state from live access.
