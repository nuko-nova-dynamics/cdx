# Codex CLI flag map

Checked against **codex-cli 0.153.4 on 2026-09-05** using installed
`--help` for `exec`, `exec resume`, `exec fork`, and `review`. These
observations describe that CLI version, not every provider or account.
Recheck the installed command help when versions differ. The runner's
`--help` is the source for the options it exposes.

## Fresh non-interactive runs

| CLI flag or configuration | Runner mapping and scope |
|---|---|
| `--json` | Always set; events are saved to an artifact |
| `-o, --output-last-message <file>` | Always set |
| `--sandbox <read-only\|workspace-write\|danger-full-access>` | Required runner `--sandbox ro\|write\|full` |
| `--approve-for-me` | Explicit opt-in to automatic approval review; runner requires fresh `--sandbox write` |
| `--model <model>` | `--model`; only `spark` is an alias, for `gpt-5.3-codex-spark` |
| `-c model_reasoning_effort="<level>"` | `--effort`; model support varies, see below |
| `-c service_tier="fast"` | `--fast`; see availability and cost notes below |
| `-c web_search="live"` | `--search`; `exec` has no standalone `--search` flag |
| `--image <file>` | Repeatable runner `--image` |
| `--output-schema <file>` | `--schema <path>` |
| `--oss`, `--local-provider <lmstudio\|ollama>` | `--local [lmstudio\|ollama]` |
| `--cd <dir>` | `--cd` |
| `--add-dir <dir>` | Repeatable runner `--add-dir` |
| `--ephemeral` | `--ephemeral` |
| `--skip-git-repo-check` | Added when the effective working root is outside a Git repository |
| `-c key=value` | Repeatable config override; maintain the selected execution boundaries |

The CLI also exposes profiles, feature toggles, config controls, and
other options that the runner does not wrap. Use the relevant help for
their exact syntax. Do not assume every CLI flag has a config equivalent.

## Model effort and speed

The runner accepts `none`, `minimal`, `low`, `medium`, `high`, `xhigh`,
`max`, and `ultra` as a union of CLI effort settings; each model supports
its own subset. Leave model and effort unset to inherit the user's
configuration unless an override is requested or needed.

The Astra entry in the local CLI model catalog inspected on 2026-09-05
advertised `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`.
The public [Astra API model page](https://developers.openai.com/api/docs/models/gpt-6-astra)
lists `low` through `max`. Treat `ultra` as CLI/account-dependent;
neither `none` nor `minimal` is an Astra setting. Check current model
metadata before choosing a level; `xhigh` is not a universal maximum.

Fast mode changes serving speed independently of reasoning effort.
The official [Codex speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed)
states a 1.5x speed increase for GPT-5.6, GPT-5.5, and GPT-5.4.
For Astra it states 2.5x Standard ChatGPT credit consumption where
available, without that speed multiplier. ChatGPT credit multipliers
do not describe API-key billing. Fast mode may also depend on the
`fast_mode` feature setting; inspect the active configuration if the
requested tier is unavailable.

The same source describes Spark as a separate model with its own
limits, available to ChatGPT Pro during research preview. Do not use
it as a universal fallback or promise lower cost without checking the
account and current terms.

## Resume and fork

```text
codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]
codex exec fork [OPTIONS] <SESSION_ID> [PROMPT]
```

Resume accepts a session id or name, or `--last`; `--all` removes cwd
filtering. Fork requires an explicit session id or name and creates a
new session. The runner exposes `--resume <id|last>` and `--fork <id>`
as mutually exclusive modes.

A fork without a prompt only creates the session and reports
`status: forked`, with no model turn. The runner omits the last-message
option and rejects schemas, images, and `--ephemeral` in this mode.
A prompted fork follows the normal completed-turn contract.

Both subcommands accept `-c`, `-m`, `-i`, `--output-schema`, `--json`,
`-o`, `--ephemeral`, and `--skip-git-repo-check`. Their direct flag sets
omit `--sandbox`, `--approve-for-me`, `--oss`, `--cd`, and `--add-dir`.
The runner maps sandbox to `-c sandbox_mode="<mode>"` and search to
`-c web_search="live"`; it rejects unsupported mode-specific options.
Use an explicit session id for automation when selecting the wrong
recent session would change the task.

## Native review

```text
codex review [OPTIONS] [PROMPT]
```

Choose one of `--uncommitted`, `--base <branch>`, or `--commit <sha>`.
These target flags conflict with `[PROMPT]` in 0.153.4. For custom
focus, prefer the structured runner path, or use a prompt containing
both target and focus without any target flag when native review was
explicitly requested. `--title` labels a commit review. Config and
feature overrides are also available; consult `codex review --help`.

Native `--base` compares the base branch's merge base with the current
working tree, including tracked staged and unstaged edits. Use
`git merge-base <ref> HEAD` followed by `git diff <merge-base-sha>` for
the same target in structured or custom-prompt reviews. A comparison to
HEAD alone would omit local edits and change the scope between paths.

## Sessions and other commands

When present, `${CODEX_HOME:-$HOME/.codex}/session_index.jsonl` contains
records with `id`, `thread_name`, and `updated_at`. This is a local
storage detail and may change independently of CLI flags. If absent,
inspect the installed session-management commands instead of assuming
the account has no sessions.

`codex fork` is interactive; automation uses `codex exec fork`.
`codex apply <task_id>` applies an agent diff. `codex cloud` provides
`exec`, `list`, `status`, `diff`, and `apply`. Inspect each command's
help before use rather than reusing flags from `exec`.

## Event stream and stdin

The runner observes `thread.started`, `turn.started`, `item.completed`,
`turn.completed`, `turn.failed`, and error events. A model task requires
both a completed turn and a successful process exit. A fork-only operation
requires a new session id, successful exit, and no error. Inspect the
reported operation and artifacts before treating the task as complete.

Installed `codex exec --help` states that piped stdin is appended to a
prompt argument. A background process whose stdin never closes can
therefore wait for more input. The runner spawns Codex with stdin
ignored to prevent that wait.

Use the installed CLI as the primary source for command syntax. For
concepts and current service behavior, consult OpenAI's
[Codex source repository](https://github.com/openai/codex).
