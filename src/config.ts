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

  get geminiApiKey(): string {
    return required('GEMINI_API_KEY');
  },
  // gemini-2.5-* was retired for new API keys (confirmed live, 2026-08-26 — a
  // 404 with "no longer available to new users... use models/gemini-3.6-flash").
  // Defaulting every phase to the confirmed-working flash tier for now; upgrade
  // design/build to a pro-tier model via env override once you've confirmed its
  // exact current name (not verified here — don't guess a second model name off
  // one error message).
  models: {
    parse: process.env.GEMINI_MODEL_PARSE ?? 'gemini-3.6-flash',
    design: process.env.GEMINI_MODEL_DESIGN ?? 'gemini-3.6-flash',
    build: process.env.GEMINI_MODEL_BUILD ?? 'gemini-3.6-flash',
    qa: process.env.GEMINI_MODEL_QA ?? 'gemini-3.6-flash',
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

  workerId: process.env.HOSTNAME ?? `agents-${process.pid}`,
};
