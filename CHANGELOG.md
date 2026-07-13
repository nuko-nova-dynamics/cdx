# Changelog

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
