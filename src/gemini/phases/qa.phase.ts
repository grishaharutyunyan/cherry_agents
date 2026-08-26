import * as fs from 'fs';
import * as path from 'path';

import { config } from '../../config';
import { AiAgentRunParsedFields, AiAgentRunQaCheck } from '../../db/types';
import { checkoutBranch } from '../../git/repo';
import { runAgenticSession } from '../client';
import { makeListFilesTool } from '../tools/list-files.tool';
import { makeReadFileTool } from '../tools/read-file.tool';
import { makeReportResultTool } from '../tools/report-result.tool';
import { makeRunShellTool } from '../tools/run-shell.tool';
import { makeRunSimulationTool } from '../tools/run-simulation.tool';
import { AgentEventHandler } from '../types';

const LINT_BUILD_ONLY = [
  ['npm', 'run', 'lint'],
  ['npm', 'run', 'build'],
];

const REPORT_TOOL_NAME = 'report_qa_result';

const QA_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    overallPass: { type: 'boolean' },
    summary: { type: 'string', description: 'One-paragraph plain-text summary, no raw simulation logs.' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          check: { type: 'string' },
          pass: { type: 'boolean' },
          measured: { type: 'string' },
          expected: { type: 'string' },
          routeHint: { type: 'string', enum: ['design', 'backend', 'frontend', 'ambiguous'] },
        },
        required: ['check', 'pass'],
      },
    },
  },
  required: ['overallPass', 'summary', 'checks'],
};

export interface QaPhaseResult {
  overallPass: boolean;
  summary: string;
  checks: AiAgentRunQaCheck[];
}

function buildSystemPrompt(): string {
  const doc = fs.readFileSync(path.join(config.knowledgeDir, 'qa-rtp-verification.md'), 'utf8');
  return `You independently verify a new gambling game's RTP and implementation quality after both builder agents finished. Don't trust the builders' own claims — verify against the actual shipped code. You never modify game code — you only report pass/fail.

You have five tools: read_file, list_files (whole monorepo, read-only), run_shell_backend and run_shell_frontend (npm run lint / npm run build only, cwd pinned to game_backend / game-frontend respectively — not a general shell), run_simulation (writes and runs a Monte Carlo script against game_backend's real code via ts-node, then deletes it — your only way to execute code), and report_qa_result (call this exactly once, as your final action, with your full findings — do not also reply with a plain-text final answer).

Follow this checklist exactly:

--- qa-rtp-verification.md ---
${doc}

routeHint on a failing check tells the orchestrator what to retry: "design" if the spec's own math/RTP is wrong, "backend" or "frontend" if that builder's implementation doesn't match a correct spec, "ambiguous" if you can't tell which side is at fault (this retries both builders).`;
}

function buildUserMessage(parsedFields: AiAgentRunParsedFields, specDocContent: string): string {
  return `Verify the game_backend + game-frontend implementation for:

- gameId: ${parsedFields.gameId}
- gameName: ${parsedFields.gameName}
- target RTP: ${parsedFields.rtpTarget}%

Full spec doc (source of truth for the RTP formula, provably-fair derivation, and WS contract to check the code against):

---
${specDocContent}
---

When finished, call report_qa_result with your full findings.`;
}

export async function runQaPhase(
  parsedFields: AiAgentRunParsedFields,
  specDocContent: string,
  backendBranch: string,
  frontendBranch: string,
  onEvent: AgentEventHandler,
): Promise<QaPhaseResult> {
  await checkoutBranch(config.gameBackendPath, backendBranch);
  await checkoutBranch(config.gameFrontendPath, frontendBranch);

  const result = await runAgenticSession({
    model: config.models.qa,
    systemPrompt: buildSystemPrompt(),
    tools: [
      makeReadFileTool(config.monorepoRoot),
      makeListFilesTool(config.monorepoRoot),
      makeRunShellTool('run_shell_backend', config.gameBackendPath, LINT_BUILD_ONLY),
      makeRunShellTool('run_shell_frontend', config.gameFrontendPath, LINT_BUILD_ONLY),
      makeRunSimulationTool(config.gameBackendPath),
      makeReportResultTool(
        REPORT_TOOL_NAME,
        'Report the final QA pass/fail result. Call exactly once, as your last action.',
        QA_RESULT_SCHEMA,
      ),
    ],
    initialUserMessage: buildUserMessage(parsedFields, specDocContent),
    maxTurns: config.maxTurnsPerPhase,
    terminalTool: REPORT_TOOL_NAME,
    onEvent,
  });

  if (result.stoppedReason === 'max_turns_exceeded' || !result.structuredResult) {
    throw new Error(`QA phase exceeded ${config.maxTurnsPerPhase} turns without calling ${REPORT_TOOL_NAME}`);
  }

  const parsed = result.structuredResult as unknown as QaPhaseResult;
  if (typeof parsed.overallPass !== 'boolean' || !Array.isArray(parsed.checks)) {
    throw new Error(`QA phase's ${REPORT_TOOL_NAME} call had an unexpected shape: ${JSON.stringify(result.structuredResult)}`);
  }
  return parsed;
}
