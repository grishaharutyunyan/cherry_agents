import { Content, GoogleGenAI } from '@google/genai';

import { config } from '../config';
import { AgentEventHandler, AgentTool } from './types';

let client: GoogleGenAI | null = null;

function createClient(): GoogleGenAI {
  return config.useVertexAI ? new GoogleGenAI({}) : new GoogleGenAI({ apiKey: config.geminiApiKey });
}

/**
 * Developer API key mode (default) vs Vertex AI mode (draws from GCP billing/
 * credits instead of the Gemini API's own billing) — the SDK auto-detects Vertex
 * mode from GOOGLE_GENAI_USE_VERTEXAI/GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION
 * env vars when constructed with no explicit options, and authenticates via
 * standard GCP Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS
 * pointing at a service account key, typically) rather than an API key at all —
 * so an apiKey must NOT be passed here in that mode. See config.useVertexAI.
 *
 * Cached singleton — used for one-shot calls (parse-prompt.ts) where there's nothing to retry.
 * generateContentWithRetry below deliberately does NOT use this cached instance; see its comment.
 */
export function getClient(): GoogleGenAI {
  if (!client) {
    client = createClient();
  }
  return client;
}

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429') || message.includes(' 429 ');
}

/**
 * Real-world precedent for why this exists: building phase dispatches backend + frontend
 * sessions in parallel, each making several calls per turn — that's enough to trip Vertex AI's
 * per-project rate limit outright (2026-08-27, RESOURCE_EXHAUSTED on the very first call of both
 * sessions at once). Retries only 429/RESOURCE_EXHAUSTED with exponential backoff; anything else
 * fails immediately, same as before. Bounded to stay well under LOCK_TTL_SECONDS (120s default).
 *
 * Deliberately builds a BRAND NEW client for every single attempt (never getClient()'s cached
 * singleton, never reuses one client instance across retries) — real precedent: with
 * structuredClone(args) already ruling out request-object mutation, a design-phase call still
 * failed with a client-side "Mixing Content and Parts" validation error every time, consistently
 * ~40s in (matching this backoff schedule almost exactly), and this bug only ever appeared after
 * the retry loop itself was added. That points at state on the CLIENT INSTANCE — not the request
 * — getting corrupted by a failed attempt and then poisoning the next one. A fresh client per
 * attempt makes that impossible regardless of the exact internal mechanism. Construction is
 * cheap (no network call), so this costs nothing on the common no-retry path.
 */
async function generateContentWithRetry(
  args: Parameters<GoogleGenAI['models']['generateContent']>[0],
  maxRetries = 4,
): Promise<Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>> {
  let delayMs = 3000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await createClient().models.generateContent(structuredClone(args));
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, 30000);
    }
  }
}

export interface AgenticSessionParams {
  model: string;
  systemPrompt: string;
  tools: AgentTool[];
  initialUserMessage: string;
  maxTurns: number;
  onEvent?: AgentEventHandler;
  /**
   * Name of a tool (typically one built with makeReportResultTool) whose call ends the session
   * immediately — its args are returned as `structuredResult` instead of being executed and fed
   * back. Use this when a phase's final answer needs to be structured data (e.g. QA's pass/fail
   * report) rather than free text.
   */
  terminalTool?: string;
  /**
   * If the session tries to finish (no function calls) without ever having called this tool,
   * one nudge — injected as a new user turn instead of accepting the finish — gets the model to
   * reconsider before the session ends for good (still bounded by maxTurns). Only nudges once,
   * to avoid an infinite prompt loop. This is a soft nudge, not the correctness guarantee — a
   * build phase finishing without ever calling run_shell (real precedent: a frontend build wrote
   * 18 files and finished without a single commit, 2026-08-27) is exactly the case this targets,
   * but the real safety net stays each build phase's own git-sha-diff check after the session.
   */
  requireToolCall?: { toolName: string; nudgeMessage: string };
}

export interface AgenticSessionResult {
  finalText: string;
  turns: number;
  stoppedReason: 'done' | 'max_turns_exceeded';
  /** Set only when the session ended via a call to `terminalTool`. */
  structuredResult?: Record<string, unknown>;
}

/**
 * Drives one multi-turn Gemini function-calling loop: send contents + tool declarations,
 * execute whatever tool calls come back against this phase's tool implementations, feed the
 * results back, repeat until the model returns plain text (done) or maxTurns is hit (failed —
 * no silent retry, the phase reports max_turns_exceeded and the orchestrator marks the run FAILED).
 */
export async function runAgenticSession(params: AgenticSessionParams): Promise<AgenticSessionResult> {
  const toolMap = new Map(params.tools.map((tool) => [tool.declaration.name ?? '', tool]));
  const contents: Content[] = [{ role: 'user', parts: [{ text: params.initialUserMessage }] }];
  const calledToolNames = new Set<string>();
  let nudged = false;

  for (let turn = 0; turn < params.maxTurns; turn++) {
    const response = await generateContentWithRetry({
      model: params.model,
      contents,
      config: {
        systemInstruction: params.systemPrompt,
        tools: params.tools.length ? [{ functionDeclarations: params.tools.map((t) => t.declaration) }] : undefined,
      },
    });

    const modelContent = response.candidates?.[0]?.content;
    if (!modelContent) {
      throw new Error('Gemini returned no content in its response');
    }
    contents.push(modelContent);

    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      const required = params.requireToolCall;
      if (required && !calledToolNames.has(required.toolName) && !nudged) {
        nudged = true;
        contents.push({ role: 'user', parts: [{ text: required.nudgeMessage }] });
        continue;
      }
      return { finalText: response.text ?? '', turns: turn + 1, stoppedReason: 'done' };
    }

    const terminalCall = params.terminalTool ? calls.find((c) => c.name === params.terminalTool) : undefined;
    if (terminalCall) {
      return {
        finalText: response.text ?? '',
        turns: turn + 1,
        stoppedReason: 'done',
        structuredResult: (terminalCall.args ?? {}) as Record<string, unknown>,
      };
    }

    await params.onEvent?.({ type: 'gemini_message', detail: { turn, text: response.text ?? '' } });

    const responseParts: Content['parts'] = [];
    for (const call of calls) {
      const name = call.name ?? '';
      const args = call.args ?? {};
      calledToolNames.add(name);
      await params.onEvent?.({ type: 'tool_call', detail: { tool: name, args } });

      let result: unknown;
      const tool = toolMap.get(name);
      try {
        result = tool ? await tool.execute(args) : { error: `Unknown tool: ${name}` };
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }

      await params.onEvent?.({ type: 'tool_result', detail: { tool: name, result } });
      responseParts!.push({
        functionResponse: {
          name,
          response: typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : { result },
        },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return { finalText: '', turns: params.maxTurns, stoppedReason: 'max_turns_exceeded' };
}
