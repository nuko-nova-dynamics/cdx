---
name: codex-structured-output
description: Get machine-readable JSON out of Codex runs using --output-schema — pick a bundled schema (review-findings, verdict, task-report, patch-plan) or author an ad-hoc one. Use when a Codex result should be parsed and acted on rather than read as prose.
---

# Structured output from Codex

`codex exec --output-schema <file>` forces the final agent message to
be JSON matching the given JSON Schema. The runner exposes it as
`--schema <path>`.

## Bundled schemas (`${CLAUDE_PLUGIN_ROOT}/schemas/`)

| Schema | Use for | Shape |
|---|---|---|
| `review-findings.schema.json` | code review | `{overall, findings[]: {file, line?, severity, summary, failure_scenario}}` |
| `verdict.schema.json` | fact-check a claim | `{claim, verdict: confirmed\|refuted\|uncertain, evidence, confidence?}` |
| `task-report.schema.json` | report after a mutating task | `{summary, files_changed[], commands_run[]?, risks[]?, follow_ups[]?}` |
| `patch-plan.schema.json` | plan before edits | `{steps[]: {file, change, rationale?}, notes?}` |

## Ad-hoc schemas

Write to the session scratchpad, then pass its path. Rules that make
Codex fill schemas reliably:

- Keep it FLAT — one level of nesting max (arrays of flat objects OK).
- Minimal `required`; optional fields get filled opportunistically.
- `additionalProperties: false` at every level.
- Use `enum` for anything categorical.
- Describe fields with `description` — Codex reads them.

## Parsing

The JSON arrives as the final message (also in the runner's
`last-message.txt` artifact). Parse it; on parse failure treat the run
as failed and retry once with the instruction "Return ONLY the JSON
object, no fences" appended.

Always verify substantive claims in parsed output against the repo
before acting — schema conformance is not truth.
