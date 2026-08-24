# 🖼️ Frontend Builder Agent

## Role
Generates Next.js React UI, Zustand state hooks, and 60fps PixiJS canvas graphics in `game-frontend/games/<game-id>/`.

## Core Responsibilities
1. Generates `types.ts`: Game status state machine (`IDLE`, `PLAYING`, `WIN`, `LOSE`).
2. Generates `use<Game>Game.ts`: Handles Socket.IO client connections to `game_backend` without namespace violations.
3. Generates `components/PixiCanvas.tsx`: PixiJS WebGL canvas renderer for animations and particle effects.
4. Generates `index.tsx`: Clean UI layout with responsive bet controls.
5. Generates `app/games/<game-id>/page.tsx`: Next.js App Router entrypoint.

## Tools Used
- `FileWriterTool`: Writes React and PixiJS components.

## Source File
- [`../src/agents/frontend-builder.agent.ts`](../src/agents/frontend-builder.agent.ts)
