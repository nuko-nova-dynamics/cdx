---
name: prompting-codex
description: Compose task prompts for Codex delegation, including GPT-6 Astra, coding, Computer Use and browser workflows, with clear scope, tools, evidence, completion criteria, and output requirements. Use before non-trivial CLI delegation or when improving a failing Codex prompt.
---

# Prompting Codex

State the outcome, relevant context, and constraints that change how
Codex should work. Use plain prose, bullets, or XML when they make the
boundaries clearer; tags and a fixed collection of blocks are optional.

## Model and budget handoff

Choose the model first and reasoning effort second. If no task shape is a
clear fit, use `gpt-5.6-sol` at `medium`. The handoff must name the selected
model, effort, and one-sentence reason before the runner starts.

- Luna `low` is for simple extraction and exact, repeatable steps; use
  `medium` for several checks and `high` or `xhigh` for a bounded
  implementation with a complete brief. It is cheap but literal and weaker
  on long context, so include the plan, scope, acceptance criteria, and exact
  verification command, then review the diff.
- Terra `medium` is for exploration and scans. Use `high` when the worker
  must reconcile substantial context or wall-clock time matters more than
  credits. Reduce irrelevant context before increasing effort or model size.
- Sol `medium` is the ordinary setting for implementation, review, routine
  navigation, authenticated browsing, course or administrative audits, and
  tracker synchronization. Use `high` for planning, complex logic, or
  conflicting sources, and `xhigh` for subtle debugging, concurrency,
  security, or unresolved cross-file reasoning.
- Astra is reserved for a specific hard technical difficulty that Sol at an
  appropriate effort is unlikely to handle. Importance, ambiguity, many
  pages, authentication, or computer use alone are not enough. Simple site
  navigation, information gathering, course reconciliation, and tracker
  updates belong on Sol or a lighter model. Start at `medium`, keep the
  context tight, delegate only the hard portion, and never fan it out. Astra
  can consume the weekly allowance roughly 3x to 5x faster than Sol in
  practice.
- Use lower effort for straightforward follow-ups. Inspect failures before
  raising effort or changing models. Escalate a genuine failure one step:
  Luna to Terra `high`, Terra to Sol `medium`, and Sol to Sol `xhigh`; do not
  use Astra as a rescue loop.
- Every input, cached-input, and output token is charged on every request.
  Repeated large context can cost more than one higher-effort turn. `--fast`
  is a paid speed tier independent of effort: 2.5x credits for GPT-5.6 and
  GPT-5.5, 2x for GPT-5.4, and 2.5x for Astra where available. Use it only
  when latency is worth the extra credits, and state the tier. API-key runs
  use API pricing, so ChatGPT credit multipliers do not apply. Treat these as
  a current subscription snapshot and recheck the account and model catalog
  before making a cost-sensitive choice; see the [current Codex speed
  documentation](https://learn.chatgpt.com/docs/agent-configuration/speed).

## Compose the task

- Give one coherent objective. A fix can include its tests and docs;
  split work when the objectives are independent or need different
  permissions, not merely because the task has several steps.
- Include the repository root, observed failure or exact review target,
  relevant source pointers, and what a completed result must do.
- When Git, a worktree, a commit, a push, or a pull request is in scope,
  state the checkout path, sandbox mode, network allowance, and who owns
  each external action. Do not imply that Codex lacks a Git capability.
- Specify output fields when they will be consumed. With runner
  `--schema`, explain field intent without duplicating the schema.
- Require evidence for uncertain claims and identify the checks that
  would establish completion. Set effort only after the task is clear;
  use a supported level from the driving skill's flag map.
- Match the brief to the model chosen by the driving skill's routing
  table. A Luna worker needs the plan, acceptance criteria, file scope,
  and verification command spelled out; it follows instructions
  literally and will not infer missing pieces. Sol and Astra can take a
  thinner brief and resolve routine gaps themselves, so give them the
  goal and constraints rather than a step list.
- Every worker brief ends with three sentences: style and ordering
  rules apply only to lines you add; do not modify any line you were
  not asked to change; list every hunk you touched in the final message.
  Verify each command you name against the package scripts and test
  config first, and say whether a dev server or network is allowed and
  what to do if a check cannot run, so the worker reports instead of
  retrying with escalation requests.

## Autonomy and verification

Preserve authorization already given in the conversation. Let Codex
resolve routine choices and complete authorized work. If approval is
still needed, prepare the concrete result first. User instructions take
precedence over skill guidelines; an actual blocking requirement should
be named and explained. Give parallel workers bounded independent work
only when delegation is permitted. Ask for checks proportional to the
change, with a stopping condition after relevant checks pass. Specify
concise reporting and distinguish verified facts from inference.

These choices address the behaviors described in OpenAI's
[Astra prompting guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra#prompting-best-practices),
reviewed on 2026-09-05. The recipes remain useful with other Codex models;
they do not assume every model supports Astra's settings.

## Select only the needed detail

- For coding or diagnosis, name the observed behavior, allowed edit
  scope, and focused verification.
- For review, specify the immutable target where possible and require
  a concrete failure scenario for each finding.
- For research, request inspected primary sources for current claims
  and separate conclusions from unresolved questions.
- For a write-capable run, include any relevant ownership boundaries
  and external actions already authorized or explicitly deferred.
- Require the final report to separate capability from execution: whether
  the command was attempted, the exact command and error, the affected
  sandbox or provider boundary, and the next permitted action. A sandbox or
  network error is not evidence that Codex cannot perform the operation.
- Require final report input, cached-input, and output token counts when they
  are available, plus elapsed time, retries, review corrections, and any
  unverified residue. Judge efficiency by the verified result and total work,
  not by an effort label or per-call price alone.
- For Git failures, require these four fields verbatim: `Operation`,
  `Evidence`, `Boundary`, and `Next step`. Reject shorthand such as
  "Codex cannot commit" when the evidence only shows a sandbox or network
  restriction.
- For a desktop or browser task, explicitly require the Computer Use,
  Chrome/browser, or built-in browser plugin in the delegated prompt.
  Carry over the exact app, browser/profile, and tab context. Require
  live capability and target checks, the actual tool used, and a read-back
  of the result. Read `cdx:codex-computer-use` for the handoff contract.

Resume or fork follow-ups should usually contain the delta instruction.
Restate scope only when it changed or the saved context could be ambiguous.

Read [prompt blocks](references/prompt-blocks.md) for reusable constraints,
[recipes](references/codex-prompt-recipes.md) for task examples, and
[anti-patterns](references/codex-prompt-antipatterns.md) when a prompt is
underperforming. Use the smallest example that fits.

Originally adapted from openai/codex-plugin-cc's gpt-5-4-prompting skill
(Apache-2.0); see NOTICE. Current guidance is maintained independently.
