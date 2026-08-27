-- Adds the design-tokens JSON artifact design_ux now emits alongside its prose brief — see the
-- 2026-08-28 visual-tokens-and-juice-animation-tiers design spec. Idempotent, same pattern as
-- 0001_awaiting_finalize_approval.sql.
ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS "designTokensContent" TEXT;
ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS "designTokensDocPath" VARCHAR;
