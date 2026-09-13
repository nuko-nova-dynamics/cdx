---
description: Delegate coding, Computer Use, or browser tasks to Codex with model, effort, sandbox, search, schema, and session controls
argument-hint: "[--bg|--wait] [--model m|spark] [--effort none|minimal|low|medium|high|xhigh|max|ultra] [--fast] [--lean] [--sandbox ro|write|full] [--approve-for-me] [--search] [--image <f>] [--schema <name|file>] [--resume [id]|--fork <id>|--fresh] [--local [lmstudio|ollama]] [-c k=v] <prompt>"
allowed-tools: Bash, Read, Grep, Glob
---

Use the cdx:driving-codex skill. Delegate the following through the runner:

$ARGUMENTS

- For desktop or browser work, also use `cdx:codex-computer-use`. Announce
  the Codex handoff, name the requested plugin and app or browser/profile,
  and include them explicitly in the delegated prompt. Verify actual
  runtime access and tool use; `--search` does not select a browser.
- `--bg` and `--wait` select background or foreground Bash execution;
  strip them before invoking the runner. Default to background for
  longer work and foreground for short probes.
- Resolve schema names `review-findings`, `verdict`, `task-report`, and
  `patch-plan` to `${CLAUDE_PLUGIN_ROOT}/schemas/<name>.schema.json`.
  Pass an explicit schema path unchanged.
- Map bare `--resume` to `--resume last` only when the intended session
  is unambiguous. `--fork <id>` starts a separate continuation. These
  modes are mutually exclusive; `--fresh` selects neither and is stripped.
- Choose model and effort from the driving skill's "Choose the model
  first" table unless overridden here. Preserve exact requested model
  names. The effort names above are the runner's accepted union; select
  only levels supported by the actual model. Astra uses `low` for
  lighter reasoning, not `none` or `minimal`.
- Add `--approve-for-me` only on an explicit request for automatic
  approval review, with fresh `--sandbox write`. It is unavailable on
  resume and fork in this runner.
- Choose other unspecified flags using the driving skill and the task's
  authorization. Use `--help` for remaining runner options.
- Before launching, announce the selected model and effort with the reason.
  If `--fast` is used, state that it is paid and include the current model
  credit multiplier.
- For Git or worktree tasks, report whether commit or push was attempted and
  include the exact error before calling it blocked. Never summarize a
  sandbox, network, or worktree metadata restriction as an inherent Codex
  limitation.
- After completion, verify and act on the result within the user's scope,
  then report the outcome, session id, input/cached-input/output token counts
  when available, elapsed time, retries, and any unverified residue.
