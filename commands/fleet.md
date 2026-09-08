---
description: Fan out N parallel Codex workers on a task (decomposition, second opinions, or A/B implementations)
argument-hint: "[--n <2-4>] [--angles \"<a>;<b>;...\"] <task>"
allowed-tools: Bash, Read, Grep, Glob
---

Use the cdx:driving-codex skill, Fleet section. Task:

$ARGUMENTS

- Default `--n 2`; cap at 4 unless the user explicitly asks for more. Use independent subtasks that benefit from parallel work; keep dependent edits sequential.
- With `--angles`, one worker per angle (each `--sandbox ro`, reporting via `--schema ${CLAUDE_PLUGIN_ROOT}/schemas/task-report.schema.json` or review-findings for review angles).
- Without `--angles`, decompose the task into non-overlapping subtasks; mutating workers get `--sandbox write` and disjoint file scopes or isolated worktrees stated explicitly in their prompts.
- Launch every worker with Bash `run_in_background: true`, each with its own `--scratch` dir under the session scratchpad.
- A scratch directory isolates logs, not edits. Preserve each worker's model and effort settings unless the user requested overrides.
- Serialize workers that operate the same browser profile or desktop app. Worktrees and scratch directories do not isolate UI state. For UI work, use `cdx:codex-computer-use` and include its explicit plugin and target requirements in every affected worker prompt.
- Collect every worker result and inspect substantive claims or combined edits against the source. Resolve disagreements and present one unified result with per-worker session ids and any remaining work.
