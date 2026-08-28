-- lastQaFailureRoute is an aggregate of every failed check's routeHint, comma-joined by
-- orchestrator.ts's handleQa/handleLeadReview (e.g. "design,frontend") and parsed back apart by
-- handleRetryBuild — a genuinely multi-value field. It was wrongly declared as the same
-- single-value enum type routeHint itself uses, which rejects any comma-joined value outright
-- ("invalid input value for enum ai_agent_runs_lastqafailureroute_enum: design,frontend",
-- 2026-08-27) — silently discarding that whole update (including qaReport) since it's one atomic
-- UPDATE statement. Widen it to plain text; the per-check routeHint inside qaReport (jsonb) is
-- unaffected and correctly stays single-valued.
ALTER TABLE ai_agent_runs ALTER COLUMN "lastQaFailureRoute" TYPE character varying USING "lastQaFailureRoute"::text;
DROP TYPE IF EXISTS ai_agent_runs_lastqafailureroute_enum;
