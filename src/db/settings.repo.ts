import { pool } from './client';

/**
 * Generic key/value settings, admin-editable without a redeploy — same rationale as
 * model-config.repo.ts's getModelForPhase (see its comment): started with the Vertex AI
 * location, since GOOGLE_CLOUD_LOCATION being hardcoded to a regional value was the actual
 * cause of a real outage (every Gemini 3.x model 404s outside "global" on Vertex AI,
 * 2026-08-27) that needed a VPS env-var edit + container restart to fix. Read fresh on every
 * call, no caching. No fallback default on a missing key — fail loudly, not silently.
 */
export async function getSetting(key: string): Promise<string> {
  const { rows } = await pool.query<{ value: string }>('SELECT value FROM ai_agent_settings WHERE key = $1', [key]);
  const value = rows[0]?.value;
  if (!value) {
    throw new Error(`No setting "${key}" in ai_agent_settings — check the table's seeded rows.`);
  }
  return value;
}
