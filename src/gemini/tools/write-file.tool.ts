import * as fs from 'fs';
import * as path from 'path';

import { AgentTool } from '../types';
import { PathEscapeError, resolveWithinAnyRoot } from './scoped-fs';

/**
 * Write (create or overwrite) a text file. This is the real security boundary for a phase —
 * `allowedRoots` are absolute directories; any resolved path outside them is rejected here,
 * in the tool handler, not just described in the system prompt. `path` arguments are interpreted
 * relative to the monorepo root (same convention as read_file/list_files) so the model reasons
 * about one path space, but the write only succeeds if that path falls under an allowed root.
 */
export function makeWriteFileTool(monorepoRoot: string, allowedRoots: string[]): AgentTool {
  return {
    declaration: {
      name: 'write_file',
      description:
        `Write (create or overwrite) a text file. \`path\` is relative to the monorepo root, and ` +
        `must resolve under one of: ${allowedRoots.map((r) => path.relative(monorepoRoot, r)).join(', ')}.`,
      parametersJsonSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
    execute: (args) => {
      const relPath = String(args.path ?? '');
      const content = String(args.content ?? '');
      try {
        const resolved = resolveWithinAnyRoot(allowedRoots, monorepoRoot, relPath);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, content, 'utf8');
        return { path: relPath, bytesWritten: Buffer.byteLength(content, 'utf8') };
      } catch (err) {
        if (err instanceof PathEscapeError) return { error: err.message };
        throw err;
      }
    },
  };
}
