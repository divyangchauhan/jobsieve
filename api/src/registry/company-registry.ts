export type AtsType =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'getro'
  | null;

export interface WatchlistCompany {
  readonly name: string;
  readonly ats: AtsType;
  readonly slug: string;
  readonly tier: 1 | 2 | 3;
  readonly domain: string;
}

export const COMPANIES: readonly WatchlistCompany[] = [
  // ── Lever ────────────────────────────────────────────────────────────────────
  {
    name: 'Celestia',
    ats: 'lever',
    slug: 'celestia',
    tier: 1,
    domain: 'web3-l1-infra',
  },
  {
    name: 'Maple Finance',
    ats: 'lever',
    slug: 'maple-finance',
    tier: 2,
    domain: 'web3-defi',
  },
  {
    name: 'Kraken',
    ats: 'lever',
    slug: 'kraken',
    tier: 2,
    domain: 'web3-exchange',
  },
  {
    name: 'Arbitrum Foundation',
    ats: 'lever',
    slug: 'arbitrumfoundation',
    tier: 1,
    domain: 'web3-l2',
  },
  {
    name: 'Immutable X',
    ats: 'lever',
    slug: 'immutable',
    tier: 2,
    domain: 'web3-gaming',
  },
  // slug was jito-labs → now jito
  {
    name: 'Jito Labs',
    ats: 'lever',
    slug: 'jito',
    tier: 1,
    domain: 'web3-mev',
  },
  // moved from ashby/ethena-labs → lever/ethena (6 jobs)
  {
    name: 'Ethena Labs',
    ats: 'lever',
    slug: 'ethena',
    tier: 1,
    domain: 'web3-defi',
  },
  // bridge
  {
    name: 'Connext / Everclear',
    ats: 'lever',
    slug: 'connext-network',
    tier: 1,
    domain: 'web3-bridge',
  },

  // ── Greenhouse ───────────────────────────────────────────────────────────────
  // slug was layerzero → layerzerolabs
  {
    name: 'LayerZero Labs',
    ats: 'greenhouse',
    slug: 'layerzerolabs',
    tier: 1,
    domain: 'web3-bridge',
  },
  {
    name: 'Bybit',
    ats: 'greenhouse',
    slug: 'bybit',
    tier: 2,
    domain: 'web3-exchange',
  },
  {
    name: 'OKX',
    ats: 'greenhouse',
    slug: 'okx',
    tier: 2,
    domain: 'web3-exchange',
  },
  // confirmed live greenhouse/consensys 12 jobs; was omitted from initial registry build
  {
    name: 'Infura / ConsenSys',
    ats: 'greenhouse',
    slug: 'consensys',
    tier: 1,
    domain: 'web3-infra',
  },
  {
    name: 'Fireblocks',
    ats: 'greenhouse',
    slug: 'fireblocks',
    tier: 1,
    domain: 'web3-fintech',
  },
  {
    name: 'BitGo',
    ats: 'greenhouse',
    slug: 'bitgo',
    tier: 2,
    domain: 'web3-fintech',
  },
  {
    name: 'Gemini',
    ats: 'greenhouse',
    slug: 'gemini',
    tier: 2,
    domain: 'web3-exchange',
  },
  {
    name: 'Coinbase',
    ats: 'greenhouse',
    slug: 'coinbase',
    tier: 2,
    domain: 'web3-exchange',
  },
  {
    name: 'OpenZeppelin',
    ats: 'greenhouse',
    slug: 'openzeppelin',
    tier: 1,
    domain: 'security',
  },
  // moved from lever → greenhouse
  {
    name: 'Immunefi',
    ats: 'greenhouse',
    slug: 'immunefi',
    tier: 2,
    domain: 'security',
  },
  {
    name: 'AssemblyAI',
    ats: 'greenhouse',
    slug: 'assemblyai',
    tier: 1,
    domain: 'ai-infra',
  },
  {
    name: 'Together AI',
    ats: 'greenhouse',
    slug: 'togetherai',
    tier: 2,
    domain: 'ai-infra',
  },
  {
    name: 'Vercel',
    ats: 'greenhouse',
    slug: 'vercel',
    tier: 1,
    domain: 'backend-saas',
  },
  {
    name: 'PlanetScale',
    ats: 'greenhouse',
    slug: 'planetscale',
    tier: 2,
    domain: 'backend-saas',
  },
  {
    name: 'CockroachLabs',
    ats: 'greenhouse',
    slug: 'cockroachlabs',
    tier: 2,
    domain: 'backend-saas',
  },
  {
    name: 'Redpanda Data',
    ats: 'greenhouse',
    slug: 'redpandadata',
    tier: 1,
    domain: 'backend-saas',
  },
  {
    name: 'Temporal Technologies',
    ats: 'greenhouse',
    slug: 'temporaltechnologies',
    tier: 1,
    domain: 'backend-saas',
  },
  {
    name: 'Stripe',
    ats: 'greenhouse',
    slug: 'stripe',
    tier: 3,
    domain: 'fintech',
  },
  { name: 'Brex', ats: 'greenhouse', slug: 'brex', tier: 2, domain: 'fintech' },
  {
    name: 'Datadog',
    ats: 'greenhouse',
    slug: 'datadog',
    tier: 3,
    domain: 'backend-saas',
  },
  {
    name: 'Cloudflare',
    ats: 'greenhouse',
    slug: 'cloudflare',
    tier: 2,
    domain: 'backend-saas',
  },
  // slug was grafana → grafanalabs
  {
    name: 'Grafana Labs',
    ats: 'greenhouse',
    slug: 'grafanalabs',
    tier: 2,
    domain: 'backend-saas',
  },
  // slug was copper → copperco
  {
    name: 'Copper',
    ats: 'greenhouse',
    slug: 'copperco',
    tier: 2,
    domain: 'web3-fintech',
  },
  // moved from lever → greenhouse
  {
    name: 'Dagger.io',
    ats: 'greenhouse',
    slug: 'dagger',
    tier: 1,
    domain: 'backend-saas',
  },
  // moved from ashby/zora → greenhouse/zora
  {
    name: 'Zora',
    ats: 'greenhouse',
    slug: 'zora',
    tier: 2,
    domain: 'web3-nft',
  },
  // 1 job "Wildcard" as of 2026-06-14; board confirmed live
  {
    name: 'Socket',
    ats: 'greenhouse',
    slug: 'socket',
    tier: 1,
    domain: 'web3-bridge',
  },

  // ── Ashby ─────────────────────────────────────────────────────────────────────
  {
    name: 'Goldsky',
    ats: 'ashby',
    slug: 'goldsky',
    tier: 1,
    domain: 'web3-infra',
  },
  {
    name: 'Pyth Network',
    ats: 'ashby',
    slug: 'pythnetwork',
    tier: 1,
    domain: 'web3-oracle',
  },
  {
    name: 'ENS Labs',
    ats: 'ashby',
    slug: 'ens-labs',
    tier: 1,
    domain: 'web3-naming',
  },
  {
    name: 'Trigger.dev',
    ats: 'ashby',
    slug: 'triggerdev',
    tier: 1,
    domain: 'backend-saas',
  },
  {
    name: 'Helius (Solana RPC)',
    ats: 'ashby',
    slug: 'helius',
    tier: 1,
    domain: 'web3-infra',
  },
  {
    name: 'Dynamic',
    ats: 'ashby',
    slug: 'dynamic',
    tier: 1,
    domain: 'web3-auth',
  },
  { name: 'Exa AI', ats: 'ashby', slug: 'exa', tier: 1, domain: 'ai-infra' },
  {
    name: 'LangChain',
    ats: 'ashby',
    slug: 'langchain',
    tier: 2,
    domain: 'ai-infra',
  },
  {
    name: 'Supabase',
    ats: 'ashby',
    slug: 'supabase',
    tier: 1,
    domain: 'backend-saas',
  },
  {
    name: 'Neon Database',
    ats: 'ashby',
    slug: 'neon',
    tier: 1,
    domain: 'backend-saas',
  },
  {
    name: 'Axiom',
    ats: 'ashby',
    slug: 'axiom',
    tier: 1,
    domain: 'backend-saas',
  },
  {
    name: 'Railway',
    ats: 'ashby',
    slug: 'railway',
    tier: 2,
    domain: 'backend-saas',
  },
  {
    name: 'Cartesia',
    ats: 'ashby',
    slug: 'cartesia',
    tier: 2,
    domain: 'ai-infra',
  },
  {
    name: 'Linear',
    ats: 'ashby',
    slug: 'linear',
    tier: 2,
    domain: 'backend-saas',
  },
  {
    name: 'Depot',
    ats: 'ashby',
    slug: 'depot',
    tier: 2,
    domain: 'backend-saas',
  },
  {
    name: 'Speakeasy',
    ats: 'ashby',
    slug: 'speakeasy',
    tier: 2,
    domain: 'backend-saas',
  },
  {
    name: 'LlamaIndex',
    ats: 'ashby',
    slug: 'llamaindex',
    tier: 2,
    domain: 'ai-infra',
  },
  {
    name: 'Turnkey',
    ats: 'ashby',
    slug: 'turnkey',
    tier: 1,
    domain: 'web3-auth',
  },
  // slug corrected: modal-labs → modal
  { name: 'Modal', ats: 'ashby', slug: 'modal', tier: 1, domain: 'ai-infra' },
  // slug corrected: fern → buildwithfern
  {
    name: 'Fern',
    ats: 'ashby',
    slug: 'buildwithfern',
    tier: 2,
    domain: 'backend-saas',
  },
  // slug corrected: braintrustdata → braintrust
  {
    name: 'Braintrust',
    ats: 'ashby',
    slug: 'braintrust',
    tier: 1,
    domain: 'ai-infra',
  },

  // Moved from greenhouse → ashby
  {
    name: 'OP Labs (Optimism)',
    ats: 'ashby',
    slug: 'oplabs',
    tier: 1,
    domain: 'web3-l2',
  },
  {
    name: 'Paxos',
    ats: 'ashby',
    slug: 'paxos',
    tier: 1,
    domain: 'web3-fintech',
  },
  {
    name: 'OpenSea',
    ats: 'ashby',
    slug: 'opensea',
    tier: 2,
    domain: 'web3-nft',
  },
  { name: 'Cohere', ats: 'ashby', slug: 'cohere', tier: 2, domain: 'ai-infra' },
  {
    name: 'ElevenLabs',
    ats: 'ashby',
    slug: 'elevenlabs',
    tier: 1,
    domain: 'ai-infra',
  },
  {
    name: 'Perplexity',
    ats: 'ashby',
    slug: 'perplexity',
    tier: 1,
    domain: 'ai-infra',
  },
  {
    name: 'Deepgram',
    ats: 'ashby',
    slug: 'deepgram',
    tier: 1,
    domain: 'ai-infra',
  },
  {
    name: 'Fireworks AI',
    ats: 'ashby',
    slug: 'fireworks-ai',
    tier: 2,
    domain: 'ai-infra',
  },
  {
    name: 'PostHog',
    ats: 'ashby',
    slug: 'posthog',
    tier: 1,
    domain: 'backend-saas',
  },
  {
    name: 'Sentry',
    ats: 'ashby',
    slug: 'sentry',
    tier: 2,
    domain: 'backend-saas',
  },
  {
    name: 'Stytch',
    ats: 'ashby',
    slug: 'stytch',
    tier: 1,
    domain: 'backend-saas',
  },
  { name: 'Kong', ats: 'ashby', slug: 'kong', tier: 2, domain: 'backend-saas' },
  {
    name: 'Airbyte',
    ats: 'ashby',
    slug: 'airbyte',
    tier: 2,
    domain: 'backend-saas',
  },
  {
    name: 'Materialize',
    ats: 'ashby',
    slug: 'materialize',
    tier: 2,
    domain: 'backend-saas',
  },
  { name: 'Plaid', ats: 'ashby', slug: 'plaid', tier: 2, domain: 'fintech' },
  {
    name: 'Weaviate',
    ats: 'ashby',
    slug: 'weaviate',
    tier: 2,
    domain: 'ai-infra',
  },
  {
    name: 'Pinecone',
    ats: 'ashby',
    slug: 'pinecone',
    tier: 2,
    domain: 'ai-infra',
  },
  {
    name: 'Anyscale',
    ats: 'ashby',
    slug: 'anyscale',
    tier: 2,
    domain: 'ai-infra',
  },
  {
    name: 'Merge API',
    ats: 'ashby',
    slug: 'merge',
    tier: 2,
    domain: 'backend-saas',
  },
  // slug corrected: uniswaplabs → uniswap
  {
    name: 'Uniswap Labs',
    ats: 'ashby',
    slug: 'uniswap',
    tier: 1,
    domain: 'web3-defi',
  },
  // slug corrected: safe-global → safe
  {
    name: 'Safe (Gnosis Safe)',
    ats: 'ashby',
    slug: 'safe',
    tier: 1,
    domain: 'web3-wallet',
  },
  // slug corrected: alchemy-2 → alchemy
  {
    name: 'Alchemy',
    ats: 'ashby',
    slug: 'alchemy',
    tier: 1,
    domain: 'web3-infra',
  },
  // slug corrected: matterlabs → matter-labs
  {
    name: 'zkSync / Matter Labs',
    ats: 'ashby',
    slug: 'matter-labs',
    tier: 1,
    domain: 'web3-l2',
  },
  // slug corrected: polygon → polygon-labs
  {
    name: 'Polygon Labs',
    ats: 'ashby',
    slug: 'polygon-labs',
    tier: 1,
    domain: 'web3-l2',
  },
  // slug corrected: eigenlabs → eigen-labs
  {
    name: 'EigenLayer / Eigen Labs',
    ats: 'ashby',
    slug: 'eigen-labs',
    tier: 2,
    domain: 'web3-l1-infra',
  },

  // Moved from lever → ashby
  {
    name: 'LI.FI',
    ats: 'ashby',
    slug: 'li.fi',
    tier: 1,
    domain: 'web3-bridge',
  },
  {
    name: 'Biconomy',
    ats: 'ashby',
    slug: 'biconomy',
    tier: 1,
    domain: 'web3-infra',
  },
  {
    name: 'QuickNode',
    ats: 'ashby',
    slug: 'quicknode',
    tier: 1,
    domain: 'web3-infra',
  },
  {
    name: 'WorkOS',
    ats: 'ashby',
    slug: 'workos',
    tier: 1,
    domain: 'backend-saas',
  },
  {
    name: 'Inngest',
    ats: 'ashby',
    slug: 'inngest',
    tier: 1,
    domain: 'backend-saas',
  },
  { name: 'Orb', ats: 'ashby', slug: 'orb', tier: 2, domain: 'backend-saas' },
  {
    name: 'Render',
    ats: 'ashby',
    slug: 'render',
    tier: 2,
    domain: 'backend-saas',
  },
  { name: 'Lago', ats: 'ashby', slug: 'lago', tier: 2, domain: 'backend-saas' },
  // slug corrected: gelato-network → gelato
  {
    name: 'Gelato Network',
    ats: 'ashby',
    slug: 'gelato',
    tier: 1,
    domain: 'web3-infra',
  },
  // slug corrected: risk-labs → risklabs
  {
    name: 'Risk Labs (UMA Protocol)',
    ats: 'ashby',
    slug: 'risklabs',
    tier: 1,
    domain: 'web3-oracle',
  },
  // slug corrected: vellum-ai → vellum
  {
    name: 'Vellum AI',
    ats: 'ashby',
    slug: 'vellum',
    tier: 2,
    domain: 'ai-infra',
  },
  // slug corrected: magic-eden → magiceden
  {
    name: 'Magic Eden',
    ats: 'ashby',
    slug: 'magiceden',
    tier: 2,
    domain: 'web3-nft',
  },
  // slug corrected: wormhole-labs → wormholelabs
  {
    name: 'Wormhole Labs',
    ats: 'ashby',
    slug: 'wormholelabs',
    tier: 1,
    domain: 'web3-bridge',
  },
  // confirmed via live probe 2026-06-14
  {
    name: 'Lido Finance',
    ats: 'ashby',
    slug: 'Lido.fi',
    tier: 1,
    domain: 'web3-defi',
  },
  {
    name: 'Flashbots',
    ats: 'ashby',
    slug: 'flashbots.net',
    tier: 1,
    domain: 'web3-mev',
  },

  // ── ATS-discovery write-back 2026-06-14 ──────────────────────────────────────────
  // discovered via ats-discovery 2026-06-14 (3 jobs)
  {
    name: 'Across Protocol',
    ats: 'ashby',
    slug: 'risklabs',
    tier: 1,
    domain: 'web3-bridge',
  },
] as const;
