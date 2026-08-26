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

## Current status (M2–M5 implemented)

- **M2** — prompt parsing (structured Gemini call) + design phase (real
  agentic session against `knowledge/gambling-math-rtp.md`, writing a real
  spec doc into `game_backend/docs/ai-agent-handoffs/`) + the admin
  approval gate.
- **M3** — real backend + frontend builder agents
  (`gemini/phases/backend-build.phase.ts` /
  `gemini/phases/frontend-build.phase.ts`): each checks out/creates a
  `CHE-<GAMEID>` branch in its own repo (`git/repo.ts`), runs an agentic
  session scoped to that game's own directory (`write_file`'s
  `allowedRoots`) plus an allowlisted `run_shell` (git add/commit, npm run
  lint, npm run build — never a general shell), and commits. `building`
  dispatches both in parallel (`Promise.allSettled`) — never proceeds to QA
  on half a build.
- **M4** — QA agent (`gemini/phases/qa.phase.ts`): read-only + a
  `run_simulation` tool that writes/runs/deletes a one-off Monte Carlo
  script against the real shipped `game_backend` code
  (`gemini/tools/run-simulation.tool.ts`), reports a structured pass/fail
  via a "terminal tool" call (`report_qa_result` —
  `gemini/tools/report-result.tool.ts`, `client.ts`'s `terminalTool`
  option) rather than free text. A failing check's `routeHint` sends the
  run to `retry_design` or `retry_build`; capped at 2 retries
  (`MAX_RETRIES` in `orchestrator.ts`), same as the Claude Code pipeline.
- **M5** — `orchestrator/finalize.ts`: deterministic, no Gemini call.
  Appends `game_backend/docs/games.json`, writes the 3 handoff docs into
  `game_backend/docs/ai-agent-handoffs/`, commits, pushes both branches,
  and opens both PRs via `gh` (`git/pr.ts`'s `ensurePr` — idempotent, reuses
  an existing PR on a retry instead of erroring).

See "Git & GitHub access (M3/M5)" below for what has to be provisioned on
the deploy target before build/finalize can actually push/PR for real.

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
- `GEMINI_API_KEY` (or Vertex AI — see below) — generate it yourself from
  your GCP project.
- Run `npm run db:setup` once against each Postgres instance (local, then
  staging) — see "Database" below.
- See "Git & GitHub access (M3/M5)" directly below — a PAT, and real working
  clones of `game_backend`/`game-frontend` (with `npm install` already run
  in each, so `npm run lint`/`npm run build`/`ts-node` work) at whatever
  host paths get bind-mounted to `GAME_BACKEND_PATH`/`GAME_FRONTEND_PATH`.

## Git & GitHub access (M3/M5)

The build/retry phases commit to `game_backend`/`game-frontend`, and
finalize pushes + opens PRs — this needs real credentials on the deploy
target, provisioned once, manually:

1. **Working clones with dependencies installed.** `GAME_BACKEND_PATH` /
   `GAME_FRONTEND_PATH` (bind-mounted into the container — see
   `docker-compose.staging.yml`'s `cherry_agents` service) must point at
   real `git clone`s of `game_backend`/`game-frontend` on the host, each
   with `npm install` already run — `npm run lint`/`npm run build` (in
   every phase) and `ts-node` (QA's `run_simulation`) all need
   `node_modules` to exist. These are **separate checkouts from whatever
   the actual running `game_backend`/`game-frontend` services deploy
   from** (those pull pre-built `ghcr.io` images, not this bind-mounted
   source) — this pipeline needs its own dedicated working copies.
2. **A GitHub PAT.** Generate a fine-grained token scoped to just the
   `game_backend` and `game-frontend` repos, with **Contents**
   (read/write) and **Pull requests** (read/write) permissions. Set it as
   `GH_TOKEN` in the env file (`envs/cherry_agents/.env.staging` on the
   VPS) — **never paste the token itself in chat/logs**, set it directly
   on the deploy target.
3. That's it — `docker-entrypoint.sh` does the rest at container start:
   configures `git safe.directory` for both bind-mounted paths (needed
   since the container's user likely differs from the host checkout's
   owner), sets a `cherry-agents-bot` git identity (override via
   `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`), and — when `GH_TOKEN` is set —
   rewrites `git@github.com:` remotes to `https://github.com/` and runs
   `gh auth setup-git` so the same PAT covers both `git push` and
   `gh pr create` (no SSH key needed).

## Database

`ai_agent_runs`/`ai_agent_run_events` live in their own **separate Postgres
database** (`cherry_agents`), not the shared `cactus` app database every
other service in this monorepo uses. This is a hard boundary, not just a
permissions one — Postgres can't query across databases in one connection
(no dblink/fdw installed), so `cherry_agents`' credentials can never reach
user/wallet/transaction data even in principle, regardless of any grant
mistake down the line.

Run `npm run db:setup` **once** per Postgres instance, ever (needs a
superuser connection via `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`, plus
`CHERRY_AGENTS_DB_PASSWORD` for the new role — see `db/setup.sh` header) —
it creates a `cherry_agents_app` role, a `cherry_agents` database owned
outright by that role, the initial schema, and transfers ownership of
every table/type it created (not just the database itself — see the
comment in `db/setup.sh`) to `cherry_agents_app`, including `GRANT CREATE
ON SCHEMA public` (needed on Postgres 15+, where a non-owner role gets no
schema-level `CREATE` by default). That ownership transfer is the point
past which **no schema change ever needs superuser access again**.

**Every schema change after that first bootstrap is a migration, not a
manual psql command.** `src/db/migrate.ts` runs at every container boot
(`main.ts`, before the poll loop starts), applying any `db/migrations/*.sql`
file not yet recorded in the `schema_migrations` table, in filename order —
same idea as `cherry_backend`'s `DB_MAIN_RUN_MIGRATIONS` self-migrating at
boot. To change the schema: add a new numbered file under `db/migrations/`
(write it idempotently — `IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS` /
etc. — it's not run inside a transaction, since `ALTER TYPE ... ADD VALUE`
has version-dependent restrictions inside one), commit it, deploy — that's
the whole process. `db/setup.sh` itself stays idempotent and safe to re-run
too (e.g. onto a database that predates this migration system), but you
should no longer need to.

`cherry_admin_backend`'s `AiAgentsModule` connects to this same database
through its own separate `AgentsDatabase` TypeORM connection
(`DB_AGENTS_URI` in its own env, `DB_AGENTS_SYNCHRONIZE` left off) — it's
the only other thing that ever touches these tables, and it never runs
migrations itself; `cherry_agents` owns this schema exclusively.

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

## Gemini authentication — API key vs Vertex AI mode

Two ways to authenticate, pick one:

**Developer API key (default)** — `GEMINI_API_KEY` set, `GOOGLE_GENAI_USE_VERTEXAI`
unset/false. Simplest, billed against the key's own ai.google.dev usage.

**Vertex AI mode** — draws from your GCP project's billing/credits instead
(e.g. a $300 free-trial credit balance) rather than the Developer API's own
billing. This is a real authentication switch, not just a config flag:

1. Enable the **Vertex AI API** on your GCP project (Console → APIs &
   Services → Library → "Vertex AI API" → Enable), if not already on.
2. Create a **dedicated service account** for this worker (IAM & Admin →
   Service Accounts → Create), grant it the **Vertex AI User** role (least
   privilege — don't reuse a broader account).
3. Create a JSON key for that service account and download it. **Never
   paste its contents anywhere in chat/logs** — get it onto the deploy
   target (VPS or wherever) directly, e.g. `scp`.
4. Set these env vars (see `.env.example`):
   ```
   GOOGLE_GENAI_USE_VERTEXAI=true
   GOOGLE_CLOUD_PROJECT=<your-gcp-project-id>
   GOOGLE_CLOUD_LOCATION=us-central1
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/the/key.json
   ```
   Leave `GEMINI_API_KEY` blank — it's not read in this mode.
5. In Docker, the key file has to be **bind-mounted into the container** —
   `GOOGLE_APPLICATION_CREDENTIALS` is a path, and it has to resolve inside
   the container's filesystem, not the host's. See
   `docker-compose.staging.yml`'s `cherry_agents` service for the mount.

The SDK (`@google/genai`, via `google-auth-library` underneath) reads
`GOOGLE_GENAI_USE_VERTEXAI`/`GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION`
and resolves Application Default Credentials automatically — `src/gemini/client.ts`'s
`getClient()` just constructs `new GoogleGenAI({})` with no explicit options
in Vertex mode rather than passing an API key.

## Env vars

See `.env.example`.
