# Changelog

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
