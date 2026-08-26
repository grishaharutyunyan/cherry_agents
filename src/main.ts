import { config } from './config';
import { pool } from './db/client';
import { runMigrations } from './db/migrate';
import { claimNextPendingRun } from './db/runs.repo';
import { runOnePhaseStep } from './orchestrator/orchestrator';

async function tick(): Promise<void> {
  const run = await claimNextPendingRun();
  if (!run) return;
  console.log(`[agents] claimed run ${run.id} (phase=${run.phase})`);
  await runOnePhaseStep(run);
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
