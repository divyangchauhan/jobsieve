# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Conventions

- File and directory names: `kebab-case`
- No magic numbers — define named constants
- Keep functions short and single-purpose (aim for <20 lines); extract logic into utility functions
- Prefer early returns over nested conditionals
- Use default parameter values instead of `null`/`undefined` checks
- RO-RO (Receive Object, Return Object): when a function takes more than two parameters or returns more than one value, use a typed input object and a typed return object instead of positional arguments
- Use `readonly` for properties that must not mutate after construction
- Use `as const` for fixed lookup objects and literal arrays
- Encapsulate related primitives into types/interfaces rather than passing them individually
- Validation belongs in class constructors or dedicated validator classes (`class-validator` is wired up)

## Package manager

This project uses **pnpm** exclusively. Never use `npm` or `yarn`.

```bash
pnpm install           # install all workspace deps (backend + frontend)

# Development
pnpm run dev:api       # NestJS in watch mode (backend only)
pnpm run dev:ui        # Vite dev server — proxies /api → localhost:3000 (frontend only)

# Build
pnpm run build         # build frontend then backend (production-ready)
pnpm run build:api     # compile NestJS only → api/dist/
pnpm run build:ui      # compile React only → frontend/dist/

# Run
pnpm run start         # run compiled api/dist/main.js (serves API + static frontend)

# Test
pnpm test              # jest unit tests (api/src/**/*.spec.ts)
pnpm run test:watch    # jest in watch mode
pnpm run test:cov      # jest with coverage
pnpm run test:e2e      # jest e2e (api/test/**/*.e2e-spec.ts)

# Utilities
pnpm run lint          # eslint --fix across api/src/ and api/test/
pnpm run format        # prettier --write
pnpm run ingest        # POST /api/admin/ingest against a running server
```

Run a single test file (from repo root):

```bash
pnpm --filter jobsieve-api test -- src/ingestion/dedup-key.spec.ts
```

Or from within `api/`:

```bash
pnpm test -- src/ingestion/dedup-key.spec.ts
```

Run a single test by name pattern:

```bash
pnpm --filter jobsieve-api test -- --testNamePattern "dedupKey"
```

After installing new native addons, run:

```bash
pnpm rebuild <package-name>
```

## TypeScript

Strict mode is fully enabled: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. The module system is `nodenext` — use `.js` extensions on relative imports in source files (TypeScript resolves them to `.ts` at compile time). `no-explicit-any` is an ESLint **error**; never use `any` in domain code.

## Architecture

This is a pnpm monorepo with two workspace packages:

| Package | Path | Purpose |
|---------|------|---------|
| `jobsieve-api` | `api/` | NestJS backend |
| `jobsieve-frontend` | `frontend/` | Vite + React frontend |

**Backend module layout (planned):**

| Module                   | Responsibility                                                                   |
| ------------------------ | -------------------------------------------------------------------------------- |
| `ConfigModule` (global)  | Typed env config via `@nestjs/config`                                            |
| `TypeOrmModule` (global) | SQLite via `better-sqlite3`; entity: `Job`                                       |
| `AdaptersModule`         | Registers `ADAPTER_PROVIDERS` token — array of `SourceAdapter` implementations   |
| `IngestionModule`        | `IngestionService.upsert()` — status-preserving SQLite upsert                    |
| `ScoringModule`          | `FitScoringService.score(job, profile)` — pure, profile-driven fit scoring       |
| `ProfileModule`          | `ProfileService` — singleton relevance profile (get/update + rescore-all)        |
| `CronModule`             | `CronOrchestratorService` — drives adapters on schedule                          |
| `JobsModule`             | REST API: `GET /jobs`, `PATCH /jobs/:id`                                         |
| `AdminModule`            | `POST /admin/ingest` — manual trigger                                            |
| `NotionModule`           | Optional; only registers when both `NOTION_TOKEN` + `NOTION_DATABASE_ID` are set |

**Key interfaces** (in `api/src/ingestion/`):

- `NormalizedJob` — shared DTO all adapters must produce
- `SourceAdapter` — `{ name: string; fetchJobs(): Promise<NormalizedJob[]> }`

**Adding a source adapter** = one file implementing `SourceAdapter` + one line in `AdaptersModule`.

**Dedup key logic** (in `api/src/ingestion/dedup-key.ts`):

- If `sourceJobId` is set: `"${source}:${sourceJobId}"`
- Otherwise: SHA-1 of the normalized URL (lowercase host, no query/hash, no trailing slash)

**Upsert invariant**: `ON CONFLICT(dedup_key) DO UPDATE` only touches `title`, `company`, `url`, `tags`, `salary`, `last_seen_at`. It **never** overwrites `status`, `notion_page_id`, or `first_seen_at`.

**Frontend** lives in `frontend/` (Vite + React 18 + TanStack Query v5 + Tailwind CSS). Its dev server proxies `/api` → `localhost:3000`. Production: `pnpm run build` builds both; NestJS serves `frontend/dist` as static assets at `/` and all API routes under `/api`.

**Build output**: `api/dist/` (NestJS compiled output), `frontend/dist/` (Vite static assets).

## Environment

`.env` lives at the repo root and is loaded by `ConfigModule` via `envFilePath: '../.env'`. Copy `.env.example` to `.env` and create `data/` before first run:

```bash
cp .env.example .env && mkdir -p data
```

`DATABASE_PATH` in `.env` is relative to `api/` (where NestJS runs), so the default `../data/jobsieve.sqlite` puts the database at `data/jobsieve.sqlite` in the repo root.

Required vars: `DATABASE_PATH`, `CRON_SCHEDULE`, `WEB3CAREER_TOKEN`, `MIN_FIT_SCORE`. Notion sync is opt-in and only activates when both `NOTION_TOKEN` and `NOTION_DATABASE_ID` are present.

**Scoring & filtering** are driven by an editable singleton **relevance profile** (`Profile` entity, edited via the `/settings` page → `PUT /api/profile`), not by env keys. The taxonomy of role families, seniorities, default stack/excludes, locations, and regions lives in `api/src/scoring/taxonomy.ts` — extend it there. `STACK_KEYWORDS`/`SENIORITY_KEYWORDS` are **retired** (kept optional in env validation for backwards compatibility). The jobs query applies the profile's exclude/location/region/freshness as SQL hard filters, then scores survivors at read time; `fit_score` is also kept truthful via a rescore-all on every profile save and at ingest.

## pnpm quirks

`.npmrc` sets `shamefully-hoist=true` — required for NestJS decorator metadata and `better-sqlite3` native bindings to resolve. `pnpm.onlyBuiltDependencies` in the root `package.json` approves native build scripts non-interactively for `better-sqlite3`, `@nestjs/core`, `unrs-resolver`, and `esbuild` (used by Vite). This field must live at the workspace root, not inside `api/package.json`.
