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
pnpm install          # install deps
pnpm run build        # compile TypeScript via nest build → dist/
pnpm run start:dev    # watch mode (backend)
pnpm run start:prod   # run compiled dist/main.js
pnpm run lint         # eslint --fix across src/ and test/
pnpm run format       # prettier --write
pnpm test             # jest unit tests (src/**/*.spec.ts)
pnpm run test:watch   # jest in watch mode
pnpm run test:cov     # jest with coverage
pnpm run test:e2e     # jest e2e (test/**/*.e2e-spec.ts)
pnpm run ingest       # POST /admin/ingest against a running server (manual trigger)
```

Run a single test file:

```bash
pnpm test -- src/ingestion/dedup-key.spec.ts
```

Run a single test by name pattern:

```bash
pnpm test -- --testNamePattern "dedupKey"
```

After installing new native addons, run:

```bash
pnpm rebuild <package-name>
```

## TypeScript

Strict mode is fully enabled: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. The module system is `nodenext` — use `.js` extensions on relative imports in source files (TypeScript resolves them to `.ts` at compile time). `no-explicit-any` is an ESLint **error**; never use `any` in domain code.

## Architecture

This is a NestJS monorepo with a `frontend/` React app alongside the backend.

**Backend module layout (planned):**

| Module                   | Responsibility                                                                   |
| ------------------------ | -------------------------------------------------------------------------------- |
| `ConfigModule` (global)  | Typed env config via `@nestjs/config`                                            |
| `TypeOrmModule` (global) | SQLite via `better-sqlite3`; entity: `Job`                                       |
| `AdaptersModule`         | Registers `ADAPTER_PROVIDERS` token — array of `SourceAdapter` implementations   |
| `IngestionModule`        | `IngestionService.upsert()` — status-preserving SQLite upsert                    |
| `ScoringModule`          | `FitScoringService.score()` — keyword-based fit scoring                          |
| `CronModule`             | `CronOrchestratorService` — drives adapters on schedule                          |
| `JobsModule`             | REST API: `GET /jobs`, `PATCH /jobs/:id`                                         |
| `AdminModule`            | `POST /admin/ingest` — manual trigger                                            |
| `NotionModule`           | Optional; only registers when both `NOTION_TOKEN` + `NOTION_DATABASE_ID` are set |

**Key interfaces** (in `src/ingestion/`):

- `NormalizedJob` — shared DTO all adapters must produce
- `SourceAdapter` — `{ name: string; fetchJobs(): Promise<NormalizedJob[]> }`

**Adding a source adapter** = one file implementing `SourceAdapter` + one line in `AdaptersModule`.

**Dedup key logic** (in `src/ingestion/dedup-key.ts`):

- If `sourceJobId` is set: `"${source}:${sourceJobId}"`
- Otherwise: SHA-1 of the normalized URL (lowercase host, no query/hash, no trailing slash)

**Upsert invariant**: `ON CONFLICT(dedup_key) DO UPDATE` only touches `title`, `company`, `url`, `tags`, `salary`, `last_seen_at`. It **never** overwrites `status`, `notion_page_id`, or `first_seen_at`.

**Frontend** lives in `frontend/` (Vite + React 18 + TanStack Query v5 + Tailwind CSS). Its dev server proxies `/api` → `localhost:3000`. Production: `pnpm run build` in `frontend/` then NestJS `ServeStaticModule` serves `frontend/dist` at `/`.

## Environment

Copy `.env.example` to `.env` and create `data/` before first run:

```bash
cp .env.example .env && mkdir -p data
```

Required vars: `DATABASE_PATH`, `CRON_SCHEDULE`, `WEB3CAREER_TOKEN`, `MIN_FIT_SCORE`, `STACK_KEYWORDS`, `SENIORITY_KEYWORDS`. Notion sync is opt-in and only activates when both `NOTION_TOKEN` and `NOTION_DATABASE_ID` are present.

## pnpm quirks

`.npmrc` sets `shamefully-hoist=true` — required for NestJS decorator metadata and `better-sqlite3` native bindings to resolve. `pnpm.onlyBuiltDependencies` in `package.json` approves native build scripts non-interactively for `better-sqlite3`, `@nestjs/core`, and `unrs-resolver`.
