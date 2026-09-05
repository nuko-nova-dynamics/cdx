# Codex prompt anti-patterns

Use observed failures to decide which instruction needs changing.

| Pattern | Why it fails | Better direction |
|---|---|---|
| "Take a look and tell me what you think" | No review target or decision | Specify the change, concern, and evidence expected |
| "Think harder" | Does not identify missing work | Name the uncertainty and the check that could resolve it |
| A mandatory stack of XML blocks for every task | Adds constraints unrelated to the job | State the outcome and include only relevant boundaries |
| Splitting one fix, its tests, and its docs into unrelated runs | Loses the shared completion criterion | Keep coherent work together; split independent scopes |
| "Keep investigating until completely certain" | Has no reachable stopping condition | Define sufficient evidence and report remaining uncertainty |
| "Run every test and audit everything" for a small change | Expands work beyond the affected behavior | Name proportional checks and when to stop |
| "Ask before every write" after a fix is already authorized | Prevents execution of the requested task | Preserve the existing authorization and actual stop boundary |
| An unqualified "never ask questions" | Hides decisions required for correctness | Resolve routine choices; surface only material missing decisions |
| "Tell me exactly why production failed" without evidence | Encourages unsupported certainty | Require observed evidence and label inference |
| "Use xhigh, the maximum effort" | Assumes all models expose the same levels | Check the selected model and installed CLI's supported settings |
| Retrying a failed write task solely to repair report formatting | Can repeat completed mutations | Inspect artifacts and recover the report without replaying work |

For scope, verification, and evidence examples, read
[prompt blocks](prompt-blocks.md). For a complete task starting point,
read [recipes](codex-prompt-recipes.md).
