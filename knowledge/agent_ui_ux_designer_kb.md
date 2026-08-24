# Agent Knowledge Base: Web3, Playful & Next-Gen Casino UI/UX

**Target Agent**: `UI/UX Visual Design Agent`  
**Purpose**: Directives for creating state-of-the-art, innovative, Web3-native, and immersive casino game interfaces that feel fresh, dynamic, and professional on every generation.

---

## 💎 1. The Web3 & Next-Gen Visual Aesthetic Matrix

To ensure games never look repetitive or basic, agents must draw from and blend distinct **Visual Design Archetypes**:

```
 ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
 │   1. Cyberpunk TON    │   │  2. Luxury Obsidian   │   │  3. Holographic Sci-Fi│
 │ Neon Glows, Dark HUD, │   │ 24k Gold Accents, Deep│   │ Glass Iridescence,    │
 │ Synthwave Grid, Cyan  │   │ Emerald, Marble, Silk │   │ Prismatic Flares, Pure│
 └───────────────────────┘   └───────────────────────┘   └───────────────────────┘
 ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
 │  4. Retro Neo-Arcade  │   │  5. Quantum Nebula    │   │ 6. Tokyo Night Matrix │
 │ 80s Pixel-Glow, Bold  │   │ Deep Space Violet,    │   │ Neon Kanzi, Rain Slick│
 │ Typography, CRT flares│   │ Stardust, Warp Trails │   │ Asphalt, Red & Amber  │
 └───────────────────────┘   └───────────────────────┘   └───────────────────────┘
```

---

## 🚀 2. Playful & Engaging Micro-Interactions

Every casino game must feel **alive, tactile, and rewarding**:

### A. Dynamic Win Celebrations (Crescendo Tiers)
* **Standard Win (`< 3x`)**: Crisp coin drop audio cue, subtle emerald border pulse, multiplier tick-up.
* **Big Win (`3x - 10x`)**: Screen shake effect, golden particle burst from center, celebratory synth fanfare.
* **Mega Win / Jackpot (`> 10x`)**: Fullscreen WebGL particle explosion (golden coins + glowing stars), vibrating haptic pulse sequence, animated badge: `🔥 MEGA WIN 🔥`.

### B. Provably Fair Web3 Inspector Badge
* Every game UI includes an interactive **"Provably Fair"** modal/pill in the top corner.
* Displays:
  * `Server Seed (SHA-256 Hash)`: Click-to-copy button.
  * `Client Seed`: Editable text input for transparency.
  * `Nonce`: Live incrementing counter.
* *Effect*: Builds player trust and reinforces the Web3 decentralized crypto gaming feel.

### C. Quick-Bet Interactive Chips
Instead of plain text inputs, provide **tactile chip selectors**:
* Preset Chips: `[+10 CC]`, `[+50 CC]`, `[+100 CC]`, `[+500 CC]`, `[½]`, `[2×]`, `[MAX]`.
* Animated button presses with tactile audio clicks and Telegram haptic feedback.

---

## 🎨 3. Next-Gen Imagen 3 Asset Rules (STRICT LIMIT: 2 Assets Only)

**CRITICAL INVARIANT**: 
* **NEVER generate images for buttons, click states, chips, arrows, or UI icons.**
* All UI buttons (`PLACE BET`, `½`, `2×`, `+10 CC`), badges, and interactive controls must be rendered using **pure CSS, Tailwind, Lucide React icons, and WebGL vector graphics**.
* Google Imagen 3 is used **strictly for 2 assets only**:
  1. **Game Background (`bg.png`)**: 16:9 atmospheric backdrop.
  2. **Hero Centerpiece Art (`hero.png`)**: 1:1 main visual (wheel, crystal core, rocket, or emblem).

* ❌ **Bad/Boring**: `"Button click image"` or `"A casino wheel"`
* ✅ **State-of-the-Art Hero Art**: `"Hyper-futuristic cyberpunk multiplier roulette wheel, floating holographic neon cyan and magenta segments, glowing plasma center core, dark obsidian metallic chassis, volumetric lighting, raytracing, unreal engine 5 render, dark backdrop, isolated 2D game asset, transparent background"`
* ✅ **State-of-the-Art Background**: `"Atmospheric luxury underground crypto casino vault, dark moody cinematic lighting, glowing blue neon laser grids, floating digital particle dust, ultra-wide 16:9 4k backdrop, depth of field"`

---

## ⚡ 4. 60 FPS PixiJS WebGL Visual Standards

* **Glow Filters & Bloom**: Use PixiJS shaders or multi-layered alpha circles to create intense glowing light orbs.
* **Dynamic Motion Trails**: When objects move (wheel spins, crash rocket flies, plinko ball drops), render velocity-based alpha trails.
* **Responsive Scaling**: Pixi stage must dynamically adapt to portrait mobile screens (Telegram Mini App) and desktop viewports without clipping.
