---
description: Submit and manage Codex Cloud tasks (exec, list, status, diff, apply)
argument-hint: "exec <prompt> | list | status <id> | diff <id> | apply <id>"
allowed-tools: Bash, Read
---

Use the cdx:driving-codex skill, Cloud section. Request:

$ARGUMENTS

Map directly to `codex cloud exec|list|status|diff|apply`. These commands are experimental upstream — surface their output faithfully, including errors. Before `apply`, show the diff (`codex cloud diff <id>`) and confirm with the user unless they already said to apply.
