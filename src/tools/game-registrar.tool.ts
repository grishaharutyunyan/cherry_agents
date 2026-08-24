import { config } from '../config';
import { GameSpec } from '../agents/game-designer.agent';

export interface GameRegistrationResult {
  registered: boolean;
  minBet: number;
  maxBet: number;
  freebetEnabled: boolean;
}

/**
 * Registers a generated game with cherry_admin_backend so it's actually
 * playable, not just listed. Three calls, all authenticated with a static
 * x-admin-api-key (agents/ is a service caller, not an interactive admin):
 *  1. POST /gambling/games          — creates the gambling.games row that
 *     game_service_backend reads minBet/maxBet/freebetEnabled/config from.
 *  2. POST /gambling/games/refresh-configs — tells game_service_backend to
 *     reload its registry so the new game is actually joinable.
 *  3. POST /games/sync              — pulls the game into the webapp.games
 *     display catalog (image/thumbnail/markers) from cherry_backend.
 */
export class GameRegistrarTool {
  static async registerGame(spec: GameSpec): Promise<GameRegistrationResult> {
    const { url, apiKey } = config.adminBackend;

    if (!url || !apiKey) {
      console.warn(
        '⚠️ [Game Registrar] ADMIN_BACKEND_URL/ADMIN_API_KEY not configured — skipping gambling.games registration. The game will show in the catalog but will NOT be playable until registered manually.',
      );
      return { registered: false, minBet: 0, maxBet: 0, freebetEnabled: false };
    }

    const baseUrl = url.replace(/\/+$/, '');
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-api-key': apiKey,
    };

    // Cap max bet so the top multiplier can never pay out more than the
    // platform's absolute max win, per docs/knowledge/gambling-math-rtp.md's
    // computeMaxBet() convention.
    const maxBet = Math.max(1, Math.floor(config.math.absoluteMaxWin / spec.maxMultiplier));
    const minBet = Math.min(10, maxBet);
    const freebetEnabled = true;

    const createRes = await fetch(`${baseUrl}/gambling/games`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        gameId: spec.gameId,
        gameName: spec.gameTitle,
        description: spec.theme,
        minBet,
        maxBet,
        isActive: true,
        freebetEnabled,
        category: spec.gameType,
        config: {
          maxMultiplier: spec.maxMultiplier,
          provablyFairPattern: spec.provablyFairPattern,
        },
      }),
    });
    if (!createRes.ok) {
      throw new Error(
        `[Game Registrar] Failed to create gambling.games row for ${spec.gameId}: HTTP ${createRes.status}: ${await createRes.text()}`,
      );
    }

    const refreshRes = await fetch(`${baseUrl}/gambling/games/refresh-configs`, {
      method: 'POST',
      headers,
    });
    if (!refreshRes.ok) {
      throw new Error(
        `[Game Registrar] gambling.games row created but game_service_backend refresh failed: HTTP ${refreshRes.status}: ${await refreshRes.text()}`,
      );
    }

    const syncRes = await fetch(`${baseUrl}/games/sync`, {
      method: 'POST',
      headers,
    });
    if (!syncRes.ok) {
      throw new Error(
        `[Game Registrar] Game engine registered but webapp.games catalog sync failed: HTTP ${syncRes.status}: ${await syncRes.text()}`,
      );
    }

    console.log(
      `🗄️ [Game Registrar] Registered ${spec.gameId} in gambling.games (minBet=${minBet}, maxBet=${maxBet} CC), refreshed game engine, synced webapp catalog.`,
    );

    return { registered: true, minBet, maxBet, freebetEnabled };
  }
}
