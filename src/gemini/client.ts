import { Content, GoogleGenAI } from '@google/genai';

import { config } from '../config';
import { AgentEventHandler, AgentTool } from './types';

let client: GoogleGenAI | null = null;

/**
 * Developer API key mode (default) vs Vertex AI mode (draws from GCP billing/
 * credits instead of the Gemini API's own billing) — the SDK auto-detects Vertex
 * mode from GOOGLE_GENAI_USE_VERTEXAI/GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION
 * env vars when constructed with no explicit options, and authenticates via
 * standard GCP Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS
 * pointing at a service account key, typically) rather than an API key at all —
 * so an apiKey must NOT be passed here in that mode. See config.useVertexAI.
 */
export function getClient(): GoogleGenAI {
  if (!client) {
    client = config.useVertexAI ? new GoogleGenAI({}) : new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return client;
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
  const ai = getClient();
  const toolMap = new Map(params.tools.map((tool) => [tool.declaration.name ?? '', tool]));
  const contents: Content[] = [{ role: 'user', parts: [{ text: params.initialUserMessage }] }];
  const calledToolNames = new Set<string>();
  let nudged = false;

  for (let turn = 0; turn < params.maxTurns; turn++) {
    const response = await ai.models.generateContent({
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
