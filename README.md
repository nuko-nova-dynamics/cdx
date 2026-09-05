# cdx

[Codex CLI](https://github.com/openai/codex) integration for Claude Code.

Skill-first: say **"spawn codex on the failing tests"**, **"get a codex second
opinion on this diff"**, or **"have codex fix this in the background"** and
Claude picks the right flags, runs `codex exec`, parses structured output, and
acts on it: verifies findings against the repo, checks patches, and resumes
or forks sessions.

CLI surface verified against **codex-cli 0.153.4** on September 5, 2026.
Requires Node >= 20 and a logged-in Codex CLI (`codex login`). Run
`/cdx:setup` after changing CLI versions to check for drift.

## Install

```bash
claude plugin marketplace add nuko-nova-dynamics/marketplace
claude plugin install cdx@nuko-nova-tools
```

Update an existing installation with:

```bash
claude plugin marketplace update nuko-nova-tools
claude plugin update cdx@nuko-nova-tools
```

Reload plugins or start a new Claude Code session after updating. Standalone
installs through `nuko-nova-dynamics/cdx` (`cdx@cdx`) and local clones remain
supported; use the marketplace matching your existing installation.

## Philosophy

- **Natural language is the interface.** Ask to delegate work to Codex;
  slash commands are optional aliases.
- **Claude chooses the flags.** Sandbox, model, effort, web search, images,
  schemas are selected per task while preserving your explicit choices.
- **Structured output over prose relay.** Reviews and reports come back as
  JSON (`--output-schema`) that Claude parses, verifies, and acts on.
- **Codex owns its state.** Sessions live in `~/.codex`; cdx keeps no job
  registry, no state files, no companion daemon. One small runner script tames
  the JSONL event stream; everything else is the CLI itself.

## Commands

| Command | Purpose |
|---|---|
| `/cdx:task` | Delegate with model, effort, sandbox, Fast tier, search, images, schema, resume, fork, and local-provider options. `--approve-for-me` opts into automatic review on fresh workspace-write runs. |
| `/cdx:review` | Structured review Claude verifies finding-by-finding, or `--native` for Codex's built-in reviewer (`--uncommitted\|--base <ref>\|--commit <sha>`) |
| `/cdx:fleet` | 2–4 parallel Codex workers: decomposed subtasks, multi-angle opinions, A/B implementations |
| `/cdx:session` | `list`, `resume <id\|--last>`, `fork <id>`, `apply <task_id>` |
| `/cdx:cloud` | Codex Cloud: `exec`, `list`, `status`, `diff`, `apply` |
| `/cdx:setup` | Doctor: install, auth, version drift vs the verified flag map, config pitfalls, live smoke |

## Skills

- **driving-codex**: invocation contract, flag heuristics, session
  management, fleet fan-out, failure signatures. Reference:
  `skills/driving-codex/references/flag-map.md` (stamped with the verified CLI
  version).
- **codex-structured-output**: bundled schema library (`review-findings`,
  `verdict`, `task-report`, `patch-plan`) + rules for ad-hoc schemas.
- **prompting-codex**: task framing, authorization, and proportional verification,
  with GPT-6 Astra guidance. Original templates were adapted from
  openai/codex-plugin-cc (Apache-2.0, see NOTICE).

## Models and reasoning

The runner inherits your Codex model and effort by default. Explicit model IDs
pass through unchanged; `spark` remains an alias for `gpt-5.3-codex-spark` when
your account supports it.

```bash
node scripts/codex-run.mjs --sandbox ro --model gpt-6-astra --effort max -- "Review this repository"
node scripts/codex-run.mjs --sandbox ro --fork <session-id>
```

Reasoning levels are model-dependent. The current Astra CLI catalog offers
`low`, `medium`, `high`, `xhigh`, `max`, and `ultra`; Ultra also enables automatic
delegation. Use `low` instead of `none` or `minimal` for Astra. Fast tier changes
serving speed and usage independently of effort; availability and rates depend
on the selected model and sign-in method. See the maintained
[flag reference](skills/driving-codex/references/flag-map.md).

## Safety model

- The runner **requires** an explicit sandbox: `ro` (read-only) for
  review/research, `write` (workspace-write) for fixes, `full`
  (danger-full-access) only with explicit user authorization.
- `--approve-for-me` routes approval requests to Codex's automatic reviewer.
  It requires a fresh `--sandbox write` run and is never enabled implicitly.
  Sandbox and approval policy are distinct controls; neither authorizes
  unrelated external actions.
- The `--dangerously-bypass-*` flags are never used, under any circumstances.

## Testing

```bash
node --test tests/*.test.mjs   # unit tests (stub codex, free)
bash tests/smoke.sh            # real Codex calls using your configured model
CDX_SMOKE_MODEL=gpt-6-astra CDX_SMOKE_EFFORT=low bash tests/smoke.sh
```

The live smoke covers structured output, session recall, fork creation and
continuation, and two concurrent workers. It uses a unique temporary directory
and reports its artifact paths. Model runs consume your normal Codex allowance.

## License

Apache-2.0. Portions adapted from openai/codex-plugin-cc — see NOTICE.
