import { VertexAiTool } from '../tools/vertex-ai.tool';
import { FileWriterTool } from '../tools/file-writer.tool';
import * as path from 'path';
import { config } from '../config';

export interface GameSpec {
  gameId: string;
  gameTitle: string;
  gameTitleRu: string;
  theme: string;
  themeRu: string;
  accentColor: string;
  secondaryColor: string;
  gameType: 'wheel' | 'crash' | 'grid' | 'cards' | 'ladder' | 'slots' | 'dice';
  targetRtp: number;
  provablyFairPattern: 'BITSTREAM' | 'FISHER_YATES' | 'FLOAT_0_1';
  maxMultiplier: number;
  paytable: Array<{
    outcome: string;
    probability: number;
    multiplier: number;
    label: string;
    labelRu: string;
    glowColor: string;
  }>;
  assetManifest: Array<{ name: string; prompt: string; aspectRatio: '1:1' | '16:9'; filename: string }>;
  soundCues: string[];
  playfulFeatures: string[];
}

const INNOVATION_ARCHETYPES = [
  {
    theme: 'Cyberpunk TON Vault',
    themeRu: 'Киберпанк TON Хранилище',
    accentColor: '#00f0ff',
    secondaryColor: '#ff007f',
    type: 'wheel' as const,
    title: 'Neon Multiplier Vortex',
    titleRu: 'Неоновый Вихрь Множителей',
  },
  {
    theme: 'Luxury Obsidian & 24k Gold',
    themeRu: 'Обсидиан и 24к Золото',
    accentColor: '#f0c040',
    secondaryColor: '#10b981',
    type: 'grid' as const,
    title: 'Imperial Gem Vault',
    titleRu: 'Императорское Хранилище Самоцветов',
  },
  {
    theme: 'Quantum Nebula Warp',
    themeRu: 'Квантовая Туманность',
    accentColor: '#a78bfa',
    secondaryColor: '#38bdf8',
    type: 'crash' as const,
    title: 'Cosmic Multiplier Rocket',
    titleRu: 'Космическая Ракета Множителей',
  },
  {
    theme: 'Tokyo Night Matrix',
    themeRu: 'Токийская Ночная Матрица',
    accentColor: '#ef4444',
    secondaryColor: '#f59e0b',
    type: 'dice' as const,
    title: 'Cyber Samurai Dice Duel',
    titleRu: 'Кибер Самурай Дуэль Костей',
  },
  {
    theme: 'Holographic Prism Crypto',
    themeRu: 'Голографическая Крипто Призма',
    accentColor: '#38bdf8',
    secondaryColor: '#c084fc',
    type: 'ladder' as const,
    title: 'Web3 Lightning Ladder',
    titleRu: 'Web3 Молниеносная Лестница',
  },
];

export class GameDesignerAgent {
  static async planGame(userPrompt: string): Promise<GameSpec> {
    console.log(`🧠 [Game Designer Agent] Innovating new Web3 casino game design from: "${userPrompt}"`);

    const mathKb = FileWriterTool.readFile(path.join(config.paths.knowledge, 'agent_math_architect_kb.md')) || '';
    const uiKb = FileWriterTool.readFile(path.join(config.paths.knowledge, 'agent_ui_ux_designer_kb.md')) || '';

    const systemPrompt = `You are the Lead Web3 Casino Game Innovation Architect for Cherry Platform.
Every game you design must be distinct, visually stunning, playful, and mathematically airtight.
REQUIREMENTS:
1. Target RTP: strictly between 0.95 and 0.97 (default 0.965).
2. Currencies: Cherry Coin (CC), where 1 TON = $1.40 = 140 CC.
3. Multi-language: Provide both English and Russian titles, themes, and outcome labels.
4. Aesthetics: Web3/crypto dark glassmorphism, neon glow accents, energetic playful vibe.
5. Paytable: Sum of (probability * multiplier) must equal targetRtp.
6. Assets: Exactly 2 items in assetManifest: 'background' (bg.png) and 'hero_asset' (hero.png). NEVER generate images for buttons, chips, or click states (they must use pure CSS/Tailwind).`;

    try {
      const spec = await VertexAiTool.generateJson<GameSpec>({
        systemPrompt,
        userPrompt,
        knowledgeBaseContext: `${mathKb}\n\n${uiKb}`,
      });
      return spec;
    } catch (e) {
      // Dynamic Randomization Archetype Fallback if offline
      const archetype = INNOVATION_ARCHETYPES[Math.floor(Math.random() * INNOVATION_ARCHETYPES.length)];
      const slug = (userPrompt ? userPrompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '') || archetype.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      return {
        gameId: slug,
        gameTitle: userPrompt || archetype.title,
        gameTitleRu: archetype.titleRu,
        theme: archetype.theme,
        themeRu: archetype.themeRu,
        accentColor: archetype.accentColor,
        secondaryColor: archetype.secondaryColor,
        gameType: archetype.type,
        targetRtp: 0.965,
        provablyFairPattern: 'FLOAT_0_1',
        maxMultiplier: 10.0,
        paytable: [
          { outcome: 'tier_1', probability: 0.40, multiplier: 2.0, label: '2× Multiplier Burst', labelRu: '2× Всплеск Множителя', glowColor: archetype.accentColor },
          { outcome: 'tier_2', probability: 0.04, multiplier: 3.0, label: '3× Super Charge', labelRu: '3× Супер Заряд', glowColor: archetype.secondaryColor },
          { outcome: 'tier_3', probability: 0.008, multiplier: 5.0, label: '5× Mega Surge', labelRu: '5× Мега Всплеск', glowColor: '#f0c040' },
          { outcome: 'tier_jackpot', probability: 0.0005, multiplier: 10.0, label: '10× Web3 Cyber Jackpot', labelRu: '10× Web3 Кибер Джекпот', glowColor: '#10b981' },
          { outcome: 'miss', probability: 0.5515, multiplier: 0.0, label: 'No Win', labelRu: 'Без Выигрыша', glowColor: '#64748b' },
        ],
        assetManifest: [
          { name: 'background', prompt: `Ultra high-end ${archetype.theme} casino backdrop, volumetric neon lighting, cinematic 4k raytracing, dark atmospheric glassmorphism`, aspectRatio: '16:9', filename: 'bg.png' },
          { name: 'hero_asset', prompt: `Isometric 2D glowing ${archetype.theme} game center asset, floating holographic neon crystals, transparent background`, aspectRatio: '1:1', filename: 'hero.png' },
        ],
        soundCues: ['spin_start', 'multiplier_tick', 'big_win_fanfare', 'jackpot_crescendo', 'tactile_chip_click'],
        playfulFeatures: [
          'Live Web3 Provably Fair Hash Inspector Modal',
          'Tactile Quick-Bet Chips (+10, +50, +100, MAX)',
          'Particle Fireworks on 5x+ Wins',
          'Haptic Pulse Integration for Telegram TMA',
        ],
      };
    }
  }
}
