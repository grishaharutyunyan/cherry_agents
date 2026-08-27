import * as fs from 'fs';
import * as path from 'path';

import { config } from '../../config';
import { getModelForPhase } from '../../db/model-config.repo';
import { AiAgentRunParsedFields } from '../../db/types';
import { commitAll, discardChanges, ensureBranch } from '../../git/repo';
import { gameBranchName } from '../../orchestrator/naming';
import { runAgenticSession } from '../client';
import { makeListFilesTool } from '../tools/list-files.tool';
import { makeReadFileTool } from '../tools/read-file.tool';
import { makeWriteFileTool } from '../tools/write-file.tool';
import { AgentEventHandler } from '../types';

export interface DesignUxPhaseResult {
  designUxContent: string;
  designUxDocPath: string;
  designTokensContent: string;
  designTokensDocPath: string;
  reportText: string;
}

function buildSystemPrompt(): string {
  const knowledge = fs.readFileSync(path.join(config.knowledgeDir, 'game-visual-identity.md'), 'utf8');
  return `You are the Design & UX lead for one new gambling game on the Cherry casino platform. A math/RTP spec for this game already exists — you do not touch math, paytables, or the WebSocket contract, but you DO read the spec, because both of your deliverables must be grounded in this game's real paytable and multiplier range, not generic. You write via the write_file tool. A frontend-builder will read both of your deliverables alongside the math spec when it builds the game's actual UI; QA and the Lead Orchestrator will verify the second deliverable is faithfully implemented.

You have three tools: read_file, list_files (both scoped to the whole monorepo, read-only), and write_file (scoped only to the game_backend/docs/ai-agent-handoffs/ directory — you cannot write anywhere else).

Read docs/knowledge/game-visual-identity.md (its full content is included below) for this house's actual visual conventions. There is no shared design-token system across games — every existing game invents its own palette — so your job is to make one deliberate, original choice for this game, not to reuse another game's exact palette. You may use read_file/list_files to look at an existing game's frontend under game-frontend/games/ (e.g. colorful-plinko/constants.ts) purely to see how palettes are expressed in this codebase, never to copy one wholesale.

You produce TWO files, via two separate write_file calls:

1. **The prose brief** (path given to you below) — sections, in order:
   a. Game ID & name.
   b. Visual anchor — one paragraph describing the core visual mood/style everything else derives from.
   c. Palette — the same colors as file 2's colorTokens, described in words (role + one-line reasoning each).
   d. Narrative/theme — 2-4 sentences tying the visual anchor to the game's mechanics.
   e. UI layout notes — brief notes for the frontend-builder's own judgment on where the mandatory UI surface should live given this visual anchor, and the "juice" tone in prose (what Base/Big/Mega Win should *feel* like) — the numbers themselves live in file 2.

2. **The design-tokens JSON** (path given to you below) — MUST be valid JSON, no markdown fences, no commentary, matching exactly this shape:
   \`\`\`json
   {
     "colorTokens": {
       "main_bg": "#hex", "surface": "#hex", "accent": "#hex", "text_primary": "#hex",
       "win_glow": "#hex", "loss_dim": "#hex", "multiplier_hot": "#hex", "multiplier_cold": "#hex"
     },
     "animationTiers": [
       { "id": "base", "minMultiplier": <number>, "maxMultiplier": <number>, "effects": ["..."], "counterDurationMs": <number> },
       { "id": "big",  "minMultiplier": <number>, "maxMultiplier": <number>, "effects": ["..."], "counterDurationMs": <number> },
       { "id": "mega", "minMultiplier": <number>, "maxMultiplier": null,     "effects": ["..."], "counterDurationMs": <number> }
     ]
   }
   \`\`\`
   The three tiers are always exactly Base/Big/Mega, in that order — but the min/maxMultiplier
   boundaries must be DERIVED FROM THIS GAME'S OWN REAL MULTIPLIER RANGE in the spec doc below, not
   copied from an example. A low top-multiplier game (e.g. max 5x) needs tiers that fit inside that
   range — a "mega" tier starting at 10x would be unreachable and wrong. A high top-multiplier game
   (e.g. max 1000x) needs boundaries scaled accordingly. Use your judgment on the split; there's no
   fixed formula. \`effects\` are free-text effect-category labels (e.g. "scalePulse", "screenShake",
   "particleBurst", "screenDim", "particleFountain", "colorStrobe") — descriptive labels for a human
   and for the Lead Orchestrator's later tone judgment, not a fixed vocabulary or function names the
   frontend must call by that exact name. No shared animation library exists in this codebase and
   none should be assumed — the frontend-builder implements each effect with its own bespoke code.

Before finishing: re-read file 2 and confirm it's syntactically valid JSON matching the shape above exactly (correct key names, tiers in order, numbers not strings) — a malformed tokens file breaks every downstream step that reads it.

When you are done writing both files, reply with plain text (no more tool calls) summarizing the visual anchor, palette, and the three tier boundaries you chose (with a one-line reason for where you drew them).

--- docs/knowledge/game-visual-identity.md ---
${knowledge}`;
}

function buildUserMessage(
  parsedFields: AiAgentRunParsedFields,
  specDocContent: string,
  designUxDocPath: string,
  designTokensDocPath: string,
  feedback: string | null,
): string {
  const base = `Write the visual-identity brief and design-tokens JSON for this game:

- gameId: ${parsedFields.gameId}
- gameName: ${parsedFields.gameName}
- archetype: ${parsedFields.archetype}
- category: ${parsedFields.category}
- description: ${parsedFields.description}

Full math/RTP spec doc (source of truth for the real paytable and multiplier range — derive the
animation tier boundaries from this, not from any example):

---
${specDocContent}
---

Write file 1 via write_file to exactly this path: ${designUxDocPath}
Write file 2 via write_file to exactly this path: ${designTokensDocPath}`;

  if (!feedback) return base;

  return `${base}

This is a REVISION of files you (or a prior run) already wrote at those same paths. The reviewer requested changes:
"${feedback}"

Read both existing files first via read_file, then rewrite whichever one(s) the feedback implicates via write_file, in place.`;
}

export async function runDesignUxPhase(
  parsedFields: AiAgentRunParsedFields,
  specDocContent: string,
  approvalFeedback: string | null,
  onEvent: AgentEventHandler,
): Promise<DesignUxPhaseResult> {
  const handoffsDir = path.join(config.gameBackendPath, 'docs', 'ai-agent-handoffs');
  const designUxDocPath = `game_backend/docs/ai-agent-handoffs/HANDOFF_${parsedFields.fileSlug}_DESIGN_UX.md`;
  const designUxAbsPath = path.join(handoffsDir, `HANDOFF_${parsedFields.fileSlug}_DESIGN_UX.md`);
  const designTokensDocPath = `game_backend/docs/ai-agent-handoffs/HANDOFF_${parsedFields.fileSlug}_DESIGN_TOKENS.json`;
  const designTokensAbsPath = path.join(handoffsDir, `HANDOFF_${parsedFields.fileSlug}_DESIGN_TOKENS.json`);

  // Same branch as the design phase — this phase runs immediately after it, on the same
  // already-checked-out feature branch. ensureBranch is a safe no-op if already on it.
  await ensureBranch(config.gameBackendPath, gameBranchName(parsedFields.gameId));

  try {
    // No dedicated "design_ux" row in ai_agent_model_config (only parse/design/build/qa are
    // seeded) — this phase is small and adjacent to design, so it reuses the design model rather
    // than adding a fifth config row + admin UI field for one more phase.
    const model = await getModelForPhase('design');
    const result = await runAgenticSession({
      model,
      systemPrompt: buildSystemPrompt(),
      tools: [
        makeReadFileTool(config.monorepoRoot),
        makeListFilesTool(config.monorepoRoot),
        makeWriteFileTool(config.monorepoRoot, [handoffsDir]),
      ],
      initialUserMessage: buildUserMessage(parsedFields, specDocContent, designUxDocPath, designTokensDocPath, approvalFeedback),
      maxTurns: config.maxTurnsPerPhase,
      onEvent,
      requireToolCall: {
        toolName: 'write_file',
        nudgeMessage:
          `You finished without ever calling write_file — neither deliverable has been written yet. ` +
          `Write both files now via write_file: the brief to ${designUxDocPath}, and the tokens JSON to ${designTokensDocPath}.`,
      },
    });

    if (result.stoppedReason === 'max_turns_exceeded') {
      throw new Error(`Design & UX phase exceeded ${config.maxTurnsPerPhase} turns without finishing`);
    }

    const missing = [
      !fs.existsSync(designUxAbsPath) ? designUxDocPath : null,
      !fs.existsSync(designTokensAbsPath) ? designTokensDocPath : null,
    ].filter((p): p is string => p !== null);
    if (missing.length > 0) {
      throw new Error(
        `Design & UX phase finished but did not write: ${missing.join(', ')}. ` +
          `Model's final text (after ${result.turns} turn(s)): ${result.finalText.slice(0, 2000)}`,
      );
    }

    const designTokensContent = fs.readFileSync(designTokensAbsPath, 'utf8');
    try {
      JSON.parse(designTokensContent);
    } catch (err) {
      throw new Error(
        `Design & UX phase wrote ${designTokensDocPath} but it isn't valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Commit deterministically here rather than relying on the model to do it — this is what
    // keeps the working tree clean for the building phase's own ensureBranch()/commit, and
    // there's nothing design-specific for the model to decide about how these two files get
    // committed. Conventional Commits, lowercase type + subject — game_backend's commit-msg hook
    // (commitlint, @commitlint/config-conventional) rejects anything else.
    await commitAll(config.gameBackendPath, `docs: add ${parsedFields.gameId} design & ux brief + design tokens`);

    return {
      designUxContent: fs.readFileSync(designUxAbsPath, 'utf8'),
      designUxDocPath,
      designTokensContent,
      designTokensDocPath,
      reportText: result.finalText,
    };
  } catch (err) {
    // See design.phase.ts's identical catch for why: an uncommitted partial write from a failed
    // session must never poison this branch for a retry or an unrelated later run.
    await discardChanges(config.gameBackendPath);
    throw err;
  }
}
