import { PoolClient } from 'pg';

import { pool } from './client';

/**
 * GAME_BACKEND_PATH/GAME_FRONTEND_PATH are single shared working-directory checkouts, not
 * per-run clones — every phase except parsing does a `git checkout` in that same directory.
 * The per-run row lock in runs.repo.ts only stops two workers from double-processing the SAME
 * run; it does nothing to stop two workers from processing two DIFFERENT runs at once, which
 * would race on that same `git checkout`. This is a second, session-scoped Postgres advisory
 * lock guarding the shared working directories themselves, held for one tick's entire phase
 * processing, across every worker instance — not just this process.
 *
 * One fixed, arbitrary key: there is only one shared git working-directory pair for the whole
 * service, so a single global lock is enough — no need to key by run or game.
 */
const GIT_WORKTREE_LOCK_KEY = 837_402_991;

export interface GitLock {
  release(): Promise<void>;
}

/**
 * Non-blocking. Advisory locks are tied to the session (the specific connection), so this
 * checks out one dedicated client from the pool for the lock's whole lifetime rather than using
 * pool.query() — that could hand the lock and unlock calls to two different pooled connections,
 * silently no-op-ing the unlock and leaking the lock held forever on the original connection.
 * Returns null immediately if another worker already holds it; the caller should skip this tick
 * rather than block the poll loop waiting on a phase that could run for minutes.
 */
export async function tryAcquireGitLock(): Promise<GitLock | null> {
  const client: PoolClient = await pool.connect();
  const { rows } = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1) AS acquired', [
    GIT_WORKTREE_LOCK_KEY,
  ]);
  if (!rows[0]?.acquired) {
    client.release();
    return null;
  }
  return {
    release: async () => {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [GIT_WORKTREE_LOCK_KEY]);
      } finally {
        client.release();
      }
    },
  };
}
