/*
 * ats-discovery.ts — read-only ATS probe for T1 gap companies.
 * For each tier-1 company with ats: null in sources.json, probes Greenhouse,
 * Lever, Ashby, Workable, Recruitee, Personio, and SmartRecruiters to find
 * where they currently post jobs.
 *
 * Write-back: companies that resolve onto a big-3 board are written back to
 * jobsieve-sources.json and appended to company-registry.ts automatically.
 *
 * Usage:
 *   cd api && pnpm ats-discover
 * Output: ../ats-discovery-report.md
 */
import * as fs from 'fs';
import * as path from 'path';

import axios, { AxiosError } from 'axios';

// ─── Config ──────────────────────────────────────────────────────────────────

const SOURCES_PATH = path.resolve(__dirname, '../../src/registry/jobsieve-sources.json');
const REGISTRY_PATH = path.resolve(__dirname, '../../src/registry/company-registry.ts');
const REPORT_PATH = path.resolve(__dirname, '../../../ats-discovery-report.md');
const TIMEOUT_MS = 10_000;
const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 700;
const UA = { 'User-Agent': 'jobsieve-discovery/1.0' };

// Big-3 ATS types eligible for write-back into the polling registry.
const BIG3 = new Set(['greenhouse', 'lever', 'ashby']);

// ─── Types ───────────────────────────────────────────────────────────────────

interface SourcesCompany {
  name: string;
  domain: string;
  tier: number;
  ats: string | null;
  atsSlug: string | null;
  careerUrl: string | null;
  tags?: string[];
  notes?: string;
}

interface SourcesJson {
  companies: SourcesCompany[];
}

type Classification = 'BUILDABLE-CLEAN' | 'API-DISABLED' | 'SCRAPE-ONLY' | 'NONE';

interface DiscoveryResult {
  readonly name: string;
  readonly domain: string;
  readonly tier: number;
  readonly careerUrl: string | null;
  readonly detectedProvider: string | null;
  readonly resolvedSlug: string | null;
  readonly httpStatus: number | string;
  readonly jobCount: number;
  readonly classification: Classification;
  readonly note: string;
}

// ─── Alias overrides ─────────────────────────────────────────────────────────
// These are tried in addition to careerUrl-derived and name-derived slugs.

const ALIAS_SEEDS: Record<string, readonly string[]> = {
  'WalletConnect': ['reown', 'walletconnect'],
  'The Graph Protocol': ['edgeandnode', 'edge-and-node', 'semiotic', 'thegraph', 'graphprotocol'],
  'Across Protocol': ['risklabs', 'uma', 'across', 'across-protocol'],
};

// ─── URL analysis ─────────────────────────────────────────────────────────────

const URL_STOPWORDS = new Set(['jobs', 'job', 'careers', 'career', 'openings', 'en', 'positions']);

function extractCareerUrlToken(careerUrl: string): string | null {
  try {
    const u = new URL(careerUrl);
    const segs = u.pathname.split('/').filter(Boolean);
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      if (seg && !URL_STOPWORDS.has(seg.toLowerCase())) return seg;
    }
  } catch { /* malformed */ }
  return null;
}

type Big3Kind = 'greenhouse' | 'lever' | 'ashby';
type CareerUrlHint =
  | { kind: Big3Kind; slug: string }
  | { kind: 'workday' | 'phenom' | 'custom' };

function isBig3Hint(h: CareerUrlHint): h is { kind: Big3Kind; slug: string } {
  return h.kind === 'greenhouse' || h.kind === 'lever' || h.kind === 'ashby';
}

function analyzeCareerUrl(careerUrl: string | null): CareerUrlHint {
  if (!careerUrl) return { kind: 'custom' };
  try {
    const u = new URL(careerUrl);
    const host = u.hostname.toLowerCase();
    if (host === 'boards.greenhouse.io' || host === 'boards-api.greenhouse.io') {
      const slug = extractCareerUrlToken(careerUrl);
      if (slug) return { kind: 'greenhouse', slug };
    }
    if (host === 'jobs.lever.co') {
      const slug = extractCareerUrlToken(careerUrl);
      if (slug) return { kind: 'lever', slug };
    }
    if (host === 'jobs.ashbyhq.com') {
      const slug = extractCareerUrlToken(careerUrl);
      if (slug) return { kind: 'ashby', slug };
    }
    if (host.endsWith('.myworkdayjobs.com') || host.endsWith('.workday.com')) return { kind: 'workday' };
    if (host.endsWith('.phenompeople.com') || u.pathname.includes('/us/en/search-results')) return { kind: 'phenom' };
  } catch { /* malformed */ }
  return { kind: 'custom' };
}

function nameToSlugs(name: string): string[] {
  const base = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();
  const words = base.split(/\s+/);
  const candidates = new Set<string>();
  candidates.add(words.join('-'));
  candidates.add(words.join(''));
  const sfxStrip = ['labs', 'protocol', 'network', 'finance', 'foundation', 'ai', 'security'];
  for (const sfx of sfxStrip) {
    const hyphen = words.join('-');
    if (hyphen.endsWith(`-${sfx}`)) candidates.add(hyphen.slice(0, -(sfx.length + 1)));
  }
  return [...candidates].filter((s) => s.length >= 2);
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────

async function delay(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) throw err; // terminal
      last = err;
      if (i < maxAttempts - 1) await delay(1_000 * (i + 1));
    }
  }
  throw last;
}

// ─── ATS probers ─────────────────────────────────────────────────────────────

type HitResult = { ats: string; slug: string; count: number };

async function probeGreenhouse(slug: string): Promise<number | null> {
  try {
    const { data } = await withRetry(() =>
      axios.get<{ jobs: unknown[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
        { timeout: TIMEOUT_MS, headers: UA },
      ),
    );
    return Array.isArray(data.jobs) ? data.jobs.length : null;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null;
    return null;
  }
}

async function probeLever(slug: string): Promise<number | null> {
  try {
    const { data } = await withRetry(() =>
      axios.get<unknown[]>(`https://api.lever.co/v0/postings/${slug}`, {
        timeout: TIMEOUT_MS,
        params: { mode: 'json' },
        headers: UA,
      }),
    );
    return Array.isArray(data) ? data.length : null;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null;
    return null;
  }
}

// Returns: count on hit, null on miss, -1 on 404 (API-disabled but board may exist)
async function probeAshby(slug: string): Promise<number | -1 | null> {
  try {
    const { data } = await withRetry(() =>
      axios.get<{ jobs?: unknown[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        { timeout: TIMEOUT_MS, headers: UA },
      ),
    );
    return Array.isArray(data.jobs) ? data.jobs.length : null;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return -1; // API-disabled sentinel
    return null;
  }
}

let workableVerified: boolean | null = null;

// GET https://apply.workable.com/api/v1/widget/accounts/{slug}
// Returns {name, description, jobs:[...]} for real boards, 404 for non-existent slugs.
async function probeWorkable(slug: string): Promise<number | null> {
  // Lazily verify the endpoint shape using the known-good Trail of Bits board.
  if (workableVerified === null) {
    try {
      const res = await axios.get<{ jobs: unknown[] }>(
        'https://apply.workable.com/api/v1/widget/accounts/trailofbits',
        { timeout: TIMEOUT_MS, headers: UA },
      );
      workableVerified = Array.isArray(res.data.jobs) && res.data.jobs.length > 0;
    } catch {
      workableVerified = false;
    }
    if (!workableVerified) {
      console.warn('⚠  Workable endpoint verification failed (trailofbits returned no jobs) — skipping all Workable probes');
    }
  }
  if (!workableVerified) return null;

  try {
    const { data } = await withRetry(() =>
      axios.get<{ jobs?: unknown[] }>(
        `https://apply.workable.com/api/v1/widget/accounts/${slug}`,
        { timeout: TIMEOUT_MS, headers: UA },
      ),
    );
    // Require ≥1 job to confirm the company actually uses this board.
    const count = Array.isArray(data.jobs) ? data.jobs.length : 0;
    return count > 0 ? count : null;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null;
    return null;
  }
}

interface RecruiteeOffer {
  readonly careers_url?: string;
}

// Recruitee: subdomain-based — {slug}.recruitee.com returns 404 for non-existent boards.
// Sample/demo boards have all jobs hosted at the recruitee.com subdomain itself.
// Real company boards redirect applications to an external domain.
async function probeRecruitee(slug: string): Promise<number | null> {
  try {
    const { data } = await withRetry(() =>
      axios.get<{ offers?: RecruiteeOffer[] }>(`https://${slug}.recruitee.com/api/offers/`, {
        timeout: TIMEOUT_MS,
        headers: UA,
      }),
    );
    if (!Array.isArray(data.offers)) return null;
    // Filter out sample boards: a real company's job apply URLs point to an external domain,
    // not `${slug}.recruitee.com`. If all URLs stay on the board's subdomain, it's a demo.
    const realJobs = data.offers.filter(
      (o) => !o.careers_url?.includes(`${slug}.recruitee.com`),
    );
    return realJobs.length > 0 ? realJobs.length : null;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null;
    return null;
  }
}

// SmartRecruiters: returns 200+{content:[]} for any slug (including non-customers).
// Must use totalFound > 0 to confirm a real board.
async function probeSmartRecruiters(slug: string): Promise<number | null> {
  try {
    const { data } = await withRetry(() =>
      axios.get<{ totalFound?: number; content?: unknown[] }>(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
        { timeout: TIMEOUT_MS, headers: UA },
      ),
    );
    const total = typeof data.totalFound === 'number' ? data.totalFound : 0;
    return total > 0 ? total : null;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null;
    return null;
  }
}

// ─── Per-company probe ────────────────────────────────────────────────────────

async function discoverCompany(company: SourcesCompany): Promise<DiscoveryResult> {
  const hint = analyzeCareerUrl(company.careerUrl);

  // Detect Workday / Phenom early — no API to probe
  if (hint.kind === 'workday' || hint.kind === 'phenom') {
    return {
      name: company.name, domain: company.domain, tier: company.tier,
      careerUrl: company.careerUrl, detectedProvider: hint.kind.toUpperCase(),
      resolvedSlug: null, httpStatus: 'N/A (no API)',
      jobCount: 0, classification: 'SCRAPE-ONLY',
      note: `careerUrl host signals ${hint.kind}`,
    };
  }

  // Build candidate slug list (priority: careerUrl slug > aliases > name-derived)
  const slugsFromUrl: string[] = isBig3Hint(hint) ? [hint.slug] : [];
  const aliasSeeds: string[] = [...(ALIAS_SEEDS[company.name] ?? [])];
  const nameSlugCandidates = nameToSlugs(company.name);
  const allCandidates = [...new Set([...slugsFromUrl, ...aliasSeeds, ...nameSlugCandidates])];

  // Probe big-3 first
  let ashbyApiDisabledSlug: string | null = null;
  const big3Probers: Array<{ ats: string; fn: (s: string) => Promise<number | null | -1> }> = [
    { ats: 'greenhouse', fn: probeGreenhouse },
    { ats: 'lever', fn: probeLever },
    { ats: 'ashby', fn: probeAshby },
  ];

  // If careerUrl signals a specific big-3 ATS, probe that ATS first with its slug
  if (isBig3Hint(hint)) {
    const primaryProber = big3Probers.find((p) => p.ats === hint.kind);
    if (primaryProber) {
      const count = await primaryProber.fn(hint.slug);
      if (count !== null && count !== -1) {
        return hit(company, primaryProber.ats, hint.slug, count, 200, `careerUrl slug confirmed`);
      }
      if (count === -1 && hint.kind === 'ashby') {
        ashbyApiDisabledSlug = hint.slug;
      }
    }
  }

  // Try all candidates on all big-3
  const primarySlug = isBig3Hint(hint) ? hint.slug : null;
  for (const slug of allCandidates) {
    // Skip the primary slug already probed above
    if (primarySlug !== null && slug === primarySlug) continue;

    for (const { ats, fn } of big3Probers) {
      const count = await fn(slug);
      if (count !== null && count !== -1) {
        return hit(company, ats, slug, count, 200,
          isBig3Hint(hint) ? `moved from ${hint.kind}/${hint.slug}` : '');
      }
      // Only treat Ashby 404 as "API-disabled" for slugs derived from an Ashby careerUrl.
      // For other companies, Ashby 404 just means "not found on Ashby."
    }
  }

  // Probe other scriptable ATS (Workable, Recruitee, Personio, SmartRecruiters)
  // Personio excluded: WAF blocks all probes (307→429 for all subdomains)
  const otherProbers: Array<{ ats: string; fn: (s: string) => Promise<number | null> }> = [
    { ats: 'workable', fn: probeWorkable },
    { ats: 'recruitee', fn: probeRecruitee },
    { ats: 'smartrecruiters', fn: probeSmartRecruiters },
  ];

  for (const slug of allCandidates) {
    for (const { ats, fn } of otherProbers) {
      const count = await fn(slug);
      if (count !== null) {
        return hit(company, ats, slug, count, 200, '');
      }
    }
  }

  // Nothing found — determine classification
  if (ashbyApiDisabledSlug !== null) {
    return {
      name: company.name, domain: company.domain, tier: company.tier,
      careerUrl: company.careerUrl, detectedProvider: 'ashby',
      resolvedSlug: ashbyApiDisabledSlug, httpStatus: 404,
      jobCount: 0, classification: 'API-DISABLED',
      note: `ashby board at jobs.ashbyhq.com/${ashbyApiDisabledSlug} exists; posting-api returns 404`,
    };
  }

  // Custom careerUrl but no ATS found — SCRAPE-ONLY (manual watchlist)
  if (hint.kind === 'custom' && company.careerUrl) {
    return {
      name: company.name, domain: company.domain, tier: company.tier,
      careerUrl: company.careerUrl, detectedProvider: 'custom',
      resolvedSlug: null, httpStatus: 404,
      jobCount: 0, classification: 'SCRAPE-ONLY',
      note: `custom careerUrl; no scriptable ATS detected`,
    };
  }

  return {
    name: company.name, domain: company.domain, tier: company.tier,
    careerUrl: company.careerUrl, detectedProvider: null,
    resolvedSlug: null, httpStatus: 404,
    jobCount: 0, classification: 'NONE',
    note: `tried slugs: ${allCandidates.join(', ')}`,
  };
}

function hit(
  company: SourcesCompany,
  ats: string,
  slug: string,
  count: number,
  status: number,
  note: string,
): DiscoveryResult {
  return {
    name: company.name, domain: company.domain, tier: company.tier,
    careerUrl: company.careerUrl, detectedProvider: ats,
    resolvedSlug: slug, httpStatus: status,
    jobCount: count,
    classification: 'BUILDABLE-CLEAN',
    note,
  };
}

// ─── Write-back ───────────────────────────────────────────────────────────────

function writeback(
  sources: SourcesJson,
  results: DiscoveryResult[],
): void {
  const big3Wins = results.filter(
    (r) => r.classification === 'BUILDABLE-CLEAN' && r.detectedProvider !== null && BIG3.has(r.detectedProvider),
  );

  if (big3Wins.length === 0) {
    console.log('No big-3 wins to write back.');
    return;
  }

  console.log(`\nWriting back ${big3Wins.length} big-3 win(s) to sources.json + company-registry.ts…`);

  // ── Update sources.json with surgical string replacement ─────────────────────
  // We avoid re-serializing the whole file (which strips \uXXXX escapes) by
  // targeting specific JSON values via regex substitution on the raw text.
  let sourcesRaw = fs.readFileSync(SOURCES_PATH, 'utf-8');
  for (const win of big3Wins) {
    // Find the company block by name and patch ats/atsSlug values inline
    const escapedName = win.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRe = new RegExp(
      `("name":\\s*"${escapedName}"[\\s\\S]*?)"ats":\\s*null,\\s*"atsSlug":\\s*null`,
    );
    if (!blockRe.test(sourcesRaw)) {
      console.error(`  ❌ Could not find ats: null block for ${win.name} in sources.json`);
      continue;
    }
    sourcesRaw = sourcesRaw.replace(
      blockRe,
      `$1"ats": "${win.detectedProvider}",\n      "atsSlug": "${win.resolvedSlug}"`,
    );
    // Append note
    const noteRe = new RegExp(
      `("name":\\s*"${escapedName}"[\\s\\S]*?)"notes":\\s*"([^"]*)"`,
    );
    const stamp = `Discovered ${win.detectedProvider}/${win.resolvedSlug} (${win.jobCount} jobs) via ats-discovery 2026-06-14.`;
    sourcesRaw = sourcesRaw.replace(noteRe, `$1"notes": "$2 ${stamp}"`);
  }
  fs.writeFileSync(SOURCES_PATH, sourcesRaw, 'utf-8');
  console.log('  ✅ sources.json updated');

  // ── Append to company-registry.ts ────────────────────────────────────────────
  let registryTs = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  const insertMarker = '] as const;';
  const insertIdx = registryTs.lastIndexOf(insertMarker);
  if (insertIdx === -1) {
    console.error('  ❌ Could not locate "] as const;" in company-registry.ts — skipping registry write-back');
    return;
  }

  const newEntries = big3Wins.map((win) => {
    const ats = win.detectedProvider as string;
    const slug = win.resolvedSlug as string;
    return `  // discovered via ats-discovery 2026-06-14 (${win.jobCount} jobs)\n` +
      `  { name: '${win.name}', ats: '${ats}', slug: '${slug}', tier: ${win.tier}, domain: '${win.domain}' },`;
  });

  registryTs =
    registryTs.slice(0, insertIdx) +
    '\n  // ── ATS-discovery write-back 2026-06-14 ──────────────────────────────────────────\n' +
    newEntries.join('\n') + '\n\n' +
    registryTs.slice(insertIdx);

  fs.writeFileSync(REGISTRY_PATH, registryTs, 'utf-8');
  console.log('  ✅ company-registry.ts updated');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const raw = fs.readFileSync(SOURCES_PATH, 'utf-8');
  const sources = JSON.parse(raw) as SourcesJson;

  const targets = sources.companies.filter((c) => c.ats === null && c.tier === 1);
  console.log(`Probing ${targets.length} tier-1 companies with ats: null…\n`);

  const results: DiscoveryResult[] = [];

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(discoverCompany));
    results.push(...batchResults);

    const done = Math.min(i + BATCH_SIZE, targets.length);
    for (const r of batchResults) {
      const icon =
        r.classification === 'BUILDABLE-CLEAN' ? '✅' :
        r.classification === 'API-DISABLED' ? '⚠️ ' :
        r.classification === 'SCRAPE-ONLY' ? '🔒' : '❌';
      console.log(`  ${icon} ${r.name}: ${r.detectedProvider ?? 'none'}/${r.resolvedSlug ?? '—'} (${r.jobCount} jobs) [${r.classification}]`);
    }

    if (done < targets.length) await delay(BATCH_DELAY_MS);
  }

  // ─── Build report ────────────────────────────────────────────────────────────

  const buildable = results.filter((r) => r.classification === 'BUILDABLE-CLEAN');
  const apiDisabled = results.filter((r) => r.classification === 'API-DISABLED');
  const scrapeOnly = results.filter((r) => r.classification === 'SCRAPE-ONLY');
  const none = results.filter((r) => r.classification === 'NONE');

  const big3Wins = buildable.filter((r) => r.detectedProvider !== null && BIG3.has(r.detectedProvider));
  const otherWins = buildable.filter((r) => r.detectedProvider !== null && !BIG3.has(r.detectedProvider));

  // Cluster counts for BUILDABLE-CLEAN (non-big-3)
  const providerCounts = new Map<string, DiscoveryResult[]>();
  for (const r of buildable) {
    const p = r.detectedProvider ?? 'unknown';
    const arr = providerCounts.get(p) ?? [];
    arr.push(r);
    providerCounts.set(p, arr);
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const lines: string[] = [
    `# ATS Discovery Report`,
    ``,
    `Generated: ${now} UTC`,
    `Targets: ${targets.length} tier-1 companies with \`ats: null\``,
    ``,
    `## Summary`,
    ``,
    `| Classification | Count |`,
    `|---------------|-------|`,
    `| ✅ BUILDABLE-CLEAN | ${buildable.length} |`,
    `| ⚠️  API-DISABLED | ${apiDisabled.length} |`,
    `| 🔒 SCRAPE-ONLY | ${scrapeOnly.length} |`,
    `| ❌ NONE | ${none.length} |`,
    ``,
    `### Cluster counts (BUILDABLE-CLEAN by provider)`,
    ``,
    `| Provider | Companies |`,
    `|----------|-----------|`,
  ];

  for (const [provider, companies] of [...providerCounts.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`| ${provider} | ${companies.length} (${companies.map((c) => c.name).join(', ')}) |`);
  }
  lines.push(``);

  if (big3Wins.length > 0) {
    lines.push(`### Big-3 token-drift wins (written back to registry)`, ``);
    lines.push(`| Company | Was (in sources.json) | Now | Jobs |`);
    lines.push(`|---------|----------------------|-----|------|`);
    for (const r of big3Wins) {
      lines.push(
        `| ${r.name} | ats: null | ${r.detectedProvider}/${r.resolvedSlug} | ${r.jobCount} |`,
      );
    }
    lines.push(``);
  }

  lines.push(
    `## Recommendation`,
    ``,
  );

  const topNonBig3 = [...providerCounts.entries()]
    .filter(([p]) => !BIG3.has(p))
    .sort((a, b) => b[1].length - a[1].length);

  if (topNonBig3.length > 0 && (topNonBig3[0]?.[1].length ?? 0) >= 4) {
    const [provider, companies] = topNonBig3[0] as [string, DiscoveryResult[]];
    lines.push(
      `**Build adapter for: ${provider.toUpperCase()}** — ${companies.length} companies cluster here.`,
      ``,
      `Companies on ${provider}: ${companies.map((c) => `${c.name} (${c.resolvedSlug})`).join(', ')}`,
      ``,
    );
  } else if (topNonBig3.length > 0 && (topNonBig3[0]?.[1].length ?? 0) >= 2) {
    const [provider, companies] = topNonBig3[0] as [string, DiscoveryResult[]];
    lines.push(
      `**Weak cluster on ${provider}** (${companies.length} companies — below the 4-company threshold for an adapter).`,
      `Recommendation: no new adapter. Add the SCRAPE-ONLY / API-DISABLED companies to a manual watchlist instead.`,
      ``,
    );
  } else {
    lines.push(
      `**No adapter recommended** — BUILDABLE-CLEAN companies scatter ≤1–2 per non-big-3 provider.`,
      `Add the SCRAPE-ONLY / API-DISABLED / NONE companies to a manual watchlist instead.`,
      ``,
    );
  }

  if (scrapeOnly.length > 0 || apiDisabled.length > 0 || none.length > 0) {
    lines.push(`**Manual watchlist (check site directly):**`, ``);
    for (const r of [...scrapeOnly, ...apiDisabled, ...none]) {
      lines.push(`- ${r.name} (${r.classification}) — ${r.careerUrl ?? 'no URL'}`);
    }
    lines.push(``);
  }

  lines.push(`## Full per-company table`, ``);
  lines.push(`| Company | Domain | T | Provider | Token | HTTP | Jobs | Classification | Note |`);
  lines.push(`|---------|--------|---|----------|-------|------|------|----------------|------|`);

  for (const r of results) {
    lines.push(
      `| ${r.name} | ${r.domain} | ${r.tier} | ${r.detectedProvider ?? '—'} | ${r.resolvedSlug ?? '—'} | ${r.httpStatus} | ${r.jobCount} | ${r.classification} | ${r.note} |`,
    );
  }
  lines.push(``);

  const report = lines.join('\n');
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');
  console.log(`\n✅ Report written to ${REPORT_PATH}`);

  // ─── Write-back big-3 wins ───────────────────────────────────────────────────
  if (big3Wins.length > 0) {
    writeback(sources, results);
  }
}

main().catch((err: unknown) => {
  console.error('ats-discovery fatal:', err);
  process.exitCode = 1;
});
