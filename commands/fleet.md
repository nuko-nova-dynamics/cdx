---
description: Fan out N parallel Codex workers on a task (decomposition, second opinions, or A/B implementations)
argument-hint: "[--n <2-4>] [--angles \"<a>;<b>;...\"] <task>"
allowed-tools: Bash, Read, Grep, Glob
---

Use the cdx:driving-codex skill, Fleet section. Task:

$ARGUMENTS

- Default `--n 2`; cap at 4 unless the user explicitly asks for more.
- With `--angles`, one worker per angle (each `--sandbox ro`, reporting via `--schema ${CLAUDE_PLUGIN_ROOT}/schemas/task-report.schema.json` or review-findings for review angles).
- Without `--angles`, decompose the task into non-overlapping subtasks yourself; mutating workers get `--sandbox write` and MUST have disjoint file scopes stated explicitly in their prompts.
- Launch every worker with Bash `run_in_background: true`, each with its own `--scratch` dir under the session scratchpad.
- When all report: synthesize — dedupe, note agreements/disagreements, pick winners. Present one unified result with per-worker session ids.
