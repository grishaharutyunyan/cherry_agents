import * as fs from 'fs';
import * as path from 'path';

import { AgentTool } from '../types';
import { resolveWithinRoot } from './scoped-fs';

const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_PATTERN = /\brgba?\([^)]*\)/g;
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);
// The token *values* have to be defined with real hex somewhere (a CSS custom-property block or
// a Tailwind theme extension) — that's legitimate, not a violation. frontend-build.phase.ts's
// system prompt mandates this definition live in exactly one of these filenames so the exclusion
// is reliable without needing to know the agent's exact chosen path in advance.
const SKIP_FILENAMES = new Set(['theme.css', 'theme.ts', 'theme.tsx']);

function walk(dir: string, excludeAbs: Set<string>, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (excludeAbs.has(full) || SKIP_FILENAMES.has(entry.name)) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, excludeAbs, out);
    } else if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

/**
 * Deterministic pattern match, not LLM judgment — see the 2026-08-28 design-tokens spec's "Why
 * these boundaries": this is a dedicated tool rather than something QA's agent has to remember to
 * notice while doing everything else. Scans every code/style file under `scanDir` for a raw hex or
 * rgb()/rgba() color literal, excluding `excludePaths` (the token JSON itself legitimately
 * contains these — it's the source of truth the component files should reference instead).
 */
export function makeLintHardcodedColorsTool(monorepoRoot: string, scanDir: string, excludePaths: string[]): AgentTool {
  return {
    declaration: {
      name: 'lint_hardcoded_colors',
      description:
        'Scan the frontend game directory for hardcoded hex or rgb()/rgba() color literals that ' +
        'should instead reference a design-token CSS variable. Takes no arguments — the directory ' +
        'and exclusions are fixed for this QA run. Returns { hits: [{file, line, match}], clean }.',
      parametersJsonSchema: { type: 'object', properties: {} },
    },
    execute: () => {
      const excludeAbs = new Set(excludePaths.map((p) => resolveWithinRoot(monorepoRoot, p)));
      const files: string[] = [];
      if (fs.existsSync(scanDir)) walk(scanDir, excludeAbs, files);

      const hits: { file: string; line: number; match: string }[] = [];
      for (const absFile of files) {
        const rel = path.relative(monorepoRoot, absFile);
        const lines = fs.readFileSync(absFile, 'utf8').split('\n');
        lines.forEach((lineText, idx) => {
          for (const m of lineText.match(HEX_PATTERN) ?? []) hits.push({ file: rel, line: idx + 1, match: m });
          for (const m of lineText.match(RGB_PATTERN) ?? []) hits.push({ file: rel, line: idx + 1, match: m });
        });
      }
      return { hits, clean: hits.length === 0 };
    },
  };
}
