-- Adds the second (PR-review) approval gate's phase value. Idempotent — safe to run even if
-- already applied outside the migration runner (e.g. an earlier manual psql run on staging).
ALTER TYPE ai_agent_runs_phase_enum ADD VALUE IF NOT EXISTS 'awaiting_finalize_approval';
