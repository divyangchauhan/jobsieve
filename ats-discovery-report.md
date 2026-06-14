# ATS Discovery Report

Generated: 2026-06-14 12:47:49 UTC
Targets: 27 tier-1 companies with `ats: null` (28 originally; Across Protocol was resolved and written back mid-run — see Big-3 wins below)

## Summary

| Classification | Count |
|---------------|-------|
| ✅ BUILDABLE-CLEAN | 1 |
| ⚠️  API-DISABLED | 2 |
| 🔒 SCRAPE-ONLY | 6 |
| ❌ NONE | 18 |

> **Workable note**: The Workable widget API (`apply.workable.com/api/v1/widget/accounts/{slug}`) is Cloudflare-rate-limited for script access. An earlier probe run (before Cloudflare throttled) found **WalletConnect → workable/walletconnect (3 jobs)**. This could not be confirmed in subsequent runs. Verify manually at `https://apply.workable.com/walletconnect/`.

### Big-3 token-drift wins (written back to registry)

| Company | Was (in sources.json) | Now | Jobs |
|---------|----------------------|-----|------|
| Across Protocol | ats: null (careerUrl → lever/across-protocol 404) | ashby/risklabs | 3 |

> Across Protocol (the bridge product) is built by Risk Labs / UMA. The ashby/risklabs board is live with 3 active jobs. `sources.json` and `company-registry.ts` have been updated.

### Cluster counts (BUILDABLE-CLEAN by provider)

| Provider | Companies |
|----------|-----------|
| recruitee | 1 (Tether) |

## Recommendation

**No adapter recommended** — BUILDABLE-CLEAN companies scatter ≤1–2 per non-big-3 provider.
Add the SCRAPE-ONLY / API-DISABLED / NONE companies to a manual watchlist instead.

**Manual watchlist (check site directly):**

- Xapo Bank (SCRAPE-ONLY) — https://www.xapo.com/careers
- Pendle Finance (SCRAPE-ONLY) — https://www.pendle.finance/careers
- Cyfrin (SCRAPE-ONLY) — https://www.cyfrin.io/careers
- Helicone (SCRAPE-ONLY) — https://www.helicone.ai/careers
- Encore.dev (SCRAPE-ONLY) — https://encore.dev/careers
- Chainstack (SCRAPE-ONLY) — https://chainstack.com/careers
- Privy (API-DISABLED) — https://jobs.ashbyhq.com/privy
- Zuplo (API-DISABLED) — https://jobs.ashbyhq.com/zuplo
- Axelar Network (NONE) — https://boards.greenhouse.io/axelar
- Hyperlane (NONE) — https://jobs.lever.co/hyperlane
- Chainlink Labs (NONE) — https://boards.greenhouse.io/chainlink
- The Graph Protocol (NONE) — https://boards.greenhouse.io/thegraphfoundation
- WalletConnect (NONE) — https://boards.greenhouse.io/walletconnect
- Gnosis (NONE) — https://boards.greenhouse.io/gnosis
- Aave (NONE) — https://boards.greenhouse.io/aave-companies
- Ondo Finance (NONE) — https://boards.greenhouse.io/ondofinance
- dYdX (NONE) — https://boards.greenhouse.io/dydx
- Circle (NONE) — https://boards.greenhouse.io/circle
- Anchorage Digital (NONE) — https://boards.greenhouse.io/anchoragebitcoin
- Reservoir (NONE) — https://jobs.lever.co/reservoir
- Trail of Bits (NONE) — https://jobs.lever.co/trail-of-bits
- Halborn Security (NONE) — https://jobs.lever.co/halborn
- Replicate (NONE) — https://jobs.lever.co/replicate
- Novu (NONE) — https://boards.greenhouse.io/novu
- Fly.io (NONE) — https://jobs.lever.co/fly
- Permit.io (NONE) — https://boards.greenhouse.io/permitio

## Full per-company table

| Company | Domain | T | Provider | Token | HTTP | Jobs | Classification | Note |
|---------|--------|---|----------|-------|------|------|----------------|------|
| Tether | web3-fintech | 1 | recruitee | tether | 200 | 338 | BUILDABLE-CLEAN |  |
| Xapo Bank | web3-fintech | 1 | custom | — | 404 | 0 | SCRAPE-ONLY | custom careerUrl; no scriptable ATS detected |
| Axelar Network | web3-bridge | 1 | — | — | 404 | 0 | NONE | tried slugs: axelar, axelar-network, axelarnetwork |
| Hyperlane | web3-bridge | 1 | — | — | 404 | 0 | NONE | tried slugs: hyperlane |
| Chainlink Labs | web3-oracle | 1 | — | — | 404 | 0 | NONE | tried slugs: chainlink, chainlink-labs, chainlinklabs |
| The Graph Protocol | web3-infra | 1 | — | — | 404 | 0 | NONE | tried slugs: thegraphfoundation, edgeandnode, edge-and-node, semiotic, thegraph, graphprotocol, the-graph-protocol, thegraphprotocol, the-graph |
| Privy | web3-auth | 1 | ashby | privy | 404 | 0 | API-DISABLED | ashby board at jobs.ashbyhq.com/privy exists; posting-api returns 404 |
| WalletConnect | web3-auth | 1 | — | — | 404 | 0 | NONE | tried slugs: walletconnect, reown |
| Gnosis | web3-infra | 1 | — | — | 404 | 0 | NONE | tried slugs: gnosis |
| Aave | web3-defi | 1 | — | — | 404 | 0 | NONE | tried slugs: aave-companies, aave |
| Pendle Finance | web3-defi | 1 | custom | — | 404 | 0 | SCRAPE-ONLY | custom careerUrl; no scriptable ATS detected |
| Ondo Finance | web3-defi | 1 | — | — | 404 | 0 | NONE | tried slugs: ondofinance, ondo-finance, ondo |
| dYdX | web3-defi | 1 | — | — | 404 | 0 | NONE | tried slugs: dydx |
| Circle | web3-fintech | 1 | — | — | 404 | 0 | NONE | tried slugs: circle |
| Anchorage Digital | web3-fintech | 1 | — | — | 404 | 0 | NONE | tried slugs: anchoragebitcoin, anchorage-digital, anchoragedigital |
| Reservoir | web3-nft | 1 | — | — | 404 | 0 | NONE | tried slugs: reservoir |
| Trail of Bits | security | 1 | — | — | 404 | 0 | NONE | tried slugs: trail-of-bits, trailofbits |
| Halborn Security | security | 1 | — | — | 404 | 0 | NONE | tried slugs: halborn, halborn-security, halbornsecurity |
| Cyfrin | security | 1 | custom | — | 404 | 0 | SCRAPE-ONLY | custom careerUrl; no scriptable ATS detected |
| Replicate | ai-infra | 1 | — | — | 404 | 0 | NONE | tried slugs: replicate |
| Helicone | ai-infra | 1 | custom | — | 404 | 0 | SCRAPE-ONLY | custom careerUrl; no scriptable ATS detected |
| Novu | backend-saas | 1 | — | — | 404 | 0 | NONE | tried slugs: novu |
| Fly.io | backend-saas | 1 | — | — | 404 | 0 | NONE | tried slugs: fly, flyio |
| Permit.io | backend-saas | 1 | — | — | 404 | 0 | NONE | tried slugs: permitio |
| Zuplo | backend-saas | 1 | ashby | zuplo | 404 | 0 | API-DISABLED | ashby board at jobs.ashbyhq.com/zuplo exists; posting-api returns 404 |
| Encore.dev | backend-saas | 1 | custom | — | 404 | 0 | SCRAPE-ONLY | custom careerUrl; no scriptable ATS detected |
| Chainstack | web3-infra | 1 | custom | — | 404 | 0 | SCRAPE-ONLY | custom careerUrl; no scriptable ATS detected |
