import { AiAgentRunParsedFields } from '../db/types';
import { getModelForPhase } from '../db/model-config.repo';
import { getClient } from '../gemini/client';

const PARSED_FIELDS_SCHEMA = {
  type: 'object',
  properties: {
    clarificationQuestion: {
      type: 'string',
      description:
        'Set this ONLY if you genuinely cannot make a reasonable determination for gameName, rtpTarget, or ' +
        'freebetEnabled from the prompt (or any other field where a wrong guess would be costly, e.g. an ' +
        'archetype that is completely unclear). Ask ONE specific question that would unblock you. If you set ' +
        'this, leave every other field empty — do not guess just to fill the schema.',
    },
    gameId: { type: 'string', description: 'kebab-case game id, e.g. "neon-multiplier-wheel"' },
    gameName: { type: 'string', description: 'Human-readable display name, e.g. "Neon Multiplier Wheel"' },
    gameSlug: { type: 'string', description: 'Same as gameId, kebab-case' },
    fileSlug: { type: 'string', description: 'SCREAMING_SNAKE_CASE version, e.g. "NEON_MULTIPLIER_WHEEL"' },
    archetype: { type: 'string', description: 'Closest existing game family, e.g. plinko, crash, wheel, mines, dice, cards, keno' },
    rtpTarget: { type: 'number', description: 'Target RTP as a percentage number, e.g. 96.5 (platform range: 95.0-97.0)' },
    minBet: { type: 'number' },
    maxBet: { type: 'number' },
    freebetEnabled: { type: 'boolean' },
    category: { type: 'string' },
    description: { type: 'string', description: 'One-paragraph restatement of the requested game' },
  },
};

const REQUIRED_NON_DEFAULTABLE_FIELDS: (keyof AiAgentRunParsedFields)[] = ['gameName', 'rtpTarget', 'freebetEnabled'];

export type ParsePromptResult =
  | { status: 'ok'; fields: AiAgentRunParsedFields }
  | { status: 'needs_clarification'; question: string }
  | { status: 'failed'; reason: string };

/**
 * Mirrors create-game.md's "parse prompt → structured fields" step: a single zero-tool,
 * structured-output Gemini call, not an agentic loop.
 *
 * The model itself decides when it needs clarification (via the clarificationQuestion field in
 * the schema) rather than this function checking a hardcoded list of "critical" fields — that's
 * the primary path. REQUIRED_NON_DEFAULTABLE_FIELDS is only a safety net for the case where the
 * model didn't ask but also didn't fill a field it can't legitimately default (e.g. it missed the
 * instruction) — that also produces a clarification question, never a silent guess or a hard
 * failure. `failed` is reserved for genuine technical errors (empty/unparseable response).
 */
export async function parsePrompt(
  prompt: string,
  overrides: Record<string, unknown> | null,
  priorClarification: { question: string; answer: string } | null,
): Promise<ParsePromptResult> {
  const ai = await getClient();
  const model = await getModelForPhase('parse');

  const followUp = priorClarification
    ? `\n\nThis is a FOLLOW-UP. You previously asked: "${priorClarification.question}"\nThe admin answered: "${priorClarification.answer}"\nUse this answer to finalize your determination. Only set clarificationQuestion again if you are still genuinely blocked after accounting for this answer.`
    : '';

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Extract a structured game-creation spec from this admin prompt for a casino gaming platform. ' +
              'If a numeric/boolean field is not stated or clearly implied, make your best reasonable default ' +
              'given the archetype (default RTP 96.5 within the 95.0-97.0 platform range, freebetEnabled false ' +
              'unless requested, minBet 10 / maxBet 10000 in CherryCoin unless stated). Only ask for ' +
              'clarification on something a reasonable default would get wrong in a costly way — see the ' +
              'clarificationQuestion field description.\n\n' +
              `Prompt: "${prompt}"\n\n` +
              (overrides ? `Admin-supplied overrides (these take precedence): ${JSON.stringify(overrides)}` : '') +
              followUp,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: PARSED_FIELDS_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) return { status: 'failed', reason: 'Gemini returned an empty response for the parse phase.' };

  let parsed: Partial<AiAgentRunParsedFields> & { clarificationQuestion?: string | null };
  try {
    parsed = JSON.parse(text) as Partial<AiAgentRunParsedFields> & { clarificationQuestion?: string | null };
  } catch {
    return { status: 'failed', reason: `Gemini's parse-phase response was not valid JSON: ${text.slice(0, 500)}` };
  }

  if (parsed.clarificationQuestion) {
    return { status: 'needs_clarification', question: parsed.clarificationQuestion };
  }

  const merged: Partial<AiAgentRunParsedFields> = { ...parsed, ...(overrides ?? {}) };
  const missing = REQUIRED_NON_DEFAULTABLE_FIELDS.filter(
    (field) => merged[field] === undefined || merged[field] === null,
  );
  if (missing.length > 0) {
    return {
      status: 'needs_clarification',
      question: `Could not determine ${missing.join(', ')} from the prompt — please provide ${missing.length === 1 ? 'it' : 'them'}.`,
    };
  }

  return { status: 'ok', fields: merged as AiAgentRunParsedFields };
}
