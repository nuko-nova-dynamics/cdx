# cdx

Full-surface [Codex CLI](https://github.com/openai/codex) integration for Claude Code.

Skill-first: say **"spawn codex on the failing tests"**, **"get a codex second
opinion on this diff"**, or **"have codex fix this in the background"** and
Claude picks the right flags, runs `codex exec`, parses structured output, and
acts on it — verifies findings against the repo, applies and tests patches,
resumes threads. A real two-model loop, replacing the official openai-codex
plugin's locked-down verbatim forwarder.

Verified against **codex-cli 0.143.0**. Requires Node >= 20 and a logged-in
Codex CLI (`codex login`).

## Install

```bash
claude plugin marketplace add nuko-nova-dynamics/cdx
claude plugin install cdx@cdx
```

Or from a local clone: `claude plugin marketplace add /path/to/cdx`.

## Philosophy

- **Natural language is the interface.** The `driving-codex` skill triggers on
  any mention of Codex; slash commands are optional aliases.
- **Claude chooses the flags.** Sandbox, model, effort, web search, images,
  schemas — selected per task by documented heuristics, never asked of you.
- **Structured output over prose relay.** Reviews and reports come back as
  JSON (`--output-schema`) that Claude parses, verifies, and acts on.
- **Codex owns its state.** Sessions live in `~/.codex`; cdx keeps no job
  registry, no state files, no companion daemon. One small runner script tames
  the JSONL event stream; everything else is the CLI itself.

## Commands

| Command | Purpose |
|---|---|
| `/cdx:task` | Delegate with full flag control: `[--bg\|--wait] [--model m\|spark] [--effort ...] [--sandbox ro\|write\|full] [--search] [--image f] [--schema name\|file] [--resume [id]\|--fresh] [--local] [-c k=v] <prompt>` |
| `/cdx:review` | Structured review Claude verifies finding-by-finding, or `--native` for Codex's built-in reviewer (`--uncommitted\|--base <ref>\|--commit <sha>`) |
| `/cdx:fleet` | 2–4 parallel Codex workers: decomposed subtasks, multi-angle opinions, A/B implementations |
| `/cdx:session` | `list`, `resume <id\|--last>`, `fork <id>`, `apply <task_id>` |
| `/cdx:cloud` | Codex Cloud: `exec`, `list`, `status`, `diff`, `apply` |
| `/cdx:setup` | Doctor: install, auth, version drift vs the verified flag map, config pitfalls, live smoke |

## Skills

- **driving-codex** — the core: invocation contract, flag heuristics, session
  management, fleet fan-out, failure signatures. Reference:
  `skills/driving-codex/references/flag-map.md` (stamped with the verified CLI
  version).
- **codex-structured-output** — bundled schema library (`review-findings`,
  `verdict`, `task-report`, `patch-plan`) + rules for ad-hoc schemas.
- **prompting-codex** — GPT-5.x-Codex prompt contracts, adapted from
  openai/codex-plugin-cc (Apache-2.0, see NOTICE).

## Safety model

- `codex exec` is inherently non-interactive (no approval flag exists); the
  runner therefore **requires** an explicit sandbox: `ro` (read-only) for
  review/research, `write` (workspace-write) for fixes, `full`
  (danger-full-access) only on explicit request with one confirmation per
  session.
- The `--dangerously-bypass-*` flags are never used, under any circumstances.

## Testing

```bash
node --test tests/*.test.mjs   # unit tests (stub codex, free)
bash tests/smoke.sh            # real Codex, ~5 cheap spark calls
```

## License

Apache-2.0. Portions adapted from openai/codex-plugin-cc — see NOTICE.
