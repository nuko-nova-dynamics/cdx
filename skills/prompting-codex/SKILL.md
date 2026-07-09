---
name: prompting-codex
description: Compose effective prompts for Codex (GPT-5.x-Codex models) — task framing, output contracts, verification blocks. Use before any non-trivial Codex delegation to tighten the prompt.
---

# Prompting Codex

Prompt Codex like an operator, not a collaborator. Compact,
block-structured prompts with XML tags: state the task, the output
contract, the follow-through defaults, and only the extra constraints
that matter.

Core rules:
- One clear task per run. Split unrelated asks into separate runs.
- Tell Codex what done looks like — it will not infer the end state.
- Add explicit grounding/verification rules wherever unsupported
  guesses would hurt.
- Tighten the prompt contract before raising reasoning effort.

Default recipe:
- `<task>`: the concrete job plus relevant repo/failure context.
- `<structured_output_contract>` or `<compact_output_contract>`:
  exact shape and brevity requirements (omit when the runner passes
  `--schema` — the schema IS the contract; still state field
  intent in the task).
- `<default_follow_through_policy>`: what to do instead of asking
  routine questions.
- `<verification_loop>` / `<completeness_contract>`: required for
  debugging, implementation, risky fixes.
- `<grounding_rules>` / `<citation_rules>`: required for review,
  research, or claim-heavy output.

Add blocks by task type:
- Coding/debugging: `completeness_contract`, `verification_loop`,
  `missing_context_gating`.
- Review: `grounding_rules`, `dig_deeper_nudge` (+ `--schema
  review-findings`).
- Research: `research_mode`, `citation_rules` (+ `--search`).
- Write-capable runs: `action_safety` — stay narrow, no unrelated
  refactors.

Resume follow-ups (`--resume <id>`): send only the delta instruction,
not the restated prompt, unless direction changed materially.

Reusable blocks: [references/prompt-blocks.md](references/prompt-blocks.md).
End-to-end templates: [references/codex-prompt-recipes.md](references/codex-prompt-recipes.md).
Failure modes: [references/codex-prompt-antipatterns.md](references/codex-prompt-antipatterns.md).

Adapted from openai/codex-plugin-cc's gpt-5-4-prompting skill
(Apache-2.0); see NOTICE.
