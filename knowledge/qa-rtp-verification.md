# QA / RTP verification

Read by: `game-qa-verifier` agent. Runs independently of the two
builder agents — don't trust the backend-builder's own math claims,
verify against the actual shipped code.

Goal: catch the two failure modes that matter — (1) the RTP formula is
wrong, (2) the implementation doesn't match the formula. Do this
cheaply: report a numeric summary, never paste per-round simulation
output into the conversation.

## 1. Sample size and tolerance

RTP has statistical variance — don't expect an exact match. Standard
error of a Monte Carlo RTP estimate roughly follows
`SE ≈ stdev(payout) / sqrt(N)`. For most house games (payout stdev on
the order of the average multiplier), `N = 1,000,000` rounds gets you
well under ±0.5% error for low-variance games (dice-wheel, mines) and
usually still under ±1% for high-variance ones (plinko's 50x bucket,
keno's 8000x top prize) — if a game has a very high top multiplier
with very low hit probability, increase N (e.g. `10,000,000`) or
accept a wider tolerance band and say so explicitly in the report.

Default gate: **measured RTP within ±0.5% absolute of target RTP** at
N=1,000,000. Widen to ±1% only for confirmed high-variance configs,
and state why in the pass/fail report.

## 2. How to simulate — import the real code, don't reimplement it

Per `adding-a-new-game-backend.md`, math and provably-fair logic
should be callable without a live server/DB:
- Complex games: `import` the `<id>-math.service.ts` and
  `<id>-provably-fair.service.ts` classes directly.
- Simple games: `import` the relevant pure functions from
  `<id>.service.ts` / `<id>.config.ts`.

Script skeleton (adapt derivation to bitstream or shuffle per
`gambling-math-rtp.md`):

```typescript
// scratch script, not committed — run with ts-node against game_backend
import { <Id>MathService } from '../src/games/<id>/<id>-math.service';
import { deriveOutcome } from '../src/games/<id>/<id>-provably-fair.service';
import * as crypto from 'crypto';

const N = 1_000_000;
const math = new <Id>MathService();
let totalPayout = 0;
let totalBet = 0;
const BET = 100;

for (let i = 0; i < N; i++) {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');
  const outcome = deriveOutcome(serverSeed, clientSeed, i /* nonce/roundId */);
  const multiplier = math.getMultiplier(outcome /* + config, e.g. rows/mines/picks */);
  totalPayout += BET * multiplier;
  totalBet += BET;
}

const measuredRTP = totalPayout / totalBet;
console.log(JSON.stringify({ measuredRTP, targetRTP: <TARGET>, deltaPct: ((measuredRTP - <TARGET>) / <TARGET>) * 100, N }));
```

Run it, read only the final JSON line — that's the entire token cost
of the RTP check.

For games with player-configurable parameters (rows, risk level, mine
count, pick count), run the simulation once per configuration the
spec exposes, not just one — a table-driven game can pass overall RTP
while one specific config is badly off.

## 3. Edge-case checklist (beyond raw RTP)

- `computeMaxBet()` (if present): confirm `dbMaxBet` vs.
  `floor(ABSOLUTE_MAX_WIN / topMultiplier)` actually caps correctly —
  simulate a max-bet round at the top multiplier and confirm payout
  never exceeds `ABSOLUTE_MAX_WIN`.
- `freebetEnabled`: if `true`, confirm a freebet round still respects
  the same max-win cap (a freebet shouldn't be a loophole around
  `ABSOLUTE_MAX_WIN`).
- Both registration halves exist per `adding-a-new-game-backend.md`
  §4: code calls `gameRegistry.registerGame()`, and the spec's DB
  payload (from the finalize step) matches the `IGameConfig` the code
  actually returns from `getConfig()` — mismatched `minBet`/`maxBet`
  between the DB payload doc and the code's assumptions is a real
  failure mode, check it directly.
- Redis round TTL matches the `30 * 60 * 1000` convention unless the
  spec explicitly deviates.
- `finishRound`'s DB write is NOT wrapped in try/catch (must propagate
  errors) while `createRound`'s is (best-effort) — confirm this isn't
  inverted, since it's easy to copy-paste backwards from a reference
  game.

## 4. Design-tokens contract (if a design-tokens JSON exists for this game)

Two checks, deliberately different in kind — see the 2026-08-28 visual-tokens-and-juice
design spec:

- **Hex-lint (deterministic — use the `lint_hardcoded_colors` tool, don't eyeball it).** Call
  it once; it scans the frontend game directory for raw hex/`rgb()`/`rgba()` literals outside
  the token file. Any hit is a fail, `routeHint: frontend` — the component should reference a
  CSS variable derived from `colorTokens` instead.
- **Tier-wiring (structural — read the code yourself).** For each of the three
  `animationTiers`, confirm: the component imports the tokens JSON; there's a conditional
  comparing the real outcome multiplier against that tier's `minMultiplier`/`maxMultiplier`;
  the branch contains actual executable logic (not empty, not a no-op, not a `TODO`). This is
  a presence/structure check only — do NOT judge whether the effect *looks* like a "particle
  fountain" or matches the brief's tone; that's the Lead Orchestrator's job downstream, not
  yours. A branch with any real animation code, however simple, passes this check. Missing or
  empty branch is a fail, `routeHint: frontend`.

## 5. Build gates

- `npm run lint` clean in both `game_backend` and `game-frontend`.
- `npm run build` clean in both.
- Frontend/backend WS contract: diff the spec's documented event/action
  payload shapes against what the frontend's `types.ts` and backend's
  DTOs actually declare — a silent field-name mismatch won't surface
  as a build error in either repo alone.
- Mandatory UI surface present (`adding-a-new-game-frontend.md` §6):
  settings button, sound toggle, how-to-play, provably-fair check,
  history with freebet/freespin indicator, and haptics if the spec
  calls for them. This is a presence check (do the components exist
  and render), not a design review — placement/UX judgment belongs to
  `game-frontend-builder`, QA only confirms nothing was skipped.

## 6. Reporting format

Report pass/fail per check above as a short table (check name,
result, number if applicable) — not narrative prose, not raw
simulation logs. On failure, name the specific check, the measured vs.
expected number, and which agent's output it implicates (designer's
math vs. backend-builder's implementation) so the orchestrator routes
the retry correctly. Cap retries at 2 — on a third failure, stop and
report to the user instead of looping.
