---
description: List, resume, fork Codex sessions or apply a session's diff
argument-hint: "list [--all] | resume <id|--last> [prompt] | fork <id> | apply <task_id>"
allowed-tools: Bash, Read
---

Use the cdx:driving-codex skill, Sessions section. Request:

$ARGUMENTS

- `list`: read `~/.codex/session_index.jsonl`, show the 15 most recent as a table (id prefix, thread name, updated). `--all` shows all.
- `resume <id|--last> [prompt]`: runner with `--resume <id|last>` and the prompt (ask what to send only if no prompt given and intent is unclear).
- `fork <id>`: run `codex fork <id>` and report the new session id.
- `apply <task_id>`: run `codex apply <task_id>`, then `git diff --stat` and report what landed. Warn if the working tree was dirty beforehand.
