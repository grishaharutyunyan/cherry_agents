import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

export async function getHeadSha(cwd: string): Promise<string> {
  return git(cwd, ['rev-parse', 'HEAD']);
}

async function branchExistsLocally(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--verify', branch]);
    return true;
  } catch {
    return false;
  }
}

async function assertClean(cwd: string): Promise<void> {
  const status = await git(cwd, ['status', '--porcelain']);
  if (status) {
    throw new Error(`${cwd} has uncommitted changes — refusing to switch branches`);
  }
}

/**
 * Checks out `branch`, creating it from `baseBranch` if it doesn't exist yet. Idempotent — a
 * retry within the same run (or a build phase re-run after a QA-routed retry) just re-checks-out
 * the same branch and keeps committing to it, matching create-game.md's "same branch, new commit"
 * convention for its Claude-Code-driven counterpart.
 */
export async function ensureBranch(cwd: string, branch: string, baseBranch = 'dev'): Promise<void> {
  await assertClean(cwd);
  if (await branchExistsLocally(cwd, branch)) {
    await git(cwd, ['checkout', branch]);
    return;
  }
  await git(cwd, ['fetch', 'origin', baseBranch]);
  await git(cwd, ['checkout', baseBranch]);
  await git(cwd, ['pull', 'origin', baseBranch]);
  await git(cwd, ['checkout', '-b', branch]);
}

/** Checks out an already-existing branch — for QA/finalize phases, which run after a build phase already created it. */
export async function checkoutBranch(cwd: string, branch: string): Promise<void> {
  await assertClean(cwd);
  await git(cwd, ['checkout', branch]);
}

/** Stages everything and commits, no-op if the working tree is already clean. */
export async function commitAll(cwd: string, message: string): Promise<void> {
  await git(cwd, ['add', '-A']);
  const status = await git(cwd, ['status', '--porcelain']);
  if (!status) return;
  await git(cwd, ['commit', '-m', message]);
}

export async function pushBranch(cwd: string, branch: string): Promise<void> {
  await git(cwd, ['push', '-u', 'origin', branch]);
}
