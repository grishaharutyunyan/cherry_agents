import { pool } from './client';
import { config } from '../config';
import {
  AI_AGENT_RUN_PARKED_PHASES,
  AI_AGENT_RUN_TERMINAL_PHASES,
  AiAgentRunEventType,
  AiAgentRunPhase,
  AiAgentRunRow,
} from './types';

/**
 * Claim one runnable row for this worker tick — same row-level-lock shape as
 * cherry_backend's WithdrawalQueueEntity/WithdrawalScheduler (lockedAt/lockedUntil/
 * processedBy + FOR UPDATE SKIP LOCKED), so multiple worker instances never
 * double-process the same run.
 */
export async function claimNextPendingRun(): Promise<AiAgentRunRow | null> {
  const excludedPhases = [...AI_AGENT_RUN_TERMINAL_PHASES, ...AI_AGENT_RUN_PARKED_PHASES];
  const { rows } = await pool.query<AiAgentRunRow>(
    `UPDATE ai_agent_runs
     SET "lockedAt" = now(),
         "lockedUntil" = now() + ($2 || ' seconds')::interval,
         "processedBy" = $1
     WHERE id = (
       SELECT id FROM ai_agent_runs
       WHERE phase NOT IN (${excludedPhases.map((_, i) => `$${i + 3}`).join(', ')})
         AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
       ORDER BY "createdAt" ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [config.workerId, String(config.lockTtlSeconds), ...excludedPhases],
  );
  return rows[0] ?? null;
}

export async function getRun(id: number): Promise<AiAgentRunRow | null> {
  const { rows } = await pool.query<AiAgentRunRow>(
    `SELECT * FROM ai_agent_runs WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

type UpdatableRunFields = Partial<
  Pick<
    AiAgentRunRow,
    | 'phase'
    | 'parsedFields'
    | 'clarificationQuestion'
    | 'specDocContent'
    | 'specDocPath'
    | 'designUxContent'
    | 'designUxDocPath'
    | 'designTokensContent'
    | 'designTokensDocPath'
    | 'leadReviewNotes'
    | 'finalHandoffContent'
    | 'qaReport'
    | 'backendBranch'
    | 'frontendBranch'
    | 'backendPrUrl'
    | 'frontendPrUrl'
    | 'thumbnailPromptContent'
    | 'adminPayloadContent'
    | 'failureReason'
    | 'retryCount'
    | 'lastQaFailureRoute'
    | 'approvalFeedback'
    | 'completedAt'
  >
> & {
  /** Releases the worker's claim lock (set alongside a phase transition) unless explicitly kept. */
  releaseLock?: boolean;
};

export async function updateRun(id: number, fields: UpdatableRunFields): Promise<void> {
  const { releaseLock = true, ...columns } = fields;
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(columns)) {
    values.push(value === undefined ? null : jsonColumnsAsNeeded(key, value));
    setClauses.push(`"${key}" = $${values.length}`);
  }

  if (releaseLock) {
    setClauses.push(`"lockedUntil" = NULL`);
  }

  if (setClauses.length === 0) return;

  values.push(id);
  await pool.query(
    `UPDATE ai_agent_runs SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
    values,
  );
}

/** jsonb columns need to be passed as JSON strings through node-postgres. */
function jsonColumnsAsNeeded(key: string, value: unknown): unknown {
  const jsonColumns = new Set(['parsedFields', 'qaReport']);
  if (jsonColumns.has(key) && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}

export async function appendEvent(
  runId: number,
  phase: AiAgentRunPhase | string,
  eventType: AiAgentRunEventType,
  detail: Record<string, unknown> | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO ai_agent_run_events ("runId", phase, "eventType", detail)
     VALUES ($1, $2, $3, $4)`,
    [runId, phase, eventType, detail === null ? null : JSON.stringify(detail)],
  );
}
