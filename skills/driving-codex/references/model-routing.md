# Codex model routing

Evidence reviewed on **2026-09-11**: OpenAI's GPT-5.6 launch tables
(July 9), the July 30 price-cut post, the GPT-6 Astra launch tables
(September 3), the Codex rate card at learn.chatgpt.com/docs/pricing,
Artificial Analysis' Sol/Terra/Luna cost-vs-intelligence article
(July 13), four r/codex comparison threads, and 248k local Codex
requests across three ChatGPT accounts. Vendor benchmarks are the
vendor's; community results are small samples. Re-check before relying
on a number that decides a routing change.

## Cost against a ChatGPT subscription

Codex meters subscription usage in credits per million tokens. Every
token in the context is charged on every request, so a 200k context
resent 300 times is the dominant cost; reasoning effort barely moves it.

| Model | Input | Cached input | Output | Relative to Sol |
|---|---|---|---|---|
| GPT-6 Astra | 250 | 25 | 1,250 | 2.5x on paper; measured 3.3x to 4.7x against the weekly meter |
| GPT-5.6 Sol | 100 | 10 | 500 | 1x |
| GPT-5.6 Terra | 50 | 5 | 300 | 0.5x input, 0.6x output |
| GPT-5.6 Luna | 5 | 0.5 | 30 | 0.05x input; Luna at xhigh or max emits far more reasoning, still well under Terra |

A typical mechanical background run (330M input, 97% cached, 1M output)
cost 22% of a Pro weekly window on Sol. The same tokens price at about
11% on Terra and under 2% on Luna even allowing three times the output.

## Model profiles

### GPT-6 Astra (`gpt-6-astra`)

- **Strengths:** highest capability on end-to-end multi-step work,
  computer use, browsing, cybersecurity, math, and template-faithful
  documents. Asks focused questions and holds the original goal when
  steered mid-task. Codex keeps notes across context windows for it
  (experimental `features.context_management`).
- **Weaknesses:** drains the subscription 3x to 5x faster than Sol per
  token in practice. The 272k window is the real window; Codex waives
  the API's above-272k surcharge but still bills every token at the base
  rate. Not for loops that resend a large repo context hundreds of times.
- **Use when:** the task is genuinely hard, ambiguous, or high-value:
  root-cause debugging, unfamiliar systems, tricky UI verification with
  computer use, research that has to be right the first time.
- **Typical workflow:** one interactive or `codex exec` session at
  medium effort, tight scope, short context. Do not fan out Astra.

### GPT-5.6 Sol (`gpt-5.6-sol`)

- **Strengths:** strongest GPT-5.6 tier for complex coding, deep
  research, math, cyber, and polish. Best planner in the family:
  Sol at high or xhigh produces plans that cheaper models can execute.
  Reliable long-context retrieval (about 90% on the 256k to 512k needle
  test).
- **Weaknesses:** on OpenAI's own September tables, Claude Opus 5 beats
  Sol on every coding row (Terminal-Bench 4.0 52.6 vs 37.3, FrontierCode
  53.4 vs 47.5, coding-agent index 68.1 vs 65.1). Community reports of
  over-engineering, validation loops, and ignoring explicit
  instructions at high effort. Costs 20x Luna per token.
- **Use when:** planning and decomposition, ambiguous or cross-cutting
  changes, subtle debugging, security or concurrency work, and as the
  fallback when Terra or Luna fails twice.
- **Typical workflow:** Sol high or xhigh writes the plan and acceptance
  criteria; cheaper workers implement; Sol medium reviews or resolves
  disagreements. Sol low is a fast, cheap iteration mode that many
  users prefer to Terra high at similar cost.

### GPT-5.6 Terra (`gpt-5.6-terra`)

- **Strengths:** fast (community measurements of 3x to 4x shorter
  wall-clock than Luna xhigh on the same task), stays in scope, good
  long-context retrieval (89.6% on the 256k to 512k needle test vs Luna
  41.3%), and better than Luna at unstructured extraction and
  under-specified tasks. OpenAI positions it as the GPT-5.5
  replacement at half the cost.
- **Weaknesses:** dominated on cost-per-intelligence. Artificial
  Analysis: for any Terra effort level there is a Luna or Sol level
  that is as smart for less. One to three points behind Sol on coding
  benchmarks and far behind on hard reasoning, computer use, and
  cyber. Community reports of "done" summaries that leave part of a
  large contract unimplemented.
- **Use when:** a worker must hold a very large context, the brief is
  thin and the model has to infer intent, or wall-clock matters more
  than credits. Terra high is the common daily-driver setting among
  its defenders.
- **Typical workflow:** implementation worker for medium-sized, well
  scoped changes when Luna proves too literal; review-repair pass over
  Luna output; server or infra configuration.

### GPT-5.6 Luna (`gpt-5.6-luna`)

- **Strengths:** cheapest by an order of magnitude. Coding-agent
  benchmarks within a few points of Terra. In a community trial with a
  detailed 11-story plan, Luna xhigh finished 3 of 3 runs defect-free at
  $0.59 while Terra medium and Sol medium each finished 0 of 3.
- **Weaknesses:** weak long-context retrieval, takes prompts literally,
  misses small details, and can leave tasks half done without a
  detailed plan. Slow at xhigh and max because it emits large reasoning
  traces (one measurement: 97% of output). Luna max regresses relative
  to xhigh in several reports: same quality, 40% more cost and time,
  more over-thinking. Not available through `spawn_agent` in some CLI
  versions.
- **Use when:** the plan is detailed and verifiable, the change is
  bounded, and a review pass follows. Repo exploration, test runs,
  git operations, and mechanical edits.
- **Typical workflow:** Luna xhigh as the default fleet worker with a
  Sol-authored plan, acceptance criteria, and file scope in the prompt;
  Terra high or Sol medium reviews the diff. Prefer xhigh over max.

## Routing rules the skill applies

1. Planning, decomposition, and the final merge decision: Sol high.
2. Fleet workers and mechanical background loops: Luna xhigh with a
   detailed brief. Escalate a failing worker to Terra high, then Sol.
3. Workers that must hold more than roughly 150k of context, or thin
   briefs: Terra high.
4. Hard, ambiguous, or verification-heavy tasks the user cares about:
   Sol xhigh or Astra medium, one session, no fan-out.
5. Never route by effort alone. Effort changes reasoning tokens, which
   are under 1% of a typical Codex request; model choice changes the
   per-token rate by 20x.
6. Workers run `--lean`. A 2026-09-11 Luna probe on codex-cli 0.154.0
   started at 25,115 input tokens with the user's config and 17,223
   without it, and the two MCP servers that failed to start on every
   normal run were gone. The remaining constant is `$CODEX_HOME/AGENTS.md`,
   which still loads; keep it short and scope writing-style rules to
   prose deliverables so workers do not read a writing skill before a
   code change.
7. A Luna brief carries three guard sentences: style and ordering rules
   apply only to lines you add; do not modify any line you were not
   asked to change; list every hunk you touched in the final message.
   Observed 2026-09-11: a Luna xhigh worker asked to delete a route
   also rewrote two historical changelog entries to remove em dashes
   and moved a Security section to match a group order given in the
   brief, then reported the reorder in passing and the rewrites not at
   all. Review caught it; the sentences prevent it.

The host can set `CDX_DEFAULT_MODEL` and `CDX_DEFAULT_EFFORT` in its
environment; explicit `--model` and `--effort` flags always win.
