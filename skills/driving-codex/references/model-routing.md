# Codex model routing

cdx routes by tier: Sol, Luna, and Astra. The runner resolves each tier to a
model ID from the machine's Codex catalog at run time (the skill's "Model
tiers on this machine" section). This reference never needs updating for a
new release or a renamed model; only the dated evidence below goes stale.

The routing choices are this skill's policy, informed by the sources in
"Dated evidence". Vendor evaluations do not prove a result on a particular
delegated task.

Use Sol at `xhigh` when no more specific task shape fits. Choose tier and
effort separately, honor explicit user choices, and do not route new work to
Terra by default.

## Sol: the default

Sol is the workhorse tier: implementation, reviews, planning, authenticated
browsing, administrative work, and debugging, at `xhigh` for every task. Use
another Sol effort only when the user names it. A thin brief needs
clarification and relevant source context; a larger tier does not replace
them.

## Luna and Astra

Luna is the low-cost tier for exact extraction, checks, git operations, and
bounded implementation. It runs at `xhigh` unless the user names another
effort. Give it implementation only when a clear plan, file scope, acceptance
criteria, and verified commands support it, and review the diff for
unrequested changes. Results from an older Luna release do not establish a
newer one's performance or its best effort setting.

Reserve Astra for a specific technical or scientific difficulty that Sol at
an appropriate effort is unlikely to handle, or a demonstrated capability
limit after correcting the brief and tools. Importance, many pages,
authentication, or computer use alone do not qualify. Start at `high`,
delegate only the hard portion, and never fan out Astra. A machine whose
catalog has no Astra model has no Astra tier; say so instead of substituting.

If a Luna worker needs broader judgment, switch to Sol. Raise Astra's effort
when the available evidence is difficult to reconcile. Missing inputs, broken
commands, unavailable tools, and permission blocks need those problems
addressed first. Avoid retrying every tier as a fixed escalation ladder.

## Context and effort come from the catalog

`codex debug models` prints, for each model the tier can resolve to, its
`context_window`, `max_context_window`, `effective_context_window_percent`,
`supported_reasoning_levels`, and `service_tiers`. Read them for the resolved
model rather than assuming a figure. A session on a custom `model_provider`
uses whatever its `model_catalog_json` says, which can differ from OpenAI's
catalog for the same model. API context limits and long-context surcharges do
not apply to Codex subscription usage unless its documentation says so.

`ultra` is a CLI and account setting, and higher effort does not guarantee a
better result.

## Worker context and briefs

Use a fresh session and concise source pointers for each independent worker.
Mechanical workers use `--lean`; browser, app, and MCP-dependent workers, and
any worker on a machine that reaches Codex through a custom provider, need
the full configuration. The flag-map reference documents what `--lean`
retains. A local 2026-09-11 probe on codex-cli 0.154.0 reduced initial input
from 25,115 to 17,223 tokens without user configuration. This is a dated
context measurement, not a cost or quality benchmark.

Brief each worker with the goal, allowed files, acceptance criteria, and
verified checks. Scope style and ordering rules to prose being added or
intentionally revised, preserve unrelated text, and require a list of changed
files and any edits beyond the brief. Select each worker separately; use
Luna for bounded work and Sol when it needs broader judgment. Judge total
efficiency by verified results, tokens, time, retries, and review corrections.

## Speed tiers

`--fast` sets `service_tier="fast"`; it does not select Ultrafast or change
reasoning effort. Fast's included-subscription and purchased-credit rates
differ, as documented in the skill body's economics section. Whether the
resolved model offers Fast or Ultrafast is in its catalog `service_tiers`.
Token-generation speed claims do not measure total task time. Spark is a
separate model, not a Fast-mode alias.

The host can set `CDX_DEFAULT_MODEL`, `CDX_DEFAULT_EFFORT`, and
`CDX_MODEL_<TIER>` in its environment; explicit runner flags win over the
first two. Updating this policy does not change those settings or the
user's selected main-session model.

## Dated evidence

Reviewed on **2026-09-29**, when OpenAI's catalog resolved Sol to
`gpt-6.1-sol`, Luna to `gpt-6-luna`, and Astra to `gpt-6-astra` (labeled
examples, not routing defaults): the
[DevDay recap](https://openai.com/index/devday-2026-recap/),
[GPT-6.1 Sol launch](https://openai.com/index/introducing-gpt-6-1-sol/),
[API model card](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Codex pricing](https://learn.chatgpt.com/docs/pricing), and
[Codex speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed).

- OpenAI reported near-Astra performance for that Sol release on coding,
  computer use, and professional work. On DeepSWE 1.1 it matched Astra at
  roughly one-fifth the cost per task. Astra remained the highest-scoring
  model on the launch's scientific benchmark. The launch gave no direct
  coding comparison with Luna.
- That Sol release supported `low` through `max` in the public API (`none`
  and `minimal` unsupported); the codex-cli 0.159.0 catalog also advertised
  `ultra` for Sol and Astra, not Luna.
- Its Codex default context window rose from 272,000 to 500,000 tokens on
  2026-10-11; the codex-cli 0.162.1 live catalog listed 500,000, with
  `max_context_window` 872,000 and 95% effective. The bundled catalog still
  said 272,000.
- Sol Ultrafast was announced as coming soon; Astra Ultrafast was available
  on eligible plans.

Recheck the live catalog and the rate card before relying on any of these.
