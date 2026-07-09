# Codex CLI flag map — verified against codex-cli 0.144.0 (2026-07-09)

Runner flags map to these. Anything not wrapped by the runner can be
passed with `-c key=value` or by calling `codex` directly.

## codex exec (non-interactive; NO approval flag exists)

| Flag | Notes |
|---|---|
| `--json` | JSONL events on stdout (runner always sets) |
| `-o, --output-last-message <file>` | final message to file (runner always sets) |
| `-s, --sandbox <read-only\|workspace-write\|danger-full-access>` | runner: ro/write/full |
| `-m, --model <model>` | runner `--model`; alias spark→gpt-5.3-codex-spark |
| `-c model_reasoning_effort="<none\|minimal\|low\|medium\|high\|xhigh>"` | runner `--effort` |
| `-c web_search="<disabled\|cached\|indexed\|live>"` | runner `--search` → `live`. The `--search` FLAG was REMOVED from exec in 0.144.0 (still exists on the interactive TUI); default mode is `cached` (OpenAI-maintained index, no external access) |
| `-i, --image <file>...` | attach images |
| `--output-schema <file>` | JSON Schema for final response |
| `--oss` / `--local-provider <lmstudio\|ollama>` | runner `--local` |
| `-C, --cd <dir>` | working root |
| `--add-dir <dir>` | extra writable roots |
| `--ephemeral` | no session persistence |
| `--skip-git-repo-check` | allow outside a git repo |
| `-p, --profile <name>` | layer $CODEX_HOME/<name>.config.toml |
| `--enable <feature>` / `--disable <feature>` | feature flags (`codex features list`) |
| `--ignore-user-config` / `--ignore-rules` / `--strict-config` | config hygiene |
| `--color <always\|never\|auto>` | output color |

## codex exec resume

`codex exec resume [SESSION_ID] [PROMPT]` — UUID or thread name;
`--last` for most recent; `--all` disables cwd filtering.
NARROWER flag set than exec (verified 0.143.0/0.144.0): accepts `-c`,
`-m`, `-i`, `--output-schema`, `--json`, `-o`, `--ephemeral`,
`--skip-git-repo-check` — but NOT `--sandbox` (use
`-c sandbox_mode="<mode>"`), `--oss`, `-C`, or `--add-dir`. The runner
maps sandbox and web search to config keys automatically (so `--search`
works on resume) and errors on the unsupported ones.

## codex review (native reviewer, prose output)

`codex review [PROMPT]` with `--uncommitted` | `--base <branch>` |
`--commit <sha>`, optional `--title <t>`. `-c`/`--enable`/`--disable`
also accepted.

## codex cloud

`codex cloud exec|list|status|diff|apply` — submit/browse/apply Codex
Cloud tasks.

## Sessions on disk

`~/.codex/session_index.jsonl`: `{"id","thread_name","updated_at"}`
per line. Full transcripts under `~/.codex/sessions/<year>/...`.

## Other subcommands

`codex apply <task_id>` (git-apply latest agent diff), `codex fork`,
`codex doctor`, `codex features list`, `codex sandbox` (run arbitrary
commands inside Codex sandbox), `codex mcp-server` (Codex as MCP).

## Event stream (`--json`)

`thread.started{thread_id}` · `turn.started` ·
`item.completed{item:{id,type,...}}` with item types
`agent_message{text}` / `command_execution` / `error{message}` ·
`turn.completed{usage{input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens}}`
· `turn.failed{error{message}}` · top-level `error{message}`.

## Danger flags — NEVER USE

`--dangerously-bypass-approvals-and-sandbox`,
`--dangerously-bypass-hook-trust`.
