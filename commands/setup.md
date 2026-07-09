---
description: Check Codex CLI health — install, auth, version, features, config pitfalls
argument-hint: ""
allowed-tools: Bash, Read, AskUserQuestion
---

Health-check the Codex integration:

1. `codex --version` — if missing, offer to `npm install -g @openai/codex` (AskUserQuestion, install first + "(Recommended)").
2. `codex doctor` — surface anything non-healthy.
3. Auth: if doctor reports auth problems, tell the user to run `!codex login`.
4. Version drift: compare `codex --version` to the verified version in `${CLAUDE_PLUGIN_ROOT}/skills/driving-codex/references/flag-map.md`; if newer, note that the flag map may lag and new flags may exist.
5. Config pitfalls: grep `~/.codex/config.toml` for `model =` — if the pinned model is rejected by this CLI (signature: "requires a newer version of Codex"), recommend `codex update` or removing the pin.
6. Smoke: run the runner with `--sandbox ro --model spark --ephemeral -- "Reply with exactly: ok"` and report pass/fail.

Report all findings compactly.
