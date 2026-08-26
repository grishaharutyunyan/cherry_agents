import { Content, GoogleGenAI } from '@google/genai';

import { config } from '../config';
import { AgentEventHandler, AgentTool } from './types';

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: config.geminiApiKey });
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
}

export interface AgenticSessionResult {
  finalText: string;
  turns: number;
  stoppedReason: 'done' | 'max_turns_exceeded';
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
      return { finalText: response.text ?? '', turns: turn + 1, stoppedReason: 'done' };
    }

    await params.onEvent?.({ type: 'gemini_message', detail: { turn, text: response.text ?? '' } });

    const responseParts: Content['parts'] = [];
    for (const call of calls) {
      const name = call.name ?? '';
      const args = call.args ?? {};
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
