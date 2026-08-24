import * as http from 'http';
import { GameGenerationPipeline } from './index';
import { config } from './config';

const PORT = process.env.PORT || 8888;

/**
 * Lightweight HTTP server running on Contabo VPS to receive generation requests
 * from Admin Panel, Webhooks, or Telegram Bot.
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

  // Trigger Game Generation Endpoint
  if (req.method === 'POST' && url.pathname === '/api/generate') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const prompt = payload.prompt || 'Cyberpunk Neon Multiplier Wheel';

        console.log(`📡 [VPS Agent Server] Received generation trigger: "${prompt}"`);

        // Run the multi-agent generation pipeline
        const result = await GameGenerationPipeline.run(prompt);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            message: `Game ${result.spec.gameId} generated and verified successfully!`,
            gameId: result.spec.gameId,
            route: `/games/${result.spec.gameId}`,
            spec: result.spec,
          }),
        );
      } catch (err: any) {
        console.error('❌ [VPS Agent Server] Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🤖 CHERRY GAME AGENTS SERVICE RUNNING ON CONTABO VPS`);
  console.log(`🌐 Port:    http://0.0.0.0:${PORT}`);
  console.log(`📡 Endpoint: POST http://0.0.0.0:${PORT}/api/generate`);
  console.log(`======================================================\n`);
});
