#!/usr/bin/env bash
# Real-Codex smoke tests. Requires logged-in codex CLI. Costs a few cheap spark calls.
set -euo pipefail
cd "$(dirname "$0")/.."
RUNNER="scripts/codex-run.mjs"
SCRATCH="tests/scratch"
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
PASS=0; FAIL=0
check() { # name, condition
  if eval "$2"; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi
}

# 1. Basic run captures session + final message
OUT1=$(node "$RUNNER" --sandbox ro --model spark --ephemeral --scratch "$SCRATCH/basic" --cd "$SCRATCH" -- "Reply with exactly the word: hello" || true)
check "basic: completed"        '[[ "$OUT1" == *"status: completed"* ]]'
check "basic: says hello"       '[[ "$OUT1" == *"hello"* ]]'
check "basic: session id shown" '[[ "$OUT1" == *"session: "* && "$OUT1" != *"session: unknown"* ]]'

# 2. Schema run returns parseable JSON matching verdict shape
OUT2=$(node "$RUNNER" --sandbox ro --model spark --ephemeral --scratch "$SCRATCH/schema" --cd "$SCRATCH" \
  --schema schemas/verdict.schema.json -- "Claim to evaluate: the sky is sometimes blue. Return your verdict." || true)
check "schema: completed" '[[ "$OUT2" == *"status: completed"* ]]'
check "schema: valid verdict JSON" 'node -e "const j=JSON.parse(require(\"fs\").readFileSync(\"$SCRATCH/schema/last-message.txt\",\"utf8\")); if(![\"confirmed\",\"refuted\",\"uncertain\"].includes(j.verdict)) process.exit(1)"'

# 3. Resume round-trip (persistent session, then continue it)
OUT3=$(node "$RUNNER" --sandbox ro --model spark --scratch "$SCRATCH/resume-a" --cd "$SCRATCH" -- "Remember the codeword: pineapple42. Reply: stored." || true)
SID=$(echo "$OUT3" | sed -n 's/^session: //p')
check "resume: first run completed" '[[ "$OUT3" == *"status: completed"* && -n "$SID" ]]'
OUT4=$(node "$RUNNER" --sandbox ro --model spark --scratch "$SCRATCH/resume-b" --resume "$SID" -- "What was the codeword? Reply with just the codeword." || true)
check "resume: codeword recalled" '[[ "$OUT4" == *"pineapple42"* ]]'

# 4. Fleet: two parallel workers both complete
node "$RUNNER" --sandbox ro --model spark --ephemeral --scratch "$SCRATCH/fleet-1" --cd "$SCRATCH" -- "Reply with exactly: worker one done" > "$SCRATCH/f1.out" 2>&1 &
P1=$!
node "$RUNNER" --sandbox ro --model spark --ephemeral --scratch "$SCRATCH/fleet-2" --cd "$SCRATCH" -- "Reply with exactly: worker two done" > "$SCRATCH/f2.out" 2>&1 &
P2=$!
wait $P1 || true; wait $P2 || true
check "fleet: worker one" 'grep -q "worker one done" "$SCRATCH/f1.out"'
check "fleet: worker two" 'grep -q "worker two done" "$SCRATCH/f2.out"'

echo "----"
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
