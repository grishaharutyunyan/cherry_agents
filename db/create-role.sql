-- Provisions a database dedicated ONLY to cherry_agents, isolated from the main
-- app database ("cactus") every other service in this monorepo shares.
--
-- Why a separate DATABASE, not just a separate schema/role in the app DB: Postgres
-- cannot query across databases in a single connection (no dblink/fdw installed
-- here), so this is a hard boundary — cherry_agents' credentials can never reach
-- user/wallet/transaction data, not even in principle, regardless of any grant
-- mistake down the line.
--
-- Run this ONCE per Postgres instance (local dev, staging, prod-if-ever-needed) as
-- a superuser. Safe to re-run except the CREATE DATABASE line, which will error
-- "already exists" if you run it twice — that's expected, just skip past it.
--
-- Usage: psql "$SUPERUSER_CONNECTION" -f create-role.sql
--        (edit the password below first, or ALTER ROLE ... PASSWORD '...' after)

-- ── 1. Role ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cherry_agents_app') THEN
    CREATE ROLE cherry_agents_app LOGIN PASSWORD 'change_me';
  END IF;
END
$$;

-- ── 2. Database, owned outright by that role ────────────────────────────────
-- Errors "database already exists" on a re-run — that's fine, move on.
CREATE DATABASE cherry_agents OWNER cherry_agents_app;

-- ── 3. Tables — run against the NEW database, not this one ─────────────────
\c cherry_agents

CREATE TYPE ai_agent_runs_phase_enum AS ENUM (
  'parsing','design','awaiting_approval','building','qa',
  'retry_design','retry_build','finalizing','done','failed','cancelled'
);
CREATE TYPE ai_agent_runs_lastqafailureroute_enum AS ENUM (
  'design','backend','frontend','ambiguous'
);
CREATE TYPE ai_agent_run_events_eventtype_enum AS ENUM (
  'phase_started','phase_completed','tool_call','tool_result','gemini_message','error','retry_routed'
);

CREATE TABLE ai_agent_runs (
  "id" SERIAL PRIMARY KEY,
  "prompt" text NOT NULL,
  "parsedFields" jsonb,
  "overrides" jsonb,
  "phase" ai_agent_runs_phase_enum NOT NULL DEFAULT 'parsing',
  "approved" boolean NOT NULL DEFAULT false,
  "approvalFeedback" text,
  "retryCount" integer NOT NULL DEFAULT 0,
  "lastQaFailureRoute" ai_agent_runs_lastqafailureroute_enum,
  "specDocContent" text,
  "specDocPath" character varying,
  "finalHandoffContent" text,
  "qaReport" jsonb,
  "backendBranch" character varying,
  "frontendBranch" character varying,
  "backendPrUrl" character varying,
  "frontendPrUrl" character varying,
  "thumbnailPromptContent" text,
  "adminPayloadContent" text,
  "failureReason" text,
  "triggeredByAdminId" character varying NOT NULL,
  "triggeredByAdminLogin" character varying,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ,
  "lockedAt" TIMESTAMPTZ,
  "lockedUntil" TIMESTAMPTZ,
  "processedBy" character varying
);

CREATE TABLE ai_agent_run_events (
  "id" SERIAL PRIMARY KEY,
  "runId" integer NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
  "phase" character varying NOT NULL,
  "eventType" ai_agent_run_events_eventtype_enum NOT NULL,
  "detail" jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "IDX_ai_agent_runs_phase_locked" ON ai_agent_runs ("phase", "lockedUntil");
CREATE INDEX "IDX_ai_agent_run_events_run_created" ON ai_agent_run_events ("runId", "createdAt");

-- Both cherry_agents (the worker) and cherry_admin_backend's AiAgentsModule (via
-- its own separate "AgentsDatabase" TypeORM connection) connect to this same
-- database with this same role. Nothing else does, and this role has no access
-- to any other database on this instance.
