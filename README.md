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
Requires Node >= 20 and a logged-in Codex CLI (`codex login`). After
changing CLI versions, ask Claude to check the Codex setup for drift.

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
  Claude loads the skill it needs.
- **Claude chooses the flags.** Sandbox, model, effort, web search, images,
  schemas are selected per task while preserving your explicit choices.
- **Structured output over prose relay.** Reviews and reports come back as
  JSON (`--output-schema`) that Claude parses, verifies, and acts on.
- **Codex owns its state.** Sessions live in `~/.codex`; cdx keeps no job
  registry, no state files, no companion daemon. One small runner script tames
  the JSONL event stream; everything else is the CLI itself. The one
  exception is the mod's record of which Codex session each Codex agent
  owns, kept in Claude Code's mod store and dropped after 30 days unused.

## Skills

cdx has no slash commands. Claude loads its two skills on its own when a
request matches, so you ask in plain language; you can also type
`/cdx:driving-codex` or `/cdx:codex-computer-use` to load one by hand.

- **driving-codex**: any request that involves Codex: delegating coding or a
  review, parallel workers, resuming, forking, or applying sessions, Codex
  Cloud, and a CLI that is missing or failing. It holds the "Choose the model
  first" routing table, the invocation contract, flag choices, sessions, and
  fleet fan-out. Its references, read when a task needs them:
  - `prompting.md`, with `prompt-blocks.md`, `codex-prompt-recipes.md`, and
    `codex-prompt-antipatterns.md`: task framing, authorization, and
    proportional verification. Original templates were adapted from
    openai/codex-plugin-cc (Apache-2.0, see NOTICE).
  - `structured-output.md`: the bundled schemas (`review-findings`,
    `verdict`, `task-report`, `patch-plan`) and rules for ad-hoc schemas.
  - `review.md`: review targets (uncommitted, against a base, one commit),
    the structured review agent, and Codex's native reviewer.
  - `setup.md`: the health check for install, sign-in, version drift, runner
    compatibility, a live smoke test, and Computer Use or browser plugins.
  - `model-routing.md` (dated benchmark, cost, and community evidence) and
    `flag-map.md` (stamped with the verified CLI version).
- **codex-computer-use**: desktop app and browser work. When Claude drives
  computer use itself and when it delegates to Codex; explicit plugin
  handoffs, browser/profile selection, live capability checks, app and page
  verification, and shared UI coordination.

## Codex as a subagent

cdx includes a mod that registers three Agent tool types:
`cdx:codex-sol`, `cdx:codex-luna`, and `cdx:codex-astra`. Claude spawns one
like any other subagent. The mod answers the agent's model requests by
running the runner with that Codex model, so the agent's reply is Codex's
result and no Claude request is made for it. `SendMessage` to the agent
resumes the same Codex session, and named agents can run in the background.

```text
Spawn a codex-sol agent named "fixer" to fix the failing tests, then ask it
to explain the root cause.
```

Runs are read-only, at `xhigh` effort for `codex-sol` and `codex-luna` and
`high` for `codex-astra`. The prompt's first line can be a `cdx:` header of
runner flags, such as `cdx: --sandbox write --effort high`; the agent type sets
the model. Follow-ups keep the previous sandbox and effort. Progress (commands,
edits, searches) streams while Codex works. With `isolation: "worktree"`, Codex
runs in the agent's worktree.

Codex can message Claude while it works. Each agent run gives Codex a
`message_claude` tool for milestones, blockers, and questions it can work
around. A message reaches the session that spawned the agent at once: it
starts a turn when that session is idle and queues behind the current turn
otherwise. A message from an agent another subagent spawned goes to that
subagent. The agent's final answer still arrives separately. Reply with
`SendMessage`; the agent reads it after its current run. Each run delivers at
most 20 messages.

In an agent team, Claude Code cuts a teammate's final answer at about 4,000
characters before the lead sees it. A Codex teammate's answer therefore puts
Codex's final message first and the runner details after it. A message too
long to fit is cut at a line break, and the answer names the
`last-message.txt` file that holds it in full.

Codex's commands run under its own sandbox, not Claude Code's permission
prompts. Mods need Claude Code CLI 2.1.287 or later and do not load under
`--safe-mode` or `disableAllHooks`; the runner and commands work without them.

## Computer use for Claude

cdx also gives Claude Codex's computer use directly. Its `computer-use` MCP
server exposes the ChatGPT desktop app's computer-use runtime (`cua_repl`) as
`mcp__plugin_cdx_computer-use__js`, so Claude can operate Mac apps and browsers
itself:

```text
Open Calculator and work out 12 × 12.
```

The server starts the runtime on the first call and finds the newest installed
version, so ChatGPT updates keep working. It needs macOS and the ChatGPT app
with Codex Computer Use; without them the tool returns an error and nothing
else changes. While in use, the runtime's processes take several hundred MB
(about 690 MB RSS measured with the 26.1007 app) and exit with the session.

Approvals follow your Codex `approval_policy`. With `"never"`, app-access
approvals and Claude Code's permission check for these tools are accepted
automatically, as they are in Codex; otherwise both ask as usual. Accepting an
app-access prompt counts as Codex's "always allow", so the runtime does not ask
about that app again, in Claude Code or in Codex. The cdx mod
also tells the runtime when each turn ends, as Codex does, so it can release
browser tabs.

Browsers are reached through the ChatGPT Chrome and Brave extensions. Since
the 26.1023 app, the runtime's config preloads `require-browser-access.mjs`,
which asks for an access pipe that the app gives only to its own Codex
sessions; the launcher leaves that preload out, or every browser call would
fail with "The browser access host is unavailable".

This uses unofficial OpenAI internals, not a published API. An update to the
ChatGPT app can change or break it. Set `CDX_CU_TRACE=<file>` to log the MCP
messages when troubleshooting.

## Delegating Computer Use and browsers to Codex

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

Ask Claude to check the Codex setup for Computer Use or browser plugins to
inspect installation, and to add a live smoke test with the desired
capability and target for a non-mutating live check. The live check consumes normal Codex usage.
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
`gpt-6.1-sol`, which always runs at xhigh unless you name another effort.
GPT-6 Luna (default xhigh) handles bounded checks and implementation with a
complete brief; Astra (default high) is reserved for a specific difficulty Sol
is unlikely to handle.
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
node scripts/codex-run.mjs --sandbox ro --model gpt-6.1-sol --effort xhigh -- "Review this repository"
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
