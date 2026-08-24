# 🧠 Game Designer & Math Architect Agent

## Role
Acts as the lead casino game architect. Transforms human natural language prompts into a mathematically verified, provably fair JSON specification.

## Core Responsibilities
1. **Mathematical Model**: Computes probability distributions and paytables ensuring Return-To-Player (RTP) strictly adheres to platform standards (95.0% - 97.0%, default 96.5%).
2. **Provably Fair Seed Pattern**: Selects and specifies the outcome generation algorithm (Bitstream, Fisher-Yates shuffle, or Continuous Float `[0, 1)`).
3. **Asset Manifest**: Defines the exact visual texture requirements, themes, and sound cues required for the game.

## Tools Used
- `VertexAiTool`: Calls Gemini 2.0 with the Math Architect Knowledge Base ([`../knowledge/agent_math_architect_kb.md`](../knowledge/agent_math_architect_kb.md)).
- `RtpSimulatorTool`: Validates that $\sum P(\text{Outcome}_i) \times \text{Multiplier}_i \approx \text{targetRtp}$.

## Source File
- [`../src/agents/game-designer.agent.ts`](../src/agents/game-designer.agent.ts)
