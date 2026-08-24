# Gambling math & RTP — house conventions

Read by: `game-designer` agent, before drafting any new game's math spec.

This is the actual, code-verified math convention used across
`game_backend/src/games/*` — not generic gambling theory. Every new
game's RTP model should match one of the patterns below unless there's
a specific reason to deviate (note the deviation explicitly in the
spec if so).

## Provably-fair scheme (always HMAC-SHA256)

Every game uses the same seed lifecycle:

```
serverSeed      = crypto.randomBytes(32).toString('hex')
serverSeedHash  = sha256(serverSeed)          // revealed to client BEFORE the round
...round plays...
serverSeed                                     // revealed to client AFTER the round, for verification
```

The server seed is **not** re-randomized every round — it's persisted
per user in the `game_seeds` table (`GameSeedDbService`) and a
`nonce`/`roundId` provides the per-round entropy differentiator. This
is what lets a player verify the house couldn't have cherry-picked an
outcome after seeing the bet.

Two concrete derivation patterns, pick based on your game's outcome shape:

**Bitstream** (independent binary/discrete steps — use for ladder/path games like Plinko):
```
hmac = HMAC-SHA256(key=serverSeed, data=`${clientSeed}:${nonce}`)
for step i:
  byteIndex = floor(i / 8)
  bit       = (hmac[byteIndex] >> (i % 8)) & 1
```
32 bytes = 256 usable bits.

**Shuffle** (select K-of-N without replacement — use for reveal/grid games like Mines):
```
hash = HMAC-SHA256(key=serverSeed, data=`${clientSeed}:${roundId}`)
Fisher-Yates shuffle over [0..N-1], consuming 4-byte (8 hex char)
chunks of the hash cyclically: byteOffset = ((N-1-i)*4) % 32, j = val % (i+1)
first K shuffled positions = the "hit" set (mines, drawn numbers, etc.)
```

If your new game's outcome doesn't fit either shape, say so explicitly
in the spec and design the derivation from HMAC-SHA256 output bytes —
never introduce a different hashing primitive.

## RTP model — pick one of two shapes

**(a) Flat RTP constant × fair odds — prefer this, it's simpler to verify and tune.**

```
multiplier(outcome) = RTP_CONSTANT / trueProbability(outcome)
```

Real examples from the codebase:
- **Dice Wheel** (threshold game, player picks a probability via slider): `multiplier = floor2(0.97 / (chance/100))`, `RTP = 0.97` flat.
- **Mines** (combinatorial reveal): `M(k) = 0.97 × ∏_{i=0}^{k-1} (25-i)/(25-mines-i)` — the product term is the inverse of the survival probability after k safe reveals; `0.97` is the flat house edge factor. `RTF_FACTOR` is a single tunable constant.

Use this shape whenever the outcome space has a clean closed-form
probability (single draw, sequential survival, wheel/threshold). It's
the default — only reach for (b) if the paytable shape itself needs
hand-tuning (e.g. you want specific buckets to feel bigger/smaller
than pure inverse-odds would give you).

**(b) Hand-authored multiplier table, fitted to a target RTP.**

Real examples:
- **Plinko** (binomial ladder): bucket probability = `C(rows, k) / 2^rows`; the multiplier table (e.g. 8-row medium: `[13, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13]`) is authored by hand, then RTP is *verified* (not derived) via `RTP = Σ P(bucket=k) · mult[k]`.
- **Keno-80** (hypergeometric draw): table indexed `[selectionSize][matchCount]`, e.g. 10-pick: `[0,0,0,0.5,1,2,6,22.5,80,800,8000]`. True match probability for n picks / 20 drawn from 80 is `C(20,m)·C(60,n-m)/C(80,n)`.

If you use shape (b), the QA Monte Carlo simulation (see
`qa-rtp-verification.md`) is not optional — it's the only thing
confirming the hand-tuned table actually hits the target RTP, since
there's no closed form guaranteeing it.

## Bet-limit conventions

- `minBet`/`maxBet` are **DB-sourced** (the `gambling.games` row), never hardcoded in the game's own constants file. The DB row is authoritative for what a player is *allowed* to bet.
- Code additionally enforces a tighter **per-config bet ceiling** when the paytable has a variable top multiplier, so a single bet can't produce an oversized win:
  ```
  computeMaxBet() = min(dbMaxBet, floor(ABSOLUTE_MAX_WIN / topMultiplier))
  ```
  Observed `ABSOLUTE_MAX_WIN` / `MAX_PAYOUT` constants: Plinko & Keno use `140_000` CC (documented as 1,000 TON, 1 TON = $1.40 = 140 Cherry Coin (CC)); Dice Wheel uses `50_000`; Mines uses a flat `MAX_MULTIPLIER = 10,000` cap instead of a max-win constant.
  Only add a `computeMaxBet()` if your paytable's top multiplier varies by config (rows/risk/picks). Flat single-multiplier games (wheel/dice-style) don't need one.

## What the game-designer spec must contain

1. Which provably-fair derivation (bitstream or shuffle) and the exact byte/bit mapping to outcomes.
2. Which RTP shape ((a) constant, or (b) table) and the actual numbers — full multiplier/probability table if (b).
3. A worked RTP calculation by hand (Σ P(outcome)·multiplier), showing it lands within the target ± tolerance.
4. The `ABSOLUTE_MAX_WIN` and whether `computeMaxBet()` is needed.
5. `freebetEnabled` — no consistent rule was found across existing games (mines/dice-wheel/dice-duel are `false`; plinko/hilo/day-night/keno/roulette are `true`, including plinko which has a 50x top multiplier). Set it based on this game's actual product intent, not by pattern-matching similar games, and state the reasoning in the spec so the QA agent can sanity-check it against `computeMaxBet()`.
