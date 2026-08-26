import * as fs from 'fs';
import * as path from 'path';

import { config } from '../../config';
import { AiAgentRunParsedFields } from '../../db/types';
import { runAgenticSession } from '../client';
import { makeListFilesTool } from '../tools/list-files.tool';
import { makeReadFileTool } from '../tools/read-file.tool';
import { makeWriteFileTool } from '../tools/write-file.tool';
import { AgentEventHandler } from '../types';

export interface DesignPhaseResult {
  specDocContent: string;
  /** Repo-relative path (from the monorepo root), e.g. "game_backend/.claude/handoffs/HANDOFF_X_SPEC.md" */
  specDocPath: string;
  reportText: string;
}

function buildSystemPrompt(): string {
  const knowledge = fs.readFileSync(path.join(config.knowledgeDir, 'gambling-math-rtp.md'), 'utf8');
  return `You design the math for one new gambling game on the Cherry casino platform. You do not write game code — your only deliverable is a spec document, written via the write_file tool. A backend-builder and a frontend-builder will build from what you write, in parallel, without talking to each other — so be exact about names, numbers, and event shapes.

You have three tools: read_file, list_files (both scoped to the whole monorepo, read-only), and write_file (scoped only to the game_backend/.claude/handoffs/ directory — you cannot write anywhere else).

Read docs/knowledge/gambling-math-rtp.md (its full content is included below) — the house's provably-fair and RTP conventions. Follow them; don't invent a different HMAC scheme or RTP shape. You may also use read_file/list_files to look at an existing game's implementation under game_backend/src/games/ for the closest archetype (plinko→ladder/bitstream, mines→reveal/shuffle, dice-wheel→threshold, keno→hypergeometric draw, hilo→card sequence) and at game_backend/.claude/handoffs/HANDOFF_PLINKO.md as a reference for the level of detail and format your own spec should have.

Your spec document must have these sections, in this order:
1. Game ID & name.
2. Provably-fair derivation — bitstream or shuffle (per the conventions below), the exact HMAC input string format, and the exact bit/byte-to-outcome mapping, as a numbered algorithm.
3. RTP model — state whether you're using flat-constant or hand-tuned-table shape, give the actual formula or table, then show a worked calculation (Σ P(outcome)·multiplier evaluated to a number) confirming it's within 0.5% of the target RTP. If it's not, adjust the constant/table and recompute — do not report a spec whose own worked math misses the target.
4. Paytable / multiplier table (if the archetype uses one) — the actual array, indexed exactly as the backend-builder will need to hardcode it.
5. Bet limits — the minBet/maxBet you were given, whether a computeMaxBet() ceiling is needed (only if the top multiplier varies by player-chosen config), and if so the ABSOLUTE_MAX_WIN value you're proposing, justified in one line against similar-risk existing games.
6. freebetEnabled — the value you were given, plus one line of reasoning tying it to the max-win exposure above.
7. WebSocket contract — exact event names and payload shapes for game_started, game_result, and any game-specific broadcast event, plus client→server actions (start_game, game_action if needed, finish_game). This is the single source of truth the frontend-builder will build against.
8. Redis round state shape — the TypeScript interface for what gets stored at round:<roundId>, extending IGameRound, with TTL (default 30 min unless you have a specific reason to deviate — state the reason if so).
9. Files this implies — the exact files a backend-builder and a frontend-builder should create.

Before finishing: re-read your own worked RTP calculation. If you can't show the arithmetic landing within tolerance of the target, you're not done — fix the constant/table and recompute. A spec with an unverified RTP claim is a QA failure waiting to happen.

When you are done writing the spec file, reply with plain text (no more tool calls) summarizing: the RTP you landed on, the paytable/multiplier summary, and the WS contract in one or two sentences each.

--- docs/knowledge/gambling-math-rtp.md ---
${knowledge}`;
}

function buildUserMessage(parsedFields: AiAgentRunParsedFields, specDocPath: string, feedback: string | null): string {
  const base = `Design the math spec for this game:

- gameId: ${parsedFields.gameId}
- gameName: ${parsedFields.gameName}
- archetype: ${parsedFields.archetype}
- target RTP: ${parsedFields.rtpTarget}%
- minBet: ${parsedFields.minBet}
- maxBet: ${parsedFields.maxBet}
- freebetEnabled: ${parsedFields.freebetEnabled}
- category: ${parsedFields.category}
- description: ${parsedFields.description}

Write the complete spec document via write_file to exactly this path (relative to the monorepo root): ${specDocPath}`;

  if (!feedback) return base;

  return `${base}

This is a REVISION of a spec you (or a prior run) already wrote at that same path. The admin reviewer requested changes:
"${feedback}"

Read the existing file at ${specDocPath} first via read_file, then rewrite it in place via write_file addressing the feedback.`;
}

export async function runDesignPhase(
  parsedFields: AiAgentRunParsedFields,
  approvalFeedback: string | null,
  onEvent: AgentEventHandler,
): Promise<DesignPhaseResult> {
  const handoffsDir = path.join(config.gameBackendPath, '.claude', 'handoffs');
  const specDocPath = `game_backend/.claude/handoffs/HANDOFF_${parsedFields.fileSlug}_SPEC.md`;
  const specAbsPath = path.join(config.gameBackendPath, '.claude', 'handoffs', `HANDOFF_${parsedFields.fileSlug}_SPEC.md`);

  const result = await runAgenticSession({
    model: config.models.design,
    systemPrompt: buildSystemPrompt(),
    tools: [
      makeReadFileTool(config.monorepoRoot),
      makeListFilesTool(config.monorepoRoot),
      makeWriteFileTool(config.monorepoRoot, [handoffsDir]),
    ],
    initialUserMessage: buildUserMessage(parsedFields, specDocPath, approvalFeedback),
    maxTurns: config.maxTurnsPerPhase,
    onEvent,
  });

  if (result.stoppedReason === 'max_turns_exceeded') {
    throw new Error(`Design phase exceeded ${config.maxTurnsPerPhase} turns without finishing`);
  }
  if (!fs.existsSync(specAbsPath)) {
    throw new Error(`Design phase finished but did not write the expected spec file: ${specDocPath}`);
  }

  return {
    specDocContent: fs.readFileSync(specAbsPath, 'utf8'),
    specDocPath,
    reportText: result.finalText,
  };
}
