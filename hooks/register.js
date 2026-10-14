// cdx mod: Codex as Agent tool subagents, and turn-end notices for the
// computer-use server (scripts/codex-cu-mcp.mjs). Registers cdx:codex-sol,
// cdx:codex-luna, and cdx:codex-astra, whose model ids carry a prefix
// (MODEL_PREFIX). Each request such an agent makes is answered here by running
// the Codex runner, so the Agent tool spawns Codex and SendMessage resumes its
// session. Progress streams as thinking, which is shown and not recorded.
import {
  AGENTS,
  PROGRESS_PREFIX,
  RECORD_PREFIX,
  RECORD_TTL_MS,
  agentSpec,
  answerText,
  codexModelOf,
  lineBuffer,
  parseRequest,
  runnerArgs,
  sessionOfProgress,
  threadIdOf,
} from "./codex-agent.js";
import { COMPUTER_USE_TOOL, approvalPolicyFromToml } from "./computer-use.js";

// Tells the computer-use runtime that a turn ended, as Codex does from its
// Stop, SubagentStop, and Interrupt hooks, so it can release what the turn held
// (attached browser tabs). The launcher answers at once when the runtime never
// started, so turns without computer use start nothing.
async function endComputerUseTurn($, e) {
  try {
    const connected = await $.mcp.connect("computer-use");
    if (!connected.isConnected) return;
    const hookEventName = e.isAborted ? "Interrupt" : e.agentId ? "SubagentStop" : "Stop";
    const sessionId = e.agentId ?? (await $.session.id());
    await $.mcp.call(connected.server, "turn_ended", {
      hook_event_name: hookEventName,
      session_id: sessionId,
      turn_id: e.turnId,
    });
  } catch (err) {
    $.ui.log(`cdx: computer-use turn_ended failed: ${err?.message ?? err}`, { to: "debug" });
  }
}

async function codexApprovalPolicy($) {
  const home = (await $.env.get("CODEX_HOME")) || `${await $.env.get("HOME")}/.codex`;
  const text = await $.fs.read(`${home}/config.toml`).catch(() => null);
  return approvalPolicyFromToml(text);
}

export function register(on) {
  // Computer use follows the user's Codex approval policy: with
  // approval_policy = "never", cdx's computer-use tools run without a prompt,
  // as they do in Codex. Only an `ask` becomes `allow`; a deny stays. If the
  // hook fails, the usual decision stands.
  on("tool.check", { tool: COMPUTER_USE_TOOL }, async ($, e, next) => {
    const decided = await next(e);
    if (decided.decision !== "ask") return decided;
    if ((await codexApprovalPolicy($)) !== "never") return decided;
    return { decision: "allow", reason: 'Codex approval_policy is "never"; cdx computer use follows it.' };
  }).catch(($, e, next) => next(e));

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    // Awaited so the notice is sent before a headless session exits; the
    // launcher answers at once when the runtime is not running.
    await endComputerUseTurn($, e);
    return result;
  });

  on("session.start", async ($, e, next) => {
    const started = await next(e);
    for (const agent of AGENTS) {
      try {
        await $.agent.register(agentSpec(agent));
      } catch (err) {
        $.ui.log(`cdx: could not register ${agent.name}: ${err?.message ?? err}`, { to: "debug" });
      }
    }
    // Drop session records no agent has used for RECORD_TTL_MS.
    try {
      const now = await $.clock.now();
      for (const key of await $.store.keys()) {
        if (!key.startsWith(RECORD_PREFIX)) continue;
        const record = await $.store.get(key);
        if (!record || now - (record.at ?? 0) > RECORD_TTL_MS) await $.store.delete(key);
      }
    } catch (err) {
      $.ui.log(`cdx: could not prune agent records: ${err?.message ?? err}`, { to: "debug" });
    }
    return started;
  });

  on("turn.step", async function* ($, e, next) {
    const model = codexModelOf(e.model);
    if (!model || !e.agentId) return yield* next(e);

    // A rejected read must not fail the hook: Claude Code would then send the
    // request to the API under the cdx-codex- model id.
    const found = await $.session.messages({ agentId: e.agentId }).catch(() => []);
    const messages = Array.isArray(found) ? found : [];
    const last = [...messages].reverse().find((m) => m.role === "user" && m.text.trim());
    const key = RECORD_PREFIX + e.agentId;
    const record = await $.store.get(key).catch(() => undefined);
    const request = parseRequest(last?.text ?? "");

    let text;
    let block = 0;
    if (request.error) {
      text = `cdx: ${request.error}`;
    } else {
      const root = $.plugin.root;
      const { argv, sandbox, effort } = runnerArgs({
        runner: `${root}/scripts/codex-run.mjs`,
        schemasDir: `${root}/schemas`,
        model,
        record,
        request,
      });
      // Saved when Codex reports the session, so an interrupted run still
      // resumes, and only then: a run the runner rejected keeps the record's
      // last working sandbox and effort. A failed write is logged, never allowed
      // to fail the hook.
      const save = async (thread) => {
        try {
          await $.store.set(key, { thread, sandbox, effort, at: await $.clock.now() });
        } catch (err) {
          $.ui.log(`cdx: could not save the Codex session for ${e.agentId}: ${err?.message ?? err}`, { to: "debug" });
        }
      };
      const cwd = await $.session.cwd();
      let stdout = "";
      const stderrLines = [];
      const errBuffer = lineBuffer();
      const stream = $.process.spawn({ argv, cwd })[Symbol.asyncIterator]();
      let ended = { code: null, signal: null };
      let reported = false;
      try {
        for (;;) {
          const step = await stream.next();
          if (step.done) {
            ended = step.value ?? ended;
            break;
          }
          const chunk = step.value;
          if (chunk.stream === "stdout") {
            stdout += chunk.text;
            continue;
          }
          for (const line of errBuffer.push(chunk.text)) {
            if (line.startsWith(PROGRESS_PREFIX)) {
              const progress = line.slice(PROGRESS_PREFIX.length);
              const thread = sessionOfProgress(progress);
              if (thread) {
                await save(thread);
                reported = true;
                continue;
              }
              yield { kind: "thinking", index: 0, text: progress + "\n" };
              block = 1;
            } else {
              stderrLines.push(line);
            }
          }
        }
      } catch (err) {
        // A launch failure or an interrupt rejects the pull; the reason says which.
        stderrLines.push(`the runner did not finish: ${err?.message ?? err}`);
      } finally {
        // Leaving early (an interrupt) ends the loop, which stops the runner.
        await stream.return?.();
      }
      stderrLines.push(...errBuffer.flush().filter((l) => !l.startsWith(PROGRESS_PREFIX)));
      const thread = threadIdOf(stdout);
      if (thread && !reported) await save(thread);
      text = answerText({ stdout, stderrLines, ...ended });
    }

    yield { kind: "text", index: block, text };
    yield { kind: "stop", stopReason: "end_turn", usage: null };
    return { turnId: e.turnId, index: e.index, answer: text, toolUses: [], stopReason: "end_turn", usage: null };
  });
}
