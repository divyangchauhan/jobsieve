# jobsieve

A self-hosted job-aggregation service. It pulls listings from eight job boards on a
cron schedule, deduplicates them across sources, fit-scores each one against an
editable relevance profile, and surfaces the survivors in a single focused inbox —
through a REST API and a React web UI, with optional one-way sync to Notion.

Built to cut the noise out of searching for senior backend / Web3 roles across a dozen
boards, and to make "add another source" a one-file change.

---

## Why it exists

Job seekers in specialized niches (Web3, senior backend, infra) check the same boards
every day. The same role shows up on three of them, quality varies wildly, and there's
nowhere to track what you've already triaged. jobsieve aggregates, deduplicates, scores,
and presents everything in one place — and keeps your own state (status, Notion page)
intact across every re-sync.

## What it does

- **Aggregates** from 8 sources: RemoteOK, web3.career, Greenhouse, Lever, Ashby,
  Remotive, Himalayas, and We Work Remotely — JSON APIs, ATS board APIs, and RSS feeds,
  behind one `SourceAdapter` interface.
- **Deduplicates** across sources with a deterministic key (`source:id`, or a SHA-1 of
  the normalized URL when no source ID exists), so the same job never appears twice.
- **Fit-scores** each listing against an editable **relevance profile** (role families,
  seniorities, stack, location/region, exclude terms) rather than hard-coded keyword
  lists. The profile is edited live from the Settings page.
- **Filters at the source**: the profile's excludes, location, region, and freshness are
  applied as SQL hard filters; survivors are scored at read time.
- **Serves** a filterable REST API and a React UI for browsing, filtering, and tracking
  application status.
- **Syncs** new listings to a Notion database (optional, one-way, rate-limited).

---

## Architecture

```
        React UI (Vite)                     NestJS API (port 3000)
        port 5173 (dev) ──/api proxy──►  ┌───────────────────────────────┐
                                         │  JobsController   AdminController
                                         │  ProfileController              │
                                         │        │                        │
   Cron (every 4h, configurable) ──────► │  CronOrchestratorService        │
                                         │        │                        │
                                         │   8 × SourceAdapter  (try/catch  │
                                         │        │             per source)│
                                         │   IngestionService  (upsert+dedup)
                                         │        │                        │
                                         │   FitScoringService (profile-driven)
                                         │        │                        │
                                         │   TypeORM / SQLite (better-sqlite3)
                                         │        │                        │
                                         │   NotionSyncService (optional)  │
                                         └───────────────────────────────┘
```

The backend is a pnpm monorepo: `api/` (NestJS) and `frontend/` (Vite + React). In
production NestJS serves the built frontend as static assets and the API under `/api`.

See [architecture.md](architecture.md) for module wiring, data flows, the upsert
invariant, and the design decisions behind each choice. See [prd.md](prd.md) for the
product spec and milestone breakdown.

**Adding a source** is one file implementing `SourceAdapter` plus one line in
`AdaptersModule` — the orchestrator picks it up automatically.

---

## Tech stack

| Layer    | Choices |
|----------|---------|
| Backend  | NestJS, TypeScript (strict, `nodenext`), TypeORM |
| Storage  | SQLite via `better-sqlite3` (zero-infra, single-user) |
| Frontend | Vite, React 18, TanStack Query v5, Tailwind CSS |
| Tooling  | pnpm workspaces, Jest, ESLint (flat config), Prettier |

---

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 10+ (`corepack enable` will provide it) — this project is pnpm-only

### Install & configure

```bash
git clone https://github.com/divyangchauhan/jobsieve.git
cd jobsieve
pnpm install

cp .env.example .env   # then fill in the values below
mkdir -p data
```

At minimum set these in `.env`:

| Variable           | Required | Description |
|--------------------|----------|-------------|
| `DATABASE_PATH`    | yes      | SQLite file path, relative to `api/` (default `../data/jobsieve.sqlite`) |
| `WEB3CAREER_TOKEN` | yes      | Free API token from [web3.career](https://web3.career/api-docs) |
| `CRON_SCHEDULE`    | no       | Cron expression for ingestion (default `0 */4 * * *` — every 4h) |
| `MIN_FIT_SCORE`    | no       | Fallback score floor when the profile leaves it unset; lower-scoring jobs are stored but hidden from the default view |
| `API_PORT`         | no       | HTTP port (default `3000`) |

> Scoring and filtering are driven by the editable **relevance profile** (Settings page →
> `PUT /api/profile`), **not** by env vars. `STACK_KEYWORDS` / `SENIORITY_KEYWORDS` are
> retired; they remain optional in validation only so older `.env` files still load.

### Run

```bash
# Backend (watch mode)
pnpm run dev:api          # NestJS on http://localhost:3000

# Frontend (separate terminal)
pnpm run dev:ui           # Vite on http://localhost:5173, proxies /api → :3000
```

### Production

```bash
pnpm run build            # builds frontend then backend
pnpm run start            # NestJS serves the API and the built UI on one port
```

### Trigger ingestion manually

Without waiting for the cron:

```bash
curl -X POST http://localhost:3000/api/admin/ingest    # or: pnpm run ingest
```

---

## REST API

All routes are under the `/api` prefix.

### `GET /api/jobs`

Returns deduplicated, fit-scored listings. Query params:

| Param         | Type    | Description |
|---------------|---------|-------------|
| `status`      | string  | `New` · `Reviewing` · `Applied` · `Skipped` |
| `source`      | string  | Adapter name, e.g. `remoteOK`, `web3career`, `greenhouse` |
| `minFitScore` | number  | Only jobs scoring `>=` this value |
| `remote`      | boolean | `true` for remote-only |
| `search`      | string  | LIKE match on title and company |
| `page`        | number  | Page number (default `1`) |
| `limit`       | number  | Results per page (default `20`) |

The default view excludes `Skipped` jobs and jobs below the effective fit-score floor.

### `GET /api/jobs/:id` · `PATCH /api/jobs/:id`

Fetch one job, or update its status:

```json
{ "status": "Applied" }   // New | Reviewing | Applied | Skipped
```

### `GET /api/profile` · `GET /api/profile/options` · `PUT /api/profile`

Read the relevance profile, read the taxonomy of selectable options, or update the
profile. Saving the profile rescores every stored job so `fit_score` stays truthful.

### `POST /api/admin/ingest`

Trigger a full ingestion run across all adapters. Returns per-source counts.

---

## Notion sync (optional)

Set both `NOTION_TOKEN` and `NOTION_DATABASE_ID` in `.env` to push newly-inserted jobs to
a Notion database after each run. Leave either blank to disable it entirely.

By default the sync writes to columns named **Company**, **Position**, **Link**, and
**Stage**; override them with the `NOTION_COL_*` env vars (see `.env.example`). Sync is
one-way and idempotent — re-runs update the existing page via the stored `notion_page_id`,
never creating duplicates. A token bucket holds requests to Notion's ~3 req/s limit with
exponential backoff on 429s.

---

## Development

```bash
pnpm test          # Jest unit tests (api/src/**/*.spec.ts)
pnpm run test:cov  # with coverage
pnpm run test:e2e  # e2e tests
pnpm run lint      # eslint --fix
pnpm run format    # prettier
```

Run a single test file:

```bash
pnpm --filter jobsieve-api test -- src/ingestion/dedup-key.spec.ts
```

---

## Production secrets

Never commit a real `.env`. In production, source secrets from a secrets manager
(AWS Secrets Manager, HashiCorp Vault, Doppler, GCP Secret Manager).

## License

[MIT](LICENSE) © Divyang Chauhan
