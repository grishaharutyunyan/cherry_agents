# Adding a new game — game_backend checklist

Read by: `game-backend-builder` agent. Assumes `game-designer`'s spec
already exists and defines the math/RTP/provably-fair scheme (see
`gambling-math-rtp.md`).

## 1. File structure — pick simple or complex based on RTP logic surface area

**Simple** (flat-formula RTP, e.g. wheel/dice-style — see Dice Wheel):
```
src/games/<id>/
  <id>.module.ts
  <id>.service.ts       # IGameService impl, math inline
  <id>.controller.ts
  <id>.gateway.ts        # only if the game needs its own broadcast channel
  <id>.config.ts         # constants: bet caps, RTP constant, TTL
```

**Complex** (multi-step or table-driven RTP, e.g. Mines):
```
src/games/<id>/
  <id>.module.ts
  <id>.service.ts               # orchestration, implements IGameService
  <id>-math.service.ts          # pure multiplier-table logic, no I/O — unit-testable
  <id>-provably-fair.service.ts # seed/shuffle/bitstream derivation, no I/O
  <id>-db.service.ts            # Postgres persistence (round records)
  <id>.controller.ts
  entities/<id>-round.entity.ts
  dto/
```

Split math and provably-fair into their own services once the logic
is non-trivial (tables, multi-step derivation) — this is what makes
the QA agent's Monte Carlo script able to import and call them
directly without spinning up the whole NestJS app.

## 2. Implement `IGameService`

```typescript
interface IGameService {
  getConfig(): IGameConfig;
  createRound(sessionId, bet, userId, betTransactionId?, betBalance?, roundId?, isFreeBet?, freebetGrantId?, betBalanceType?): Promise<{success, roundId?, data?, error?}>;
  processAction(roundId, action): Promise<{success, data?, error?}>;
  finishRound(roundId): Promise<IGameResult>;
  getRound(roundId): Promise<IGameRound | null>;
  // optional: validateAction, cancelRound, updateRoundWinTransaction, getInitialState
}
```

`getConfig()` convention: **DB row is the base** (via
`gameRegistry.getGameConfig(id)` for `minBet`/`maxBet`/`freebetEnabled`),
in-code constants fill in what the DB doesn't carry (`maxWinAmount`,
computed `paytable`). Never hardcode `minBet`/`maxBet` in the service —
always read them from the DB-sourced config.

## 3. Redis round-state pattern (uniform across all games)

- Key: `round:<roundId>`
- Value: JSON-stringified object extending `IGameRound`
- TTL: define your own `<GAME>_ROUND_TTL_MS` constant; every existing game uses `30 * 60 * 1000` (30 min) — match it unless there's a reason not to.
- Postgres write in `createRound` is **best-effort** (try/catch, silent failure — the round continues on Redis alone).
- Postgres write in `finishRound` is **not** silenced — let it throw, so `GameFlowService` can surface a retry-able error to the client.
- On a Redis miss during resume, reconstruct from the Postgres `gameData` JSON if present; if reconstruction is incomplete, return an `AUTO_REFUND` result rather than forcing a loss.

## 4. Registration — both steps are required, independently

A game only becomes playable when **both** are true:

1. **Code registration**: your service's `onModuleInit()` calls
   `gameRegistry.registerGame('<id>', this)`.
2. **DB registration**: a row exists in `gambling.games`
   (`gameId, gameName, minBet, maxBet, isActive=true, freebetEnabled, category, config`),
   loaded by `GameRegistryService.loadGameConfigs()` at boot.

Wiring the module into the app:
```
src/games/index.ts        — add: export * from './<id>/<id>.module';
src/app.module.ts          — import <Id>Module from './games'; add to the imports: [] array
```

**Publishing without a redeploy**: `cherry_admin_backend` exposes
`POST /gambling/games` (writes the DB row — same Postgres schema/table
as game_backend, confirmed identical `@Entity({name:'games',
schema:'gambling'})`) and `POST /gambling/games/refresh-configs`,
which proxies to game_backend's own
`POST /api/admin/games/refresh-configs`
(`src/game-engine/controllers/admin-game.controller.ts`) →
`GameRegistryService.refreshGameConfigs()`. Sequence to go live
without restarting the service: **(1)** admin POST creates the DB
row, **(2)** admin POST `refresh-configs` picks it up. A stale
in-repo doc (`game_backend/docs/ADDED_GAMES.md`, referenced by a
comment in `plinko.service.ts`) claims manual SQL seeding and does not
actually exist — don't follow it; use the admin API path above.

## 5. Bet-limit ceiling (only if your paytable has a variable top multiplier)

```typescript
function computeMaxBet(dbMaxBet: number, topMultiplier: number): number {
  return Math.min(dbMaxBet, Math.floor(ABSOLUTE_MAX_WIN / topMultiplier));
}
```
Define your own `<GAME>_MAX_WIN` / `<GAME>_MAX_PAYOUT` constant.
Flat single-multiplier games don't need this.

## 6. gRPC callback wiring

Bet/win results get reported to `cherry_backend`'s `CallbackModule`
(`OnBet`/`OnWin`) via the `CALLBACK_PACKAGE` gRPC client — follow the
existing call sites in any sibling game's service for the exact
payload shape; don't invent a new callback contract per game.

## 7. Before handing off to QA

- `npm run lint` clean
- `npm run build` clean
- Module exports both the math and provably-fair logic in a way the
  QA agent's Monte Carlo script can `import` and call directly
  (no live server/DB required to simulate outcomes).
