# jobsieve — Product Requirements Document

## Overview

**jobsieve** is a self-hosted job aggregation service that pulls listings from multiple sources on a cron schedule, deduplicates and fit-scores them, stores them in a local SQLite database, and exposes them through both a REST API and a React web UI. The goal is to eliminate the noise of job-hunting across multiple platforms and surface only the listings that match your specific stack and seniority.

---

## Problem Statement

Job seekers in specialized tech niches (Web3, senior backend, etc.) must manually check multiple job boards daily. Listings duplicate across boards, quality varies widely, and there is no single place to track application status. jobsieve solves this by aggregating, deduplicating, scoring, and presenting jobs in one focused inbox.

---

## Goals

- Aggregate job listings from heterogeneous sources (JSON APIs, RSS feeds) on a schedule.
- Deduplicate across sources using a deterministic key so the same job never appears twice.
- Score each listing against configurable keyword lists so the inbox stays signal-heavy.
- Preserve user-owned state (status, Notion page ID) across re-syncs.
- Expose a minimal REST API and a React UI for browsing, filtering, and tracking applications.
- Optionally sync new listings to a Notion database for users who manage tasks there.

---

## Non-Goals

- No user authentication (single-user self-hosted tool).
- No job application submission.
- No email/push notifications (v1).
- No multi-user support.

---

## Environment Variables (.env.example)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_PATH` | Yes | Path to the SQLite file, e.g. `./data/jobsieve.sqlite` |
| `CRON_SCHEDULE` | Yes | Cron expression for ingestion, e.g. `0 */4 * * *` (every 4h) |
| `WEB3CAREER_TOKEN` | Yes (for web3.career adapter) | Free API token from web3.career |
| `MIN_FIT_SCORE` | Yes | Integer; jobs below this score are stored but hidden from default view |
| `STACK_KEYWORDS` | Yes | Comma-separated list, e.g. `typescript,nestjs,node,python,aws,kafka,web3,solidity` |
| `SENIORITY_KEYWORDS` | Yes | Comma-separated list, e.g. `senior,lead,staff,principal` |
| `NOTION_TOKEN` | Optional | Notion integration token; Notion sync only activates if both Notion vars are set |
| `NOTION_DATABASE_ID` | Optional | ID of the target Notion database |
| `API_PORT` | Optional | Port for the NestJS HTTP server, default `3000` |
| `FRONTEND_PORT` | Optional | Port for the Vite dev server, default `5173` |

> **Production note:** Source all secrets from a secrets manager (AWS Secrets Manager, Vault, etc.). Never commit `.env` to version control.

---

## Milestones

### Milestone 1 — Project + git setup
**Goal:** A clean, runnable NestJS skeleton with all tooling in place.

**Deliverables:**
- `git init` in `jobsieve/`; `package.json` name = `"jobsieve"`
- NestJS scaffold via CLI; TypeScript `strict: true`
- ESLint (flat config) + Prettier configured
- `.gitignore` covering `node_modules`, `dist`, `*.sqlite*`, `.env*`
- `.env.example` with every variable documented
- `README.md` with purpose, setup, env vars, and run instructions

**Commit:** `chore: scaffold jobsieve`

---

### Milestone 2 — Data model
**Goal:** A stable, indexed SQLite schema via TypeORM.

**Deliverables:**
- `Job` TypeORM entity with all columns:
  - `id` (PK, auto-increment)
  - `dedup_key` (unique, indexed)
  - `source`, `source_job_id` (nullable)
  - `title`, `company`, `url`
  - `posted_at` (nullable)
  - `tags` (JSON stored as text)
  - `remote` (boolean)
  - `salary` (nullable text)
  - `description` (nullable text)
  - `fit_score` (int, nullable)
  - `status` (text, default `'New'`)
  - `notion_page_id` (nullable)
  - `first_seen_at`, `last_seen_at` (timestamps)
- Indexes: unique on `dedup_key`; composite on `(status, first_seen_at)`
- TypeORM `synchronize: true` for dev; migration path documented for prod

**Commit:** `feat: add Job entity and TypeORM SQLite setup`

---

### Milestone 3 — Core normalization + dedup
**Goal:** A shared DTO + interface contract all adapters must satisfy, and a tested dedup key function.

**Deliverables:**
- `NormalizedJob` interface (no `any`)
- `SourceAdapter` interface: `{ name: string; fetchJobs(): Promise<NormalizedJob[]> }`
- `dedupKey(job: NormalizedJob): string`:
  - If `sourceJobId` present: `"${source}:${sourceJobId}"`
  - Else: SHA-1 of normalized URL (lowercase host, strip query + hash, drop trailing slash)
- Unit tests covering: ID path, URL path, trailing slash, query strings, uppercase host, missing both

**Commit:** `feat: add NormalizedJob DTO, SourceAdapter interface, and dedupKey with tests`

---

### Milestone 4 — Source adapters (v1)
**Goal:** Three isolated, failure-safe source adapters producing `NormalizedJob[]`.

**Deliverables:**
- `RemoteOKAdapter`: GET `https://remoteok.com/api`; drop element 0; set `User-Agent`
- `Web3CareerAdapter`: web3.career API (env-gated on `WEB3CAREER_TOKEN`)
- `HireWeb3Adapter`: RSS at `https://hireweb3.io/job/rss` via `rss-parser`
- Each adapter: isolated try/catch, logs failure, returns `[]` on error, 10s HTTP timeout
- Sample payload documented in adapter source comment
- Unit tests for `RemoteOKAdapter` normalize step using captured fixture

**Commit:** `feat: add RemoteOK, web3.career, and HireWeb3 source adapters`

---

### Milestone 5 — Upsert with status preservation
**Goal:** An ingestion service that safely upserts jobs without overwriting user-owned state.

**Deliverables:**
- `IngestionService.upsert(jobs: NormalizedJob[]): Promise<Job[]>` (returns new rows only)
- INSERT sets `status='New'`, `first_seen_at=now`, `last_seen_at=now`
- `ON CONFLICT(dedup_key) DO UPDATE` updates only: `title`, `company`, `url`, `tags`, `salary`, `last_seen_at`
- Columns never touched on re-sync: `status`, `notion_page_id`, `first_seen_at`
- Tests:
  - Fresh insert → `status = 'New'`
  - Re-ingest after setting `status = 'Applied'` → still `'Applied'`
  - Re-ingest returns empty new-rows array for known jobs

**Commit:** `feat: add IngestionService with status-preserving upsert`

---

### Milestone 6 — Cron orchestrator + fit scoring
**Goal:** A scheduled orchestrator that drives all adapters and scores results.

**Deliverables:**
- `FitScoringService.score(job: NormalizedJob): number`:
  - +2 per matching `STACK_KEYWORDS` term (in title + description)
  - +3 per matching `SENIORITY_KEYWORDS` term
  - +2 if `remote === true`
  - Score stored in `fit_score`
- `CronOrchestratorService`:
  - `@Cron(process.env.CRON_SCHEDULE)` (default `0 */4 * * *`)
  - Iterates adapters in `try/catch` each; continues past failures
  - Logs `"<source>: N fetched, M new"` per adapter
- Adapters registered as `ADAPTER_PROVIDERS` injection token (adding a source = 1 file + 1 line)

**Commit:** `feat: add cron orchestrator and fit scoring`

---

### Milestone 7 — REST API
**Goal:** A minimal, filterable HTTP interface for browsing jobs and tracking status.

**Deliverables:**
- `GET /jobs` — query params:
  - `status` (filter by status value)
  - `source` (filter by adapter name)
  - `minFitScore` (integer)
  - `remote` (boolean)
  - `search` (LIKE match on title + company)
  - `page`, `limit` (pagination, default limit 20)
  - Default: excludes `fit_score < MIN_FIT_SCORE` and `status = 'Skipped'`
- `PATCH /jobs/:id` — update `status` only; validate against enum `New | Reviewing | Applied | Skipped`
- `POST /admin/ingest` — manually trigger a full cron run (for testing)
- Response DTOs; no `any` in controllers

**Commit:** `feat: add REST API with job listing and status update endpoints`

---

### Milestone 8 — OPTIONAL Notion sync module
**Goal:** Push new jobs to Notion after each cron run; keep in sync on re-runs.

**Deliverables:**
- `NotionSyncModule`: only loads if `NOTION_TOKEN` + `NOTION_DATABASE_ID` are both set
- After each cron run: push newly-inserted `Job[]` to Notion database
- Store returned `notion_page_id` on each job; re-runs call `pages.update` instead of creating duplicates
- Rate limiter: ≤3 req/s via token bucket; 429 → exponential backoff with jitter (max 5 retries)
- README documents expected Notion DB schema (columns: Name, Company, URL, Status, FitScore, Source, PostedAt, Tags)

**Commit:** `feat: add optional Notion sync module`

---

### Milestone 9 — React frontend
**Goal:** A focused, single-page UI for browsing, filtering, and triaging job listings.

**Deliverables:**
- Vite + React 18 + TypeScript (`strict: true`) in `packages/frontend/` (monorepo-style or `frontend/` subdir)
- TanStack Query v5 for server state; Axios for HTTP calls to the NestJS API
- Tailwind CSS for styling; minimal custom CSS
- **Pages / Views:**
  - **Job Board** (`/`) — paginated card/table view of jobs; default filters applied (excludes low-fit + Skipped)
  - **Job Detail** (`/jobs/:id`) — full description, metadata, fit score breakdown, status selector
- **Filter bar** — live-updating controls for: source, status, remote toggle, min fit score slider, keyword search
- **Status badge** — color-coded pill per status (`New` = blue, `Reviewing` = yellow, `Applied` = green, `Skipped` = grey); clicking cycles status via `PATCH /jobs/:id`
- **Fit score bar** — visual indicator of score out of max possible
- **Manual sync button** — calls `POST /admin/ingest`, shows loading spinner + result toast
- **Dark mode** — respects `prefers-color-scheme`; manual toggle stored in `localStorage`
- Error boundary + loading skeletons for all async views
- `pnpm run dev` in `frontend/` proxies `/api` to `localhost:3000`
- `pnpm run build` outputs static assets that NestJS can serve from `/` via `ServeStaticModule`

**Tech choices:**
| Concern | Library |
|---|---|
| Build | Vite 5 |
| UI framework | React 18 |
| Server state | TanStack Query v5 |
| HTTP | Axios |
| Styling | Tailwind CSS v3 |
| Routing | React Router v6 |
| Toasts | react-hot-toast |
| Icons | lucide-react |

**Commit:** `feat: add React frontend with job board, filters, and status management`

---

## Done Criteria

- `pnpm run start` in repo root launches the NestJS API.
- `pnpm run dev` in `frontend/` launches the React dev server proxying to the API.
- `pnpm run build && pnpm run start` serves the React app as static files from NestJS.
- `POST /admin/ingest` populates SQLite from all adapters.
- `GET /jobs` returns deduplicated, fit-scored listings.
- Changing a job's status in the UI persists across page reloads and cron re-syncs.
- `pnpm test` passes (dedupKey, adapter normalize, upsert status-preservation).
