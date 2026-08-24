# Agent Knowledge Base: NestJS Backend & gRPC Logic Architecture

**Target Agent**: `Backend Logic Agent`  
**Purpose**: Architectural standards, Socket.IO gateways, gRPC callback flows, Redis caching, and NestJS game service patterns in `game_backend`.

---

## 🏗️ 1. Module Layout Standards

Every game backend module resides in `game_backend/src/games/<game-id>/` and consists of 4 core files:

```
game_backend/src/games/<game-id>/
├── <game-id>.module.ts          # NestJS Module registration
├── <game-id>.controller.ts      # Socket.IO Gateway & REST Endpoints
├── <game-id>.service.ts         # Core gameplay logic, RNG & State transitions
└── <game-id>-round.config.ts    # Multipliers, paytables & config schema
```

---

## ⚡ 2. WebSocket Gateway Conventions

* **Gateway Decorator**: All game controllers use `@WebSocketGateway()` with default namespace `/`.
* **Authentication Guard**: All handlers must enforce user authentication via `@UseGuards(WsJwtAuthGuard)`.
* **Standard WS Action Messages**:
  * `start_game`: Initiates round, validates balance via gRPC `OnBet` callback, returns initial state.
  * `game_action`: Performs step (e.g. reveal cell in Mines, pick card in Hilo).
  * `finish_game` / `cashout`: Ends round, calculates final win, triggers gRPC `OnWin` callback.

```ts
@WebSocketGateway({ cors: { origin: '*' } })
export class NeonWheelController {
  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('start_game')
  async handleStartGame(@ConnectedSocket() socket: Socket, @MessageBody() dto: StartGameDto) {
    return this.neonWheelService.startGame(socket.data.user, dto);
  }
}
```

---

## 🔄 3. gRPC Wallet Callbacks (`cherry_backend` Interop)

Game balance is managed strictly by `cherry_backend`. `game_backend` **must never mutate balances directly in local DB**.

1. **Before round execution (`OnBet`)**:
   Call `CallbackService.onBet({ userId, gameId, amount, currency })`.
   *If `onBet` fails or returns insufficient funds, abort round creation immediately.*
2. **After winning round completion (`OnWin`)**:
   Call `CallbackService.onWin({ userId, gameId, roundId, winAmount, currency })`.

---

## 🚀 4. Real-time State Caching with Redis (`KeyvRedis`)

* **Active Round State**: Active rounds must be stored in Redis via `CacheModule` with a TTL of 30 minutes.
* **Key Format**: `game:<game-id>:session:<userId>`
* **Atomic State Updates**: Read state -> Process action -> Write updated state back to Redis -> If round finishes, persist final round log to Postgres `TypeORM` and clear Redis key.

---

## 🌐 5. Multi-Language (i18n) Backend Architecture

All game modules in `game_backend` **must support English (EN) and Russian (RU)** and remain extensible for future languages:

* **`I18nService` Integration**: Game services must inject `I18nService` from `src/i18n/i18n.service.ts`.
* **Locale Normalization**: Normalize incoming locale via `normaliseLocale(code)`.
* **Translation Dictionaries**: When creating a game, append its titles and outcome keys to `src/i18n/en.json` and `src/i18n/ru.json`.
* **Language Growth Support**: If a new locale is added (e.g. `es`, `tr`), the game resolves translations automatically via `this.i18nService.t(key, lang)` falling back to `en` if untranslated.

---

## 📋 6. Required Registration Steps

After writing a new game backend module:
1. Export the module in `game_backend/src/games/index.ts`.
2. Import and add the module to `imports: [...]` in `game_backend/src/app.module.ts`.
3. Update `game_backend/src/i18n/en.json` and `game_backend/src/i18n/ru.json` with the new game's dictionary.
