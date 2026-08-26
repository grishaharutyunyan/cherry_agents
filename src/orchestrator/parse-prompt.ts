import { GoogleGenAI } from '@google/genai';

import { config } from '../config';
import { AiAgentRunParsedFields } from '../db/types';

const PARSED_FIELDS_SCHEMA = {
  type: 'object',
  properties: {
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
  required: [
    'gameId',
    'gameName',
    'gameSlug',
    'fileSlug',
    'archetype',
    'rtpTarget',
    'minBet',
    'maxBet',
    'freebetEnabled',
    'category',
    'description',
  ],
};

const REQUIRED_NON_DEFAULTABLE_FIELDS: (keyof AiAgentRunParsedFields)[] = ['gameName', 'rtpTarget', 'freebetEnabled'];

/**
 * Mirrors create-game.md's "parse prompt → structured fields" step: a single zero-tool,
 * structured-output Gemini call, not an agentic loop. Returns null if a required field
 * couldn't be determined from the prompt — the orchestrator fails the run with a clear
 * message rather than guessing (see M2 scope note in orchestrator.ts).
 */
export async function parsePrompt(
  prompt: string,
  overrides: Record<string, unknown> | null,
): Promise<AiAgentRunParsedFields | null> {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  const response = await ai.models.generateContent({
    model: config.models.parse,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Extract a structured game-creation spec from this admin prompt for a casino gaming platform. ' +
              'If a numeric/boolean field is not stated or clearly implied, make your best reasonable default ' +
              'given the archetype (default RTP 96.5 within the 95.0-97.0 platform range, freebetEnabled false ' +
              'unless requested, minBet 10 / maxBet 10000 in CherryCoin unless stated).\n\n' +
              `Prompt: "${prompt}"\n\n` +
              (overrides ? `Admin-supplied overrides (these take precedence): ${JSON.stringify(overrides)}` : ''),
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
  if (!text) return null;

  let parsed: Partial<AiAgentRunParsedFields>;
  try {
    parsed = JSON.parse(text) as Partial<AiAgentRunParsedFields>;
  } catch {
    return null;
  }

  const merged: Partial<AiAgentRunParsedFields> = { ...parsed, ...(overrides ?? {}) };
  const missing = REQUIRED_NON_DEFAULTABLE_FIELDS.filter(
    (field) => merged[field] === undefined || merged[field] === null,
  );
  if (missing.length > 0) return null;

  return merged as AiAgentRunParsedFields;
}
