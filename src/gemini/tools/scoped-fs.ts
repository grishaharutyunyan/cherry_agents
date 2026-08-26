import * as path from 'path';

export class PathEscapeError extends Error {
  constructor(relativePath: string, allowedRoots: string[]) {
    super(`Path "${relativePath}" resolves outside allowed root(s): ${allowedRoots.join(', ')}`);
  }
}

function isWithin(resolved: string, root: string): boolean {
  const normalizedRoot = path.resolve(root);
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
