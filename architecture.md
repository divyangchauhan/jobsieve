# jobsieve — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          jobsieve                               │
│                                                                 │
│  ┌──────────────┐   ┌──────────────────────────────────────┐   │
│  │  React UI    │   │         NestJS Application           │   │
│  │  (Vite)      │◄──┤                                      │   │
│  │  port 5173   │   │  ┌─────────────┐  ┌───────────────┐ │   │
│  │  (dev)       │   │  │  REST API   │  │  Cron Module  │ │   │
│  └──────────────┘   │  │  /jobs      │  │  @Cron(4h)    │ │   │
│         │           │  │  /admin/... │  └──────┬────────┘ │   │
│    /api proxy       │  └──────┬──────┘         │          │   │
│         │           │         │           ┌────▼────────┐ │   │
│         └───────────┼─────────┘           │ Orchestrator│ │   │
│                     │                     │  Service    │ │   │
│                     │              ┌──────┴──────────┐  │ │   │
│                     │              │  Adapter Array  │  │ │   │
│                     │              │  ┌───────────┐  │  │ │   │
│                     │              │  │ RemoteOK  │  │  │ │   │
│                     │              │  ├───────────┤  │  │ │   │
│                     │              │  │ Web3Career│  │  │ │   │
│                     │              │  ├───────────┤  │  │ │   │
│                     │              │  │ HireWeb3  │  │  │ │   │
│                     │              │  └───────────┘  │  │ │   │
│                     │              └────────┬────────┘  │ │   │
│                     │                       │           │ │   │
│                     │              ┌────────▼────────┐  │ │   │
│                     │              │ IngestionService│  │ │   │
│                     │              │ (upsert + dedup)│  │ │   │
│                     │              └────────┬────────┘  │ │   │
│                     │                       │           │ │   │
│                     │              ┌────────▼────────┐  │ │   │
│                     │              │ FitScoring      │  │ │   │
│                     │              │ Service         │  │ │   │
│                     │              └────────┬────────┘  │ │   │
│                     │                       │           │ │   │
│                     │         ┌─────────────▼─────────┐ │ │   │
│                     └─────────►   TypeORM / SQLite    ◄─┘ │   │
│                               │   (better-sqlite3)    │   │   │
│                               └───────────────────────┘   │   │
│                                                            │   │
│                    ┌───────────────────────────────────┐   │   │
│                    │  NotionSyncModule (optional)      │   │   │
│                    │  Only loads if NOTION_TOKEN set   │   │   │
│                    └───────────────────────────────────┘   │   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Repository Layout

```
jobsieve/
├── src/                          # NestJS backend
│   ├── app.module.ts
│   ├── main.ts
│   ├── config/
│   │   └── configuration.ts      # typed env config via @nestjs/config
│   ├── jobs/
│   │   ├── job.entity.ts         # TypeORM entity
│   │   ├── jobs.module.ts
│   │   ├── jobs.service.ts       # DB queries for REST API
│   │   └── jobs.controller.ts    # GET /jobs, PATCH /jobs/:id
│   ├── ingestion/
│   │   ├── ingestion.module.ts
│   │   ├── ingestion.service.ts  # upsert logic
│   │   ├── normalized-job.interface.ts
│   │   ├── source-adapter.interface.ts
│   │   └── dedup-key.ts          # dedupKey() + tests
│   ├── adapters/
│   │   ├── adapters.module.ts
│   │   ├── remoteok.adapter.ts
│   │   ├── web3career.adapter.ts
│   │   └── hireweb3.adapter.ts
│   ├── scoring/
│   │   ├── scoring.module.ts
│   │   └── fit-scoring.service.ts
│   ├── cron/
│   │   ├── cron.module.ts
│   │   └── cron-orchestrator.service.ts
│   ├── admin/
│   │   └── admin.controller.ts   # POST /admin/ingest
│   └── notion/
│       ├── notion.module.ts      # conditionally registered
│       └── notion-sync.service.ts
├── frontend/                     # React app
│   ├── index.html
│   ├── vite.config.ts            # proxies /api → localhost:3000
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── jobs.ts           # Axios + TanStack Query hooks
│   │   ├── components/
│   │   │   ├── JobCard.tsx
│   │   │   ├── JobDetail.tsx
│   │   │   ├── FilterBar.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── FitScoreBar.tsx
│   │   │   └── SyncButton.tsx
│   │   └── pages/
│   │       ├── JobBoard.tsx
│   │       └── JobDetailPage.tsx
│   └── package.json
├── test/                         # integration / e2e tests (Jest)
├── .env.example
├── .gitignore
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
├── package.json
├── prd.md
├── architecture.md
└── README.md
```

---

## Module Dependency Graph

```
AppModule
 ├── ConfigModule (global)
 ├── TypeOrmModule (SQLite, global)
 ├── JobsModule
 │    └── JobsController → JobsService → TypeORM JobRepository
 ├── AdminModule
 │    └── AdminController → CronOrchestratorService
 ├── AdaptersModule
 │    └── provides ADAPTER_PROVIDERS token
 │         ├── RemoteOKAdapter
 │         ├── Web3CareerAdapter
 │         └── HireWeb3Adapter
 ├── IngestionModule
 │    └── IngestionService → TypeORM JobRepository
 ├── ScoringModule
 │    └── FitScoringService
 ├── CronModule
 │    └── CronOrchestratorService
 │         ├── inject ADAPTER_PROVIDERS
 │         ├── inject IngestionService
 │         ├── inject FitScoringService
 │         └── inject NotionSyncService (optional)
 └── NotionModule (conditional)
      └── NotionSyncService
```

---

## Data Flow: Cron Run

```
@Cron fires
  │
  ▼
CronOrchestratorService.runIngestion()
  │
  ├── for each adapter (try/catch):
  │     adapter.fetchJobs() → NormalizedJob[]
  │     FitScoringService.score(job) → fit_score applied
  │     IngestionService.upsert(jobs) → newJobs: Job[]
  │     log: "<source>: N fetched, M new"
  │
  └── (if NotionSyncModule active)
        NotionSyncService.syncNew(allNewJobs)
          ├── batch into groups of 3
          ├── POST pages.create per job (rate ≤ 3/s)
          ├── on 429: exponential backoff, retry ≤5
          └── store notion_page_id on each Job
```

---

## Data Flow: REST API Request

```
Client
  │  GET /jobs?status=New&minFitScore=5&remote=true&search=nestjs&page=1
  ▼
JobsController
  │
  ▼
JobsService.findAll(filters, pagination)
  │  SELECT * FROM jobs
  │  WHERE status != 'Skipped'
  │    AND fit_score >= MIN_FIT_SCORE   ← default
  │    AND status = 'New'              ← from query
  │    AND remote = true               ← from query
  │    AND fit_score >= 5              ← from query
  │    AND (title LIKE '%nestjs%' OR company LIKE '%nestjs%')
  │  ORDER BY first_seen_at DESC
  │  LIMIT 20 OFFSET 0
  ▼
JobsController → JSON response
```

---

## Dedup Key Strategy

```
NormalizedJob
  │
  ├─ sourceJobId present?
  │     YES → key = "${source}:${sourceJobId}"      e.g. "remoteok:123456"
  │     NO  → normalize URL:
  │              lowercase host
  │              strip ?query and #hash
  │              strip trailing slash
  │           key = sha1(normalizedUrl)
  │
  └─ stored in dedup_key column (UNIQUE constraint)
       → INSERT OR IGNORE / ON CONFLICT DO UPDATE
```

---

## Upsert Strategy (Status Preservation)

```sql
INSERT INTO jobs (dedup_key, source, title, company, url, tags,
                  remote, salary, fit_score, status,
                  first_seen_at, last_seen_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (dedup_key) DO UPDATE SET
  title        = excluded.title,
  company      = excluded.company,
  url          = excluded.url,
  tags         = excluded.tags,
  salary       = excluded.salary,
  last_seen_at = CURRENT_TIMESTAMP
  -- status, notion_page_id, first_seen_at are NEVER updated
```

New rows identified via `RETURNING id` (or pre-check existence before batch).

---

## Fit Scoring Algorithm

```
score = 0

for each keyword in STACK_KEYWORDS:
  if keyword in (job.title + ' ' + job.description).toLowerCase():
    score += 2

for each keyword in SENIORITY_KEYWORDS:
  if keyword in job.title.toLowerCase():
    score += 3

if job.remote === true:
  score += 2

job.fit_score = score

if score < MIN_FIT_SCORE:
  job is stored but excluded from default GET /jobs response
```

---

## Frontend Architecture

```
frontend/src/
  │
  ├── api/jobs.ts
  │     Axios instance (baseURL = /api)
  │     TanStack Query hooks:
  │       useJobs(filters)      → GET /jobs
  │       useJob(id)            → GET /jobs/:id
  │       useUpdateStatus()     → PATCH /jobs/:id (mutation + cache invalidate)
  │       useIngest()           → POST /admin/ingest
  │
  ├── pages/JobBoard.tsx
  │     QueryClientProvider
  │     FilterBar (controlled state → passed to useJobs)
  │     SyncButton
  │     Paginated list of JobCard components
  │
  ├── pages/JobDetailPage.tsx
  │     useJob(id)
  │     Full description render
  │     StatusBadge with click-to-update
  │     FitScoreBar
  │
  └── components/
        StatusBadge.tsx   — color-coded; onClick → useUpdateStatus mutation
        FitScoreBar.tsx   — score / maxPossibleScore as a styled bar
        FilterBar.tsx     — source, status, remote, minFitScore, search inputs
        SyncButton.tsx    — calls useIngest, shows spinner + toast
```

**Dev proxy** (`vite.config.ts`):
```ts
server: {
  proxy: {
    '/api': 'http://localhost:3000'
  }
}
```

**Production serve**: NestJS `ServeStaticModule` serves `frontend/dist` at `/`; API remains at `/jobs`, `/admin/ingest`.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | SQLite via `better-sqlite3` | Zero-infra, single-user tool; synchronous driver avoids async complexity |
| ORM upsert | Raw `INSERT ... ON CONFLICT DO UPDATE` via QueryBuilder | TypeORM `.save()` does not reliably skip untouched columns on conflict |
| Adapter isolation | Each adapter in its own `try/catch` inside the cron | One broken source must never block others; logged and skipped |
| Adapter registration | `ADAPTER_PROVIDERS` injection token (array) | Adding a new source = one file + push to the array; zero changes to orchestrator |
| Notion module gating | `registerAsync` with `useFactory` returning null if env vars absent | Clean no-op with no startup errors; avoids `@notionhq/client` crashing on missing token |
| Fit scoring | In-process, env-configurable keyword lists | Zero deps, trivially tunable, fast |
| Frontend state | TanStack Query | Handles caching, background refetch, and optimistic updates; fits the read-heavy pattern |
| Frontend build → backend serve | `ServeStaticModule` | Single process, no separate static server needed for self-hosted use |
| HTTP timeouts | 10s on all adapter requests | Prevents a slow upstream from blocking the entire cron window |
| Rate limiting (Notion) | Token bucket at ≤3 req/s + exponential backoff on 429 | Notion API limit is ~3 req/s per integration; backoff prevents thundering herd |

---

## Notion Database Schema

If using Notion sync, create a database with these properties:

| Property | Type | Notes |
|---|---|---|
| Name | Title | Job title |
| Company | Text | |
| URL | URL | Job listing URL |
| Status | Select | Options: New, Reviewing, Applied, Skipped |
| Fit Score | Number | |
| Source | Select | Adapter name |
| Remote | Checkbox | |
| Posted At | Date | |
| Tags | Multi-select | |
| First Seen | Date | |

---

## Adding a New Source Adapter

1. Create `src/adapters/mysource.adapter.ts` implementing `SourceAdapter`.
2. Register it in `src/adapters/adapters.module.ts` by pushing to `ADAPTER_PROVIDERS`.
3. Done — the orchestrator picks it up automatically.
