# jobsieve

A self-hosted job aggregation service that pulls listings from multiple sources on a cron schedule, deduplicates and fit-scores them against your stack keywords, and surfaces them in one focused inbox — via a REST API and a React web UI.

---

## What it does

- Pulls jobs from RemoteOK (JSON), web3.career (API), and HireWeb3 (RSS) every 4 hours (configurable).
- Deduplicates across sources using a deterministic key (source ID or SHA-1 of normalized URL).
- Scores each listing against configurable stack and seniority keywords.
- Exposes a filterable REST API at `GET /jobs`.
- Serves a React UI for browsing, filtering, and tracking application status.
- Optionally syncs new listings to a Notion database.

---

## Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
git clone <repo-url> jobsieve
cd jobsieve
pnpm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values. At minimum:

| Variable | Description |
|---|---|
| `DATABASE_PATH` | Path to the SQLite file, e.g. `./data/jobsieve.sqlite` |
| `CRON_SCHEDULE` | Cron expression, e.g. `0 */4 * * *` |
| `WEB3CAREER_TOKEN` | Free API token from [web3.career](https://web3.career/api-docs) |
| `MIN_FIT_SCORE` | Integer threshold; jobs below this are hidden from default view |
| `STACK_KEYWORDS` | Comma-separated, e.g. `typescript,nestjs,node,python,aws` |
| `SENIORITY_KEYWORDS` | Comma-separated, e.g. `senior,lead,staff,principal` |

Create the data directory:

```bash
mkdir -p data
```

### Run

**Development (with watch):**
```bash
pnpm run start:dev
```

**Production:**
```bash
pnpm run build
pnpm run start:prod
```

The API starts on `http://localhost:3000` (or `API_PORT`).

---

## Triggering ingestion manually

For testing without waiting for the cron, hit the admin endpoint:

```bash
curl -X POST http://localhost:3000/admin/ingest
```

Or via npm script:

```bash
pnpm run ingest
```

---

## REST API

### `GET /jobs`

Returns deduplicated, fit-scored job listings.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by status: `New`, `Reviewing`, `Applied`, `Skipped` |
| `source` | string | Filter by adapter name: `remoteok`, `web3career`, `hireweb3` |
| `minFitScore` | number | Only jobs with `fit_score >=` this value |
| `remote` | boolean | `true` for remote-only |
| `search` | string | LIKE match on title and company |
| `page` | number | Page number (default `1`) |
| `limit` | number | Results per page (default `20`) |

Default response excludes `Skipped` jobs and jobs below `MIN_FIT_SCORE`.

### `PATCH /jobs/:id`

Update a job's status.

```json
{ "status": "Applied" }
```

Valid values: `New` | `Reviewing` | `Applied` | `Skipped`

### `POST /admin/ingest`

Manually trigger a full ingestion run across all adapters. Returns counts per source.

---

## React UI

**Development:**

```bash
cd frontend
pnpm install
pnpm run dev   # starts on http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:3000`.

**Production (served by NestJS):**

```bash
cd frontend && pnpm run build
cd ..
pnpm run start:prod   # NestJS serves frontend/dist at /
```

---

## Notion Sync (optional)

If you want new jobs pushed to a Notion database after each cron run, set both Notion env vars in `.env`:

```
NOTION_TOKEN=secret_...
NOTION_DATABASE_ID=<your-database-id>
```

### Expected Notion database schema

Create a database with these properties:

| Property | Type |
|---|---|
| Name | Title |
| Company | Text |
| URL | URL |
| Status | Select — options: New, Reviewing, Applied, Skipped |
| Fit Score | Number |
| Source | Select |
| Remote | Checkbox |
| Posted At | Date |
| Tags | Multi-select |
| First Seen | Date |

The service syncs only newly-inserted jobs after each cron run. Re-runs update the existing Notion page via the stored `notion_page_id` — no duplicates.

> **Rate limiting:** Notion's API limit is ~3 requests/sec. jobsieve enforces this automatically with a token bucket and exponential backoff on 429 responses.

---

## Production secrets

Never commit `.env` to version control. In production, source all secrets from a secrets manager:
- AWS Secrets Manager
- HashiCorp Vault
- Doppler
- GCP Secret Manager

---

## Adding a new job source

1. Create `src/adapters/mysource.adapter.ts` implementing the `SourceAdapter` interface.
2. Register it in `src/adapters/adapters.module.ts` by adding it to `ADAPTER_PROVIDERS`.
3. Done — the orchestrator picks it up on the next run.

---

## Development

```bash
pnpm run test        # unit tests
pnpm run test:cov    # with coverage
pnpm run lint        # eslint
pnpm run format      # prettier
```
