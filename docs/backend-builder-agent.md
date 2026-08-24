# ⚙️ Backend Builder Agent

## Role
Generates and registers complete NestJS backend modules in `game_backend/src/games/<game-id>/`.

## Core Responsibilities
1. Generates `<game-id>-round.config.ts`: Paytables, probabilities, and max multiplier rules.
2. Generates `<game-id>.service.ts`: Implements HMAC-SHA256 outcome generation and seed calculation.
3. Generates `<game-id>.controller.ts`: Sets up `@WebSocketGateway()` with `@SubscribeMessage('start_game')`.
4. Generates `<game-id>.module.ts`: NestJS module structure.
5. Auto-registers the game in `game_backend/src/games/index.ts` and `game_backend/src/app.module.ts`.

## Tools Used
- `FileWriterTool`: Writes code files to disk.
- `ModuleRegistrarTool`: Injects the new module into `AppModule`.

## Source File
- [`../src/agents/backend-builder.agent.ts`](../src/agents/backend-builder.agent.ts)
