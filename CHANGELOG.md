# Changelog

## 0.7.4 - 2026-10-28

- Browser control through the Chrome and Brave extensions works again. The
  ChatGPT app's computer-use plugin 26.1023 preloads
  `require-browser-access.mjs`, which makes the browser service ask for an
  access pipe that the app passes only to its own Codex sessions, so every
  browser call from cdx failed with "The browser access host is
  unavailable". The launcher now leaves that preload out, and the browsers
  list as they did before 26.1023.
- `codex-computer-use` restricts the `SkyComputerUseService` restart to the
  "explicitly stopped by the user" message.

## 0.7.3 - 2026-10-27

- `codex-computer-use` now says how to recover when computer use keeps
  answering "This application session has been explicitly stopped by the
  user for this turn" although the user stopped nothing. The state sits in
  the long-running `SkyComputerUseService`, so new turns and new launchers
  do not clear it; restarting the service and calling `js_reset` does.

## 0.7.2 - 2026-10-16

- Codex teammates no longer lose the end of long answers. Claude Code cuts a
  teammate's final answer at about 4,000 characters before the lead sees it,
  and the runner put its details first and the `last-message:` path last, so
  long reviews arrived cut off with no way to find the rest. A teammate's
  answer now puts Codex's final message first and the session, status,
  warnings, and artifact paths after it. When the whole would not fit, the
  message is cut at a line break and the answer names `last-message.txt`,
  which holds it in full. Answers to agents outside a team are unchanged.

## 0.7.1 - 2026-10-15

- `driving-codex` now hands review-and-fix requests to the `codex-review-loop`
  skill when it is installed. That skill has Codex review read-only, has
  Claude verify and fix the valid findings, and re-reviews in the same Codex
  session. Plain reviews stay in `driving-codex`.

## 0.7.0 - 2026-10-15

- cdx is now two skills that Claude loads on its own, with no slash commands.
  Each skill and command description stays in Claude's context every turn,
  and ten overlapping entries made it harder to pick the right one.
  - Removed the `/cdx:task`, `/cdx:review`, `/cdx:fleet`, `/cdx:session`,
    `/cdx:cloud`, and `/cdx:setup` commands. Ask in plain language instead.
    Their unique rules moved into `driving-codex`: fork-only runs, session
    listing, fleet angles and reporting, and Codex Cloud `apply`. The review
    and setup procedures became `references/review.md` and
    `references/setup.md`.
  - `prompting-codex` and `codex-structured-output` are no longer separate
    skills. They only apply once Claude is already delegating to Codex, so
    they became `driving-codex/references/prompting.md` (with its prompt
    blocks, recipes, and anti-patterns) and
    `references/structured-output.md`. The prompting guide's copy of the
    model table was dropped; the table in `driving-codex` is the one source.
  - Both remaining descriptions now say when to load the skill.
    `driving-codex` lists every Codex case: delegating work, reviews,
    parallel workers, sessions, Cloud, and a failing CLI.
    `codex-computer-use` also loads before the first cdx computer-use tool
    call.

## 0.6.5 - 2026-10-15

- Fix computer use asking for app access on every call. When you accepted an
  app-access prompt in Claude Code, cdx passed the answer to the runtime
  without a persist choice, so the runtime asked again on the next call. An
  accept is now sent as Codex's "always allow" (`persist: "always"`, or
  `"session"` when the prompt does not offer "always"), so the runtime stops
  asking about that app, in Claude Code and in Codex. Declines pass through
  unchanged.

## 0.6.4 - 2026-10-14

- Codex agents can message Claude while they run. Each agent run gives Codex
  a pre-approved `message_claude` tool (a small MCP server, through the new
  runner flag `--claude-channel`). The runner reports each completed call
  from Codex's event stream, and the mod delivers it to whoever spawned the
  agent: the main session through `$.prompt.submit`, which starts a turn
  when the session is idle, or a spawning subagent through `$.session.send`.
  At most 20 messages per run; the tool refuses later calls so Codex knows,
  and a message over 4,000 characters is cut at a character boundary and
  marked. A message reaches Claude framed as the agent's report, never as
  the user's words or approval, and one whose spawner cannot be resolved is
  logged and not delivered rather than sent to the main session. Tested end to
  end with a background agent: both messages arrived as new turns while it
  ran, before its final answer.

## 0.6.3 - 2026-10-13

- Default efforts are now set per agent type: `codex-sol` and `codex-luna`
  start at `xhigh`, `codex-astra` at `high`. A `cdx:` header or a resumed
  session's stored effort still wins.
- `/cdx:review` reviews at `xhigh`, and the routing guidance in the skills,
  `/cdx:fleet`, and the README uses the same defaults.

## 0.6.2 - 2026-10-13

- Fix `cdx:` headers being ignored for agents spawned as teammates (agent
  teams on): Claude Code wraps their prompts in `<teammate-message>`
  envelopes, so every such agent ran read-only at medium effort whatever its
  header said. The envelopes are now unwrapped, including ones whose quoted
  attributes contain `>`.
- `/cdx:review` runs structured reviews through a `cdx:codex-sol` agent
  (read-only, medium effort, `review-findings` schema in the `cdx:` header).
  After fixes, a message to the same reviewer re-reviews with its context.
  It falls back to the runner when the agent types are unavailable;
  `--native` still uses `codex review`.
- Computer use, from a Codex review of 0.6.x:
  - Read `approval_policy` with TOML's string rules, so an example line
    inside a string (even after an escaped quote) cannot turn on automatic
    approval. Checked against Python's `tomllib` on about 4,400 generated
    configs.
  - Drop a call cancelled while the runtime starts, instead of running it.
  - Retry a failed start on the next call, so installing the ChatGPT app or
    its plugin mid-session works.
  - Give each agent its own turn: the mod tags computer-use calls with the
    calling agent, subagent calls carry Codex's subagent thread metadata, and
    a subagent's turn end no longer ends the main conversation's browser turn.

## 0.6.1 - 2026-10-13

- Send Codex turn metadata (`session_id`, `turn_id`, and the tool-use id as
  `call_id`) with each computer-use call, and the same ids with `turn_ended`.
  The browser service requires them: in 0.6.0, `cua.getState()` listed apps
  but reported "Missing required Codex turn metadata" for browsers. The
  launcher owns the ids, so a subagent's turn end also starts a new turn for
  the main conversation.

## 0.6.0 - 2026-10-13

- Give Claude Codex's computer use directly. The `computer-use` MCP server
  (`scripts/codex-cu-mcp.mjs`) exposes the ChatGPT app's `cua_repl` runtime as
  `js` and `js_reset`. It starts the runtime on the first call, reads the
  newest installed unified-computer-use config each time, and returns a tool
  error when the app or plugin is missing. Unofficial OpenAI internals.
- Follow the user's Codex `approval_policy` for computer use: with `"never"`,
  app-access approvals and the tools' permission check are accepted
  automatically; otherwise they ask as usual.
- The cdx mod calls the runtime's `turn_ended` at the end of each turn,
  subagent turn, and interrupt, as Codex does.
- `codex-computer-use` now routes short UI tasks to Claude's own computer use
  and long ones, or ones that name Codex, to Codex.

## 0.5.1 - 2026-10-13

- Report Codex error items under `--- warnings ---` instead of
  `--- errors ---`. In codex-cli 0.162.1 these items carry only non-fatal
  notices: config and runtime warnings, deprecation notices, and model
  reroutes. Failures still come from top-level error events and
  `turn.failed`, and a warning no longer fails a fork-only run.
  `--progress` labels these lines `warning`.

## 0.5.0 - 2026-10-13

- Add a mod that registers `cdx:codex-sol`, `cdx:codex-luna`, and
  `cdx:codex-astra` as Agent tool types. Spawning one runs Codex through the
  runner, and `SendMessage` resumes the same Codex session. Runs default to
  read-only at medium effort; a first-line `cdx:` header passes runner flags.
  Codex runs in the agent's worktree under `isolation: "worktree"`.
- Add runner `--progress`, which writes the session id as soon as Codex
  assigns it, then one stderr line per command, file change, tool call, web
  search, or error item while Codex works.

## 0.4.3 - 2026-10-12

- Record GPT-6.1 Sol's larger Codex window: 500,000 tokens by default since
  2026-10-11 (872,000 maximum, 95% effective), with other models at 272,000.
  Note that the codex-cli 0.162.1 bundled catalog and custom providers still
  report 272,000.

## 0.4.2 - 2026-09-29

- Route ordinary work, planning, and reviews to GPT-6.1 Sol; keep GPT-6 Luna
  for bounded workers and Astra for specific hard technical or scientific work.
  Remove Terra from default routing and escalation.
- Refresh official model, credit, context, reasoning, and speed evidence.
  Distinguish public API limits from the Codex catalog, Fast from Ultrafast,
  and purchased-credit rates from included subscription usage.
- Keep model IDs and supported efforts explicit across skills and commands,
  with runner coverage and live checks for GPT-6.1 Sol.

## 0.4.1 - 2026-09-13

- Expand model and effort routing across the driving and prompting skills,
  including subscription token economics, Astra usage warnings, Fast-tier
  credit multipliers, and the Sol fallback.
- Require evidence-based reporting for Git, worktree, sandbox, network, and
  authentication failures so a boundary error is not misreported as a Codex
  capability limit.
- Make task and fleet commands report model choices, token usage, retries,
  and unverified residue, and keep Fast mode opt-in for parallel workers.

## 0.4.0 - 2026-09-11

- Add runner `--lean` for fleet workers and mechanical runs: passes
  `--ignore-user-config` and `-c apps._default.enabled=false`, so the worker
  starts without the user's MCP servers, connector apps, hooks, personality,
  or context overrides. Auth, the repository `AGENTS.md`, and execpolicy
  rules still load. Measured on a Luna probe: first-request context fell
  from 25.1k to 17.2k tokens and MCP startup errors went from two to zero.
  Requires an explicit model (or `CDX_DEFAULT_MODEL`); not available with
  `--resume`, `--fork`, or `--local`.
- The skill now sends every fleet worker and well-briefed mechanical run
  through `--lean`, keeps full config for planning, review, Computer Use,
  browser, and MCP-dependent tasks, and adds Luna brief rules: style and
  ordering instructions apply only to lines the worker adds, no unrequested
  edits, and every touched hunk listed in the final message.

## 0.3.2 - 2026-09-11

- Move model routing into the driving-codex skill body as a "Choose the
  model first" table so a plain-language handoff ("have Codex do X")
  picks model and effort by task shape without slash commands: Sol plans
  and reviews, Luna xhigh implements well-briefed work and fleet workers,
  Terra high takes large-context or thin-brief workers, Astra is reserved
  for hard single sessions. Brief requirements per model and escalation
  steps are stated alongside. The announcement now names the chosen model
  and effort.

## 0.3.1 - 2026-09-11

- Add a dated model routing reference (Astra, Sol, Terra, Luna): strengths,
  weaknesses, when to use each, typical workflows, and Codex credit cost
  against a ChatGPT subscription. Fleet workers now default to Luna xhigh
  with a detailed brief, Terra high for large-context or thin-brief
  workers, Sol for planning and merges; never fan out Astra.
- Runner honors `CDX_DEFAULT_MODEL` and `CDX_DEFAULT_EFFORT` from the host
  environment when `--model` or `--effort` is not passed. Explicit flags
  win; `--local` runs ignore the model default.

## 0.3.0 - 2026-09-07

- Add a Computer Use and browser delegation skill, including Chrome,
  named browser profiles, the built-in browser, and workflows spanning apps.
- Require Claude to announce the Codex handoff and put the requested plugin
  and target explicitly in Codex's prompt. Report actual tool use and verify
  the resulting app or page state.
- Check plugin availability in the delegated session, preserve browser/profile
  choices and existing authorization, and serialize workers sharing UI state.
- Add optional plugin diagnostics to `/cdx:setup` and examples for desktop
  and browser tasks. Runner flags and execution behavior are unchanged.

## 0.2.0 - 2026-09-05

- Support the CLI's `max` and `ultra` reasoning levels while preserving inherited
  model defaults. Refresh model selection and prompting for GPT-6 Astra.
- Add noninteractive `--fork`, including fork creation without a new model turn,
  and explicit `--approve-for-me` for fresh workspace-write runs.
- Fix focused native-review instructions, distinguish sandbox from approval
  policy, and replace universal Fast-mode claims with model-specific guidance.
- Correct Structured Outputs nesting guidance and recover malformed reports
  without automatically repeating write operations.
- Preserve literal option-looking prompts and resolve schema/image paths before
  changing the working root. Expose stderr-only errors, flush complete artifacts,
  and prevent stale answers or completion states from masking failures.
- Expand runner regression coverage and replace Spark-only live checks with
  configurable model, schema, resume, fork, and concurrent-worker smoke coverage.
- Add CI regression checks on Node 20, 22, and 24.

CLI command surface checked against codex-cli 0.153.4.

## 0.1.4 — 2026-07-16

driving-codex: clarify that the Fast service tier is orthogonal to
reasoning effort (serving speed, not a quality trade) — --fast
--effort xhigh is valid and often optimal for urgent hard work.


## 0.1.3 — 2026-07-15

New `--fast` runner flag: Codex "Fast" service tier (`service_tier=
"fast"`, request tier `priority`) — same model at 1.5x speed for
increased usage. Verified against the official config reference and a
live run on gpt-5.6-sol.

## 0.1.2 — 2026-07-13

Runner auto-adds `--skip-git-repo-check` when the effective working
root (`--cd` target or cwd) is not inside a git repository. Previously
any run launched from a non-repo directory (e.g. ~/Projects) failed
instantly with codex's "Not inside a trusted directory" error.

## 0.1.1 — 2026-07-09

codex-cli 0.144.0 compatibility: the `--search` flag was removed from
`codex exec` upstream; the runner now maps `--search` to the
`web_search="live"` config key (works on resume too, which the old flag
never did). Flag map re-verified and restamped against 0.144.0.

## 0.1.0 — 2026-07-09

Initial release: driving-codex / codex-structured-output / prompting-codex skills,
/cdx:task /cdx:review /cdx:fleet /cdx:session /cdx:cloud /cdx:setup commands,
4 bundled output schemas, codex-run.mjs runner, smoke tests.
