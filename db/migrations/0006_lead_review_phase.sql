-- Adds the Lead Orchestrator's semantic-evaluation phase — an LLM-as-judge step between
-- design_ux and the human awaiting_approval gate that autonomously approves or rejects (with
-- revision notes routed back to `design`) based on whether the spec + visual brief actually
-- satisfy the original prompt, not just structural validity. Idempotent, same pattern as
-- 0001_awaiting_finalize_approval.sql.
ALTER TYPE ai_agent_runs_phase_enum ADD VALUE IF NOT EXISTS 'lead_review';
ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS "leadReviewNotes" TEXT;
