# JobSieve

A Next.js job inbox with Clerk accounts, Neon Postgres, individual relevance profiles and application tracking, and early-job alerts. Job listings are shared; settings, statuses, subscriptions and notification history belong to each user. The former NestJS/Vite server and Notion integration have been replaced.

## Run locally

Use Node 22+ and pnpm 10:

```sh
pnpm install
cp .env.example .env.local
# Configure DATABASE_URL and both Clerk keys in .env.local.
pnpm db:migrate
pnpm dev
```

Create a Clerk application with email and/or social sign-in. Use its **development** keys locally. Configure `/sign-in` and `/sign-up` as shown in `.env.example`. Clerk supplies account management, verification and session handling; passwords are never stored in Postgres.

`pnpm db:migrate` runs versioned SQL migrations under a transaction and advisory lock. Runtime schema synchronization is not used. Configure a Clerk webhook at `/api/webhooks/clerk` for `user.deleted` and `user.updated`, and set `CLERK_WEBHOOK_SIGNING_SECRET`; deletion cascades through private user data.

## Vercel and Neon

1. Create a Vercel project named `jobsieve`, framework **Next.js**, repository root `.`.
2. Connect the existing `neon-database` resource. Its integration injects a pooled `DATABASE_URL`. Use isolated Neon branches for preview and development environments.
3. Add Clerk keys, URL settings, `CRON_SECRET` and notification credentials in Vercel project settings. All secret keys remain server-only.
4. Apply migrations to the target database, then deploy. Do not automatically migrate production from every preview build.
5. Sign in, customize Settings, refresh the inbox, configure Alerts and enable a device or destination.

The checked-in `vercel.json` selects Sydney (`syd1`) to match the existing database, and defines source cron jobs plus a notification worker. Frequent Vercel cron requires **Pro**. The project does not change your billing plan.

Clerk production authentication requires a domain you own and its DNS records; a `*.vercel.app` address uses Clerk development keys. Keep development previews protected. The provisioned `jobsieve_preview` database separates preview records from the production database on the existing Neon resource; a separate Neon branch is preferable when evolving schemas. Preview deployments do not run scheduled jobs. Enable the checked-in cron schedule when deploying production.

## Job ingestion

The **Sync jobs** button calls authenticated Server Actions, one bounded source batch at a time, and reports progress. Completed batches remain saved if the browser closes; scheduled ingestion continues independently. Each source batch has a database lease and cooldown, so concurrent users cannot multiply upstream requests. The source registry is in `lib/registry/company-registry.ts`.

All sources run once daily at 00:00 UTC. ATS boards remain partitioned into batches of ten companies. The manual Sync jobs button remains available between scheduled runs and respects source cooldowns. Missing `WEB3CAREER_TOKEN` does not disable the other sources.

Source coverage is limited to the configured boards, public feed results and pagination caps. Listing a company in a user's preferences filters available jobs; it does not discover a new ATS board. Company criteria match company names and catalogue sector labels; funding, headcount and other unavailable attributes are not inferred from a job description.

Shared ingestion never applies an individual user's title allowlist. Jobs are deduplicated by normalized company/title and source identity. Re-ingestion preserves first-seen time and every user's application status, and returns IDs instead of copying descriptions back to the server. Postgres calculates fit scores, filters and paginates against the current user's profile. Only the requested page crosses the database connection.

## Early-job alerts

Alerts are disabled until a user enables them. Set the posting-age window (1–24 hours), channels, and company/job preferences. Company names OR company keywords are combined with job keywords and the relevance profile. Selected role families must match for alerts. Jobs already applied to or skipped are excluded.

A job needs a valid source publication time inside the window. Unknown timestamps are excluded unless the user opts into **newly discovered** alerts. Initial source imports are excluded from discovery alerts. Greenhouse's `updated_at` is deliberately **not** treated as a publication time. Notifications distinguish publication from discovery, and neither implies guaranteed interview odds. Source delays (including Remotive's 24-hour delay) mean the system cannot guarantee discovery within the first few hours.

A durable Postgres outbox deduplicates by user/job/channel. The worker runs once daily at 00:05 UTC, five minutes after source polling starts, rechecks preferences and job age, and retries transient failures up to five attempts with backoff. Users see recent delivery status. Delivery is at least once: a crash after a provider accepts a message can cause a retry. Resend uses an idempotency key; push uses a stable notification tag. Slack/Discord cannot guarantee exactly-once delivery.

The worker checks for enabled users first. It matches jobs and inserts outbox entries inside Postgres, returning only the number queued. It does not download the last day's descriptions on every tick. Neon transfer quotas still apply; exhausting one blocks database access until the allowance resets or the plan changes. The API reports this as a temporary service outage without exposing connection credentials.

### Channel setup

- **Browser push:** generate VAPID keys with `pnpm exec web-push generate-vapid-keys`; set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a valid `VAPID_SUBJECT`. Users grant browser permission and explicitly register each device in Alerts. HTTPS is required except localhost. iOS requires adding the app to the Home Screen. Account switches suppress notifications intended for another account on that browser.
- **Email:** configure `RESEND_API_KEY` and a verified sender in `ALERT_EMAIL_FROM`. Delivery uses the current verified primary Clerk email, never an arbitrary submitted address.
- **Discord / Slack:** configure a 32-byte hex `NOTIFICATION_ENCRYPTION_KEY` (`openssl rand -hex 32`). Users save official incoming webhook URLs in Alerts. URLs are encrypted at rest and never returned through the API; blank replacement fields keep saved values. Disable the channel to stop delivery.

Notification destinations are restricted to supported provider hosts, redirect following is disabled, and HTTP requests have timeouts. No live messages are sent by the test suite.

## Import existing SQLite data

Back up the old database first. After migrations, explicitly choose the Clerk user who owns the legacy profile and application statuses:

```sh
pnpm db:import /absolute/path/jobsieve.sqlite user_YOUR_CLERK_ID
```

The importer reads SQLite without modifying it. Job listings become shared, while the legacy profile and statuses are assigned only to that owner. Import on a fresh target before normal use. Alerts remain disabled. No SQLite data is packaged into a Vercel deployment.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Unit tests retain the scoring, normalization, URL deduplication and RemoteOK regression suites. Integration tests run actual SQL against Postgres and cover tenant isolation, state preservation, concurrent ingestion, notification leases/retries, alert matching, authenticated routes and unsafe destinations. Set `TEST_DATABASE_URL` to a dedicated test database; tests create and drop uniquely named schemas, never truncate production tables.

Browser UI tests exercise the actual React screens with mocked service boundaries. Live Clerk sign-in and delivery-provider acceptance require configured credentials and are separate from those tests. Run `pnpm test:e2e:live` with Clerk development keys to verify real sign-in, sign-out and two-user isolation. It creates and removes dedicated Clerk test users and uses TEST_DATABASE_URL; production Clerk keys are rejected. See `tests/e2e` for those checks.

### Usage controls

Background schedules total 17 calls per day at the current source count: 16 ingestion batches at 00:00 UTC and one notification worker at 00:05 UTC. Daily polling can delay job discovery by up to 24 hours. Alerts still respect each user's maximum job age, so jobs older than that window will not generate notifications. Failed deliveries retry on the next daily worker run only while still eligible. This replaces the earlier 15-minute schedule at the user's request.

Job lists and notification delivery return summary fields. Full descriptions are fetched only for the job detail view. Manual sync refreshes the list once at completion and scans alerts only for that user. Unchanged ingestion rows are not rewritten; last-seen timestamps refresh at most hourly unless job content changes. API reads do not rewrite unchanged user records. Failed ingestion respects each source's normal cooldown. A shared five-minute gate prevents overlapping notification cron invocations; expired delivery leases also count toward the five-attempt maximum. Neon statements have a 15-second database timeout in addition to the HTTP timeout.

These controls bound known amplification paths; they are not a spending cap. The regression suite checks transferred bytes, unchanged row versions, overlapping workers, retry limits, and schedule volume. Monitor Neon CU-hours, transfer and retained history after a full day of healthy operation. Jobs and private application history are retained; storage will grow with new jobs and accounts.
