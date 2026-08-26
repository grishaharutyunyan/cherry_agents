import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { AgentTool } from '../types';
import { runExecFile } from './shell-util';

/**
 * QA-only tool: writes the full source of a scratch Monte Carlo script (per
 * qa-rtp-verification.md's skeleton — imports from "../src/games/<id>/...") into a temp file one
 * directory below game_backend's root (so that relative import resolves), runs it via ts-node
 * with cwd=game_backend, then deletes the file — win or lose, it's never left around to be
 * committed. QA has no write_file tool at all; this is its only way to produce/run code, and its
 * only way to write anything to disk, scoped to one throwaway file per call.
 */
export function makeRunSimulationTool(gameBackendPath: string, timeoutMs = 5 * 60 * 1000): AgentTool {
  return {
    declaration: {
      name: 'run_simulation',
      description:
        'Run a Monte Carlo RTP simulation script against the real shipped game_backend code. Pass the ' +
        'full TypeScript source of a scratch script (per qa-rtp-verification.md\'s skeleton) that imports ' +
        'from "../src/games/<id>/..." — it runs via ts-node with cwd=game_backend, then is deleted; never ' +
        'committed. Print only the final JSON summary line from the script to keep output small.',
      parametersJsonSchema: {
        type: 'object',
        properties: { script: { type: 'string' } },
        required: ['script'],
      },
    },
    execute: async (args) => {
      const script = String(args.script ?? '');
      const scratchDir = path.join(gameBackendPath, '.ai-agent-scratch');
      fs.mkdirSync(scratchDir, { recursive: true });
      const scriptPath = path.join(scratchDir, `qa-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.ts`);
      fs.writeFileSync(scriptPath, script, 'utf8');
      try {
        const tsNodeBin = path.join(gameBackendPath, 'node_modules', '.bin', 'ts-node');
        return await runExecFile(tsNodeBin, ['-r', 'tsconfig-paths/register', scriptPath], gameBackendPath, timeoutMs);
      } finally {
        fs.rmSync(scriptPath, { force: true });
      }
    },
  };
}
