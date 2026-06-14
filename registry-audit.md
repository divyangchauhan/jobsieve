# Registry Audit — 2026-06-14

Generated against `feat/new-source-adapters`. 95 companies in registry after adding ConsenSys.

---

## Bucket definitions

| Bucket | Meaning |
|--------|---------|
| **A — live** | API 200, ≥1 job returned |
| **B — empty-200** | API 200, 0 jobs; hosted board confirmed to exist; no current openings |
| **C — API-disabled** | Hosted board exists at the UI URL, but the posting API returns 404 — the company intentionally disables public API ingestion; roles arrive via aggregate feeds |
| **D — not on any big-3** | 404 on Greenhouse, Lever, and Ashby; no ingestable board found |

---

## Per-company table

### Greenhouse (26 companies)

| Company | Token | Request URL | Status | Jobs | Bucket | Note |
|---------|-------|-------------|--------|------|--------|------|
| LayerZero Labs | layerzerolabs | `boards-api.greenhouse.io/v1/boards/layerzerolabs/jobs` | 200 | 17 | **A** | |
| Bybit | bybit | `boards-api.greenhouse.io/v1/boards/bybit/jobs` | 200 | 139 | **A** | |
| OKX | okx | `boards-api.greenhouse.io/v1/boards/okx/jobs` | 200 | 259 | **A** | |
| Infura / ConsenSys | consensys | `boards-api.greenhouse.io/v1/boards/consensys/jobs` | 200 | 12 | **A** | Restored after being dropped from initial registry build |
| Fireblocks | fireblocks | `boards-api.greenhouse.io/v1/boards/fireblocks/jobs` | 200 | 56 | **A** | |
| BitGo | bitgo | `boards-api.greenhouse.io/v1/boards/bitgo/jobs` | 200 | 47 | **A** | |
| Gemini | gemini | `boards-api.greenhouse.io/v1/boards/gemini/jobs` | 200 | 26 | **A** | |
| Coinbase | coinbase | `boards-api.greenhouse.io/v1/boards/coinbase/jobs` | 200 | 84 | **A** | |
| OpenZeppelin | openzeppelin | `boards-api.greenhouse.io/v1/boards/openzeppelin/jobs` | 200 | 5 | **A** | |
| Immunefi | immunefi | `boards-api.greenhouse.io/v1/boards/immunefi/jobs` | 200 | 3 | **A** | Moved from lever/immunefi |
| AssemblyAI | assemblyai | `boards-api.greenhouse.io/v1/boards/assemblyai/jobs` | 200 | 6 | **A** | Moved from lever/assemblyai |
| Together AI | togetherai | `boards-api.greenhouse.io/v1/boards/togetherai/jobs` | 200 | 57 | **A** | |
| Vercel | vercel | `boards-api.greenhouse.io/v1/boards/vercel/jobs` | 200 | 72 | **A** | |
| PlanetScale | planetscale | `boards-api.greenhouse.io/v1/boards/planetscale/jobs` | 200 | 12 | **A** | |
| CockroachLabs | cockroachlabs | `boards-api.greenhouse.io/v1/boards/cockroachlabs/jobs` | 200 | 36 | **A** | |
| Redpanda Data | redpandadata | `boards-api.greenhouse.io/v1/boards/redpandadata/jobs` | 200 | 21 | **A** | |
| Temporal Technologies | temporaltechnologies | `boards-api.greenhouse.io/v1/boards/temporaltechnologies/jobs` | 200 | 50 | **A** | |
| Stripe | stripe | `boards-api.greenhouse.io/v1/boards/stripe/jobs` | 200 | 505 | **A** | |
| Brex | brex | `boards-api.greenhouse.io/v1/boards/brex/jobs` | 200 | 237 | **A** | |
| Datadog | datadog | `boards-api.greenhouse.io/v1/boards/datadog/jobs` | 200 | 403 | **A** | |
| Cloudflare | cloudflare | `boards-api.greenhouse.io/v1/boards/cloudflare/jobs` | 200 | 193 | **A** | |
| Grafana Labs | grafanalabs | `boards-api.greenhouse.io/v1/boards/grafanalabs/jobs` | 200 | 106 | **A** | Slug corrected from grafana |
| Copper | copperco | `boards-api.greenhouse.io/v1/boards/copperco/jobs` | 200 | 6 | **A** | Slug corrected from copper |
| Socket | socket | `boards-api.greenhouse.io/v1/boards/socket/jobs` | 200 | 1 | **A** | |
| Dagger.io | dagger | `boards-api.greenhouse.io/v1/boards/dagger/jobs` | 200 | 0 | **B** | Board exists (`boards.greenhouse.io/dagger` → 200); genuine no current openings |
| Zora | zora | `boards-api.greenhouse.io/v1/boards/zora/jobs` | 200 | 0 | **B** | Board exists (`boards.greenhouse.io/zora` → 200); genuine no current openings |

**Greenhouse summary: 24 A, 2 B, 0 C, 0 D**

---

### Lever (8 companies)

All 8 companies explain the total of 15 jobs line-by-line:

| Company | Token | Request URL | Status | Jobs | Bucket | Note |
|---------|-------|-------------|--------|------|--------|------|
| Celestia | celestia | `api.lever.co/v0/postings/celestia?mode=json` | 200 | 1 | **A** | |
| Arbitrum Foundation | arbitrumfoundation | `api.lever.co/v0/postings/arbitrumfoundation?mode=json` | 200 | 3 | **A** | Moved from greenhouse/arbitrumfoundation |
| Immutable X | immutable | `api.lever.co/v0/postings/immutable?mode=json` | 200 | 2 | **A** | Moved from greenhouse/immutable |
| Jito Labs | jito | `api.lever.co/v0/postings/jito?mode=json` | 200 | 2 | **A** | Slug corrected jito-labs → jito |
| Ethena Labs | ethena | `api.lever.co/v0/postings/ethena?mode=json` | 200 | 6 | **A** | Moved from ashby/ethena-labs |
| Connext / Everclear | connext-network | `api.lever.co/v0/postings/connext-network?mode=json` | 200 | 1 | **A** | |
| Kraken | kraken | `api.lever.co/v0/postings/kraken?mode=json` | 200 | 0 | **B** | Board exists (`jobs.lever.co/kraken` → 200, 712 kB SSR page); genuine no current openings. Lever SSR confirms 0 listings. |
| Maple Finance | maple-finance | `api.lever.co/v0/postings/maple-finance?mode=json` | 200 | 0 | **B** | Board exists (`jobs.lever.co/maple-finance` → 200, 708 kB SSR page); genuine no current openings. |

**Lever subtotal: 1+3+2+2+6+1+0+0 = 15 jobs.** The 15 total is correct. Kraken and Maple Finance have active boards but zero current openings.

**Lever summary: 6 A, 2 B, 0 C, 0 D**

---

### Ashby (61 companies)

| Company | Token | Request URL | Status | Jobs | Bucket | Note |
|---------|-------|-------------|--------|------|--------|------|
| Goldsky | goldsky | `api.ashbyhq.com/posting-api/job-board/goldsky` | 200 | 3 | **A** | |
| Pyth Network | pythnetwork | `api.ashbyhq.com/posting-api/job-board/pythnetwork` | 200 | 1 | **A** | |
| Trigger.dev | triggerdev | `api.ashbyhq.com/posting-api/job-board/triggerdev` | 200 | 3 | **A** | |
| Helius (Solana RPC) | helius | `api.ashbyhq.com/posting-api/job-board/helius` | 200 | 8 | **A** | |
| Exa AI | exa | `api.ashbyhq.com/posting-api/job-board/exa` | 200 | 37 | **A** | |
| LangChain | langchain | `api.ashbyhq.com/posting-api/job-board/langchain` | 200 | 108 | **A** | |
| Supabase | supabase | `api.ashbyhq.com/posting-api/job-board/supabase` | 200 | 48 | **A** | |
| Neon Database | neon | `api.ashbyhq.com/posting-api/job-board/neon` | 200 | 7 | **A** | |
| Axiom | axiom | `api.ashbyhq.com/posting-api/job-board/axiom` | 200 | 3 | **A** | |
| Railway | railway | `api.ashbyhq.com/posting-api/job-board/railway` | 200 | 10 | **A** | |
| Cartesia | cartesia | `api.ashbyhq.com/posting-api/job-board/cartesia` | 200 | 33 | **A** | |
| Linear | linear | `api.ashbyhq.com/posting-api/job-board/linear` | 200 | 25 | **A** | |
| Depot | depot | `api.ashbyhq.com/posting-api/job-board/depot` | 200 | 1 | **A** | |
| Speakeasy | speakeasy | `api.ashbyhq.com/posting-api/job-board/speakeasy` | 200 | 5 | **A** | |
| LlamaIndex | llamaindex | `api.ashbyhq.com/posting-api/job-board/llamaindex` | 200 | 12 | **A** | |
| Turnkey | turnkey | `api.ashbyhq.com/posting-api/job-board/turnkey` | 200 | 13 | **A** | |
| Modal | modal | `api.ashbyhq.com/posting-api/job-board/modal` | 200 | 31 | **A** | Slug corrected modal-labs → modal |
| Braintrust | braintrust | `api.ashbyhq.com/posting-api/job-board/braintrust` | 200 | 28 | **A** | Slug corrected braintrustdata → braintrust |
| OP Labs (Optimism) | oplabs | `api.ashbyhq.com/posting-api/job-board/oplabs` | 200 | 9 | **A** | Moved from greenhouse/oplabs |
| Paxos | paxos | `api.ashbyhq.com/posting-api/job-board/paxos` | 200 | 19 | **A** | Moved from greenhouse/paxos |
| OpenSea | opensea | `api.ashbyhq.com/posting-api/job-board/opensea` | 200 | 4 | **A** | Moved from greenhouse/opensea |
| Cohere | cohere | `api.ashbyhq.com/posting-api/job-board/cohere` | 200 | 126 | **A** | Moved from greenhouse/cohere |
| ElevenLabs | elevenlabs | `api.ashbyhq.com/posting-api/job-board/elevenlabs` | 200 | 154 | **A** | Moved from greenhouse/elevenlabs |
| Perplexity | perplexity | `api.ashbyhq.com/posting-api/job-board/perplexity` | 200 | 71 | **A** | Moved from greenhouse/perplexity |
| Deepgram | deepgram | `api.ashbyhq.com/posting-api/job-board/deepgram` | 200 | 60 | **A** | Moved from greenhouse/deepgram |
| Fireworks AI | fireworks-ai | `api.ashbyhq.com/posting-api/job-board/fireworks-ai` | 200 | 30 | **A** | |
| PostHog | posthog | `api.ashbyhq.com/posting-api/job-board/posthog` | 200 | 16 | **A** | Moved from greenhouse/posthog |
| Sentry | sentry | `api.ashbyhq.com/posting-api/job-board/sentry` | 200 | 46 | **A** | Moved from greenhouse/sentry |
| Stytch | stytch | `api.ashbyhq.com/posting-api/job-board/stytch` | 200 | 5 | **A** | Moved from greenhouse/stytch |
| Kong | kong | `api.ashbyhq.com/posting-api/job-board/kong` | 200 | 90 | **A** | Moved from greenhouse/kong |
| Airbyte | airbyte | `api.ashbyhq.com/posting-api/job-board/airbyte` | 200 | 8 | **A** | Moved from greenhouse/airbyte |
| Materialize | materialize | `api.ashbyhq.com/posting-api/job-board/materialize` | 200 | 3 | **A** | Moved from greenhouse/materialize |
| Plaid | plaid | `api.ashbyhq.com/posting-api/job-board/plaid` | 200 | 103 | **A** | Moved from greenhouse/plaid |
| Weaviate | weaviate | `api.ashbyhq.com/posting-api/job-board/weaviate` | 200 | 5 | **A** | Moved from greenhouse/weaviate |
| Pinecone | pinecone | `api.ashbyhq.com/posting-api/job-board/pinecone` | 200 | 7 | **A** | Moved from greenhouse/pinecone |
| Anyscale | anyscale | `api.ashbyhq.com/posting-api/job-board/anyscale` | 200 | 10 | **A** | Moved from greenhouse/anyscale |
| Merge API | merge | `api.ashbyhq.com/posting-api/job-board/merge` | 200 | 21 | **A** | Slug corrected mergeapi → merge |
| Uniswap Labs | uniswap | `api.ashbyhq.com/posting-api/job-board/uniswap` | 200 | 10 | **A** | Slug corrected uniswaplabs → uniswap |
| Safe (Gnosis Safe) | safe | `api.ashbyhq.com/posting-api/job-board/safe` | 200 | 16 | **A** | Moved from greenhouse/safe-global; slug corrected safe-global → safe |
| Alchemy | alchemy | `api.ashbyhq.com/posting-api/job-board/alchemy` | 200 | 16 | **A** | Moved from greenhouse/alchemy-2 |
| zkSync / Matter Labs | matter-labs | `api.ashbyhq.com/posting-api/job-board/matter-labs` | 200 | 2 | **A** | Slug corrected matterlabs → matter-labs |
| Polygon Labs | polygon-labs | `api.ashbyhq.com/posting-api/job-board/polygon-labs` | 200 | 6 | **A** | Slug corrected polygon → polygon-labs |
| EigenLayer / Eigen Labs | eigen-labs | `api.ashbyhq.com/posting-api/job-board/eigen-labs` | 200 | 2 | **A** | Slug corrected eigenlabs → eigen-labs |
| LI.FI | li.fi | `api.ashbyhq.com/posting-api/job-board/li.fi` | 200 | 4 | **A** | Moved from lever/li.fi |
| QuickNode | quicknode | `api.ashbyhq.com/posting-api/job-board/quicknode` | 200 | 2 | **A** | Moved from lever/quicknode |
| WorkOS | workos | `api.ashbyhq.com/posting-api/job-board/workos` | 200 | 29 | **A** | Moved from lever/workos |
| Inngest | inngest | `api.ashbyhq.com/posting-api/job-board/inngest` | 200 | 2 | **A** | Moved from lever/inngest |
| Orb | orb | `api.ashbyhq.com/posting-api/job-board/orb` | 200 | 12 | **A** | Moved from lever/orb |
| Render | render | `api.ashbyhq.com/posting-api/job-board/render` | 200 | 22 | **A** | Moved from lever/render |
| Lago | lago | `api.ashbyhq.com/posting-api/job-board/lago` | 200 | 13 | **A** | Moved from lever/lago |
| Gelato Network | gelato | `api.ashbyhq.com/posting-api/job-board/gelato` | 200 | 12 | **A** | Moved from lever/gelato-network |
| Risk Labs (UMA Protocol) | risklabs | `api.ashbyhq.com/posting-api/job-board/risklabs` | 200 | 3 | **A** | Moved from lever/risk-labs; slug corrected |
| Vellum AI | vellum | `api.ashbyhq.com/posting-api/job-board/vellum` | 200 | 1 | **A** | Moved from lever/vellum-ai |
| Magic Eden | magiceden | `api.ashbyhq.com/posting-api/job-board/magiceden` | 200 | 6 | **A** | Moved from lever/magic-eden |
| Wormhole Labs | wormholelabs | `api.ashbyhq.com/posting-api/job-board/wormholelabs` | 200 | 5 | **A** | Moved from lever/wormhole-labs; slug corrected |
| Lido Finance | Lido.fi | `api.ashbyhq.com/posting-api/job-board/Lido.fi` | 200 | 5 | **A** | Moved from greenhouse/lidofinance |
| ENS Labs | ens-labs | `api.ashbyhq.com/posting-api/job-board/ens-labs` | 200 | 0 | **B** | Board exists (`jobs.ashbyhq.com/ens-labs` → 200); genuine no current openings |
| Dynamic | dynamic | `api.ashbyhq.com/posting-api/job-board/dynamic` | 200 | 0 | **B** | Board exists (`jobs.ashbyhq.com/dynamic` → 200); genuine no current openings |
| Fern | buildwithfern | `api.ashbyhq.com/posting-api/job-board/buildwithfern` | 200 | 0 | **B** | Board exists (`jobs.ashbyhq.com/buildwithfern` → 200); genuine no current openings |
| Biconomy | biconomy | `api.ashbyhq.com/posting-api/job-board/biconomy` | 200 | 0 | **B** | Board exists (`jobs.ashbyhq.com/biconomy` → 200); genuine no current openings |
| Flashbots | flashbots.net | `api.ashbyhq.com/posting-api/job-board/flashbots.net` | 200 | 0 | **B** | Board exists (`jobs.ashbyhq.com/flashbots.net` → 200); genuine no current openings |

**Ashby summary: 56 A, 5 B, 0 C, 0 D**

---

## Bucket summary

| Bucket | Greenhouse | Lever | Ashby | Total |
|--------|-----------|-------|-------|-------|
| A — live | 24 | 6 | 56 | **86** |
| B — empty-200 | 2 | 2 | 5 | **9** |
| C — API-disabled | 0 | 0 | 0 | 0 |
| D — not on any big-3 | 0 | 0 | 0 | 0 |
| **Total** | **26** | **8** | **61** | **95** |

All 95 registry companies have live boards (buckets A or B). Zero companies are silently 404-ing.

---

## Specific unknowns (task item 4)

### Chainlink Labs
- Token probed: `chainlink-labs` on Ashby
- Exact URL: `https://api.ashbyhq.com/posting-api/job-board/chainlink-labs`
- HTTP status: **404**
- Also probed: `greenhouse/chainlink` → 404, `greenhouse/chainlinklabs` → 404, `lever/chainlink` → 404, `lever/chainlink-labs` → 404, `ashby/chainlinklabs` → 404
- **Bucket: D — not on any big-3.** All public Greenhouse/Lever/Ashby boards for Chainlink are gone. Their roles arrive via the `web3.career` and `cryptocurrencyjobs` aggregate feeds.

### Aave
- Tokens probed: `aavelabs` on Lever, `aave-companies` / `aave` on Greenhouse, `aave` / `aavelabs` / `aave-labs` on Ashby
- Exact URL (task-specified): `https://api.lever.co/v0/postings/aavelabs?mode=json`
- HTTP status: **404**
- All other slug variants also 404
- **Bucket: D — not on any big-3.** Roles arrive via aggregate feeds.

---

## Re-pointed six (task item 5)

All confirmed bucket A as of 2026-06-14:

| Company | ATS | Token | Jobs | Bucket |
|---------|-----|-------|------|--------|
| Alchemy | ashby | alchemy | 16 | **A** ✅ |
| QuickNode | ashby | quicknode | 2 | **A** ✅ |
| Safe (Gnosis Safe) | ashby | safe | 16 | **A** ✅ |
| Biconomy | ashby | biconomy | 0 | **B** ⚠️ |
| Gelato Network | ashby | gelato | 12 | **A** ✅ |
| Wormhole Labs | ashby | wormholelabs | 5 | **A** ✅ |

**Biconomy is bucket B, not A.** The token is correct (`ashby/biconomy` → 200, `jobs.ashbyhq.com/biconomy` → 200) but the board has no current openings. This is a genuine hiring pause, not a bad token.

---

## Workday / Rippling / getro adapters (task item 6)

**Not built.** None of these adapters exist in the codebase. No files under `api/src/adapters/` for workday, rippling, or getro.

Companies with no current ingestion path as a result:
- **Circle** — `greenhouse/circle` 404; may have moved to Workday. Roles not reachable via current adapters.
- **dYdX** — `greenhouse/dydx` 404; likely Workday. Not reachable.
- **Ondo Finance** — `greenhouse/ondofinance` 404; likely Workday. Not reachable.
- **Groq** — `lever/groq` 404; private ATS or Workday. Not reachable.
- **Hugging Face** — `greenhouse/huggingface` 404; not reachable.
- **Trail of Bits** — `lever/trail-of-bits` 404; not reachable.

Note: **LI.FI** is covered — it moved to `ashby/li.fi` (4 jobs live). dYdX and Circle are the highest-priority gaps for a Workday adapter.

---

## Dropped-companies table

Companies present in the original `jobsieve-sources.json` (commit `84afbb2`) with a non-null ATS entry, that were excluded from `company-registry.ts`.

| Company | Original ATS/Token | Current Status | Why Excluded |
|---------|--------------------|----------------|--------------|
| Axelar Network | greenhouse/axelar | D — 404 all providers | dropped-by-resolver |
| Across Protocol | lever/across-protocol | D — 404 all providers | dropped-by-resolver |
| Hyperlane | lever/hyperlane | D — 404 all providers | dropped-by-resolver |
| The Graph Protocol | greenhouse/thegraphfoundation | D — 404 all providers | dropped-by-resolver |
| **Infura / ConsenSys** | greenhouse/consensys | **A — 12 jobs live** | **bug: dropped in error — restored in this commit** |
| Privy | ashby/privy | C — API disabled, hosted board exists | dropped-by-resolver (legitimate: public API intentionally disabled) |
| WalletConnect | greenhouse/walletconnect | D — 404 all providers | dropped-by-resolver |
| Gnosis | greenhouse/gnosis | D — 404 all providers | dropped-by-resolver |
| Aave | greenhouse/aave-companies | D — 404 all providers | dropped-by-resolver |
| Ondo Finance | greenhouse/ondofinance | D — 404 all providers | dropped-by-resolver (may use Workday) |
| dYdX | greenhouse/dydx | D — 404 all providers | dropped-by-resolver (may use Workday) |
| Circle | greenhouse/circle | D — 404 all providers | dropped-by-resolver (may use Workday) |
| Anchorage Digital | greenhouse/anchoragebitcoin | D — 404 all providers | dropped-by-resolver |
| Starkware / StarkNet | greenhouse/starkware | D — 404 all providers | dropped-by-resolver |
| Reservoir | lever/reservoir | D — 404 all providers | dropped-by-resolver |
| Trail of Bits | lever/trail-of-bits | D — 404 all providers | dropped-by-resolver |
| Halborn Security | lever/halborn | D — 404 all providers | dropped-by-resolver |
| Groq | lever/groq | D — 404 all providers | dropped-by-resolver (may use private/Workday ATS) |
| Replicate | lever/replicate | D — 404 all providers | dropped-by-resolver |
| Weights & Biases | greenhouse/wandb | D — 404 all providers | dropped-by-resolver |
| Hugging Face | greenhouse/huggingface | D — 404 all providers | dropped-by-resolver |
| Novu | greenhouse/novu | D — 404 all providers | dropped-by-resolver (NestJS stack match; check manually) |
| Fly.io | lever/fly | D — 404 all providers | dropped-by-resolver (strong fit; check site manually) |
| Permit.io | greenhouse/permitio | D — 404 all providers | dropped-by-resolver |
| Zuplo | ashby/zuplo | D — 404 all providers | dropped-by-resolver |
| dbt Labs | greenhouse/dbtlabs | D — 404 all providers | dropped-by-resolver |
| Retool | greenhouse/retool | D — 404 all providers | dropped-by-resolver |
| Unstoppable Domains | greenhouse/unstoppabledomains | D — 404 all providers | dropped-by-resolver |
| Chainlink Labs | greenhouse/chainlink | D — 404 all providers | dropped-by-resolver |

All dropped-by-resolver companies have been updated in `jobsieve-sources.json` with `ats: null` and a note explaining the 404 date and which feeds cover them.

**One genuine bug found**: Infura / ConsenSys (`greenhouse/consensys`) was live with 12 jobs but was excluded from the registry. Restored in this commit.

---

## Original Lever targets — explicit accounting (task item 2)

| Original Lever Target | Was | Now | Status |
|-----------------------|-----|-----|--------|
| Kraken | lever/kraken | lever/kraken | In registry — **B** (0 jobs, board active, no current openings) |
| AssemblyAI | lever/assemblyai | greenhouse/assemblyai | In registry — **A** (6 jobs; moved provider) |
| Groq | lever/groq | — | **dropped-by-resolver** (404 all providers; not in registry) |
| Fly.io | lever/fly | — | **dropped-by-resolver** (404 all providers; not in registry; strong fit, check site) |
| Replicate | lever/replicate | — | **dropped-by-resolver** (404 all providers; not in registry) |
| WorkOS | lever/workos | ashby/workos | In registry — **A** (29 jobs; moved to Ashby) |
| Inngest | lever/inngest | ashby/inngest | In registry — **A** (2 jobs; moved to Ashby) |
| Render | lever/render | ashby/render | In registry — **A** (22 jobs; moved to Ashby) |
| Dagger.io | lever/dagger | greenhouse/dagger | In registry — **B** (0 jobs; moved to Greenhouse; no current openings) |
| Risk Labs | lever/risk-labs | ashby/risklabs | In registry — **A** (3 jobs; moved to Ashby) |
| Across Protocol | lever/across-protocol | — | **dropped-by-resolver** (404 all providers; not in registry) |
| Hyperlane | lever/hyperlane | — | **dropped-by-resolver** (404 all providers; not in registry) |
| Celestia | lever/celestia | lever/celestia | In registry — **A** (1 job) |
| Maple Finance | lever/maple-finance | lever/maple-finance | In registry — **B** (0 jobs, board active, no current openings) |
| Magic Eden | lever/magic-eden | ashby/magiceden | In registry — **A** (6 jobs; moved to Ashby) |
| Jito Labs | lever/jito-labs | lever/jito | In registry — **A** (2 jobs; slug corrected jito-labs → jito) |

**Regression found**: Groq, Fly.io, Replicate, Across Protocol, and Hyperlane are dropped-by-resolver and absent from the registry. Their boards returned 404 across all three ATS providers. They have been marked `ats: null` in `jobsieve-sources.json` so they remain as tracked leads covered by aggregate feeds.
