import * as fs from 'fs';
import * as path from 'path';

import { pool } from './client';

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'db', 'migrations');

/**
 * Runs once at process startup (see main.ts), before the poll loop — same idea as
 * cherry_backend's DB_MAIN_RUN_MIGRATIONS ("owns the schema — runs pending migrations at boot"),
 * so every deploy is self-migrating and a schema change never again needs a manual psql command
 * on the deploy target.
 *
 * Each file in db/migrations/ runs at most once (tracked in schema_migrations), in filename
 * order, and MUST be written idempotently (IF NOT EXISTS / ADD VALUE IF NOT EXISTS / etc.) as a
 * defense-in-depth safety net — not wrapped in a transaction, since `ALTER TYPE ... ADD VALUE`
 * has version-dependent restrictions inside transaction blocks; idempotent SQL makes a partial
 * failure (e.g. the SQL succeeds but the bookkeeping INSERT is interrupted) safe to just retry
 * on the next boot rather than needing real rollback.
 */
export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename varchar PRIMARY KEY,
      "appliedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    : [];

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`[agents] applying migration ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }
}
