# 🤖 Autonomous AI Game Generation Pipeline

This multi-agent system autonomously designs, codes, creates visual assets for, tests, and deploys new casino games into the Cherry platform (`game_backend` and `game-frontend`).

---

## 🏛️ Pipeline Architecture

```
                       ┌────────────────────────────┐
                       │  User Prompt / Game Idea   │
                       └─────────────┬──────────────┘
                                     │
                                     ▼
                       ┌────────────────────────────┐
                       │ 1. Game Designer Agent     │
                       │ (Spec, Math, Rules, RTP)   │
                       └─────────────┬──────────────┘
                                     │
                  ┌──────────────────┴──────────────────┐
                  ▼                                     ▼
   ┌─────────────────────────────┐       ┌─────────────────────────────┐
   │ 2. Backend Builder Agent    │       │ 3. Asset Generator Agent    │
   │ (NestJS, WS, gRPC, Redis)   │       │ (Imagen 3 Visuals & Sounds) │
   └──────────────┬──────────────┘       └──────────────┬──────────────┘
                  │                                     │
                  └──────────────────┬──────────────────┘
                                     ▼
                       ┌────────────────────────────┐
                       │ 4. Frontend Builder Agent  │
                       │ (Next.js, PixiJS, State)   │
                       └─────────────┬──────────────┘
                                     │
                                     ▼
                       ┌────────────────────────────┐
                       │ 5. QA & Verification Agent │
                       │ (Monte Carlo & Build Check)│
                       └─────────────┬──────────────┘
                                     │
                                     ▼
                       ┌────────────────────────────┐
                       │     Ready for Deploy       │
                       │   (Contabo VPS Live Game)  │
                       └────────────────────────────┘
```

---

## 👥 The 5 Specialized Agents

| Agent | Responsibilities | Target Knowledge Base / Output |
| :--- | :--- | :--- |
| **[Game Designer](game-designer-agent.md)** | Takes prompt, generates strict JSON Game Spec (RTP, volatility, state machine, paytable, provably-fair pattern). | [`../knowledge/agent_math_architect_kb.md`](../knowledge/agent_math_architect_kb.md) |
| **[Asset Generator](asset-generator-agent.md)** | Generates backgrounds, symbols, UI elements via Vertex AI Imagen 3 API. | [`../knowledge/agent_ui_ux_designer_kb.md`](../knowledge/agent_ui_ux_designer_kb.md) |
| **[Backend Builder](backend-builder-agent.md)** | Scaffolds and writes NestJS module, controller, service, round config in `game_backend/src/games/<id>/`. | [`../knowledge/agent_backend_engineer_kb.md`](../knowledge/agent_backend_engineer_kb.md) |
| **[Frontend Builder](frontend-builder-agent.md)** | Scaffolds React state hook, PixiJS canvas, UI controls, route in `game-frontend/games/<id>/`. | [`../knowledge/agent_frontend_engineer_kb.md`](../knowledge/agent_frontend_engineer_kb.md) |
| **[QA Verifier](qa-verifier-agent.md)** | Runs 100k Monte Carlo RTP simulation, validates TypeScript build, verifies WebSocket contract. | [`../knowledge/agent_qa_verifier_kb.md`](../knowledge/agent_qa_verifier_kb.md) |

---

## 🚀 Running the Generation CLI

```bash
cd agents
npm install
npm run generate -- --prompt "Cyberpunk Neon Multiplier Wheel with 96.5% RTP"
```
