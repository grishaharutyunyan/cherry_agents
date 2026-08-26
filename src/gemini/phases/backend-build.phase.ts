import * as fs from 'fs';
import * as path from 'path';

import { config } from '../../config';
import { AiAgentRunParsedFields } from '../../db/types';
import { ensureBranch, getHeadSha } from '../../git/repo';
import { runAgenticSession } from '../client';
import { makeListFilesTool } from '../tools/list-files.tool';
import { makeReadFileTool } from '../tools/read-file.tool';
import { makeRunShellTool } from '../tools/run-shell.tool';
import { makeWriteFileTool } from '../tools/write-file.tool';
import { AgentEventHandler } from '../types';

const BUILD_SHELL_ALLOWLIST = [
  ['git', 'status'],
  ['git', 'diff'],
  ['git', 'add'],
  ['git', 'commit'],
  ['npm', 'run', 'lint'],
  ['npm', 'run', 'build'],
];

export interface BuildPhaseResult {
  branch: string;
  reportText: string;
}

function buildSystemPrompt(): string {
  const checklist = fs.readFileSync(path.join(config.knowledgeDir, 'adding-a-new-game-backend.md'), 'utf8');
  return `You implement the NestJS backend module for one new gambling game on the Cherry casino platform, from a spec doc a design agent already wrote. A frontend-builder is building the UI in parallel from the same spec, without talking to you — match the spec's WebSocket contract exactly, don't improvise event/field names.

You have four tools: read_file, list_files (whole monorepo, read-only), write_file (scoped only to this game's own directory under game_backend/src/games/, plus game_backend/src/games/index.ts and game_backend/src/app.module.ts for registration), and run_shell (cwd pinned to game_backend; allowed: git status/diff/add/commit, npm run lint, npm run build — not a general shell, no pipes/redirects/globs).

Follow this checklist exactly:

--- adding-a-new-game-backend.md ---
${checklist}

You are committing directly to an already-checked-out feature branch — do not create or switch branches yourself. When your implementation is complete: stage and commit your changes via run_shell (git add, then git commit -m "<message>"), then run npm run lint and npm run build via run_shell and fix any errors they report before finishing. Do not finish with an uncommitted working tree or a failing lint/build.

When done, reply with plain text (no more tool calls) summarizing the files you created/modified and confirming lint+build passed.`;
}

function buildUserMessage(parsedFields: AiAgentRunParsedFields, specDocContent: string, retryFeedback: string | null): string {
  const base = `Implement the game_backend module for:

- gameId: ${parsedFields.gameId}
- gameName: ${parsedFields.gameName}
- archetype: ${parsedFields.archetype}

Full spec doc (source of truth for math/RTP/provably-fair/WS contract):

---
${specDocContent}
---`;

  if (!retryFeedback) return base;
  return `${base}

This is a RETRY. A QA agent found a problem with the previous build on this same branch:
${retryFeedback}

Read your previous implementation first via read_file/list_files, then fix the issue and commit again (new commit, same branch).`;
}

export async function runBackendBuildPhase(
  parsedFields: AiAgentRunParsedFields,
  specDocContent: string,
  retryFeedback: string | null,
  onEvent: AgentEventHandler,
): Promise<BuildPhaseResult> {
  const branch = `CHE-${parsedFields.gameId.toUpperCase()}`;
  await ensureBranch(config.gameBackendPath, branch);
  const shaBefore = await getHeadSha(config.gameBackendPath);

  const gameDir = path.join(config.gameBackendPath, 'src', 'games', parsedFields.gameId);
  const indexFile = path.join(config.gameBackendPath, 'src', 'games', 'index.ts');
  const appModuleFile = path.join(config.gameBackendPath, 'src', 'app.module.ts');

  const result = await runAgenticSession({
    model: config.models.build,
    systemPrompt: buildSystemPrompt(),
    tools: [
      makeReadFileTool(config.monorepoRoot),
      makeListFilesTool(config.monorepoRoot),
      makeWriteFileTool(config.monorepoRoot, [gameDir, indexFile, appModuleFile]),
      makeRunShellTool('run_shell', config.gameBackendPath, BUILD_SHELL_ALLOWLIST),
    ],
    initialUserMessage: buildUserMessage(parsedFields, specDocContent, retryFeedback),
    maxTurns: config.maxTurnsPerPhase,
    onEvent,
  });

  if (result.stoppedReason === 'max_turns_exceeded') {
    throw new Error(`Backend build phase exceeded ${config.maxTurnsPerPhase} turns without finishing`);
  }

  const shaAfter = await getHeadSha(config.gameBackendPath);
  if (shaAfter === shaBefore) {
    throw new Error('Backend build phase finished without committing any changes to game_backend');
  }

  return { branch, reportText: result.finalText };
}
