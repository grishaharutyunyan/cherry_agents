-- Adds the clarification-pause phase: parsePrompt can now ask a question instead of guessing or
-- hard-failing when it can't confidently determine a critical field. Parked like
-- awaiting_approval — see AI_AGENT_RUN_PARKED_PHASES in src/db/types.ts. Idempotent, same
-- pattern as 0001_awaiting_finalize_approval.sql.
ALTER TYPE ai_agent_runs_phase_enum ADD VALUE IF NOT EXISTS 'needs_clarification';
ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS "clarificationQuestion" TEXT;
