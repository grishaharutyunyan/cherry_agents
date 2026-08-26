import * as fs from 'fs';

import { AgentTool } from '../types';
import { PathEscapeError, resolveWithinRoot } from './scoped-fs';

/** Read-only, scoped to the whole monorepo — every phase gets this (low risk, needed for context like reading an existing game's service for reference). */
export function makeReadFileTool(monorepoRoot: string): AgentTool {
  return {
    declaration: {
      name: 'read_file',
      description:
        'Read the full UTF-8 text contents of a file. `path` is relative to the monorepo root, ' +
        'e.g. "docs/knowledge/gambling-math-rtp.md" or "game_backend/src/games/plinko/plinko.service.ts".',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
    execute: (args) => {
      const relPath = String(args.path ?? '');
      try {
        const resolved = resolveWithinRoot(monorepoRoot, relPath);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
          return { error: `File not found: ${relPath}` };
        }
        return { path: relPath, content: fs.readFileSync(resolved, 'utf8') };
      } catch (err) {
        if (err instanceof PathEscapeError) return { error: err.message };
        throw err;
      }
    },
  };
}
