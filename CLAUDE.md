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

## Current application

JobSieve is now a Next.js App Router application with Clerk accounts and Neon Postgres. Use pnpm exclusively.

- `app/`: authenticated routes, API handlers, Server Actions, cron endpoints.
- `lib/`: source adapters, pure scoring, Postgres access, user isolation, alert matching and durable delivery.
- `ui/`: existing React inbox, detail and settings components, plus alert configuration.
- `migrations/`: versioned SQL; no automatic runtime schema synchronization.
- `tests/`: real Postgres integration tests and browser regression tests.

Commands: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:e2e:live`, `pnpm db:migrate`, `pnpm db:import`.

Every API operation and Server Action must derive the user ID from Clerk on the server. Jobs are shared; profiles, statuses, push subscriptions and notification history are private. Ingestion must never overwrite user state. Queries and mutations touching private records must include the authenticated owner.

Read README.md and architecture.md for deployment and notification semantics. Do not treat source update timestamps as publication times. Do not send real notifications from tests. Preserve the original source adapters' normalization and scoring regression tests.

Use environment files for credentials; never print secrets, store them in tracked files, or use NEXT_PUBLIC_ for secret keys. `scripts/legacy` contains retained SQLite-era diagnostics for local snapshots only; it is not deployed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
