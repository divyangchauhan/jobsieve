# jobsieve — Architecture

## System overview

jobsieve is a pnpm monorepo with two workspaces — `api/` (NestJS) and `frontend/`
(Vite + React). A cron schedule drives eight source adapters through a single
orchestrator; results are deduplicated, upserted into SQLite, and fit-scored against an
editable relevance profile. A REST API and a React UI read that data; an optional module
syncs new jobs to Notion.

```
        React UI (Vite)                      NestJS application (port 3000)
        port 5173 (dev)                   ┌────────────────────────────────────┐
              │                           │  REST API                          │
              │  /api proxy (dev)         │   JobsController   /api/jobs        │
              └──────────────────────────►│   ProfileController /api/profile    │
                                          │   AdminController  /api/admin/...   │
   @Cron (every 4h, configurable) ───────►│            │                        │
                                          │   CronOrchestratorService           │
                                          │            │                        │
                                          │   ADAPTER_PROVIDERS  (8 adapters,    │
                                          │            │          try/catch each)│
                                          │   IngestionService   (upsert + dedup)│
                                          │            │                        │
                                          │   FitScoringService  (profile-driven)│
                                          │            │                        │
                                          │   TypeORM / SQLite (better-sqlite3)  │
                                          │            │                        │
                                          │   NotionSyncService (optional)       │
                                          └────────────────────────────────────┘
```

In production NestJS serves the built frontend (`frontend/dist`) as static assets and
falls back to `index.html` for non-`/api`, non-asset GET requests (SPA routing). The API
lives under the global `/api` prefix.

---

## Repository layout

```
jobsieve/
├── api/                              # NestJS backend (workspace: jobsieve-api)
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts                   # global /api prefix, static serve + SPA fallback
│   │   ├── config/
│   │   │   └── env.validation.ts     # class-validator env schema
│   │   ├── jobs/
│   │   │   ├── job.entity.ts         # TypeORM entity
│   │   │   ├── jobs.controller.ts    # GET /jobs, GET/PATCH /jobs/:id, POST /jobs/:id/notion-sync
│   │   │   ├── jobs.service.ts       # profile-aware SQL filtering + read-time scoring
│   │   │   └── dto/
│   │   ├── profile/
│   │   │   ├── profile.entity.ts     # singleton relevance profile
│   │   │   ├── profile.controller.ts # GET /profile, GET /profile/options, PUT /profile
│   │   │   └── profile.service.ts    # get/update + rescore-all
│   │   ├── ingestion/
│   │   │   ├── ingestion.service.ts  # status-preserving upsert
│   │   │   ├── normalize.ts
│   │   │   ├── normalized-job.interface.ts
│   │   │   ├── source-adapter.interface.ts
│   │   │   └── dedup-key.ts          # dedupKey() (+ spec)
│   │   ├── adapters/                 # one file per source + shared helpers
│   │   │   ├── adapters.module.ts    # ADAPTER_PROVIDERS injection token
│   │   │   ├── remote-ok.adapter.ts
│   │   │   ├── web3career.adapter.ts
│   │   │   ├── greenhouse.adapter.ts
│   │   │   ├── lever.adapter.ts
│   │   │   ├── ashby.adapter.ts
│   │   │   ├── remotive.adapter.ts
│   │   │   ├── himalayas.adapter.ts
│   │   │   ├── wwr.adapter.ts
│   │   │   ├── rss-helper.ts · retry.ts · concurrency.ts · title-filter.ts
│   │   ├── scoring/
│   │   │   ├── fit-scoring.service.ts
│   │   │   ├── taxonomy.ts           # role families, seniorities, stack, regions
│   │   │   └── phrase-match.ts
│   │   ├── cron/cron-orchestrator.service.ts
│   │   ├── admin/admin.controller.ts # POST /admin/ingest
│   │   └── notion/                   # conditionally registered
│   │       ├── notion-sync.service.ts
│   │       └── notion-column-map.ts
│   ├── scripts/                      # read-only diagnostics (smoke, resolve, audits)
│   └── test/                         # Jest e2e
├── frontend/                         # React app (workspace: jobsieve-frontend)
│   ├── vite.config.ts                # proxies /api → localhost:3000
│   └── src/
│       ├── pages/                    # JobBoard, JobDetail, Settings
│       ├── components/               # JobCard, FilterBar, FitScoreBar, MultiSelect, …
│       ├── hooks/useProfile.ts
│       └── api/                      # jobs.ts, profile.ts (Axios + TanStack Query)
├── .env.example · .gitignore · .npmrc   # shamefully-hoist=true (NestJS / better-sqlite3)
├── package.json                      # workspace root; packageManager: pnpm@10.x
├── prd.md · architecture.md · README.md
```

---

## Module dependency graph

```
AppModule
 ├── ConfigModule (global)            # env.validation.ts
 ├── TypeOrmModule (SQLite, global)   # entities: Job, Profile
 ├── JobsModule
 │    └── JobsController → JobsService → Job repository + ProfileService
 ├── ProfileModule
 │    └── ProfileController → ProfileService (get/update + rescore-all)
 ├── AdminModule
 │    └── AdminController → CronOrchestratorService
 ├── AdaptersModule
 │    └── provides ADAPTER_PROVIDERS token (array of 8 adapters):
 │         RemoteOK · Web3Career · Greenhouse · Lever · Ashby · Remotive · Himalayas · WWR
 ├── IngestionModule
 │    └── IngestionService → Job repository
 ├── ScoringModule
 │    └── FitScoringService (consumes the profile + taxonomy)
 ├── CronModule
 │    └── CronOrchestratorService
 │         ├── inject ADAPTER_PROVIDERS
 │         ├── inject IngestionService, FitScoringService, ProfileService
 │         └── inject NotionSyncService (optional)
 └── NotionModule (conditional — only when NOTION_TOKEN + NOTION_DATABASE_ID are set)
      └── NotionSyncService
```

---

## Data flow: cron run

```
@Cron fires (CRON_SCHEDULE, default 0 */4 * * *)
  │
  ▼
CronOrchestratorService.runIngestion()
  │
  ├── for each adapter (isolated try/catch):
  │     adapter.fetchJobs() → NormalizedJob[]
  │     IngestionService.upsert(jobs) → newJobs: Job[]
  │     log: "<source>: N fetched, M new"
  │
  ├── FitScoringService scores against the active relevance profile
  │
  └── if NotionSyncModule active:
        NotionSyncService.syncNew(allNewJobs)
          ├── token bucket ≤ 3 req/s
          ├── pages.create per new job; store notion_page_id
          └── on 429: exponential backoff (≤ 5 retries)
```

One broken source never blocks the others — each adapter runs in its own try/catch,
logs the failure, and returns `[]`.

---

## Data flow: REST API request

```
Client
  │  GET /api/jobs?status=New&remote=true&search=nestjs&page=1
  ▼
JobsController → JobsService.findAll(filters, pagination)
  │  Hard filters applied in SQL from the active profile:
  │    exclude terms · location types · region eligibility · freshness window
  │  plus request filters: status · source · remote · search
  │  ORDER BY first_seen_at DESC, LIMIT/OFFSET
  │  survivors fit-scored at read time; default view drops status='Skipped'
  │  and jobs below the effective fit-score floor (profile.minFitScore ?? MIN_FIT_SCORE)
  ▼
JSON response (paginated)
```

`fit_score` is also kept truthful on writes: ProfileService rescores every stored job on
each profile save, and scoring runs at ingest.

---

## Dedup key strategy

```
NormalizedJob
  ├─ sourceJobId present?
  │     YES → key = "${source}:${sourceJobId}"      e.g. "remoteOK:123456"
  │     NO  → normalize URL (lowercase host, strip ?query and #hash, drop trailing slash)
  │           key = sha1(normalizedUrl)
  └─ stored in dedup_key (UNIQUE) → INSERT ... ON CONFLICT(dedup_key) DO UPDATE
```

A secondary `content_key` and `alt_sources` support cross-source consolidation of the
same role surfaced under different URLs.

---

## Upsert strategy (status preservation)

```sql
INSERT INTO jobs (dedup_key, source, title, company, url, tags, remote, salary,
                  fit_score, status, first_seen_at, last_seen_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (dedup_key) DO UPDATE SET
  title        = excluded.title,
  company      = excluded.company,
  url          = excluded.url,
  tags         = excluded.tags,
  salary       = excluded.salary,
  last_seen_at = CURRENT_TIMESTAMP;
  -- status, notion_page_id, first_seen_at are NEVER overwritten
```

The invariant: re-ingesting a known job refreshes its mutable fields and `last_seen_at`,
but never clobbers user-owned state.

---

## Fit scoring

Scoring is **profile-driven**, not based on env keyword lists. The editable relevance
profile (`Profile` entity, edited via the Settings page → `PUT /api/profile`) holds:

- `roleFamilies`, `seniorities`, `stack` — positive signal
- `excludeTerms` — hard-filter terms
- `locationTypes`, `regionEligibility`, `freshnessDays` — hard filters
- `minFitScore` — per-profile floor (falls back to the `MIN_FIT_SCORE` env var)

The taxonomy of selectable role families, seniorities, default stack/excludes, locations,
and regions lives in `api/src/scoring/taxonomy.ts` and is extended there.
`FitScoringService` combines title/description phrase matches (`phrase-match.ts`) against
the profile to produce `fit_score`. Profiles are saved through the Settings UI, and every
save triggers a rescore-all so stored scores stay consistent with the current profile.

> `STACK_KEYWORDS` / `SENIORITY_KEYWORDS` env vars are **retired**. They remain optional
> in env validation only so older `.env` files still load.

---

## Key design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | SQLite via `better-sqlite3` | Zero-infra, single-user tool; synchronous driver avoids async complexity |
| Upsert | Raw `INSERT ... ON CONFLICT DO UPDATE` (QueryBuilder) | TypeORM `.save()` does not reliably skip untouched columns on conflict |
| Adapter isolation | Each adapter in its own try/catch inside the cron | One broken source must never block the others; it is logged and skipped |
| Adapter registration | `ADAPTER_PROVIDERS` injection token (array) | Adding a source = one file + one line; zero orchestrator changes |
| Scoring model | Editable relevance profile + taxonomy, rescore-on-save | Tunable from the UI without redeploys; keeps `fit_score` truthful |
| Source-side filtering | Profile excludes/location/region/freshness as SQL hard filters | Cheap to apply in SQL; only survivors get scored at read time |
| Notion gating | `registerAsync` factory returns a no-op when env vars are absent | Clean startup with no errors when Notion is unconfigured |
| Frontend state | TanStack Query | Caching, background refetch, optimistic updates — fits the read-heavy pattern |
| Frontend serve | NestJS static assets + SPA fallback in `main.ts` | Single process; no separate static server for self-hosted use |
| HTTP timeouts / retries | Per-adapter timeout + bounded retry/concurrency helpers | A slow upstream can't block the cron window |
| Notion rate limiting | Token bucket ≤ 3 req/s + exponential backoff on 429 | Respects Notion's ~3 req/s integration limit |

---

## Notion sync (optional)

When `NOTION_TOKEN` and `NOTION_DATABASE_ID` are both set, new jobs are pushed to a Notion
database after each run. The default column map (`notion-column-map.ts`) targets:

| Field | Default column | Env override |
|---|---|---|
| Company | `Company` | `NOTION_COL_NAME` |
| Position | `Position` | `NOTION_COL_POSITION` |
| Link | `Link` | `NOTION_COL_LINK` |
| Stage | `Stage` | `NOTION_COL_STAGE` |

Sync is one-way and idempotent — re-runs call `pages.update` via the stored
`notion_page_id` rather than creating duplicates.

---

## Adding a new source adapter

1. Create `api/src/adapters/mysource.adapter.ts` implementing `SourceAdapter`
   (`{ name: string; fetchJobs(): Promise<NormalizedJob[]> }`).
2. Register it in `api/src/adapters/adapters.module.ts` by adding it to `ADAPTER_PROVIDERS`.
3. Done — the orchestrator picks it up on the next run.
