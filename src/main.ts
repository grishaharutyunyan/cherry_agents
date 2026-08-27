import { config } from './config';
import { pool } from './db/client';
import { tryAcquireGitLock } from './db/git-lock';
import { runMigrations } from './db/migrate';
import { claimNextPendingRun } from './db/runs.repo';
import { runOnePhaseStep } from './orchestrator/orchestrator';

async function tick(): Promise<void> {
  const run = await claimNextPendingRun();
  if (!run) return;
  console.log(`[agents] claimed run ${run.id} (phase=${run.phase})`);

  // GAME_BACKEND_PATH/GAME_FRONTEND_PATH are shared working-directory checkouts, not per-run
  // clones — serialize all phase processing across every worker instance via a Postgres
  // advisory lock so two different runs never race on the same `git checkout`. On a miss, leave
  // this run's own claim as-is (don't release it) rather than fighting over it — it naturally
  // becomes reclaimable once its own lockedUntil TTL passes, by which point the lock is likely free.
  const lock = await tryAcquireGitLock();
  if (!lock) {
    console.log(`[agents] run ${run.id} claimed but another run is mid-phase elsewhere — retrying next tick`);
    return;
  }
  try {
    await runOnePhaseStep(run);
  } finally {
    await lock.release();
  }
}

async function main(): Promise<void> {
  // Fail fast on missing required config rather than dying on the first tick.
  if (config.useVertexAI) {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      throw new Error('GOOGLE_GENAI_USE_VERTEXAI is set but GOOGLE_CLOUD_PROJECT is missing');
    }
  } else {
    void config.geminiApiKey;
  }
  void config.dbUri;

  await runMigrations();

  console.log(
    `[agents] worker starting as "${config.workerId}", polling every ${config.pollIntervalMs}ms ` +
      `(Gemini via ${config.useVertexAI ? `Vertex AI, project=${process.env.GOOGLE_CLOUD_PROJECT}` : 'Developer API key'})`,
  );
  console.log(`[agents] game_backend: ${config.gameBackendPath}`);
  console.log(`[agents] game-frontend: ${config.gameFrontendPath}`);

  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error('[agents] poll tick failed', err);
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

process.on('SIGTERM', () => {
  void pool.end();
  process.exit(0);
});
process.on('SIGINT', () => {
  void pool.end();
  process.exit(0);
});

main().catch((err) => {
  console.error('[agents] fatal startup error', err);
  process.exit(1);
});
