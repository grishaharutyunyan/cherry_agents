# Agent Knowledge Base: Next.js & PixiJS Frontend Architecture

**Target Agent**: `Frontend Integration Agent`  
**Purpose**: Structure rules, Socket.IO hooks, PixiJS WebGL canvas rendering, Zustand state management, and Next.js 16 App Router setup in `game-frontend`.

---

## 📁 1. Directory Layout Rules

Every frontend game is self-contained in `game-frontend/games/<game-id>/` plus a Next.js App Router page wrapper:

```
game-frontend/
├── app/games/<game-id>/page.tsx       # Route entry point (imports games/<game-id>)
└── games/<game-id>/
    ├── index.tsx                      # Root React container
    ├── use<GameName>Game.ts           # State machine & WebSocket logic hook
    ├── useGameSound.ts                # Audio playback hook (Howler)
    ├── types.ts                       # DTOs & state interfaces
    └── components/
        ├── PixiCanvas.tsx             # PixiJS WebGL graphics engine
        ├── Controls.tsx               # Bet bar, multiplier selection, start button
        └── Header.tsx                 # Game title & live balance display
```

---

## 🔌 2. Socket.IO Connection Client Standard

* **Factory Function**: Use `createWebSocketClient` from `@/lib/websocket-client`.
* **Handshake Config**: Pass `apiKey: process.env.NEXT_PUBLIC_GAME_API_KEY`.
* **Namespace Rule (CRITICAL)**: **DO NOT PASS A NAMESPACE**. The server gateways listen strictly on default `/`.

```ts
// game-frontend/games/<game-id>/use<GameName>Game.ts
import { createWebSocketClient } from '@/lib/websocket-client';

const socket = createWebSocketClient({
  apiKey: process.env.NEXT_PUBLIC_GAME_API_KEY,
  url: process.env.NEXT_PUBLIC_SOCKET_URL,
});
```

---

## 🎮 3. PixiJS Render Loop Guidelines

* **Lifecycle**: Mount Pixi `Application` inside a `useRef<HTMLDivElement>` container on React `useEffect`. Always destroy application on unmount: `app.destroy(true, { children: true, texture: true })`.
* **Responsive Scaling**: Resize renderer dynamically to container width/height using `app.renderer.resize(width, height)`.
* **Texture Preloading**: Preload Imagen 3 assets from `/games/<game-id>/assets/` using `Assets.load()`.

```ts
useEffect(() => {
  const app = new Application();
  app.init({ width: 800, height: 600, backgroundAlpha: 0 }).then(() => {
    containerRef.current?.appendChild(app.canvas);
    // Add PixiJS Sprites & Ticker loops
  });
  return () => {
    app.destroy(true, { children: true });
  };
}, []);
```

---

## 🔄 4. Game State Machine (Zustand / React State)

Every game must manage a clear lifecycle state machine:
* `IDLE`: User selects bet amount and risk level.
* `BETTING` / `STARTING`: WS payload dispatched, waiting for server response.
* `PLAYING` / `SPINNING`: Game loop running, animations active.
* `RESULT_WIN` / `RESULT_LOSE`: Server returned result. Trigger victory burst or loss effect.

---

## 🌐 5. Multi-Language (i18n) Frontend Architecture

All frontend games in `game-frontend` **must support English (EN) and Russian (RU)** and remain extensible for future languages:

* **`useTranslation` Hook**: Components must use `const { t, i18n } = useTranslation();`.
* **Dynamic Language Detection**: Languages are auto-detected from query string `?lang=ru` via `detectLanguageFromUrl()` in `lib/i18n.ts`.
* **No Hardcoded UI Strings**: All button labels, headers, status messages, and win banners must use translation keys e.g. `t('game.place_bet')`, `t('game.win')`, or `games.<gameId>.*`.
* **Translations Registration**: When creating a game, append its titles and outcome keys to `public/locales/en.json` and `public/locales/ru.json`.
