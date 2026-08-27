import { pool } from './client';

export type AiAgentModelPhase = 'parse' | 'design' | 'build' | 'qa';

/**
 * DB-backed, not env-var — this is the one thing about the pipeline an admin should be able to
 * change without a redeploy. Real precedent: swapping gemini-3.6-flash for gemini-3.7-flash
 * required editing config.ts, redeploying, AND separately fixing an env-var override on the
 * staging VPS that silently beat the code default (2026-08-27). Read fresh on every phase
 * invocation, not cached — the table is one row per phase and this is called once per phase
 * start, not per turn, so the query cost is negligible.
 *
 * No fallback default on a missing row: a renamed/missing phase should fail loudly here, not
 * silently fall back to some hardcoded value that can go stale exactly the way the env var did.
 */
export async function getModelForPhase(phase: AiAgentModelPhase): Promise<string> {
  const { rows } = await pool.query<{ model: string }>('SELECT model FROM ai_agent_model_config WHERE phase = $1', [
    phase,
  ]);
  const model = rows[0]?.model;
  if (!model) {
    throw new Error(`No model configured for phase "${phase}" in ai_agent_model_config — check the table's seeded rows.`);
  }
  return model;
}
