/*
 * coverage-check.ts — read-only diagnostic.
 * For every company in jobsieve-sources.json with ats: null, checks whether
 * jobs are flowing in via feed/aggregator sources (web3career, remoteok, etc.).
 * Treats a company as "covered" only if ≥1 matching row has last_seen_at
 * within the last 30 days AND at least one match has fit_score > 0.
 *
 * Usage:
 *   cd api && pnpm coverage
 * Output: ../coverage-report.md
 */

import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3') as (path: string, opts: object) => {
  prepare: (sql: string) => { all: (...args: unknown[]) => JobRow[] };
  close: () => void;
};

// ─── Config ──────────────────────────────────────────────────────────────────

const SOURCES_PATH = path.resolve(__dirname, '../../src/registry/jobsieve-sources.json');
const DB_PATH = path.resolve(__dirname, '../../../data/jobsieve.sqlite');
const REPORT_PATH = path.resolve(__dirname, '../../../coverage-report.md');
const FRESHNESS_DAYS = 30;
const DIRECT_ATS = new Set(['greenhouse', 'lever', 'ashby']);

// ─── Types ───────────────────────────────────────────────────────────────────

interface SourcesCompany {
  name: string;
  domain: string;
  tier: number;
  ats: string | null;
  atsSlug: string | null;
  careerUrl: string | null;
  notes?: string;
}

interface SourcesJson {
  companies: SourcesCompany[];
}

interface JobRow {
  id: number;
  source: string;
  title: string;
  company: string;
  fit_score: number | null;
  last_seen_at: string;
}

type Verdict = 'covered' | 'weak' | 'gap';

interface CompanyResult {
  name: string;
  domain: string;
  tier: number;
  totalMatches: number;
  freshMatches: number;
  matchesWithScore: number;
  maxFitScore: number;
  sources: string[];
  mostRecentLastSeen: string | null;
  sampleTitles: string[];
  verdict: Verdict;
}

// ─── Normalization ────────────────────────────────────────────────────────────

import { coreTokens, matchesField, tokenizeField } from '../src/ingestion/normalize.js';

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const raw = fs.readFileSync(SOURCES_PATH, 'utf-8');
  const sources = JSON.parse(raw) as SourcesJson;

  // Target set: all companies without a direct big-3 board
  const targets = sources.companies.filter((c) => c.ats === null || !DIRECT_ATS.has(c.ats ?? ''));

  console.log(`Targets: ${targets.length} companies with ats: null`);

  const db = Database(DB_PATH, { readonly: true });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FRESHNESS_DAYS);
  const cutoffIso = cutoff.toISOString();

  // Fetch all feed/aggregator jobs (exclude direct big-3 boards)
  const feedJobs = db
    .prepare(
      `SELECT id, source, title, company, fit_score, last_seen_at
       FROM jobs
       WHERE source NOT IN ('greenhouse','lever','ashby')
       ORDER BY last_seen_at DESC`,
    )
    .all();

  console.log(`Feed jobs in DB: ${feedJobs.length}`);

  const results: CompanyResult[] = [];

  for (const target of targets) {
    const targetCore = coreTokens(target.name);

    const matches: JobRow[] = [];
    for (const job of feedJobs) {
      const companyTokens = tokenizeField(job.company);
      const titleTokens = tokenizeField(job.title);
      if (
        matchesField(targetCore, companyTokens) ||
        matchesField(targetCore, titleTokens)
      ) {
        matches.push(job);
      }
    }

    const freshMatches = matches.filter((j) => j.last_seen_at >= cutoffIso);
    const matchesWithScore = freshMatches.filter((j) => (j.fit_score ?? 0) > 0);
    const maxFitScore = matches.reduce((m, j) => Math.max(m, j.fit_score ?? 0), 0);
    const sourceSet = new Set(freshMatches.map((j) => j.source));
    const mostRecentLastSeen = matches.length > 0 ? matches[0]?.last_seen_at ?? null : null;
    const sampleTitles = freshMatches
      .filter((j) => (j.fit_score ?? 0) > 0)
      .slice(0, 2)
      .map((j) => `${j.title} @ ${j.company} [${j.fit_score ?? 0}]`);

    let verdict: Verdict;
    if (freshMatches.length > 0 && matchesWithScore.length > 0) {
      verdict = 'covered';
    } else if (matches.length > 0) {
      verdict = 'weak';
    } else {
      verdict = 'gap';
    }

    results.push({
      name: target.name,
      domain: target.domain,
      tier: target.tier,
      totalMatches: matches.length,
      freshMatches: freshMatches.length,
      matchesWithScore: matchesWithScore.length,
      maxFitScore,
      sources: [...sourceSet],
      mostRecentLastSeen,
      sampleTitles,
      verdict,
    });
  }

  db.close();

  // ─── Sort: gap first, then weak, then covered; within each, tier asc ──────
  const verdictOrder: Record<Verdict, number> = { gap: 0, weak: 1, covered: 2 };
  results.sort((a, b) => {
    const vDiff = verdictOrder[a.verdict] - verdictOrder[b.verdict];
    if (vDiff !== 0) return vDiff;
    return a.tier - b.tier;
  });

  const covered = results.filter((r) => r.verdict === 'covered');
  const weak = results.filter((r) => r.verdict === 'weak');
  const gap = results.filter((r) => r.verdict === 'gap');

  // ─── Build report ────────────────────────────────────────────────────────
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const lines: string[] = [
    `# Coverage Report`,
    ``,
    `Generated: ${now} UTC`,
    `Ingestion run completed: today (triggered before this report)`,
    `Feed jobs in DB: ${feedJobs.length} (sources: web3career, remoteok, hireweb3, remotive, himalayas, weworkremotely)`,
    `Targets: ${targets.length} companies with \`ats: null\` in sources.json`,
    `Freshness window: last ${FRESHNESS_DAYS} days`,
    ``,
    `## Summary`,
    ``,
    `| Verdict | Count |`,
    `|---------|-------|`,
    `| ✅ covered (fresh + relevant) | ${covered.length} |`,
    `| ⚠️ weak (stale or zero fit_score) | ${weak.length} |`,
    `| ❌ gap (no matches) | ${gap.length} |`,
    ``,
    `## Per-company table`,
    ``,
    `| Company | Domain | T | Verdict | Total | Fresh | w/score | Max score | Sources | Most Recent |`,
    `|---------|--------|---|---------|-------|-------|---------|-----------|---------|-------------|`,
  ];

  for (const r of results) {
    const emoji = r.verdict === 'covered' ? '✅' : r.verdict === 'weak' ? '⚠️' : '❌';
    lines.push(
      `| ${r.name} | ${r.domain} | ${r.tier} | ${emoji} ${r.verdict} | ${r.totalMatches} | ${r.freshMatches} | ${r.matchesWithScore} | ${r.maxFitScore} | ${r.sources.join(', ')} | ${r.mostRecentLastSeen?.slice(0, 10) ?? '—'} |`,
    );
  }

  lines.push(``, `## Sample titles for covered/weak companies`, ``);
  for (const r of [...covered, ...weak]) {
    if (r.sampleTitles.length > 0) {
      lines.push(`**${r.name}**:`);
      for (const t of r.sampleTitles) lines.push(`- ${t}`);
      lines.push(``);
    }
  }

  lines.push(`## Gap companies (no feed coverage)`, ``);
  lines.push(`These are candidates for a further adapter (Workable, Phenom, direct scrape, etc.)`, ``);
  lines.push(`| Company | Domain | Tier |`);
  lines.push(`|---------|--------|------|`);
  for (const r of gap) {
    lines.push(`| ${r.name} | ${r.domain} | ${r.tier} |`);
  }
  lines.push(``);

  const report = lines.join('\n');
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');

  console.log(`\n✅ Report written to ${REPORT_PATH}`);
  console.log(`   covered: ${covered.length} | weak: ${weak.length} | gap: ${gap.length}`);

  if (gap.length > 0) {
    console.log('\n❌ Gap companies:');
    for (const r of gap) {
      console.log(`  [T${r.tier}] ${r.name} (${r.domain})`);
    }
  }
}

main();
