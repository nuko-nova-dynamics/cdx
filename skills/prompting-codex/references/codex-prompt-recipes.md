# Codex prompt recipes

Adapt the smallest example that fits. Replace placeholders with source
and authorization from the current request. These recipes work across
Codex models, including GPT-6 Astra; model and effort selection belong
in the runner settings.

## Diagnosis

```text
Diagnose <failing command or behavior> in <repository root>.
The observed failure is <exact error and relevant input/state>.
Inspect the failing path and the evidence needed to distinguish plausible
causes. This is a read-only diagnosis.
Return the supported cause, evidence, and smallest next step. If the
available evidence cannot establish a cause, state what remains unknown.
```

## Narrow fix

```text
Fix <observed failure> in <repository root> so that <expected behavior>.
Preserve behavior outside the affected path and existing unrelated work.
The authorized scope is <files or behavior>; <external action> is
<authorized or deferred, only if relevant>.
Reproduce the failure where practical, apply the fix, and run <focused
checks>. Include tests or docs when needed for the fix. Completion means
<observable acceptance criterion>; broaden checks only if new evidence
requires it.
Report what changed, validation, and any remaining work.
```

## Review

```text
Review <exact diff target> in <repository root> for material correctness
and regression issues. Focus on <requested concern>.
Inspect the changed code and relevant callers. For each finding, provide
a concrete triggering scenario, the resulting failure, and source
location. Examine adjacent paths when they could confirm or refute a
finding. Report no findings when none are supported. Do not edit files.
```

Use the review-findings schema for results that will be parsed. For
native review, follow the target/prompt rules in `/cdx:review`.

## Research or recommendation

```text
Research <decision> for <requirements and constraints>.
Inspect current primary sources for claims that affect the decision.
Compare the viable options and explain which best meets the constraints.
Report observed facts with source links, your recommendation and its
tradeoffs, and any uncertainty that could change it. Stop when the
available evidence supports the decision or establishes the missing facts.
```

## Desktop and browser workflows

Before launching, Claude announces the Codex handoff and names the requested
plugin and target. Follow `cdx:codex-computer-use`; include those same choices
explicitly in the prompt. For a desktop inspection:

```text
Use Codex's Computer Use plugin to inspect <app/window> and report <setting>.
Read the current tool instructions and verify the target with a non-mutating
check before proceeding. This task is read-only; do not change the setting.
Return the tool actually used, target, observed value, and any blocker.
```

For a browser action the user has authorized:

```text
Use Codex's Chrome/browser plugin with <browser/profile> at <URL> to
<authorized action>. Discover the current tools and verify the browser,
profile, and page before acting. If the requested target is unavailable or
ambiguous, report that blocker. Read back <saved result> after the action.
Return the actual tool, verified target, actions taken, completion evidence,
and any remaining work. <Relevant stop boundary, if any.>
```

Name both plugins for a workflow spanning a desktop app and browser. A named
profile remains part of the task across resume or fork, but connectivity and
target identity need checking again when the UI state may have changed.

## Prompt patching

```text
Improve <existing prompt> for <intended task> using these observed
failures: <examples>.
Identify instructions that caused ambiguity, premature stopping, excess
work, or the wrong output. Propose only changes supported by the examples.
Return the failure analysis, revised prompt, and why the edits address
those failures. Preserve the user's scope and authorization.
```

## Resume or fork

```text
Continue with <new requirement or next step>. The earlier <authorization
or boundary> still applies. Completion now means <updated criterion>.
```

Use `--resume <id>` for the same session or `--fork <id>` for a separate
continuation. Include only context needed for the change in direction.
