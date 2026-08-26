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
import { BuildPhaseResult } from './backend-build.phase';

const BUILD_SHELL_ALLOWLIST = [
  ['git', 'status'],
  ['git', 'diff'],
  ['git', 'add'],
  ['git', 'commit'],
  ['npm', 'run', 'lint'],
  ['npm', 'run', 'build'],
];

function buildSystemPrompt(): string {
  const checklist = fs.readFileSync(path.join(config.knowledgeDir, 'adding-a-new-game-frontend.md'), 'utf8');
  const uxTricks = fs.readFileSync(path.join(config.knowledgeDir, 'gambling-ux-tricks.md'), 'utf8');
  return `You implement the Next.js/PixiJS frontend for one new gambling game on the Cherry casino platform, from a spec doc a design agent already wrote. A backend-builder is building the NestJS module in parallel from the same spec, without talking to you — build against the spec's documented WebSocket contract, not against the backend code (it may not exist yet), and don't improvise event/field names.

Every game gets its own original visual identity, animation feel, and motion — never a re-skin of an existing sibling game with the colors swapped. You may read a sibling game as a STRUCTURAL reference only (file layout, WS wiring, animation-loop technique); never copy its layout, palette, or exact animation constants/cadence. See "Never reuse another game's design" in the checklist below for the full rule.

You have four tools: read_file, list_files (whole monorepo, read-only), write_file (scoped only to this game's own directory under game-frontend/games/ and its registration page under game-frontend/app/games/), and run_shell (cwd pinned to game-frontend; allowed: git status/diff/add/commit, npm run lint, npm run build — not a general shell, no pipes/redirects/globs).

Follow this checklist exactly:

--- adding-a-new-game-frontend.md ---
${checklist}

--- gambling-ux-tricks.md ---
${uxTricks}

You are committing directly to an already-checked-out feature branch — do not create or switch branches yourself. When your implementation is complete: stage and commit your changes via run_shell (git add, then git commit -m "<message>"), then run npm run lint and npm run build via run_shell and fix any errors they report before finishing. Do not finish with an uncommitted working tree or a failing lint/build.

When done, reply with plain text (no more tool calls) summarizing the files you created/modified and confirming lint+build passed, and confirming all six mandatory UI pieces from the checklist's §6 are present.`;
}

function buildUserMessage(parsedFields: AiAgentRunParsedFields, specDocContent: string, retryFeedback: string | null): string {
  const base = `Implement the game-frontend module for:

- gameId: ${parsedFields.gameId}
- gameName: ${parsedFields.gameName}
- archetype: ${parsedFields.archetype}
- freebetEnabled: ${parsedFields.freebetEnabled}

Full spec doc (source of truth for the WebSocket contract and provably-fair derivation to surface in the check UI):

---
${specDocContent}
---`;

  if (!retryFeedback) return base;
  return `${base}

This is a RETRY. A QA agent found a problem with the previous build on this same branch:
${retryFeedback}

Read your previous implementation first via read_file/list_files, then fix the issue and commit again (new commit, same branch).`;
}

export async function runFrontendBuildPhase(
  parsedFields: AiAgentRunParsedFields,
  specDocContent: string,
  retryFeedback: string | null,
  onEvent: AgentEventHandler,
): Promise<BuildPhaseResult> {
  const branch = `CHE-${parsedFields.gameId.toUpperCase()}`;
  await ensureBranch(config.gameFrontendPath, branch);
  const shaBefore = await getHeadSha(config.gameFrontendPath);

  const gameDir = path.join(config.gameFrontendPath, 'games', parsedFields.gameId);
  const pageFile = path.join(config.gameFrontendPath, 'app', 'games', parsedFields.gameId, 'page.tsx');

  const result = await runAgenticSession({
    model: config.models.build,
    systemPrompt: buildSystemPrompt(),
    tools: [
      makeReadFileTool(config.monorepoRoot),
      makeListFilesTool(config.monorepoRoot),
      makeWriteFileTool(config.monorepoRoot, [gameDir, pageFile]),
      makeRunShellTool('run_shell', config.gameFrontendPath, BUILD_SHELL_ALLOWLIST),
    ],
    initialUserMessage: buildUserMessage(parsedFields, specDocContent, retryFeedback),
    maxTurns: config.maxTurnsPerPhase,
    onEvent,
  });

  if (result.stoppedReason === 'max_turns_exceeded') {
    throw new Error(`Frontend build phase exceeded ${config.maxTurnsPerPhase} turns without finishing`);
  }

  const shaAfter = await getHeadSha(config.gameFrontendPath);
  if (shaAfter === shaBefore) {
    throw new Error('Frontend build phase finished without committing any changes to game-frontend');
  }

  return { branch, reportText: result.finalText };
}
