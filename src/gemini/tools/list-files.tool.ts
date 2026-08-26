import * as fs from 'fs';

import { AgentTool } from '../types';
import { PathEscapeError, resolveWithinRoot } from './scoped-fs';

export function makeListFilesTool(monorepoRoot: string): AgentTool {
  return {
    declaration: {
      name: 'list_files',
      description:
        'List the immediate contents of a directory. `path` is relative to the monorepo root ' +
        '(use "" or "." for the monorepo root itself).',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
    execute: (args) => {
      const relPath = String(args.path ?? '.');
      try {
        const resolved = resolveWithinRoot(monorepoRoot, relPath);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
          return { error: `Directory not found: ${relPath}` };
        }
        const entries = fs.readdirSync(resolved, { withFileTypes: true }).map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
        }));
        return { path: relPath, entries };
      } catch (err) {
        if (err instanceof PathEscapeError) return { error: err.message };
        throw err;
      }
    },
  };
}
