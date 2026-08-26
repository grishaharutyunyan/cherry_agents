import { FunctionDeclaration } from '@google/genai';

export interface AgentTool {
  declaration: FunctionDeclaration;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export type AgentEvent =
  | { type: 'gemini_message'; detail: { turn: number; text: string } }
  | { type: 'tool_call'; detail: { tool: string; args: Record<string, unknown> } }
  | { type: 'tool_result'; detail: { tool: string; result: unknown } }
  | { type: 'error'; detail: { message: string } };

export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;
