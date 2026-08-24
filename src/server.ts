import * as http from 'http';
import * as crypto from 'crypto';
import { GameGenerationPipeline } from './index';
import { JobStoreTool } from './tools/job-store.tool';
import { config } from './config';

const PORT = process.env.PORT || 8888;

/**
 * Lightweight HTTP server running on Contabo VPS to receive generation requests
 * from Admin Panel, Webhooks, or Telegram Bot.
 *
 * /api/generate returns a jobId immediately — the pipeline (LLM design call,
 * 100k-round Monte Carlo simulation, Imagen generation, two full repo builds)
 * routinely runs several minutes, well past any single HTTP request's
 * lifetime, and runs in the background. Poll /api/jobs/:id for status/logs.
 */
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Health Check
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'cherry-game-agents', uptime: process.uptime() }));
    return;
  }

  // Everything below triggers spend (LLM/Imagen calls) or writes into
  // game_backend/game-frontend — require the same key cherry_admin_backend
  // authenticates itself with, so this endpoint can't be triggered by anyone
  // who can merely reach the VPS port.
  const providedKey = req.headers['x-admin-api-key'];
  if (!config.adminBackend.apiKey || providedKey !== config.adminBackend.apiKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or invalid x-admin-api-key' }));
    return;
  }

  // Job status/logs
  const jobMatch = req.method === 'GET' && url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const jobId = jobMatch[1];
    try {
      const job = await JobStoreTool.getJob(jobId);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Job ${jobId} not found (expired after ${config.job.ttlSeconds}s or never existed)` }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(job));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Trigger Game Generation Endpoint
  if (req.method === 'POST' && url.pathname === '/api/generate') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      let prompt: string;
      try {
        const payload = JSON.parse(body || '{}');
        prompt = payload.prompt || 'Cyberpunk Neon Multiplier Wheel';
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const jobId = crypto.randomUUID();
      await JobStoreTool.createJob(jobId, prompt, GameGenerationPipeline.STEPS.length);

      console.log(`📡 [VPS Agent Server] Queued job ${jobId} for: "${prompt}"`);

      // Fire-and-forget: the pipeline runs well past any reasonable HTTP
      // timeout, so the caller gets the jobId now and polls /api/jobs/:id.
      GameGenerationPipeline.run(prompt, jobId)
        .then((result) =>
          JobStoreTool.updateJob(jobId, {
            status: 'completed',
            currentStep: GameGenerationPipeline.STEPS.length,
            result,
          }),
        )
        .catch((err: any) => {
          console.error(`❌ [VPS Agent Server] Job ${jobId} failed:`, err.message);
          return JobStoreTool.updateJob(jobId, { status: 'failed', error: err.message });
        });

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          jobId,
          message: `Generation queued for "${prompt}". Poll GET /api/jobs/${jobId} for status.`,
          totalSteps: GameGenerationPipeline.STEPS.length,
        }),
      );
    });
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🤖 CHERRY GAME AGENTS SERVICE RUNNING ON CONTABO VPS`);
  console.log(`🌐 Port:    http://0.0.0.0:${PORT}`);
  console.log(`📡 Trigger: POST http://0.0.0.0:${PORT}/api/generate`);
  console.log(`📡 Status:  GET  http://0.0.0.0:${PORT}/api/jobs/:id`);
  console.log(`======================================================\n`);
});
