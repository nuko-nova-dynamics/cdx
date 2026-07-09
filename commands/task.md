---
description: Delegate a task to Codex with full flag control (model, effort, sandbox, search, images, schema, resume)
argument-hint: "[--bg|--wait] [--model m|spark] [--effort none|minimal|low|medium|high|xhigh] [--sandbox ro|write|full] [--search] [--image <f>] [--schema <name|file>] [--resume [id]|--fresh] [--local [lmstudio|ollama]] [-c k=v] <prompt>"
allowed-tools: Bash, Read, Grep, Glob
---

Use the cdx:driving-codex skill. Delegate the following to Codex via the runner:

$ARGUMENTS

Rules:
- `--bg`/`--wait` control Claude-side execution (background Bash vs foreground); strip them from the runner call. Default: background if the task looks > ~1 minute, else foreground.
- `--schema <name>` where name is one of review-findings|verdict|task-report|patch-plan maps to `${CLAUDE_PLUGIN_ROOT}/schemas/<name>.schema.json`; a path is passed through.
- `--resume` with no id means `--resume last`. `--fresh` means do not resume; strip it.
- Any flag the user did not set: choose per the driving-codex heuristics. Do not ask.
- After the run: parse/verify/act per driving-codex "Acting on results", then report outcome + session id.
