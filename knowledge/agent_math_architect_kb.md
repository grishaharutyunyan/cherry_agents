# Agent Knowledge Base: Game Math, Probability & Provably Fair Architecture

**Target Agent**: `Game Math Architect Agent`  
**Purpose**: Math models, Return-To-Player (RTP) calculations, provably fair HMAC-SHA256 seed algorithms, paytable design, and house edge constraints for all casino games in `game_backend`.

---

## 🎲 1. Provably Fair HMAC-SHA256 Standard

Every game in `game_backend` **must use the HMAC-SHA256 seed lifecycle**:

```
serverSeed      = crypto.randomBytes(32).toString('hex')
serverSeedHash  = sha256(serverSeed)         // Shown to client BEFORE round starts
...round outcome generated...
serverSeed                                    // Revealed to client AFTER round completes
```

### **Outcome Derivation Patterns**

#### Pattern A: Bitstream (For Path & Binary Ladder Games like Plinko / Multiplier Steps)
```ts
const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest();
// Read bits sequentially:
for (let step = 0; step < totalSteps; step++) {
  const byteIndex = Math.floor(step / 8);
  const bit = (hmac[byteIndex] >> (step % 8)) & 1; // 0 = Left, 1 = Right
}
```

#### Pattern B: Fisher-Yates Shuffle (For Selection & Grid Games like Mines / Cards)
```ts
const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${roundId}`).digest();
// Consume 4-byte (8 hex character) chunks to perform unbiased Fisher-Yates shuffle
```

#### Pattern C: Continuous Float [0, 1) (For Wheel / Dice / Crash Games)
```ts
const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest();
// Take first 4 bytes as an unsigned 32-bit integer:
const intVal = hmac.readUInt32BE(0);
const floatVal = intVal / 0x100000000; // Returns float in range [0, 1)
```

---

## 📊 2. Return-To-Player (RTP) Models

House target RTP across the platform is strictly configured between **95.0% and 97.0%** (default target: **96.5%** or **97.0%**).

### **Model Type 1: Flat RTP Multiplier (Formulaic)**
Used when outcomes have closed-form probabilities (e.g., Dice Wheel, Mines):
$$\text{Multiplier}(\text{Outcome}) = \frac{\text{RTP\_FACTOR}}{\text{TrueProbability}(\text{Outcome})}$$

*Example (Dice Wheel with 97% RTP)*:
```ts
const winChance = targetRange / 100; // e.g. 0.50 for 50% chance
const multiplier = Math.floor((0.97 / winChance) * 100) / 100; // 1.94x
```

### **Model Type 2: Hand-Authored Paytable Matrix (Verified via Probability Sum)**
Used when paytables are customized per risk level or bucket (e.g., Plinko, Keno, Slot Reels):
$$\text{RTP} = \sum_{i=1}^{N} P(\text{Outcome}_i) \times \text{Multiplier}_i$$

*Constraint*: The calculated sum **MUST equal target RTP within $\pm 0.1\%$**.

---

## 💰 3. Bet & Win Constraints

1. **DB-Sourced Bet Limits**:
   `minBet` and `maxBet` are retrieved dynamically from `gambling.games` DB table per currency. Never hardcode static limits.
2. **Absolute Max Win Protection**:
   To protect balance liquidity, enforce dynamic max bet ceiling on variable payout games:
   $$\text{MaxBetCeiling} = \min\left(\text{DbMaxBet}, \left\lfloor \frac{\text{ABSOLUTE\_MAX\_WIN}}{\text{TopMultiplier}} \right\rfloor \right)$$
   *Default Platform `ABSOLUTE_MAX_WIN`*: **140,000 CC** (approx. 1,000 TON, where 1 TON = $1.40 = 140 Cherry Coin).

---

## 📋 4. Required Output from Math Architect Agent

When generating a game's math specification, the agent must output a structured JSON:

```json
{
  "gameId": "neon-wheel",
  "targetRtp": 0.965,
  "provablyFairPattern": "FLOAT_0_1",
  "paytable": [
    { "outcome": "x2_segment", "probability": 0.40, "multiplier": 2.00 },
    { "outcome": "x5_segment", "probability": 0.03, "multiplier": 5.00 },
    { "outcome": "x10_segment", "probability": 0.003, "multiplier": 10.00 }
  ],
  "maxMultiplier": 10.00,
  "absoluteMaxWin": 140000
}
```
