import * as fs from 'fs';
import * as path from 'path';

import { config } from '../../config';
import { AiAgentRunParsedFields } from '../../db/types';
import { discardChanges, ensureBranch, getHeadSha, isClean } from '../../git/repo';
import { gameBranchName } from '../../orchestrator/naming';
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

You are committing directly to an already-checked-out feature branch — do not create or switch branches yourself. When your implementation is complete: stage and commit your changes via run_shell (git add, then git commit -m "<message>" — this repo's commit-msg hook enforces Conventional Commits: "<type>: <lowercase subject>", type one of build/chore/ci/docs/feat/fix/perf/refactor/revert/style/test, e.g. "feat: add plinko-star game backend module" — a capitalized or sentence-case subject will be rejected), then run npm run lint and npm run build via run_shell and fix any errors they report before finishing. Commit as your LAST substantive action — if you write or fix anything after that commit (e.g. to address a lint/build error), you must commit again before finishing. Do not finish with an uncommitted working tree or a failing lint/build.

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
  const branch = gameBranchName(parsedFields.gameId);
  await ensureBranch(config.gameBackendPath, branch);
  const shaBefore = await getHeadSha(config.gameBackendPath);

  const gameDir = path.join(config.gameBackendPath, 'src', 'games', parsedFields.gameId);
  const indexFile = path.join(config.gameBackendPath, 'src', 'games', 'index.ts');
  const appModuleFile = path.join(config.gameBackendPath, 'src', 'app.module.ts');

  try {
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
      requireToolCall: {
        toolName: 'run_shell',
        nudgeMessage:
          'You finished without ever calling run_shell — nothing has been committed yet. Run ' +
          'run_shell with command "git" args ["add","-A"], then command "git" args ["commit","-m","<message>"], ' +
          'then npm run lint and npm run build via run_shell (fix any errors they report), and only then finish.',
      },
    });

    if (result.stoppedReason === 'max_turns_exceeded') {
      throw new Error(`Backend build phase exceeded ${config.maxTurnsPerPhase} turns without finishing`);
    }

    const shaAfter = await getHeadSha(config.gameBackendPath);
    if (shaAfter === shaBefore) {
      throw new Error(
        `Backend build phase finished without committing any changes to game_backend. ` +
          `Model's final text (after ${result.turns} turn(s)): ${result.finalText.slice(0, 2000)}`,
      );
    }
    // A commit happened, but the model may have kept writing after it — sha changing only proves
    // AT LEAST one commit happened, not that everything is committed (real precedent: a frontend
    // build committed once, then wrote more files, then finished with those still uncommitted).
    if (!(await isClean(config.gameBackendPath))) {
      throw new Error(
        `Backend build phase committed once but left further uncommitted changes afterward — ` +
          `every write must be committed before finishing, not just the first batch. ` +
          `Model's final text (after ${result.turns} turn(s)): ${result.finalText.slice(0, 2000)}`,
      );
    }

    return { branch, reportText: result.finalText };
  } catch (err) {
    // Whatever the model wrote before failing was never committed — discard it so this branch
    // is left clean for a retry, and so an unrelated future run touching a different branch
    // never inherits this failure's leftover dirty state (real precedent: exactly that happened,
    // 2026-08-27).
    await discardChanges(config.gameBackendPath);
    throw err;
  }
}
