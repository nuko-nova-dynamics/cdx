# cdx

[Codex CLI](https://github.com/openai/codex) integration for Claude Code.

Skill-first: say **"spawn codex on the failing tests"**, **"get a codex second
opinion on this diff"**, or **"have codex fix this in the background"** and
Claude picks the right flags, runs `codex exec`, parses structured output, and
acts on it: verifies findings against the repo, checks patches, and resumes
or forks sessions.

You can also ask **"have Codex use Computer Use to check this app"** or
**"delegate this to Codex using the Chrome plugin in my Work profile"**.
Claude announces the handoff, includes the requested plugin and target in
Codex's prompt, and checks which tools Codex actually used.

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
| `/cdx:task` | Delegate coding, desktop, or browser work with model, effort, sandbox, search, schema, and session controls. Name UI plugins and targets in the prompt. `--approve-for-me` opts into automatic review on fresh workspace-write runs. |
| `/cdx:review` | Structured review Claude verifies finding-by-finding, or `--native` for Codex's built-in reviewer (`--uncommitted\|--base <ref>\|--commit <sha>`) |
| `/cdx:fleet` | 2–4 parallel Codex workers: decomposed subtasks, multi-angle opinions, A/B implementations |
| `/cdx:session` | `list`, `resume <id\|--last>`, `fork <id>`, `apply <task_id>` |
| `/cdx:cloud` | Codex Cloud: `exec`, `list`, `status`, `diff`, `apply` |
| `/cdx:setup` | Doctor: install, auth, version drift, runner compatibility, live smoke. `--plugins` checks browser/Computer Use installation; add `--smoke` for a non-mutating runtime probe. |

## Skills

- **driving-codex**: the "Choose the model first" routing table (which
  Codex model and effort for which task shape), invocation contract, flag
  heuristics, session management, fleet fan-out, failure signatures.
  References: `skills/driving-codex/references/model-routing.md` (dated
  benchmark, cost, and community evidence) and
  `skills/driving-codex/references/flag-map.md` (stamped with the verified CLI
  version).
- **codex-structured-output**: bundled schema library (`review-findings`,
  `verdict`, `task-report`, `patch-plan`) + rules for ad-hoc schemas.
- **codex-computer-use**: explicit plugin handoffs, browser/profile selection,
  live capability checks, app and page verification, and shared UI coordination.
- **prompting-codex**: task framing, authorization, and proportional verification,
  with GPT-6 Astra guidance. Original templates were adapted from
  openai/codex-plugin-cc (Apache-2.0, see NOTICE).

## Computer Use and browsers

Ask Claude to delegate a UI task to Codex when Codex's installed plugins have
the app or browser access the task needs:

```text
Have Codex use its Computer Use plugin to inspect the app's Preferences window
and report the current export format. This is a read-only check.

Delegate the signed-in settings check to Codex using its Chrome plugin in the
Work profile. Verify the profile and report whether notifications are enabled.

Have Codex use the built-in browser to verify the navigation on localhost:3000.
```

Claude names Codex and the requested plugin before launching. Codex checks its
available tools and the target, completes the authorized task, and reads back
the result. The report distinguishes actual plugin use from installed state.
If the requested browser/profile cannot be verified, Codex reports that blocker.

Computer Use and browser plugins must be available in the delegated Codex
session, with the required app permissions or browser connection. cdx does not
install them. Plugin packaging and tool APIs can vary across Codex versions;
the skill requires discovery from the running session's instructions.

Use `/cdx:setup --plugins` to inspect installation, or
`/cdx:setup --plugins --smoke` with the desired capability/target for a
non-mutating live check. The live check consumes normal Codex usage.
See the [delegation skill](skills/codex-computer-use/SKILL.md) for the prompt
contract and [official setup](https://learn.chatgpt.com/docs/computer-use).

## Models and reasoning

The runner inherits your Codex model and effort by default. Explicit model IDs
pass through unchanged; `spark` remains an alias for `gpt-5.3-codex-spark` when
your account supports it. Set `CDX_DEFAULT_MODEL` and `CDX_DEFAULT_EFFORT` in
the host environment (for example the `env` block of Claude Code's
`settings.json`) to change the default without touching `config.toml`; explicit
flags still win.

When no model is named, Claude routes ordinary work and reviews to
`gpt-6.1-sol` at medium, planning to Sol high, and difficult reasoning to
Sol xhigh. GPT-6 Luna handles bounded checks and implementation with a complete
brief; Astra is reserved for a specific difficulty Sol is unlikely to handle.
New work does not default to Terra. Each fleet worker gets its own model and
effort choice. These are routing policies informed by the
[September 29 launch](https://openai.com/index/introducing-gpt-6-1-sol/),
not a benchmark guarantee for your task.

Mechanical workers use `--lean`, which starts Codex without your
`config.toml` (MCP servers, connector apps, hooks, personality, context
overrides) while auth, repository `AGENTS.md`, and `.rules` still load.
It needs an explicit model and is unavailable on resume, fork, or `--local`.
Tasks needing UI plugins or MCP servers keep the full configuration. See the
[model routing reference](skills/driving-codex/references/model-routing.md).

```bash
node scripts/codex-run.mjs --sandbox ro --model gpt-6.1-sol --effort medium -- "Review this repository"
node scripts/codex-run.mjs --sandbox ro --fork <session-id>
```

Reasoning levels depend on the model. GPT-6.1 Sol's API supports `low`,
`medium`, `high`, `xhigh`, and `max`; neither `none` nor `minimal` is supported.
Use CLI-specific `ultra` only when the live catalog supports it. Luna has no
`ultra`. Fast and Ultrafast are serving tiers, separate from effort. The runner's
`--fast` requests paid Fast serving only; Sol Ultrafast is coming soon as of
September 29. See the [flag reference](skills/driving-codex/references/flag-map.md)
for catalog and billing distinctions.

## Safety model

- The runner **requires** an explicit sandbox: `ro` (read-only) for
  review/research, `write` (workspace-write) for fixes, `full`
  (danger-full-access) only with explicit user authorization.
- `--approve-for-me` routes approval requests to Codex's automatic reviewer.
  It requires a fresh `--sandbox write` run and is never enabled implicitly.
  Sandbox and approval policy are distinct controls; neither authorizes
  unrelated external actions.
- The `--dangerously-bypass-*` flags are never used, under any circumstances.
- Browser and app actions follow the task's authorization and their own access
  controls. `--sandbox ro` does not make UI actions read-only; scoped prompts
  must state the permitted actions. Workers sharing a browser/profile or app
  operate sequentially.

## Testing

```bash
node --test tests/*.test.mjs   # unit tests (stub codex, free)
bash tests/smoke.sh            # real Codex calls using your configured model
CDX_SMOKE_MODEL=gpt-6.1-sol CDX_SMOKE_EFFORT=low bash tests/smoke.sh
```

The live smoke covers structured output, session recall, fork creation and
continuation, and two concurrent workers. It uses a unique temporary directory
and reports its artifact paths. Model runs consume your normal Codex allowance.

## License

Apache-2.0. Portions adapted from openai/codex-plugin-cc; see NOTICE.
