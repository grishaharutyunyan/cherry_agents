import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const monorepoRoot = path.resolve(process.env.MONOREPO_ROOT ?? path.join(__dirname, '..', '..'));

export const config = {
  monorepoRoot,
  gameBackendPath: path.resolve(process.env.GAME_BACKEND_PATH ?? path.join(monorepoRoot, 'game_backend')),
  gameFrontendPath: path.resolve(process.env.GAME_FRONTEND_PATH ?? path.join(monorepoRoot, 'game-frontend')),
  cherryFrontendPath: path.resolve(process.env.CHERRY_FRONTEND_PATH ?? path.join(monorepoRoot, 'cherry_frontend')),
  knowledgeDir: path.join(__dirname, '..', 'knowledge'),

  /**
   * When true, Gemini calls draw from GCP billing/credits via Vertex AI instead
   * of the Gemini Developer API's own billing. Authenticates via standard GCP
   * Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS pointing at
   * a service account key, typically) — NOT an API key, so geminiApiKey isn't
   * required in this mode. GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION and the
   * ADC credentials themselves are read directly by @google/genai and the
   * underlying google-auth-library, not through this config object.
   */
  useVertexAI: process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' || process.env.GOOGLE_GENAI_USE_VERTEXAI === '1',

  get geminiApiKey(): string {
    return required('GEMINI_API_KEY');
  },
  // gemini-2.5-* was retired for new API keys (confirmed live, 2026-08-26 — a
  // 404 with "no longer available to new users... use models/gemini-3.6-flash").
  // gemini-3.6-flash was itself superseded by gemini-3.7-flash (released 2026-08,
  // confirmed via ai.google.dev's changelog, 2026-08-27) — bumped every phase's
  // default to it. Pro-tier for design/build (gemini-3.1-pro-preview, confirmed same
  // date) was considered and deliberately deferred: it's still a preview-tier model,
  // and this pipeline already fights Vertex rate limits on flash alone (see
  // client.ts's generateContentWithRetry and building's sequential-not-parallel
  // dispatch) — swap to it via a GEMINI_MODEL_DESIGN/GEMINI_MODEL_BUILD env override
  // if reasoning quality turns out to be the bottleneck, not rate limits.
  models: {
    parse: process.env.GEMINI_MODEL_PARSE ?? 'gemini-3.7-flash',
    design: process.env.GEMINI_MODEL_DESIGN ?? 'gemini-3.7-flash',
    build: process.env.GEMINI_MODEL_BUILD ?? 'gemini-3.7-flash',
    qa: process.env.GEMINI_MODEL_QA ?? 'gemini-3.7-flash',
  },

  /**
   * Connects to a database dedicated solely to ai_agent_runs/ai_agent_run_events —
   * deliberately NOT the shared app database cherry_backend/cherry_admin_backend use
   * (that's what "DB_MAIN_URI" refers to elsewhere in this monorepo; this is a
   * different, isolated database, hence the different name here).
   */
  get dbUri(): string {
    return required('DB_AGENTS_URI');
  },

  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 10_000),
  lockTtlSeconds: Number(process.env.LOCK_TTL_SECONDS ?? 120),
  maxTurnsPerPhase: Number(process.env.MAX_TURNS_PER_PHASE ?? 40),
  // Build phases iterate (write → lint → build → fix → re-lint...) far more than design/QA do —
  // a real backend build hit the shared 40-turn cap while still doing legitimate work
  // (2026-08-27). Separate, higher default; design/QA stay on maxTurnsPerPhase.
  maxTurnsBuild: Number(process.env.MAX_TURNS_BUILD ?? 70),

  workerId: process.env.HOSTNAME ?? `agents-${process.pid}`,
};
