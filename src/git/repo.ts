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

async function getCurrentBranch(cwd: string): Promise<string> {
  return git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
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
 *
 * The clean-tree check only applies when actually SWITCHING branches — if we're already on
 * `branch`, skip it entirely. A retry that's already sitting on its own feature branch, with its
 * own prior attempt's uncommitted content still staged there (e.g. a commit that failed a
 * commit-msg hook), must not be blocked by that leftover; nothing is at risk since no checkout is
 * happening, and the next commitAll() picks the staged content back up correctly.
 */
export async function ensureBranch(cwd: string, branch: string, baseBranch = 'dev'): Promise<void> {
  if ((await getCurrentBranch(cwd)) === branch) {
    return;
  }
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
  if ((await getCurrentBranch(cwd)) === branch) {
    return;
  }
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

/**
 * Discards all uncommitted changes (tracked and untracked) — used to clean up after a failed
 * agentic session so a partial, never-committed write never poisons the repo for whatever run
 * touches it next. Real precedent: a build phase wrote several files then hit a Vertex AI 429 on
 * a later turn, leaving its branch dirty; an unrelated later run for a different game then hit
 * "has uncommitted changes" from that leftover, on a branch it had nothing to do with.
 */
export async function discardChanges(cwd: string): Promise<void> {
  await git(cwd, ['checkout', '--', '.']);
  await git(cwd, ['clean', '-fd']);
}
