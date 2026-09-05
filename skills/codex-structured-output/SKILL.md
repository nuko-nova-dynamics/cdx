---
name: codex-structured-output
description: Request and validate machine-readable JSON from Codex runs using a bundled or ad-hoc schema. Use when a Codex result must be parsed for review, planning, verification, or task reporting.
---

# Structured output from Codex

The runner's `--schema <path>` passes a JSON Schema to
`codex exec --output-schema`. Use a model/provider that supports the
feature. A requested schema defines the final message shape; it does
not prove completion or the truth of the contents.

## Bundled schemas

Use the full path under `${CLAUDE_PLUGIN_ROOT}/schemas/`. Short names
are resolved by `/cdx:task`, not by the runner itself.

| Schema | Use for | Fields |
|---|---|---|
| `review-findings.schema.json` | Code review | `overall`, `findings[]` with file, nullable line, severity, summary, failure scenario |
| `verdict.schema.json` | Check a claim | `claim`, `verdict`, `evidence`, nullable `confidence` |
| `task-report.schema.json` | Report after a task | `summary`, `files_changed`, `commands_run`, `risks`, `follow_ups` |
| `patch-plan.schema.json` | Plan before edits | `steps[]` with file, change, nullable rationale; nullable `notes` |

All fields in these schemas are required. Nullable values and empty
arrays represent absent information where specified. Read the actual
schema when constructing a consumer.

## Ad-hoc schemas

Write the schema to the session scratch directory, then pass its path.
For OpenAI Structured Outputs strict mode:

- Use an object at the root, without a root `anyOf`.
- List every property in `required`, at each object level. Represent an
  optional value with a nullable type such as `"type": ["string", "null"]`.
- Set `additionalProperties: false` on every object.
- Stay within supported schema limits, currently up to 10 nesting levels
  and 5000 total object properties. A flat schema is a readability
  preference, not a one-level backend restriction.

These requirements were checked against OpenAI's
[Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas)
on 2026-09-05. Consult that guide for other keywords and limits when the
schema is complex. Invalid or unsupported schemas can fail before a
model response; changing the prompt cannot repair a rejected schema.

Use `enum` for categorical fields and descriptions for field meaning
when useful. These are design choices, not universal API requirements.

## Parsing and recovery

Read the runner status and parse the final message or `last-message.txt`
artifact. Validate the parsed data against the selected schema before
passing it to a consumer. Treat missing, malformed, refused, or incomplete
output as unusable for automated action and inspect the actual error.

If a write-capable run produced changes before its report failed, inspect
those changes and recover the report from available evidence. Do not
replay the original task just to fix its JSON. A bounded read-only
formatting follow-up is appropriate only when the needed result already
exists; it must not repeat the task's mutations.

Verify substantive claims against current source or tool evidence before
acting. Schema conformance does not make an unsupported finding true.
