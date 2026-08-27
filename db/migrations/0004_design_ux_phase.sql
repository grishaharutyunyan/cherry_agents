-- Adds the Design & UX phase (runs sequentially between design and awaiting_approval — see
-- orchestrator.ts's handleDesign/handleDesignUx) and the two columns it writes back to the run
-- row. Idempotent, same pattern as 0001_awaiting_finalize_approval.sql.
ALTER TYPE ai_agent_runs_phase_enum ADD VALUE IF NOT EXISTS 'design_ux';
ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS "designUxContent" TEXT;
ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS "designUxDocPath" VARCHAR;
