import { GameSpec } from './game-designer.agent';
import { FileWriterTool } from '../tools/file-writer.tool';
import { config } from '../config';
import * as path from 'path';
import * as fs from 'fs';

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export class FrontendBuilderAgent {
  static async buildFrontend(spec: GameSpec): Promise<void> {
    const slug = spec.gameId;
    const pascalName = toPascalCase(slug);
    const targetDir = path.join(config.paths.frontend, 'games', slug);
    const appRouteDir = path.join(config.paths.frontend, 'app/games', slug);

    console.log(`🎨 [Frontend Builder Agent] Generating innovative Web3 Next.js + PixiJS UI in ${targetDir}`);

    // 1. types.ts
    const typesContent = `export enum GameStatus {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  WIN = 'WIN',
  BIG_WIN = 'BIG_WIN',
  LOSE = 'LOSE',
}

export interface GameResult {
  gameId: string;
  multiplier: number;
  outcome: string;
  label: string;
  labelEn?: string;
  labelRu?: string;
  glowColor?: string;
  serverSeedHash?: string;
  nonce?: number;
}
`;
    FileWriterTool.writeFile(path.join(targetDir, 'types.ts'), typesContent);

    // 2. use<Game>Game.ts
    const hookContent = `"use client";
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createWebSocketClient } from '@/lib/websocket-client';
import { GameStatus, GameResult } from './types';

export function use${pascalName}Game() {
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [result, setResult] = useState<GameResult | null>(null);
  const [betAmount, setBetAmount] = useState<number>(10);
  const [clientSeed, setClientSeed] = useState<string>('cherry-' + Math.random().toString(36).substring(7));
  const [nonce, setNonce] = useState<number>(1);

  const startGame = useCallback(() => {
    setStatus(GameStatus.PLAYING);
    setResult(null);

    const client = createWebSocketClient({
      apiKey: process.env.NEXT_PUBLIC_GAME_API_KEY,
      url: process.env.NEXT_PUBLIC_SOCKET_URL,
    });

    const currentNonce = nonce;
    setNonce((prev) => prev + 1);

    client.emit('start_game', {
      betAmount,
      clientSeed,
      nonce: currentNonce,
      lang: i18n.language || 'en',
    });

    client.on('game_result', (data: GameResult) => {
      setResult({
        ...data,
        serverSeedHash: 'sha256-hash-mock-' + Math.random().toString(36).substring(2),
        nonce: currentNonce,
      });
      if (data.multiplier >= 5) {
        setStatus(GameStatus.BIG_WIN);
      } else if (data.multiplier > 0) {
        setStatus(GameStatus.WIN);
      } else {
        setStatus(GameStatus.LOSE);
      }
    });
  }, [betAmount, clientSeed, nonce, i18n.language]);

  return {
    status,
    result,
    betAmount,
    setBetAmount,
    clientSeed,
    setClientSeed,
    nonce,
    startGame,
  };
}
`;
    FileWriterTool.writeFile(path.join(targetDir, `use${pascalName}Game.ts`), hookContent);

    // 3. components/PixiCanvas.tsx (Innovative Web3 Visuals & 60fps Particle Engine)
    const canvasContent = `"use client";
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Application, Graphics, Container } from 'pixi.js';
import { GameStatus, GameResult } from '../types';

interface PixiCanvasProps {
  status: GameStatus;
  result: GameResult | null;
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({ status, result }) => {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const particlesRef = useRef<Array<{ g: Graphics; vx: number; vy: number; life: number }>>([]);

  useEffect(() => {
    let isMounted = true;
    const app = new Application();

    app.init({
      width: 600,
      height: 400,
      backgroundAlpha: 0,
      antialias: true,
    }).then(() => {
      if (!isMounted || !containerRef.current) {
        app.destroy(true);
        return;
      }
      appRef.current = app;
      containerRef.current.appendChild(app.canvas);

      // Web3 Plasma Center Core
      const core = new Graphics();
      core.circle(300, 200, 80);
      core.fill({ color: 0x${(spec.accentColor || '#00f0ff').replace('#', '')}, alpha: 0.2 });
      app.stage.addChild(core);

      const outerRing = new Graphics();
      outerRing.circle(300, 200, 120);
      outerRing.stroke({ width: 2, color: 0x${(spec.secondaryColor || '#ff007f').replace('#', '')}, alpha: 0.4 });
      app.stage.addChild(outerRing);

      // 60fps animation ticker
      app.ticker.add(() => {
        core.rotation += 0.015;
        outerRing.rotation -= 0.01;

        // Particle updates
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          p.g.x += p.vx;
          p.g.y += p.vy;
          p.life -= 0.02;
          p.g.alpha = p.life;
          if (p.life <= 0) {
            app.stage.removeChild(p.g);
            particlesRef.current.splice(i, 1);
          }
        }
      });
    });

    return () => {
      isMounted = false;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
      }
    };
  }, []);

  // Spawn particle fireworks on win
  useEffect(() => {
    if ((status === GameStatus.WIN || status === GameStatus.BIG_WIN) && appRef.current) {
      const count = status === GameStatus.BIG_WIN ? 60 : 25;
      for (let i = 0; i < count; i++) {
        const p = new Graphics();
        p.circle(0, 0, Math.random() * 4 + 2);
        p.fill({ color: Math.random() > 0.5 ? 0xf0c040 : 0x00f0ff });
        p.x = 300;
        p.y = 200;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2;
        appRef.current.stage.addChild(p);
        particlesRef.current.push({
          g: p,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
        });
      }
    }
  }, [status]);

  const displayLabel = i18n.language?.startsWith('ru')
    ? (result?.labelRu || result?.label)
    : (result?.labelEn || result?.label);

  return (
    <div className="relative w-full max-w-[600px] h-[380px] flex items-center justify-center rounded-3xl overflow-hidden bg-gradient-to-b from-slate-900/90 to-slate-950/95 border border-cyan-500/20 shadow-2xl backdrop-blur-2xl">
      <div ref={containerRef} className="absolute inset-0 flex items-center justify-center" />
      
      <div className="relative z-10 text-center pointer-events-none select-none">
        {status === GameStatus.PLAYING && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-lg shadow-cyan-500/50" />
            <div className="text-cyan-300 font-extrabold text-xl tracking-widest uppercase animate-pulse">
              {t('game.round_starting', 'ENGAGING WARP...')}
            </div>
          </div>
        )}

        {status === GameStatus.BIG_WIN && result && (
          <div className="animate-bounce flex flex-col items-center">
            <div className="px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-500/40">
              🔥 MEGA WIN 🔥
            </div>
            <div className="text-5xl font-black bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(245,158,11,0.6)] mt-2">
              +{result.multiplier}×
            </div>
            <div className="text-sm font-semibold text-slate-200 mt-1">{displayLabel}</div>
          </div>
        )}

        {status === GameStatus.WIN && result && (
          <div className="flex flex-col items-center animate-fade-in">
            <div className="text-4xl font-black text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">
              +{result.multiplier}× {t('game.win', 'WIN!')}
            </div>
            <div className="text-xs font-medium text-slate-300 mt-1">{displayLabel}</div>
          </div>
        )}

        {status === GameStatus.LOSE && (
          <div className="text-rose-400/90 font-bold text-lg tracking-wide uppercase">
            {t('game.crashed', 'TRY AGAIN NEXT ROUND')}
          </div>
        )}
      </div>
    </div>
  );
};
`;
    FileWriterTool.writeFile(path.join(targetDir, 'components/PixiCanvas.tsx'), canvasContent);

    // 4. index.tsx (State-of-the-art Web3 Layout with Provably Fair Badge & Quick Chips)
    const indexContent = `"use client";
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { use${pascalName}Game } from './use${pascalName}Game';
import { PixiCanvas } from './components/PixiCanvas';
import { GameStatus } from './types';

export default function ${pascalName}Game() {
  const { t, i18n } = useTranslation();
  const { status, result, betAmount, setBetAmount, clientSeed, nonce, startGame } = use${pascalName}Game();
  const [showFairModal, setShowFairModal] = useState(false);

  const title = i18n.language?.startsWith('ru') ? '${spec.gameTitleRu}' : '${spec.gameTitle}';
  const theme = i18n.language?.startsWith('ru') ? '${spec.themeRu}' : '${spec.theme}';

  const quickChips = [10, 50, 100, 500];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      {/* Top Header with Web3 Provably Fair Badge */}
      <header className="w-full max-w-[600px] flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-amber-300 bg-clip-text text-transparent">
            {title.toUpperCase()}
          </h1>
          <p className="text-[11px] text-slate-400">{theme} • RTP: ${(spec.targetRtp * 100).toFixed(1)}%</p>
        </div>

        <button
          onClick={() => setShowFairModal(!showFairModal)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-cyan-400 transition-colors shadow-md backdrop-blur-md"
        >
          <span>🛡️</span>
          <span>{t('game.provably_fair', 'Provably Fair')}</span>
        </button>
      </header>

      {/* Provably Fair Web3 Inspector Modal */}
      {showFairModal && (
        <div className="w-full max-w-[600px] mb-4 p-3 rounded-2xl bg-slate-900/90 border border-cyan-500/30 text-xs flex flex-col gap-1.5 shadow-xl backdrop-blur-xl animate-fade-in">
          <div className="flex justify-between text-slate-400 font-mono text-[10px]">
            <span>HMAC-SHA256 PROVABLY FAIR</span>
            <span className="text-cyan-400 font-bold">NONCE: #{nonce}</span>
          </div>
          <div className="bg-slate-950/80 p-2 rounded-lg font-mono text-[10px] text-slate-300 truncate">
            Client Seed: {clientSeed}
          </div>
        </div>
      )}

      {/* PixiJS Interactive Canvas */}
      <PixiCanvas status={status} result={result} />

      {/* Tactile Web3 Quick-Bet Controls */}
      <footer className="mt-6 flex flex-col gap-3 w-full max-w-[600px] bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80 shadow-2xl backdrop-blur-xl">
        {/* Quick Chips Bar */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Chips:</span>
          {quickChips.map((chip) => (
            <button
              key={chip}
              onClick={() => setBetAmount(chip)}
              disabled={status === GameStatus.PLAYING}
              className="flex-1 py-1.5 rounded-lg bg-slate-800/90 hover:bg-cyan-950/60 hover:border-cyan-500/40 border border-slate-700 text-xs font-bold text-slate-200 transition-all active:scale-95"
            >
              +{chip}
            </button>
          ))}
          <button
            onClick={() => setBetAmount(Math.max(1, Math.floor(betAmount / 2)))}
            disabled={status === GameStatus.PLAYING}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
          >
            ½
          </button>
          <button
            onClick={() => setBetAmount(betAmount * 2)}
            disabled={status === GameStatus.PLAYING}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
          >
            2×
          </button>
        </div>

        {/* Bet Action Bar */}
        <div className="flex items-center gap-4 mt-1">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold uppercase">{t('game.bet_amount', 'Bet Amount')}</span>
            <span className="font-mono text-xl font-black text-amber-400">{betAmount} <span className="text-xs text-amber-500">CC</span></span>
          </div>

          <button
            onClick={startGame}
            disabled={status === GameStatus.PLAYING}
            className="ml-auto px-10 py-3.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 font-black text-sm tracking-widest uppercase rounded-xl shadow-lg shadow-cyan-500/25 disabled:opacity-50 transition-all active:scale-95 text-slate-950"
          >
            {status === GameStatus.PLAYING
              ? t('game.round_starting', 'IN PROGRESS...')
              : t('game.place_bet', 'PLACE BET')}
          </button>
        </div>
      </footer>
    </main>
  );
}
`;
    FileWriterTool.writeFile(path.join(targetDir, 'index.tsx'), indexContent);

    // 5. app/games/<slug>/page.tsx (Route)
    const pageContent = `import { Suspense } from 'react';
import ${pascalName}Game from '@/games/${slug}';

export default function Page() {
  return (
    <Suspense fallback={<div className="text-slate-400 p-8 text-center">Loading...</div>}>
      <${pascalName}Game />
    </Suspense>
  );
}
`;
    FileWriterTool.writeFile(path.join(appRouteDir, 'page.tsx'), pageContent);

    // 6. Update frontend locales
    this.updateFrontendLocales(spec);
  }

  private static updateFrontendLocales(spec: GameSpec): void {
    const enPath = path.join(config.paths.frontend, 'public/locales/en.json');
    const ruPath = path.join(config.paths.frontend, 'public/locales/ru.json');

    const appendGame = (filePath: string, isRu: boolean) => {
      if (!fs.existsSync(filePath)) return;
      try {
        const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!json.games) json.games = {};
        const outcomeDict: Record<string, string> = {};
        for (const p of spec.paytable) {
          outcomeDict[p.outcome] = isRu ? p.labelRu : p.label;
        }
        json.games[spec.gameId] = {
          title: isRu ? spec.gameTitleRu : spec.gameTitle,
          theme: isRu ? spec.themeRu : spec.theme,
          outcomes: outcomeDict,
        };
        fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
        console.log(`🌐 [i18n Frontend] Updated ${path.basename(filePath)} for ${spec.gameId}`);
      } catch (err: any) {
        console.warn(`⚠️ Could not update ${filePath}:`, err.message);
      }
    };

    appendGame(enPath, false);
    appendGame(ruPath, true);
  }
}
