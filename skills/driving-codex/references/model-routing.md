# Codex model routing

Evidence reviewed on **2026-09-29**: the [DevDay recap](https://openai.com/index/devday-2026-recap/),
[GPT-6.1 Sol launch](https://openai.com/index/introducing-gpt-6-1-sol/),
[API model card](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Codex pricing](https://learn.chatgpt.com/docs/pricing), and
[Codex speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed).
The routing choices below are this skill's policy, informed by those sources.
Vendor evaluations do not prove a result on a particular delegated task.

Use `gpt-6.1-sol` at `xhigh` when no more specific task shape fits. Choose
model and effort separately, honor explicit user choices, and check the
installed catalog before launching. Do not route new work to Terra by default.

## Why GPT-6.1 Sol is the default

OpenAI reports near-Astra performance on coding, computer use, and professional
work. On DeepSWE 1.1, GPT-6.1 Sol matches Astra at roughly one-fifth the cost
per task and improves on GPT-6 Sol's best score by 6.4 percentage points.
Astra remains the highest-scoring model on the launch's scientific benchmark.
These are research/API evaluations; production tools and prompts can differ.
The launch provides no direct coding comparison with GPT-6 Luna.

Sol runs at `xhigh` for every task: implementation, reviews, planning,
authenticated browsing, administrative work, and debugging. Use another Sol
effort only when the user names it. A thin brief needs clarification and relevant source context;
increasing model size does not replace them.

## Luna and Astra

`gpt-6-luna` remains the low-cost choice for exact extraction, checks, git
operations, and bounded implementation. It runs at `xhigh` unless the user
names another effort; give it implementation only when a clear plan, file
scope, acceptance criteria, and verified commands support it.
Review the diff for unrequested changes. GPT-5.6 Luna anecdotes do not
establish GPT-6 Luna's performance or its best effort setting.

Reserve `gpt-6-astra` for a specific technical or scientific difficulty that
Sol at an appropriate effort is unlikely to handle, or a demonstrated
capability limit after correcting the brief and tools. Importance, many
pages, authentication, or computer use alone do not qualify. Start at
`high`, delegate only the hard portion, and never fan out Astra.

If a Luna worker needs broader judgment, switch to Sol. Raise Astra's effort
when the available evidence is difficult to reconcile. Missing inputs, broken
commands, unavailable tools, and permission blocks need those problems
addressed first. Avoid retrying every tier as a fixed escalation ladder.

## Rates and context

The skill body lists the current Standard credit rates. GPT-6.1 Sol keeps
GPT-6 Sol's input/output rates and halves its cached-input rate. API prices,
purchased credits, and included subscription limits are different measures;
old weekly-meter estimates do not predict this release's allowance usage.

The API model card lists a 1,050,000-token context window and 128,000 maximum
output. Above 272,000 input tokens, API pricing
increases for the entire request: input and cache rates double, and output
rates increase by 1.5x. That threshold is a price boundary, not the context
limit. Use the installed Codex catalog's effective window and compaction
settings for CLI sessions; do not apply API limits or surcharges to Codex
subscription usage without checking its documentation.

In Codex, GPT-6.1 Sol's default window rose from 272,000 to 500,000 tokens on
2026-10-11. OpenAI's Codex lead announced the change and said long-context
fees do not apply when Sol draws from the subscription. The live catalog read
by codex-cli 0.162.1 on 2026-10-12 lists `context_window` 500,000,
`max_context_window` 872,000, and 95% effective, which leaves 475,000 usable
tokens. Other models stay at 272,000. The 0.162.1 bundled catalog still says
272,000 for Sol. A session that does not load the live catalog, such as one
on a custom `model_provider`, gets the old window unless a
`model_catalog_json` override supplies the new one. Check the
`codex debug models` output for the provider in use rather than assuming
either figure.

GPT-6.1 Sol supports `low`, `medium`, `high`, `xhigh`, and `max` in the public
API; `none` and `minimal` are unsupported. The local codex-cli 0.159.0 catalog
inspected on 2026-09-29 also advertised `ultra` for Sol and Astra, but not
Luna. Recheck the current catalog; `ultra` is a CLI/account setting, and
higher effort does not guarantee a better result. Tool calling on GPT-6.1 Sol
uses the Responses API; Chat Completions supports it without tools.

## Worker context and briefs

Use a fresh session and concise source pointers for each independent worker.
Mechanical workers use `--lean`; browser, app, and MCP-dependent workers
need the full configuration. The flag-map reference documents what `--lean`
retains. A local 2026-09-11 probe on codex-cli 0.154.0 reduced initial input
from 25,115 to 17,223 tokens without user configuration. This is a dated
context measurement, not a GPT-6.1 cost or quality benchmark.

Brief each worker with the goal, allowed files, acceptance criteria, and
verified checks. Scope style and ordering rules to prose being added or
intentionally revised, preserve unrelated text, and require a list of changed
files and any edits beyond the brief. Select each worker separately; use
Luna for bounded work and Sol when it needs broader judgment. Judge total
efficiency by verified results, tokens, time, retries, and review corrections.

## Speed tiers

Standard and Fast are available for GPT-6.1 Sol where the account and client
support them. `--fast` sets `service_tier="fast"`; it does not select Ultrafast
or change reasoning effort. Fast's included-subscription and purchased-credit
rates differ, as documented in the skill body's economics section. No fixed
GPT-6.1 Sol throughput or task-completion multiplier is established here.

The DevDay announcement says GPT-6.1 Sol Ultrafast is coming soon. Astra
Ultrafast is available on eligible plans; token-generation speed claims do
not measure total task time. Check current availability before requesting
either tier. Codex-Spark is a separate model, not a Fast-mode alias.

The host can set `CDX_DEFAULT_MODEL` and `CDX_DEFAULT_EFFORT` in its
environment; explicit runner flags win. Updating this policy does not change
those settings or the user's selected main-session model.
