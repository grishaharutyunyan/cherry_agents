import { AgentTool } from '../types';

/**
 * A "tool" with no real side effect — it exists only to give the model a JSON-schema-validated
 * shape to call as its final answer. Pass this tool's `declaration.name` as `terminalTool` to
 * runAgenticSession(); the session loop intercepts a call to it before dispatch and returns the
 * call's args as `structuredResult` instead of executing it, so `execute` below is unreachable
 * in practice — it only exists to satisfy the AgentTool shape.
 */
export function makeReportResultTool(name: string, description: string, parametersJsonSchema: object): AgentTool {
  return {
    declaration: { name, description, parametersJsonSchema },
    execute: (args) => args,
  };
}
