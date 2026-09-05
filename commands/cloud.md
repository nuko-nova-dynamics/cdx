---
description: Submit and manage Codex Cloud tasks (exec, list, status, diff, apply)
argument-hint: "exec <prompt> | list | status <id> | diff <id> | apply <id>"
allowed-tools: Bash, Read
---

Use the cdx:driving-codex skill, Cloud section. Request:

$ARGUMENTS

Use `codex cloud exec|list|status|diff|apply`; inspect the installed
subcommand's help for its arguments. Surface actual results and errors.
Before `apply`, inspect the diff (`codex cloud diff <id>`) and the local
working tree. Apply within existing authorization, then verify the result.
If applying was not authorized, present the concrete diff for approval
after completing the inspection.
