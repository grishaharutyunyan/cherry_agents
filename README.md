# cherry_agents

Standalone worker service that runs the Gemini-powered game-creation pipeline
triggered from the admin panel's **AI Agents** section. It polls the
`ai_agent_runs` table (in its own dedicated `cherry_agents` database — see
"Database" below) for work, drives multi-turn Gemini function-calling
sessions against this monorepo's real files, and reports progress back into
that table.

It is a second, independent pipeline alongside the existing Claude-Code-driven
`/create-game` — it does not read, write, or depend on anything under
`.claude/agents/` or `.claude/commands/create-game.md`.

## Current status (M2)

Implemented: prompt parsing (structured Gemini call) and the design phase
(real agentic session against `knowledge/gambling-math-rtp.md`, writing a
real spec doc into `game_backend/.claude/handoffs/`). The `building` phase is
a **deterministic stub** that jumps straight to `done` — it exists only to
prove the `awaiting_approval` → admin-approves → unparked loop works
end-to-end. Real backend/frontend builder agents land in M3, QA + retry
routing in M4, finalize/push/PR automation in M5.

## Running locally

```bash
npm install
cp .env.example .env   # fill in GEMINI_API_KEY, DB_AGENTS_URI at minimum
npm run build && npm start
# or, for iteration:
npm run start:dev
```

`GAME_BACKEND_PATH` / `GAME_FRONTEND_PATH` default to `<monorepo root>/game_backend`
and `<monorepo root>/game-frontend` — on this dev machine that's already your
existing sibling checkouts, so you usually don't need to set them explicitly
for local runs.

## Knowledge docs

`knowledge/*.md` are **vendored copies** of the proven docs at
`docs/knowledge/*.md` (the same ones the Claude Code pipeline's subagents
read) — `gambling-math-rtp.md`, `adding-a-new-game-backend.md`,
`adding-a-new-game-frontend.md`, `gambling-ux-tricks.md`,
`qa-rtp-verification.md`. They're copied, not symlinked or fetched at
runtime, because the root `cherry` repo has no git remote and isn't part of
any per-service Docker image — a container built from this directory can't
`git clone` it. **When you edit the source docs under `docs/knowledge/`,
re-copy the relevant file(s) here too** — a stale copy is a real risk, not a
one-time setup detail. There's no sync automation yet; this is a manual step.

## Deployment (M2 partial — see Dockerfile TODO)

Every other service in this monorepo (`cherry_backend`, `game_backend`,
`cherry_admin_backend`, …) is its own independent git repo, built to
`ghcr.io/grishaharutyunyan/<service>` and pulled by `cherry-infra`'s Docker
Compose files — there is no shared host checkout of the monorepo in
production. This directory follows the same shape: it's its own git repo
(gitignored from the root `cherry` meta-repo, same as `game_backend`/
`game-frontend`), with its own `Dockerfile`.

There was an earlier, differently-shaped `cherry_agents` (Vertex AI + Imagen,
an HTTP service on port 8888, wired into `cherry_admin_backend` via
`AGENTS_SERVICE_URL`) whose source lived in a separate repo not present on
this disk. `cherry-infra/docker-compose.staging.yml`'s `cherry_agents` block
and `envs/cherry_agents/.env.staging.example` have since been reconciled to
match this codebase's actual shape (polling worker, no HTTP server, plain
`GEMINI_API_KEY`, no Imagen/Telegram) — both still uncommitted in
`cherry-infra`, review together with this repo's first commit.

**Manual prerequisites — not something this codebase can provision for you:**
- Push this repo to GitHub and set up its own CI image build to
  `ghcr.io/grishaharutyunyan/cherry_agents` (mirroring the other services).
- `GEMINI_API_KEY` — generate it yourself from your GCP project.
- Run `npm run db:setup` once against each Postgres instance (local, then
  staging) — see "Database" below.
- Once M3 (real builder agents that commit) and M5 (push + `gh pr create`)
  land, the container will additionally need: `git`/`gh` installed, a
  non-interactive deploy credential (SSH key or PAT) for `game_backend` and
  `game-frontend` with push access, and either a persistent volume with
  working clones of both repos or an entrypoint that clones them fresh on
  container start. None of that is wired up yet — M2's design phase only
  reads/writes local files, it never touches git.

## Database

`ai_agent_runs`/`ai_agent_run_events` live in their own **separate Postgres
database** (`cherry_agents`), not the shared `cactus` app database every
other service in this monorepo uses. This is a hard boundary, not just a
permissions one — Postgres can't query across databases in one connection
(no dblink/fdw installed), so `cherry_agents`' credentials can never reach
user/wallet/transaction data even in principle, regardless of any grant
mistake down the line.

Run `npm run db:setup` once per Postgres instance (needs a superuser
connection via `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`, plus
`CHERRY_AGENTS_DB_PASSWORD` for the new role — see `db/setup.sh` header) —
it creates a `cherry_agents_app` role, a `cherry_agents` database owned
outright by that role, and the two tables in it, then verifies by
connecting AS that role (not the superuser) and listing them. Idempotent —
safe to re-run; it skips role/database creation if they already exist and
uses `CREATE TABLE/TYPE/INDEX IF NOT EXISTS` for the schema.
`cherry_admin_backend`'s `AiAgentsModule` connects to this same database
through its own separate `AgentsDatabase` TypeORM connection
(`DB_AGENTS_URI` in its own env) — it's the only other thing that ever
touches these tables.

Verified locally end-to-end: the app's own `db/client.ts`/`db/runs.repo.ts`
connects and queries successfully through the restricted role: reads,
`UPDATE`s, and event `INSERT`s all work; a bare connection to `cactus` still
succeeds (Postgres grants `CONNECT` to `PUBLIC` by default — a config-file-
level restriction, not a grant, would be needed to block that too) but every
actual table read there is denied (`permission denied for table admin_users`,
`cc_transactions`, …) — the role has zero table-level grants outside its own
database.

Already provisioned on this machine's local dev Postgres — local `.env`'s
`DB_AGENTS_URI` is already pointed at it. On staging/prod, someone with
Postgres superuser credentials needs to run the script once before first
deploy (note: **`cherry_admin_backend` needs this everywhere it runs**,
including prod, even though the `cherry_agents` worker itself is
staging-only — its `AgentsDatabase` connection is opened unconditionally at
boot, so `cherry_admin_backend` won't start without `DB_AGENTS_URI` set).

## Env vars

See `.env.example`.
