#!/usr/bin/env bash
# Real Codex checks; uses your configured model unless CDX_SMOKE_MODEL is set.
set -euo pipefail
exec node "$(dirname "$0")/smoke.mjs" "$@"
