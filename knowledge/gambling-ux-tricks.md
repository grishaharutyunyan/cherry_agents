# Gambling UX & engagement — house conventions

Read by: `game-frontend-builder` agent.

This doc has two parts, kept strictly separate: **(A)** what this
codebase actually does today — verified by reading the real
`game-frontend/games/*` code — and **(B)** general gambling-UX
knowledge that is *not yet* convention here. Don't present (B) as if
it's already how this house builds games; treat it as a menu to draw
from, and if you use it, you're setting new precedent (call that out
in your handoff doc).

## (A) What this codebase actually does

**Sound (Howler-based)** — two real patterns to choose between:
- *Minimal* (Plinko): a handful of cues (`drop`, `win`) plus a looping
  idle ambience track. Audio context is unlocked on first
  `click`/`touchstart` (required for autoplay policies).
- *Rich* (Mines): dedicated cues per event (`bet, reveal, progress,
  cashout, bigWin, bust`) plus UI cues (`popupOpen/Close, countSelect,
  stepperInc/Dec, uiClick`) that **alias the `bet` sound at different
  playback-rate/volume offsets** instead of loading separate audio
  assets — cheaper on bundle size. A `BIG_WIN_MULTIPLIER_THRESHOLD`
  (Mines uses `10`) triggers a layered "epic win" swell over the
  normal cashout sound.
- **Cross-platform gotcha (verified, not optional)**: iOS WKWebView
  (Telegram-in-iPhone) has no Ogg Vorbis decoder. Every sound needs an
  MP3 source before/alongside the OGG one, or it's silent on iOS.
  Pick the *rich* pattern's asset-aliasing trick if you want many cues
  without many files.

**Animation** — Plinko's ball drop is a raw `requestAnimationFrame`
physics simulation (position/velocity ticking each frame), not a
tween/easing library — there is no gsap or CSS-transition-based easing
anywhere in this codebase. Match that: build animation as explicit
per-frame state updates, not a library dependency.

**Autoplay** — exists in exactly one game (Dice Wheel), and only as a
single sound-cue trigger on start. There is no shared autoplay
component/hook, no `stopOnWin`/`stopOnLoss`/round-count config
anywhere. Don't assume autoplay is a mature system to plug into — if
the spec calls for autoplay, you're building the first real
implementation of it. Check with the orchestrator before treating it
as a given.

**Near-miss / anticipation visuals** — none found. Mines' only
anticipation-adjacent mechanic is the audio swell above; there's no
visual near-miss emphasis anywhere in the codebase. If the spec wants
this, it's new — see (B) below for the concept, but implement it as a
genuinely new pattern, not a port of an existing one.

**Module structure** (already documented in `game-frontend/CLAUDE.md`,
confirmed accurate):
```
games/<id>/
  index.tsx
  use<Id>Game.ts       # WS state hook
  types.ts
  useGameSound.ts       # optional
  components/           # only for complex games (5-8 files: BetPanel,
                         # HistoryModal, SettingsSheet, wheel.ts,
                         # canvasEngine.ts, BettingBoard.tsx, etc.)
app/games/<id>/page.tsx  # thin wrapper: imports games/<id>/index.tsx,
                         # wraps in <Suspense>. No central registry —
                         # this file IS the registration.
```

**WebSocket connection**: `createWebSocketClient` (`lib/websocket-client.ts`)
authenticates with `NEXT_PUBLIC_GAME_API_KEY` as an `x-api-key`
handshake header. **Critical invariant: never pass a `namespace`** —
server gateways run on the default `/` namespace only; passing one
causes an `Invalid namespace` handshake failure. A shared
`hooks/useGameWebSocket.ts` wraps this with connection-state tracking
but isn't universally adopted (most games call
`createWebSocketClient` directly inside their own hook) — either is
fine, prefer the shared hook for new games since it's less code.
Reference implementation: `nine-card-mystery`. Standard events:
`connected, game_started, game_result, balance_switched,
freebet_status, freebet_granted`; standard actions: `start_game,
game_action, finish_game, switch_balance`. These must match the WS
contract the `game-designer` spec defines for the backend.

**Haptics**: no haptic feedback exists anywhere in `game-frontend`
today — confirmed, not just unsearched. `game-frontend` runs inside an
`<iframe>` embedded by `cherry_frontend` (see
`cherry_frontend/app/games/page.tsx`). Only `cherry_frontend` loads
the `telegram-web-app.js` SDK (`cherry_frontend/app/layout.tsx`,
`components/TelegramProvider.tsx`); `game-frontend`'s own
`app/layout.tsx` does not. That means `window.Telegram.WebApp` is
**not available inside the game iframe** — a new game cannot just call
it directly, even though `cherry_frontend` already has a working
helper (`cherry_frontend/lib/haptics.ts`):
```typescript
hapticImpact(style: "light"|"medium"|"heavy"|"rigid"|"soft")
hapticNotification(type: "error"|"success"|"warning")
```
This is a real, unsolved cross-frame boundary, not a solved pattern to
copy. The `game-frontend-builder` agent must establish a
`postMessage` bridge: the game iframe posts a message (e.g.
`{ type: 'haptic', style: 'medium' }`) to `window.parent`, and
`cherry_frontend` needs a listener added (in the page that renders the
game iframe) that calls its existing `hapticImpact`/`hapticNotification`
helpers. Keep the message vocabulary aligned with the existing helper
signatures above so `cherry_frontend`'s listener can pass the payload
straight through. Document whichever bridge shape you build in the
game's handoff doc, since every subsequent game will reuse it — the
first game to need haptics is effectively building this bridge for
the whole platform, not just itself.

**Thumbnails**: no thumbnail/icon assets exist anywhere in
`game-frontend` today (`public/` only has `locales/` and `sounds/`).
There's no existing path/format/aspect-ratio convention to mirror —
this pipeline is establishing one. See the orchestrator's finalize
step for the thumbnail prompt handoff.

## (B) General gambling-UX knowledge (not yet convention here)

Use only when the spec explicitly calls for it, and flag it as new in
your handoff:

- **Anticipation pacing**: a brief pause or slow-down right before the
  outcome reveal (e.g. a ball slowing before its final bucket, a card
  flip hesitating) increases perceived stakes. Keep it short (a few
  hundred ms) — too long reads as lag, not tension.
- **Near-miss emphasis**: visually highlighting an outcome that landed
  "one away" from a big win (without misrepresenting the actual
  result) is a well-known engagement mechanic. Must never imply a
  false result — it's a framing of the *real* outcome, not a fake one.
- **Variable reward cadence**: small frequent wins + rare large wins
  reads as more engaging than a flat distribution — this should come
  from the RTP/paytable design (see `gambling-math-rtp.md`), not be
  faked visually.
- **Win celebration scaling**: bigger multiplier → more visual/audio
  intensity (confetti, screen shake, layered sound) — Mines'
  `BIG_WIN_MULTIPLIER_THRESHOLD` swell is a minimal real example of
  this; scale the idea, don't invent a wholly different mechanism.

Stay within what's legally/ethically sound for this platform — juice
the presentation of real outcomes, never fabricate outcomes or mislead
about odds.
