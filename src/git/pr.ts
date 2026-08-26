import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function gh(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('gh', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

/**
 * Creates a PR for `branch` against `base`, or returns the existing one's URL if a retry already
 * created it (finalize can re-run after a worker restart mid-phase — `gh pr create` errors on a
 * duplicate, so check first rather than treating that as a failure).
 */
export async function ensurePr(cwd: string, branch: string, base: string, title: string, body: string): Promise<string> {
  try {
    const existing = await gh(cwd, ['pr', 'view', branch, '--json', 'url', '-q', '.url']);
    if (existing) return existing;
  } catch {
    // No existing PR for this branch — fall through and create one.
  }
  const out = await gh(cwd, ['pr', 'create', '--base', base, '--head', branch, '--title', title, '--body', body]);
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const url = lines[lines.length - 1];
  if (!url || !url.startsWith('http')) {
    throw new Error(`gh pr create in ${cwd} did not return a PR URL: ${out}`);
  }
  return url;
}
