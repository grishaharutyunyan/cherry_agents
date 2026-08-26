# Adding a new game — game-frontend checklist

Read by: `game-frontend-builder` agent. Assumes `game-designer`'s spec
already defines the WS contract (events/actions/payload shapes) that
`game-backend-builder` is implementing in parallel — build against the
spec's contract, not against the backend code (it may not be merged
yet).

## 1. File structure

```
games/<id>/
  index.tsx              # main game component
  use<Id>Game.ts          # WS state hook — connects, tracks round state
  types.ts                # payload/state types matching the spec's WS contract
  useGameSound.ts          # optional — see gambling-ux-tricks.md for the two real patterns
  components/              # only if the game needs more than index.tsx —
                           # betting panel, history modal, settings, canvas engine, etc.
app/games/<id>/page.tsx    # registration point — thin wrapper, wraps index.tsx in <Suspense>
```

There is no central game registry — creating `app/games/<id>/page.tsx`
*is* how a game becomes reachable in the UI.

## 2. WebSocket connection

Use `createWebSocketClient` (`lib/websocket-client.ts`), or the shared
`hooks/useGameWebSocket.ts` wrapper (prefer the shared hook for new
games — less boilerplate than the games that predate it, e.g. mines,
plinko, which call `createWebSocketClient` directly).

- Auth: `NEXT_PUBLIC_GAME_API_KEY` sent as `x-api-key` in the handshake.
- **Never pass a `namespace` option** — server gateways only run on
  the default `/` namespace; doing so causes an `Invalid namespace`
  handshake failure. This is a real, previously-hit bug, not a
  theoretical one.
- Standard events to handle: `connected, game_started, game_result,
  balance_switched, freebet_status, freebet_granted`.
- Standard actions to emit: `start_game, game_action, finish_game,
  switch_balance`.
- Reference implementation to model a new hook on: `nine-card-mystery`.

Map the spec's game-specific WS payload (e.g. `game_started.data`
shape) into `types.ts` exactly as the backend spec defines it — this
is the contract both builder agents share, don't improvise field
names.

## 3. Sound

Add `useGameSound.ts` if the spec calls for audio feedback (most
games do). Pick minimal or rich per `gambling-ux-tricks.md` based on
how many distinct game moments need a cue. Always provide an MP3
source alongside any OGG asset — OGG-only cues are silent on iOS
WKWebView (Telegram-in-iPhone has no Ogg Vorbis decoder).

## 4. Animation

Build as explicit `requestAnimationFrame` state updates (position/
velocity/progress ticked per frame), matching Plinko's ball-drop
pattern — this codebase has no tween/easing library dependency
(no gsap, no CSS-transition-based easing). Don't introduce one for a
single game; if the spec genuinely needs easing curves, hand-roll the
easing function.

## 5. Balance / session state

Games track `balance`, `realBalance`, `bonusBalance`,
`activeBalanceType` from the WS payloads (see any existing
`use<Id>Game.ts` for the pattern) — surface `freebetEnabled` state via
the `freebet_status`/`freebet_granted` events if the spec sets
`freebetEnabled: true`.

## 6. Mandatory per-game UI surface

Every new game must ship all of the following. Placement, layout, and
visual treatment are the `game-frontend-builder` agent's own UI/UX
call — these are functional requirements, not a wireframe. Match the
house's existing visual language (check 2-3 sibling games) rather than
inventing a new look per game.

- **Settings button** — real precedent exists under three different
  names (`SettingsSheet`, `SettingsPanel`, `SettingsModal` — day-night,
  dice-duel, and european-roulette/space-xy/nine-card-mystery
  respectively). Prefer **`SettingsSheet`** for new games (the more
  recent naming) unless the spec's interaction pattern is closer to
  one of the modal variants.
- **Sound on/off toggle** — real precedent: `dice-wheel`'s
  `SoundToggle.tsx`, and mute state tracked inside most
  `use<Id>Game.ts` hooks. Wire it to whichever `useGameSound.ts`
  pattern you built per `gambling-ux-tricks.md`.
- **Interactive "How to Play" guide** — real precedent:
  `HowToPlayModal`/`HowToPlay` components (coin-flip, day-night,
  space-xy). Should explain the actual rules and payout logic of
  *this* game, sourced from the `game-designer` spec — don't reuse
  another game's copy.
- **Provably-fair check UI** — real precedent, and a strong one:
  `space-xy/components/ProvablyFairModal.tsx` — shows the HMAC
  derivation steps as readable pseudocode, server seed / seed hash /
  client seed / round ID as copyable fields, and a client-side
  verify function (`lib/provablyFair.ts`-style) that recomputes the
  outcome from the revealed seed and confirms it matches. Build the
  new game's version against **this exact reference**, swapping in
  its own derivation steps from the spec (bitstream or shuffle, per
  `gambling-math-rtp.md`).
- **Round history** — real precedent: `HistoryModal`/`HistorySheet`
  components exist per-game, but **none of the existing ones surface
  whether a round was a freebet/freespin** (checked — the field isn't
  there). New games must show this: a badge or filter row indicating
  `isFreeBet`/freespin rounds distinctly from real-balance rounds, using
  the freebet fields already coming through the WS payload
  (`freebet_status`/`freebet_granted` events, `isFreeBet` on the round
  result). If the spec sets `freebetEnabled: true`, this is not
  optional.
- **Haptic feedback** — only if the spec says the game needs it (fast
  interaction games like plinko/dice benefit more than slow ones like
  roulette). See the "Haptics" section in `gambling-ux-tricks.md` for
  the cross-iframe bridge this actually requires — there's no existing
  in-game-frontend precedent to copy.

## 7. Thumbnails

No existing asset convention to mirror (none exist in this repo yet).
The orchestrator produces an image-generation *prompt* as part of the
finalize step — once you have an actual image file, place it at
`public/thumbnails/<gameId>.<ext>` (establishing this as the new
convention; note it in your handoff) and reference it via the
`thumbnail` field the backend's `IGameConfig` exposes.

## 8. Before handing off to QA

- `npm run lint` clean
- `npm run build` clean
- All six mandatory UI pieces from §6 present and functional.
- Manually trace the WS contract against the spec doc — field names,
  event names, and action names must match what `game-backend-builder`
  is implementing on the other side, since QA verifies backend RTP
  independently and won't catch a frontend/backend contract mismatch.
