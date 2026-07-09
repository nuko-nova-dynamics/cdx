# cdx

Full-surface Codex CLI integration for Claude Code. Skill-first: say
"spawn codex on X" and Claude picks the right flags, runs `codex exec`,
parses structured output, and acts on it. Replaces the official
openai-codex plugin's locked-down forwarder with a real two-model loop.

Verified against codex-cli 0.143.0. Requires Node >= 20 and a logged-in
Codex CLI (`codex login`).

## Install

```bash
claude plugin marketplace add nuko-nova-dynamics/cdx
claude plugin install cdx@cdx
```
