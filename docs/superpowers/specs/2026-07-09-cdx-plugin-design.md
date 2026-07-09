# cdx — full-surface Codex plugin for Claude Code

**Date:** 2026-07-09
**Status:** Approved design
**Replaces:** official `openai-codex` plugin (openai/codex-plugin-cc v1.0.6), which will be uninstalled after cdx is installed and verified.
**Distribution:** own repo under `nuko-nova-dynamics`, listed in the `nuko-nova-dynamics/claude-marketplace` marketplace (same pattern as claude-goal).
**Verified against:** codex-cli 0.143.0 (`codex --help`, `codex exec --help`, `codex review --help`, `codex cloud --help`, `codex exec resume --help`, `codex apply --help`, `codex features list` — all inspected 2026-07-09).

## 1. Problem

The official plugin deliberately restricts the Codex surface: `/codex:rescue` exposes only `--model/--effort/--resume/--fresh/--background/--wait/--write`, routes everything through a ~5,300-line companion runtime, and forbids Claude from inspecting the repo, choosing flags, or acting on Codex's output ("thin forwarder" rule). Codex CLI 0.143.0 actually offers: sandbox policies, approval policies, native web search, image attachments, `--output-schema` structured output, `--json` JSONL event streaming, config overrides (`-c`), profiles, feature flags, local OSS providers, `--add-dir`, `--ephemeral`, session resume/fork/apply by id, and the whole `codex cloud` subcommand family.

## 2. Philosophy

Invert the official plugin. No companion runtime middleman. Claude drives the `codex` CLI directly via Bash with the full flag surface, **chooses flags intelligently per task**, parses structured results, verifies claims against the repo, applies and tests patches, and iterates. Codex's own on-disk session store (`~/.codex/sessions`, `session_index.jsonl`) is the only state — cdx never duplicates its bookkeeping.

## 3. Primary interface: natural language, not slash commands

The user will almost always invoke Codex by prose ("spawn codex on this", "get codex's opinion", "have codex fix the failing tests") — rarely via `/cdx:*` commands. Consequences, in priority order:

1. The `driving-codex` skill is the product. Its description must trigger on: "spawn codex", "ask codex", "use codex", "codex second opinion", "have/let codex …", "delegate to codex", "what does codex think", "codex review", and any request to run, resume, or check a Codex job.
2. The skill body must be complete enough that Claude can execute any Codex workflow end-to-end with zero additional context: invocation contract, flag-selection heuristics, output handling, resume/fork, fleet fan-out, cloud.
3. Slash commands are thin optional aliases that load the same skill with pre-parsed arguments. They add discoverability, not capability.
4. Claude asks the user nothing unless the action is destructive (e.g. `--sandbox full`) or the request is genuinely ambiguous about intent (not about flags — flags are Claude's job).

## 4. Components

### 4.1 Skills (3)

**`driving-codex`** (core; auto-triggers per §3)
- Non-interactive invocation contract: `codex exec` with explicit `--sandbox` (verified: `codex exec` rejects `-a/--ask-for-approval` — it is inherently non-interactive, so sandbox is the only control), `-o <scratch>/last-message.txt`, `--json` streamed to a scratch file via the runner script, `--skip-git-repo-check` only when genuinely outside a repo.
- Flag-selection heuristics:
  - sandbox: `read-only` for review/research/diagnosis; `workspace-write` for fix/implement (default); `danger-full-access` only on explicit user request.
  - effort: leave unset by default; `xhigh` for gnarly debugging on explicit "think hard"-type asks; `low/minimal` for mechanical bulk edits.
  - model: unset by default; map "spark" → `gpt-5.3-codex-spark`; `--oss --local-provider lmstudio|ollama` when user says local.
  - `--search` when the task needs current external knowledge (library versions, API docs, error strings).
  - `-i/--image` when screenshots/mocks are in play.
  - `--output-schema` whenever the result should be acted on rather than read (reviews, verdicts, structured reports).
  - `--ephemeral` for throwaway probes that shouldn't pollute session history.
- Session management: parse the runner's reported session id; `codex exec resume <id> "<follow-up>"` for continuation; `--last` when the user says "keep going" and there is exactly one recent thread; `codex fork` for divergent exploration; `codex apply <task_id>` to land a session's diff.
- Fleet pattern: N parallel background runs (Claude Code background Bash), each with its own scratch dir and schema; aggregate + synthesize when all report. Use for decomposed subtasks, multi-angle second opinions, A/B implementations.
- Output handling: never dump raw JSONL into context; read the runner's compact summary + final message; verify substantive claims against the repo before presenting; apply/test patches when the user asked for a fix.
- Failure handling: nonzero exit → read stderr tail from scratch file, check `codex doctor`, report cause; auth failures → point at `!codex login`.

**`codex-structured-output`** — how to pick a bundled schema vs author an ad-hoc one; where schemas live; parsing/validation expectations; keep schemas flat and required-field-minimal because Codex fills them best that way.

**`prompting-codex`** — GPT-5.x-Codex prompt-writing guidance adapted from the official plugin's Apache-2.0 `gpt-5-4-prompting` skill (attribution in NOTICE): tight task framing, explicit deliverable shape, anti-patterns.

### 4.2 Commands (6, thin aliases)

| Command | Behavior |
|---|---|
| `/cdx:task` | `[--bg\|--wait] [--model m\|spark] [--effort none\|minimal\|low\|medium\|high\|xhigh] [--sandbox ro\|write\|full] [--search] [--image <f>]... [--schema <name\|file>] [--resume [id]\|--fresh] [--local [lmstudio\|ollama]] [-c k=v]... [--add-dir <d>]... <prompt>` — anything unstated is chosen by the heuristics in `driving-codex`. |
| `/cdx:review` | `[--uncommitted\|--base <ref>\|--commit <sha>] [--native] [focus text]` — default path is `codex exec` + `review-findings` schema so Claude can verify each finding against the repo and report confirmed/refuted; `--native` uses `codex review` verbatim instead. |
| `/cdx:fleet` | `[--n <count>] [--angles "<a>;<b>;…"] <task>` — parallel workers per the fleet pattern; synthesis at the end. |
| `/cdx:session` | `list [--all]` (reads `~/.codex/session_index.jsonl`), `resume <id\|--last> [prompt]`, `fork <id>`, `apply <task_id>`. |
| `/cdx:cloud` | passthrough to `codex cloud exec\|list\|status\|diff\|apply` with the same verbatim-flags philosophy. |
| `/cdx:setup` | `codex doctor` + version + auth check + `codex features list` summary; offers `npm install -g @openai/codex` / `!codex login` when missing. |

### 4.3 Schemas (`schemas/`)

- `review-findings.schema.json` — findings[]: file, line, severity, summary, failure scenario.
- `verdict.schema.json` — claim, verdict (confirmed/refuted/uncertain), evidence, confidence.
- `task-report.schema.json` — summary, files_changed[], commands_run[], risks[], follow_ups[].
- `patch-plan.schema.json` — steps[]: file, change description, rationale; ordered.

### 4.4 Scripts — exactly one

`scripts/codex-run.mjs`: composes the `codex exec` argv from a small set of named options, spawns it, tees the `--json` JSONL stream to a scratch file, and prints: compact progress lines (tool calls / files touched counts), the final agent message, the session id, and the scratch-file path. Exists solely because raw `--json` output is too noisy for context. Everything else in the plugin is plain `codex` / `git` invocations. No state files, no job registry — Claude Code's background-task tracking and Codex's session store cover it.

### 4.5 Safety defaults

- Sandbox is always explicit (it is the sole non-interactive control — `codex exec` accepts no approval flag); default `workspace-write` for mutating tasks, `read-only` otherwise.
- `danger-full-access` only when the user explicitly asks (`--sandbox full` or equivalent prose); confirm once before first use in a session.
- Never `--dangerously-bypass-approvals-and-sandbox`; never `--dangerously-bypass-hook-trust`.

## 5. Repo layout

```
cdx/
  .claude-plugin/plugin.json        # name: cdx
  commands/{task,review,fleet,session,cloud,setup}.md
  skills/driving-codex/SKILL.md
  skills/driving-codex/references/flag-map.md      # full verified flag reference per CLI version
  skills/codex-structured-output/SKILL.md
  skills/prompting-codex/SKILL.md (+ references/ adapted from Apache-2.0 upstream)
  schemas/*.schema.json
  scripts/codex-run.mjs
  tests/smoke.sh
  README.md  LICENSE (Apache-2.0)  NOTICE (upstream attribution)  CHANGELOG.md
```

## 6. Testing

`tests/smoke.sh` against a scratch repo: (1) trivial `codex exec` run through `codex-run.mjs` asserting session id + final message captured; (2) one run per bundled schema asserting valid JSON matching the schema; (3) resume round-trip (run → resume same id → assert continuation); (4) 2-worker fleet run asserting both scratch outputs exist. Manual acceptance: invoke by prose ("spawn codex to …") in a real session and confirm the skill triggers and picks sane flags.

## 7. Out of scope (v1)

- Stop-review-gate hook (worth reimplementing later as opt-in).
- Registering `codex mcp-server` in `.mcp.json` (possible later bonus for typed quick calls).
- Windows support.
- Codex desktop app / remote-control / app-server integration.

## 8. Risks

- **CLI drift:** Codex releases fast; flag reference lives in one file (`references/flag-map.md`) with the verified version stamped, and `/cdx:setup` warns when the installed version is newer than the verified one.
- **Skill trigger misses:** if prose invocation doesn't trigger reliably, fall back is adding a pointer line to `~/.claude/CLAUDE.md`; test during acceptance.
- **Context flooding:** mitigated by the runner script being the only sanctioned way to stream runs.
