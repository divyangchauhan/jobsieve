# jobsieve-desktop (Electron shell)

Phase 1 of the desktop migration: a thin Electron shell that **embeds the existing
NestJS app** (it is not rewritten). The main process boots the same `bootstrapApi`
used by the standalone server — on an ephemeral `127.0.0.1` port — and points a
`BrowserWindow` at it. The React UI and REST API are unchanged.

## How it works

- `electron/src/main.ts` — single-instance lock, sets `DATABASE_PATH` to the per-user
  `userData` dir, `require`s the compiled API (`api/dist/bootstrap.js`, CommonJS), starts
  it, and opens the window. A second launch focuses the running window instead of booting
  a second server against the single-writer SQLite file.
- `electron/src/preload.ts` — minimal context-isolated bridge.
- The API still serves the built frontend (`frontend/dist`) and the SPA fallback.

## Run it (from the repo root)

```bash
pnpm install
pnpm run desktop:rebuild   # IMPORTANT: rebuild better-sqlite3 against Electron's ABI
pnpm run desktop           # build api + frontend + electron, then launch
```

> **`desktop:rebuild` is mandatory the first time** (and after any Electron upgrade).
> The embedded API loads `better-sqlite3`, a native module compiled for your system
> Node by default. Without an Electron rebuild the app crashes at boot with a
> `NODE_MODULE_VERSION` mismatch. With pnpm the module path can vary; if the script
> can't find it, run `npx @electron/rebuild -f -w better-sqlite3` from `api/`.

> **WSL note:** launching the window needs a display (WSLg on Windows 11, or an X
> server). Building works headless; the GUI does not.

## Not yet (later phases)

- **Phase 2:** run ingestion on launch, throttled (skip if run < 3–4h ago) via a
  persisted `lastIngestAt`; replaces the always-on cron.
- **Phase 3:** in-app Settings for secrets (web3.career / Notion tokens) instead of `.env`;
  make `WEB3CAREER_TOKEN` optional so a fresh install runs.
- **Phase 4:** MSIX packaging + Microsoft Store submission.
