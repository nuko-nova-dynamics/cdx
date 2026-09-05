---
description: List, resume, or fork Codex sessions, or apply an agent diff
argument-hint: "list [--all] | resume <id|--last> [prompt] | fork <id> [prompt] | apply <task_id>"
allowed-tools: Bash, Read
---

Use the cdx:driving-codex skill, Sessions section. Request:

$ARGUMENTS

- `list`: when present, read `${CODEX_HOME:-$HOME/.codex}/session_index.jsonl`
  and show the 15 most recent sessions with id, thread name, and update
  time. `--all` shows all. If absent, check the installed session commands;
  do not conclude there are no sessions from a missing index.
- `resume <id|--last> [prompt]`: use the runner with `--resume <id|last>`.
  Send the requested delta and choose sandbox from its scope. Use `last`
  only when the intended session is unambiguous. Ask what to send only
  when no continuation intent can be inferred.
- `fork <id> [prompt]`: use the runner with `--fork <id>` and the requested
  delta. It runs `codex exec fork` non-interactively and reports the new
  session id. For a fork-only request, omit the prompt and use `--sandbox ro`;
  expect `status: forked` with no model turn. Schema, image, and ephemeral
  options require a prompt. Inspect the result before reporting what
  occurred. Do not substitute
  interactive `codex fork` in a background automation.
- `apply <task_id>`: inspect the proposed diff and current working tree,
  preserve unrelated work, and run `codex apply <task_id>` within the
  existing authorization. Inspect the resulting diff and report what
  landed or any conflict; a dirty tree alone does not require another
  approval.

Resume and fork have a narrower flag set than fresh runs. Follow the
runner's help and the driving skill's flag map for supported options.
