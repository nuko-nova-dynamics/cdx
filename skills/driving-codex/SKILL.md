---
name: driving-codex
description: Drive the OpenAI Codex CLI as a full collaborator — delegate tasks, run reviews, fan out parallel workers, resume sessions, and act on structured results. Use whenever the user mentions Codex in any form: "spawn codex", "ask codex", "use codex", "have/let codex do X", "send this to codex", "codex second opinion", "what does codex think", "delegate to codex", "codex review/fix/investigate", resuming or checking a Codex run, comparing Claude's work against Codex, or any request to run another coding agent on the task.
---

# Driving Codex

You are a full collaborator with Codex, not a forwarder. You choose the
flags, you parse the results, you verify claims against the repo, you
apply and test patches, you iterate. The user should never need to know
a single Codex flag.

## Invocation contract

Every non-interactive run goes through the bundled runner (never raw
`codex exec` — its `--json` stream floods context):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.mjs" --sandbox <ro|write|full> [flags] -- <prompt>
```

The runner prints: session id, status, item counts, token usage, the
final message, and artifact paths (full event log, last message,
stderr). It exits 0 only on a completed turn. `codex exec` takes no
approval flag — it is inherently non-interactive; sandbox is the only
control, which is why the runner makes it mandatory.

For long tasks run it with Bash `run_in_background: true` and collect
output when it finishes. Short probes (< ~1 min) can run foreground.

## Choosing flags (your job, never the user's)

- **--sandbox**: `ro` for review/diagnosis/research/second-opinion;
  `write` for fix/implement/refactor (default for mutating asks);
  `full` ONLY when the user explicitly asks for full access — confirm
  once per session before first use.
- **--model**: leave unset by default. "spark" → pass `--model spark`
  (runner maps to gpt-5.3-codex-spark) — good for quick/cheap probes.
  Pass through any explicit model the user names.
- **--effort**: leave unset by default. `xhigh` when the user signals
  hard ("really dig", "think hard", gnarly bug). `low`/`minimal` for
  mechanical bulk edits.
- **--search**: add when the task needs current external knowledge —
  library versions, API docs, error messages worth googling. (Maps to
  `web_search="live"`; without it Codex defaults to `cached` — an
  OpenAI-maintained index with no live external access.)
- **--image <file>**: attach screenshots/mocks when they exist.
- **--schema <path>**: add whenever you will ACT on the result rather
  than just read it. Bundled schemas (see codex-structured-output
  skill): `${CLAUDE_PLUGIN_ROOT}/schemas/review-findings.schema.json`,
  `verdict.schema.json`, `task-report.schema.json`,
  `patch-plan.schema.json`.
- **--ephemeral**: throwaway probes that shouldn't pollute session
  history.
- **--local [lmstudio|ollama]**: only when the user says local/offline.
- **-c key=value**: escape hatch for anything else (see
  references/flag-map.md).

## Sessions: resume, fork, apply

- The runner prints `session: <id>` — remember it for the conversation.
- Follow-up on the same thread: `--resume <id> -- <delta instruction>`.
  Send only the delta, not the whole original prompt.
- "keep going" with exactly one recent thread: `--resume last`.
- List sessions: read `~/.codex/session_index.jsonl` (JSONL of
  `{id, thread_name, updated_at}`); filter/sort with jq or node.
- Diverge without losing the original: `codex fork <id>` (interactive
  picker exists; prefer explicit id).
- Land a session's diff: `codex apply <task_id>`.

## Fleet (parallel fan-out)

For decomposed subtasks, multi-angle second opinions, or A/B
implementations: launch N runner invocations, each via Bash
`run_in_background: true`, each with its own `--scratch` dir and (for
mutating work) NON-OVERLAPPING file scopes stated in the prompt — or
`--sandbox ro` angles that only report. Collect all outputs, then
synthesize: agree/disagree, dedupe findings, pick the best
implementation. 2–4 workers is the sweet spot; more rarely helps.

## Acting on results

- Parse schema output as JSON (it arrives as the final message).
- Verify substantive claims against the repo before presenting them —
  Codex can be confidently wrong. Findings you can't confirm get
  labeled as unverified.
- If the user asked for a fix and Codex wrote one (sandbox `write`),
  inspect the diff (`git diff`), run the relevant tests, then report.
- Never dump raw JSONL or the full event log into the conversation.

## Reviews

Default review path: `--sandbox ro --schema review-findings` with a
prompt containing the diff context (see /cdx:review command for the
template). Native alternative: `codex review [--uncommitted|--base
<ref>|--commit <sha>] [instructions]` — prose output, no schema, but
purpose-built. Use native when the user wants "codex's own review";
use the schema path when findings should be verified and acted on.

## Cloud

`codex cloud exec` submits a task to Codex Cloud; `list`, `status
<id>`, `diff <id>`, `apply <id>` manage it. Cloud tasks run on OpenAI
infra against the repo's GitHub remote — use for long jobs the user
wants off this machine.

## Failure handling

- Non-zero exit: read the errors section + stderr artifact. Common
  signatures:
  - "requires a newer version of Codex" → the user's config.toml pins
    a model this CLI doesn't know. Retry with an explicit supported
    `--model` (e.g. spark) and suggest `codex update`.
  - auth errors → tell the user to run `!codex login`.
  - "Exceeded skills context budget" items are warnings, not failures.
- Runner not found / codex missing → run `/cdx:setup` flow
  (`codex doctor`, install guidance).

## Safety

- Never use `--dangerously-bypass-approvals-and-sandbox` or
  `--dangerously-bypass-hook-trust`.
- `full` sandbox needs explicit user intent + one confirmation per
  session.
- Ask the user nothing else — flag choice is yours.

Full verified flag reference: [references/flag-map.md](references/flag-map.md).
