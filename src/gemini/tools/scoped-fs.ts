import * as path from 'path';

export class PathEscapeError extends Error {
  constructor(relativePath: string, allowedRoots: string[]) {
    super(`Path "${relativePath}" resolves outside allowed root(s): ${allowedRoots.join(', ')}`);
  }
}

function isWithin(resolved: string, root: string): boolean {
  const normalizedRoot = path.resolve(root);
  // Filesystem root is a degenerate case: `normalizedRoot + path.sep` would be "//", which no
  // real absolute path starts with, so every path would wrongly fail this check.
  if (normalizedRoot === path.sep) return true;
  return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
}

/** Resolves `relativePath` against `root`, throwing if the result escapes `root` (e.g. via `..`). */
export function resolveWithinRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!isWithin(resolved, root)) {
    throw new PathEscapeError(relativePath, [root]);
  }
  return resolved;
}

/** Resolves `relativePath` against `baseForRelative`, throwing unless the result falls under one of `roots`. */
export function resolveWithinAnyRoot(roots: string[], baseForRelative: string, relativePath: string): string {
  const resolved = path.resolve(baseForRelative, relativePath);
  if (!roots.some((root) => isWithin(resolved, root))) {
    throw new PathEscapeError(relativePath, roots);
  }
  return resolved;
}
