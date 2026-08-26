#!/usr/bin/env bash
# Provisions the isolated `cherry_agents` database + `cherry_agents_app` role on a
# Postgres instance (local dev, staging, or prod-if-ever-needed). Safe to re-run —
# skips role/database creation if they already exist, always re-applies the table
# schema (CREATE TABLE IF NOT EXISTS / CREATE TYPE guarded).
#
# Usage:
#   PGHOST=localhost PGPORT=23432 PGUSER=cherry_staging PGPASSWORD=... \
#   CHERRY_AGENTS_DB_PASSWORD=some_real_password \
#     ./db/setup.sh
#
# Required env vars:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD   — a Postgres SUPERUSER connection (the
#                                          same instance/credentials docker-compose
#                                          already uses for the "postgres" service)
#   CHERRY_AGENTS_DB_PASSWORD             — password to set for the new
#                                          cherry_agents_app role (pick a real one;
#                                          this is what you'll put in
#                                          DB_AGENTS_URI afterward)
#
# All of PGHOST/PGPORT/PGUSER/PGPASSWORD are libpq's own standard env var names —
# psql picks them up automatically, no connection string needed (which avoids
# URL-encoding headaches if the superuser password has special characters).

set -euo pipefail

for var in PGHOST PGPORT PGUSER PGPASSWORD CHERRY_AGENTS_DB_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "Missing required env var: $var" >&2
    exit 1
  fi
done

echo "==> Connecting to $PGHOST:$PGPORT as $PGUSER to provision cherry_agents_app + cherry_agents db"

psql -v ON_ERROR_STOP=1 -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cherry_agents_app') THEN
    CREATE ROLE cherry_agents_app LOGIN PASSWORD '${CHERRY_AGENTS_DB_PASSWORD}';
  ELSE
    ALTER ROLE cherry_agents_app PASSWORD '${CHERRY_AGENTS_DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! psql -v ON_ERROR_STOP=1 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'cherry_agents'" | grep -q 1; then
  echo "==> Creating database cherry_agents (owner: cherry_agents_app)"
  psql -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE cherry_agents OWNER cherry_agents_app;"
else
  echo "==> Database cherry_agents already exists, skipping CREATE DATABASE"
fi

echo "==> Creating schema objects in cherry_agents (idempotent)"
psql -v ON_ERROR_STOP=1 -d cherry_agents <<'SQL'
SET search_path TO public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_agent_runs_phase_enum') THEN
    CREATE TYPE ai_agent_runs_phase_enum AS ENUM (
      'parsing','design','awaiting_approval','building','qa','awaiting_finalize_approval',
      'retry_design','retry_build','finalizing','done','failed','cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_agent_runs_lastqafailureroute_enum') THEN
    CREATE TYPE ai_agent_runs_lastqafailureroute_enum AS ENUM ('design','backend','frontend','ambiguous');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_agent_run_events_eventtype_enum') THEN
    CREATE TYPE ai_agent_run_events_eventtype_enum AS ENUM (
      'phase_started','phase_completed','tool_call','tool_result','gemini_message','error','retry_routed'
    );
  END IF;
END
$$;

-- Re-running this script after CREATE TYPE already ran once (e.g. an existing staging DB from
-- before the "awaiting_finalize_approval" PR-review gate was added) needs to add the new value
-- to the existing enum type — CREATE TYPE IF NOT EXISTS above is a no-op in that case.
ALTER TYPE ai_agent_runs_phase_enum ADD VALUE IF NOT EXISTS 'awaiting_finalize_approval';

CREATE TABLE IF NOT EXISTS ai_agent_runs (
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

CREATE TABLE IF NOT EXISTS ai_agent_run_events (
  "id" SERIAL PRIMARY KEY,
  "runId" integer NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
  "phase" character varying NOT NULL,
  "eventType" ai_agent_run_events_eventtype_enum NOT NULL,
  "detail" jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_ai_agent_runs_phase_locked" ON ai_agent_runs ("phase", "lockedUntil");
CREATE INDEX IF NOT EXISTS "IDX_ai_agent_run_events_run_created" ON ai_agent_run_events ("runId", "createdAt");

-- Tracks which db/migrations/*.sql files have run (see src/db/migrate.ts, which runs at every
-- container boot from here on) — created here too so a fresh install starts with the same
-- objects an existing, already-migrated database would have.
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename varchar PRIMARY KEY,
  "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The statements above ran as the superuser you're connected as, not as
-- cherry_agents_app — being the database's OWNER does not automatically grant
-- rights on tables/types someone else created inside it. Fix that explicitly and
-- unconditionally (safe to re-run, no-op once already correct) rather than
-- relying on cherry_agents_app happening to be the one that ran CREATE TABLE/TYPE.
-- Also grant CREATE on the public schema — needed on Postgres 15+, where a
-- non-owner role has no schema-level CREATE by default — so cherry_agents_app can
-- run future migrations (new tables/types) fully on its own, no superuser needed
-- ever again after this one-time bootstrap.
GRANT CREATE ON SCHEMA public TO cherry_agents_app;
ALTER TABLE ai_agent_runs OWNER TO cherry_agents_app;
ALTER TABLE ai_agent_run_events OWNER TO cherry_agents_app;
ALTER TABLE schema_migrations OWNER TO cherry_agents_app;
ALTER SEQUENCE ai_agent_runs_id_seq OWNER TO cherry_agents_app;
ALTER SEQUENCE ai_agent_run_events_id_seq OWNER TO cherry_agents_app;
ALTER TYPE ai_agent_runs_phase_enum OWNER TO cherry_agents_app;
ALTER TYPE ai_agent_runs_lastqafailureroute_enum OWNER TO cherry_agents_app;
ALTER TYPE ai_agent_run_events_eventtype_enum OWNER TO cherry_agents_app;
SQL

echo "==> Verifying: connecting AS cherry_agents_app (not the superuser) and actually reading/writing, not just listing tables"
PGPASSWORD="$CHERRY_AGENTS_DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U cherry_agents_app -d cherry_agents <<'SQL'
\dt
INSERT INTO ai_agent_runs (prompt, "triggeredByAdminId") VALUES ('db:setup verification row', 'setup-script');
SELECT id, phase FROM ai_agent_runs WHERE prompt = 'db:setup verification row';
DELETE FROM ai_agent_runs WHERE prompt = 'db:setup verification row';
SQL

echo "==> Done. Put this in DB_AGENTS_URI (both cherry_agents/.env and cherry_admin_backend's env):"
echo "    postgresql://cherry_agents_app:${CHERRY_AGENTS_DB_PASSWORD}@${PGHOST}:5432/cherry_agents"
echo "    (note: inside Docker Compose, host is the service name \"postgres\", not $PGHOST — see .env.staging.example)"
