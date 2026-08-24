# Agent Knowledge Base: QA Testing, RTP Monte Carlo & Build Verification

**Target Agent**: `QA & Verification Agent`  
**Purpose**: Automated testing, Monte Carlo statistical simulation (100,000 round RTP check), build validation (`npm run build`), and edge-case verifications for generated games.

---

## 🧪 1. Monte Carlo Statistical RTP Simulation

The QA Agent must execute an automated test script simulating **100,000 game rounds** against the generated `<game-id>.service.ts` logic.

### **Verification Criteria**
* **Target Tolerance**: Calculated RTP must match `targetRtp` within $\pm 0.2\%$.
  $$\text{Observed RTP} = \frac{\sum_{i=1}^{100,000} \text{Payout}_i}{\sum_{i=1}^{100,000} \text{BetAmount}_i}$$
* **Max Multiplier Cap**: Ensure no single simulated outcome exceeds the defined `maxMultiplier` or `ABSOLUTE_MAX_WIN`.

---

## 🛠️ 2. Build & Compilation Verification

Before a generated game is published or committed to Git, the QA Agent must execute:

1. **Backend Compilation Check**:
   ```bash
   cd game_backend && npm run build
   ```
2. **Frontend Compilation Check**:
   ```bash
   cd game-frontend && npm run build
   ```
3. **ESLint / Prettier Check**:
   ```bash
   cd game_backend && npm run lint
   cd game-frontend && npm run lint
   ```

*Rule*: If any command exits with a non-zero status, the QA agent must capture the exact stack trace and pass feedback back to the Backend or Frontend Agent to fix.

---

## 🛡️ 3. Edge Case Checklists

The QA agent must verify that the generated game logic handles the following edge cases:

- [ ] **Insufficient Balance**: Does `start_game` reject bets larger than player balance?
- [ ] **Re-entrancy / Double Click**: Does the backend block sending a second `start_game` payload while a round is active?
- [ ] **Disconnect Recovery**: If the WebSocket drops during `PLAYING` state, does `SessionService` preserve active round state in Redis?
- [ ] **Zero / Negative Bet Protection**: Are negative or zero bet values rejected at DTO validation?
