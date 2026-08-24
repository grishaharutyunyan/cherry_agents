import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || 'cherry-casino-ai',
    location: process.env.GCP_LOCATION || 'us-central1',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    imagenModel: process.env.IMAGEN_MODEL || 'imagen-3.0-generate-002',
  },
  paths: {
    root: process.env.ROOT_PATH
      ? path.resolve(process.env.ROOT_PATH)
      : path.resolve(__dirname, '../../'),
    backend: process.env.BACKEND_PATH
      ? path.resolve(process.cwd(), process.env.BACKEND_PATH)
      : path.resolve(__dirname, '../../game_backend'),
    frontend: process.env.FRONTEND_PATH
      ? path.resolve(process.cwd(), process.env.FRONTEND_PATH)
      : path.resolve(__dirname, '../../game-frontend'),
    agents: path.resolve(__dirname, '../'),
    docs: path.resolve(__dirname, '../docs'),
    knowledge: path.resolve(__dirname, '../knowledge'),
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
  },
  adminBackend: {
    url: process.env.ADMIN_BACKEND_URL || 'http://localhost:7773',
    apiKey: process.env.ADMIN_API_KEY || '',
  },
  redis: {
    // Points at the same physical Redis instance cherry_backend/game_backend
    // may use, but on its own logical DB (index, not just a key prefix) so
    // job records never collide with round/session state or share a
    // FLUSHDB blast radius with the game engine's live data.
    url: process.env.REDIS_URI || 'redis://localhost:6379',
    db: parseInt(process.env.REDIS_DB ?? '1', 10),
  },
  job: {
    ttlSeconds: 24 * 60 * 60,
  },
  math: {
    defaultTargetRtp: 0.965,
    minRtp: 0.95,
    maxRtp: 0.975,
    absoluteMaxWin: 140000, // 140,000 Cherry Coin (CC) — approx. 1,000 TON (1 TON = $1.40 = 140 CC)
    monteCarloSimulationRounds: 100000,
  },
};
