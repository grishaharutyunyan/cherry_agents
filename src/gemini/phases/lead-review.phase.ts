import { config } from '../../config';
import { getModelForPhase } from '../../db/model-config.repo';
import { AiAgentRunParsedFields, AiAgentRunQaCheck } from '../../db/types';
import { checkoutBranch } from '../../git/repo';
import { runAgenticSession } from '../client';
import { makeListFilesTool } from '../tools/list-files.tool';
import { makeReadFileTool } from '../tools/read-file.tool';
import { makeReportResultTool } from '../tools/report-result.tool';
import { AgentEventHandler } from '../types';

const REPORT_TOOL_NAME = 'report_lead_review';

const LEAD_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'reject'] },
    reasoning: {
      type: 'string',
      description: '1-3 sentences: why this does or does not match what was actually requested.',
    },
    revisionNotes: {
      type: 'string',
      description:
        'Only meaningful when verdict is reject — specific, actionable feedback, sent verbatim to the ' +
        'team named in routeHint. Leave empty when approving.',
    },
    routeHint: {
      type: 'string',
      enum: ['design', 'backend', 'frontend', 'ambiguous'],
      description:
        'Only meaningful when verdict is reject. "design" = the math/spec itself is what\'s wrong; ' +
        '"backend"/"frontend" = that side\'s implementation doesn\'t match a correct spec; "ambiguous" = ' +
        "can't tell which side is at fault.",
    },
  },
  required: ['verdict', 'reasoning'],
};

export interface LeadReviewResult {
  verdict: 'approve' | 'reject';
  reasoning: string;
  revisionNotes: string | null;
  routeHint: 'design' | 'backend' | 'frontend' | 'ambiguous' | null;
}

function buildSystemPrompt(): string {
  return `You are the Lead Orchestrator for an automated game-creation pipeline, acting as an LLM-as-judge supervisor. Structural QA already passed on this build — RTP simulation, lint, build, and the WebSocket-contract diff are all clean. Your evaluation is different and happens only after that: judge whether the shipped game genuinely satisfies what was actually requested, semantically — not just whether it's structurally sound. You never modify code — you only report a verdict, once.

If a design-tokens JSON is provided below, QA has already confirmed (structurally) that each of the three animation tiers has a real conditional branch with real code in it — that is NOT your job to re-check. Your job is the layer QA can't judge: read the actual effect code inside each tier's branch and decide whether it delivers the tone the visual-identity brief and original prompt describe, not just whether something fires. A bare CSS scale transition inside the "mega" tier when the brief calls for "a continuous particle fountain and a decelerating counter roll-up" is a real mismatch worth rejecting, even though QA already passed it — name the specific tier and the specific gap in your revisionNotes.

You have three tools: read_file, list_files (both scoped to the whole monorepo, read-only — use them to inspect the real shipped code under game_backend/src/games/<id> and game-frontend/games/<id> if the spec/QA summary alone don't settle your judgment) and report_lead_review (call this exactly once, as your final action — do not also reply with a plain-text final answer).

Approve unless there is a genuine, specific mismatch between what was asked and what was built — do not reject over style, phrasing, or anything equally valid to what was requested. A careful human reviewer will see your verdict either way (approving forwards to their review gate; rejecting sends the revision back to a worker first) — your job is to catch real problems before spending the human's time, not to gatekeep on taste.`;
}

function buildUserMessage(
  prompt: string,
  overrides: Record<string, unknown> | null,
  parsedFields: AiAgentRunParsedFields,
  specDocContent: string,
  designUxContent: string | null,
  designTokensContent: string | null,
  qaSummary: string,
  qaChecks: AiAgentRunQaCheck[],
): string {
  const qaTable = qaChecks.map((c) => `- ${c.check}: ${c.pass ? 'PASS' : 'FAIL'}`).join('\n');
  const tokensSection = designTokensContent
    ? `

--- Design tokens JSON (QA already confirmed each tier's conditional is wired — judge the effect code's TONE, not its presence) ---
${designTokensContent}
---`
    : '';
  return `Original request: "${prompt}"
${overrides ? `Admin-supplied overrides (authoritative over anything in the prompt): ${JSON.stringify(overrides)}` : ''}

Parsed requirements:
${JSON.stringify(parsedFields, null, 2)}

--- Math/RTP spec doc ---
${specDocContent}
---

--- Visual identity brief ---
${designUxContent ?? '(none produced — not itself a reason to reject unless the request explicitly called for one)'}
---${tokensSection}

--- QA result (structural checks, already passed) ---
${qaSummary}
${qaTable}
---

gameId: ${parsedFields.gameId} — inspect game_backend/src/games/${parsedFields.gameId}/ and game-frontend/games/${parsedFields.gameId}/ via read_file/list_files if you need to see the actual shipped code before judging (both branches are already checked out).

When finished, call report_lead_review with your verdict.`;
}

/**
 * Runs after QA passes (see orchestrator.ts's handleQa → 'lead_review', not 'awaiting_finalize_approval'
 * directly), reads the real shipped code via the same read-only tool shape qa.phase.ts uses, and
 * reports a structured verdict via the report_lead_review terminal tool. Reuses the 'qa'
 * model-config row rather than adding a dedicated 'lead_review' phase to ai_agent_model_config —
 * an evaluative task, closer in kind to QA's than to design's generative one, and a 5th config row
 * + admin UI field isn't warranted for one phase (same reasoning as design-ux.phase.ts reusing
 * 'design').
 */
export async function runLeadReviewPhase(
  prompt: string,
  overrides: Record<string, unknown> | null,
  parsedFields: AiAgentRunParsedFields,
  specDocContent: string,
  designUxContent: string | null,
  designTokensContent: string | null,
  qaSummary: string,
  qaChecks: AiAgentRunQaCheck[],
  backendBranch: string,
  frontendBranch: string,
  onEvent: AgentEventHandler,
): Promise<LeadReviewResult> {
  await checkoutBranch(config.gameBackendPath, backendBranch);
  await checkoutBranch(config.gameFrontendPath, frontendBranch);

  const model = await getModelForPhase('qa');
  const result = await runAgenticSession({
    model,
    systemPrompt: buildSystemPrompt(),
    tools: [
      makeReadFileTool(config.monorepoRoot),
      makeListFilesTool(config.monorepoRoot),
      makeReportResultTool(
        REPORT_TOOL_NAME,
        'Report the final semantic-fit verdict. Call exactly once, as your last action.',
        LEAD_REVIEW_SCHEMA,
      ),
    ],
    initialUserMessage: buildUserMessage(
      prompt,
      overrides,
      parsedFields,
      specDocContent,
      designUxContent,
      designTokensContent,
      qaSummary,
      qaChecks,
    ),
    maxTurns: config.maxTurnsPerPhase,
    terminalTool: REPORT_TOOL_NAME,
    onEvent,
  });

  // Fail-open in every "couldn't get a real verdict" case: an evaluator that can't produce one
  // must never block the run. Approve and let the existing human gate (awaiting_finalize_approval)
  // catch anything actually wrong — this phase is a pre-filter on top of that gate, not a
  // replacement for it.
  if (result.stoppedReason === 'max_turns_exceeded' || !result.structuredResult) {
    return {
      verdict: 'approve',
      reasoning: 'Lead review session did not produce a verdict — auto-approved, forwarding to human review.',
      revisionNotes: null,
      routeHint: null,
    };
  }

  const parsed = result.structuredResult as unknown as Partial<LeadReviewResult>;
  if (parsed.verdict !== 'approve' && parsed.verdict !== 'reject') {
    return {
      verdict: 'approve',
      reasoning: `Lead review returned an unexpected shape (${JSON.stringify(result.structuredResult)}) — auto-approved, forwarding to human review.`,
      revisionNotes: null,
      routeHint: null,
    };
  }

  return {
    verdict: parsed.verdict,
    reasoning: parsed.reasoning ?? '(no reasoning given)',
    revisionNotes: parsed.verdict === 'reject' ? parsed.revisionNotes ?? parsed.reasoning ?? null : null,
    routeHint: parsed.verdict === 'reject' ? parsed.routeHint ?? 'ambiguous' : null,
  };
}
