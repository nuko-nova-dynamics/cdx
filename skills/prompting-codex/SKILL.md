---
name: prompting-codex
description: Compose task prompts for Codex delegation, including GPT-6 Astra, coding, Computer Use and browser workflows, with clear scope, tools, evidence, completion criteria, and output requirements. Use before non-trivial CLI delegation or when improving a failing Codex prompt.
---

# Prompting Codex

State the outcome, relevant context, and constraints that change how
Codex should work. Use plain prose, bullets, or XML when they make the
boundaries clearer; tags and a fixed collection of blocks are optional.

## Compose the task

- Give one coherent objective. A fix can include its tests and docs;
  split work when the objectives are independent or need different
  permissions, not merely because the task has several steps.
- Include the repository root, observed failure or exact review target,
  relevant source pointers, and what a completed result must do.
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
