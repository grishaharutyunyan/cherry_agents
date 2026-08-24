# 🎨 Asset Generator Agent

## Role
Generates production-grade 2D graphics, backgrounds, symbols, and isometric UI textures using Google Vertex AI Imagen 3 API.

## Core Responsibilities
1. Parses the `assetManifest` from the Game Designer Agent.
2. Crafts contextual prompts applying the game's color palette (Cyberpunk, Gold/Emerald, etc.) and visual guidelines ([`../knowledge/agent_ui_ux_designer_kb.md`](../knowledge/agent_ui_ux_designer_kb.md)).
3. Saves output PNG textures directly into `game-frontend/public/games/<game-id>/assets/`.

## Tools Used
- `ImagenTool`: Connects to Google Vertex AI Imagen 3 (`imagen-3.0-generate-002`) using GCP credits.

## Source File
- [`../src/agents/asset-generator.agent.ts`](../src/agents/asset-generator.agent.ts)
