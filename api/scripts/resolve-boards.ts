/*
 * resolve-boards.ts — one-shot dev tool.
 * Probes every company in jobsieve-sources.json against Greenhouse, Lever,
 * and Ashby, extracts token candidates from careerUrl first, then falls back
 * to name-derived slugs.
 * Usage:
 *   cd api && pnpm resolve
 * Output: ../resolve-report.md
 */
import * as fs from 'fs';
import * as path from 'path';

import axios, { AxiosError } from 'axios';

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

interface ProbeResult {
  name: string;
  domain: string;
  tier: number;
  srcAts: string | null;
  srcSlug: string | null;
  foundAts: string | null;
  foundSlug: string | null;
  jobCount: number;
  status: 'confirmed' | 'found' | 'not-found' | 'error';
  note: string;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const UA = { 'User-Agent': 'jobsieve-resolver/1.0' };
const TIMEOUT = 8_000;

async function probeGreenhouse(slug: string): Promise<number | null> {
  try {
    const { data } = await axios.get<{ jobs: unknown[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      { timeout: TIMEOUT, headers: UA },
    );
    return Array.isArray(data.jobs) ? data.jobs.length : null;
  } catch (e) {
    if ((e as AxiosError).response?.status === 404) return null;
    return null;
  }
}

async function probeLever(slug: string): Promise<number | null> {
  try {
    const { data } = await axios.get<unknown>(
      `https://api.lever.co/v0/postings/${slug}`,
      { timeout: TIMEOUT, params: { mode: 'json' }, headers: UA },
    );
    if (!Array.isArray(data)) return null;
    return (data as unknown[]).length;
  } catch (e) {
    if ((e as AxiosError).response?.status === 404) return null;
    return null;
  }
}

async function probeAshby(slug: string): Promise<number | null> {
  try {
    const { data } = await axios.get<{ jobs: unknown[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
      { timeout: TIMEOUT, params: { includeCompensation: false }, headers: UA },
    );
    return Array.isArray(data.jobs) ? data.jobs.length : null;
  } catch (e) {
    if ((e as AxiosError).response?.status === 404) return null;
    return null;
  }
}

// ─── Token extraction ─────────────────────────────────────────────────────────

// Generic path segments that appear at the end of career URLs but are not ATS board slugs.
const URL_STOPWORDS = new Set(['jobs', 'job', 'careers', 'career', 'openings', 'positions', 'board', 'boards', 'en']);

function extractCareerUrlTokens(careerUrl: string | null): string[] {
  if (!careerUrl) return [];
  try {
    const u = new URL(careerUrl);
    // boards.greenhouse.io/SLUG or jobs.lever.co/SLUG or jobs.ashbyhq.com/SLUG
    const segments = u.pathname.split('/').filter(Boolean);
    // Walk from the end, skipping generic stopword segments
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (seg && !URL_STOPWORDS.has(seg.toLowerCase())) return [seg];
    }
  } catch {
    // ignore malformed URLs
  }
  return [];
}

function nameToSlugs(name: string): string[] {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();

  const words = base.split(/\s+/);
  const joined = words.join('-');
  const compact = words.join('');

  const candidates = new Set<string>();
  candidates.add(joined);
  candidates.add(compact);

  // common suffix removals: "labs", "protocol", "network", "finance", "foundation"
  const suffixes = ['labs', 'protocol', 'network', 'finance', 'foundation', 'ai', 'xyz'];
  for (const sfx of suffixes) {
    if (joined.endsWith(`-${sfx}`)) {
      candidates.add(joined.slice(0, -(sfx.length + 1)));
    }
  }

  return [...candidates].filter((s) => s.length >= 2);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 600;

async function delay(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

async function resolveCompany(company: SourcesCompany): Promise<ProbeResult> {
  const urlTokens = extractCareerUrlTokens(company.careerUrl);
  const nameTokens = nameToSlugs(company.name);

  // All candidates in priority order: url-derived first, name-derived second
  const candidates = [...new Set([...urlTokens, ...nameTokens])];

  const probers: Array<{ ats: string; fn: (s: string) => Promise<number | null> }> = [
    { ats: 'greenhouse', fn: probeGreenhouse },
    { ats: 'lever', fn: probeLever },
    { ats: 'ashby', fn: probeAshby },
  ];

  // If the company already has a known ATS + slug, verify it first
  if (company.ats && company.atsSlug) {
    const knownProber = probers.find((p) => p.ats === company.ats);
    if (knownProber) {
      const count = await knownProber.fn(company.atsSlug);
      if (count !== null) {
        return {
          name: company.name,
          domain: company.domain,
          tier: company.tier,
          srcAts: company.ats,
          srcSlug: company.atsSlug,
          foundAts: company.ats,
          foundSlug: company.atsSlug,
          jobCount: count,
          status: 'confirmed',
          note: '',
        };
      }
      // known ATS failed — fall through to brute probe
    }
  }

  // Brute-probe all candidates across all ATS
  for (const slug of candidates) {
    for (const { ats, fn } of probers) {
      // Skip redundant re-check of the known (ats, slug) pair
      if (company.ats === ats && company.atsSlug === slug) continue;

      const count = await fn(slug);
      if (count !== null) {
        const changed = company.ats !== ats || company.atsSlug !== slug;
        return {
          name: company.name,
          domain: company.domain,
          tier: company.tier,
          srcAts: company.ats,
          srcSlug: company.atsSlug,
          foundAts: ats,
          foundSlug: slug,
          jobCount: count,
          status: changed ? 'found' : 'confirmed',
          note: changed ? `moved from ${company.ats ?? 'null'}/${company.atsSlug ?? 'null'}` : '',
        };
      }
    }
  }

  return {
    name: company.name,
    domain: company.domain,
    tier: company.tier,
    srcAts: company.ats,
    srcSlug: company.atsSlug,
    foundAts: null,
    foundSlug: null,
    jobCount: 0,
    status: 'not-found',
    note: `tried: ${candidates.join(', ')}`,
  };
}

async function main(): Promise<void> {
  const sourcesPath = path.resolve(__dirname, '../../src/registry/jobsieve-sources.json');
  const reportPath = path.resolve(__dirname, '../../../resolve-report.md');

  const raw = fs.readFileSync(sourcesPath, 'utf-8');
  const sources = JSON.parse(raw) as SourcesJson;
  const companies = sources.companies;

  console.log(`Resolving ${companies.length} companies (batch=${BATCH_SIZE}, delay=${BATCH_DELAY_MS}ms)…\n`);

  const results: ProbeResult[] = [];

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(resolveCompany));
    results.push(...batchResults);

    const done = Math.min(i + BATCH_SIZE, companies.length);
    process.stdout.write(`  ${done}/${companies.length} done\r`);

    if (done < companies.length) await delay(BATCH_DELAY_MS);
  }

  console.log('\n');

  // ─── Build report ────────────────────────────────────────────────────────────

  const confirmed = results.filter((r) => r.status === 'confirmed');
  const found = results.filter((r) => r.status === 'found');
  const notFound = results.filter((r) => r.status === 'not-found');

  const lines: string[] = [
    `# Board Resolver Report`,
    ``,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    `Companies probed: ${companies.length}`,
    ``,
    `## Summary`,
    ``,
    `| Status | Count |`,
    `|--------|-------|`,
    `| ✅ Confirmed (unchanged) | ${confirmed.length} |`,
    `| 🔄 Found (ATS/slug changed) | ${found.length} |`,
    `| ❌ Not found | ${notFound.length} |`,
    ``,
  ];

  if (found.length > 0) {
    lines.push(`## Changed boards (action required)`, ``);
    lines.push(`| Company | Was | Now | Jobs |`);
    lines.push(`|---------|-----|-----|------|`);
    for (const r of found) {
      lines.push(
        `| ${r.name} | ${r.srcAts ?? 'null'}/${r.srcSlug ?? 'null'} | ${r.foundAts}/${r.foundSlug} | ${r.jobCount} |`,
      );
    }
    lines.push(``);
  }

  lines.push(`## Confirmed boards`, ``);
  lines.push(`| Company | ATS | Slug | Jobs | Domain |`);
  lines.push(`|---------|-----|------|------|--------|`);
  for (const r of confirmed) {
    lines.push(
      `| ${r.name} | ${r.foundAts} | ${r.foundSlug} | ${r.jobCount} | ${r.domain} |`,
    );
  }
  lines.push(``);

  lines.push(`## Not found`, ``);
  lines.push(`| Company | Domain | Tier | Tried tokens |`);
  lines.push(`|---------|--------|------|--------------|`);
  for (const r of notFound) {
    lines.push(`| ${r.name} | ${r.domain} | ${r.tier} | ${r.note} |`);
  }
  lines.push(``);

  const report = lines.join('\n');
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`✅ Report written to ${reportPath}`);
  console.log(`   Confirmed: ${confirmed.length} | Changed: ${found.length} | Not found: ${notFound.length}`);

  if (found.length > 0) {
    console.log('\n🔄 Companies with changed ATS/slug:');
    for (const r of found) {
      console.log(`  ${r.name}: ${r.srcAts}/${r.srcSlug} → ${r.foundAts}/${r.foundSlug} (${r.jobCount} jobs)`);
    }
  }
}

main().catch((err: unknown) => {
  console.error('resolve-boards fatal:', err);
  process.exitCode = 1;
});
