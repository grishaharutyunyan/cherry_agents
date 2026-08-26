import { Pool } from 'pg';

import { config } from '../config';

/**
 * Some connection strings in this monorepo get copy-pasted from a psql invocation
 * and end up with a non-standard "psql://" scheme — node-postgres only recognizes
 * postgres(ql)://. Normalize defensively rather than assuming the scheme.
 */
function normalizeConnectionString(uri: string): string {
  return uri.replace(/^psql:\/\//, 'postgresql://');
}

export const pool = new Pool({
  connectionString: normalizeConnectionString(config.dbUri),
});
