# 🧪 QA & Verification Agent

## Role
Autonomous quality assurance and mathematical verification agent. Validates that every generated game conforms to platform safety and RTP constraints before deployment.

## Core Responsibilities
1. **Monte Carlo RTP Simulation**: Simulates 100,000 game rounds in milliseconds to confirm the calculated payout matches the specified target RTP within $\pm 0.5\%$.
2. **Payout Boundary Verification**: Confirms no single round can trigger payouts higher than `maxMultiplier` or the liquidity cap (`140,000 CC`).
3. **Build Integrity Check**: Ensures all TypeScript types, NestJS modules, and React components compile without errors.

## Tools Used
- `RtpSimulatorTool`: 100,000 round statistical Monte Carlo validator.

## Source File
- [`../src/agents/qa-verifier.agent.ts`](../src/agents/qa-verifier.agent.ts)
