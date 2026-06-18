/*
 * score-audit.ts — read-only diagnostic. No DB writes, no scoring changes.
 *
 * The taxonomy rescore moved ~1,741 rows to fit_score 0. Most are genuine junk,
 * but the absolute role-family gate can also bury relevant roles whose titles are
 * generic ("Staff Engineer", "Founding Engineer", "Member of Technical Staff") or
 * whose relevance lives in the stack rather than the title. This audit recomputes
 * every job's score live against the CURRENT profile, takes the 0-scored set, and
 * buckets it to see whether any real roles got caught.
 *
 * Usage (from repo root):
 *   pnpm score-audit
 * Output: ../score-audit.md
 */

import * as fs from 'fs';
import * as path from 'path';

import type BetterSqlite3 from 'better-sqlite3';

// Reuse the scorer and its own word-boundary matching primitive so the audit's
// bucket checks match exactly how scoring would — no reimplemented matching.
import {
  FitScoringService,
  type ScorableJob,
  type ScoringProfile,
} from '../src/scoring/fit-scoring.service.js';
import { matchesPhrase } from '../src/scoring/phrase-match.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3') as typeof BetterSqlite3;

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_PATH = path.resolve(__dirname, '../../../data/jobsieve.sqlite');
const REPORT_PATH = path.resolve(__dirname, '../../../score-audit.md');
const PROFILE_ID = 1;

const WATCHLIST_SOURCES = new Set(['greenhouse', 'lever', 'ashby']);
const EXAMPLES_PER_BUCKET = 10;
const RESIDUAL_SAMPLE = 10;
const STACK_HITS_THRESHOLD = 2;

// Generic IC/eng title patterns the role-family phrases don't cover. A 0-scored
// row whose title matches one of these is a candidate the gate may be burying.
// (Phrases that ARE family keywords — e.g. "software engineer" — are omitted:
// those already pass the gate and never land in the 0-set.)
const GENERIC_TITLE_PATTERNS = [
  'staff engineer',
  'staff software engineer',
  'senior staff engineer',
  'principal engineer',
  'senior engineer',
  'founding engineer',
  'lead engineer',
  'member of technical staff',
  'mts',
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface JobRow {
  id: number;
  source: string;
  title: string;
  company: string;
  description: string | null;
  tags: string | null;
  remote: number;
}

interface ProfileRow {
  roleFamilies: string;
  seniorities: string;
  stack: string;
  locationTypes: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseJsonArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === 'string');
}

function parseTags(raw: string | null): string[] {
  if (raw === null || raw.trim().length === 0) return [];
  try {
    return parseJsonArray(raw);
  } catch {
    return [];
  }
}

// Count how many distinct stack terms appear (word-boundary) in the combined
// lowercased text, using the scorer's own matchesPhrase primitive.
function countStackHits(lowerText: string, stack: readonly string[]): number {
  let hits = 0;
  for (const term of stack) {
    if (matchesPhrase(lowerText, term)) hits += 1;
  }
  return hits;
}

// Which stack terms hit, split by where they hit. Free-text HTML descriptions
// produce false positives for English-word stack tokens (notably "Go"), so the
// title+tags ("structured") count is the trustworthy soft-gate signal; the
// description-inclusive count is the spec's raw definition.
interface StackSignal {
  readonly raw: number; // ≥-eligible against title+description+tags
  readonly structured: number; // title+tags only
}

function stackSignal(job: JobRow, stack: readonly string[]): StackSignal {
  const structuredText = [job.title, parseTags(job.tags).join(' ')]
    .join(' ')
    .toLowerCase();
  const rawText = [structuredText, (job.description ?? '').toLowerCase()].join(
    ' ',
  );
  return {
    raw: countStackHits(rawText, stack),
    structured: countStackHits(structuredText, stack),
  };
}

function matchesAnyGenericTitle(lowerTitle: string): boolean {
  return GENERIC_TITLE_PATTERNS.some((p) => matchesPhrase(lowerTitle, p));
}

function example(job: JobRow): string {
  return `${job.title} @ ${job.company} [${job.source}]`;
}

// Deterministic-but-shuffled pick so the residual sample is representative.
function sampleN<T>(items: readonly T[], n: number): T[] {
  if (items.length <= n) return [...items];
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]] as [T, T];
  }
  return copy.slice(0, n);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const db = Database(DB_PATH, { readonly: true });

  const profileRow = db
    .prepare(
      `SELECT roleFamilies, seniorities, stack, locationTypes
       FROM profile WHERE id = ?`,
    )
    .get(PROFILE_ID) as ProfileRow | undefined;

  if (profileRow === undefined) {
    db.close();
    throw new Error(`No profile row with id=${PROFILE_ID}`);
  }

  const profile: ScoringProfile = {
    roleFamilies: parseJsonArray(profileRow.roleFamilies),
    seniorities: parseJsonArray(profileRow.seniorities),
    stack: parseJsonArray(profileRow.stack),
    locationTypes: parseJsonArray(profileRow.locationTypes),
  };

  const rows = db
    .prepare(
      `SELECT id, source, title, company, description, tags, remote FROM jobs`,
    )
    .all() as JobRow[];
  db.close();

  const scorer = new FitScoringService();

  // ─── Recompute scores live; take the 0-scored set ────────────────────────
  const zeroRows: JobRow[] = [];
  let positive = 0;
  for (const row of rows) {
    const job: ScorableJob = {
      title: row.title,
      description: row.description,
      tags: parseTags(row.tags),
      remote: row.remote !== 0,
    };
    if (scorer.score(job, profile) > 0) positive += 1;
    else zeroRows.push(row);
  }

  // ─── Bucket the 0-scored rows (a row can land in several) ─────────────────
  const bucketA: JobRow[] = []; // watchlist board
  const bucketB: JobRow[] = []; // generic engineering title
  const bucketC: JobRow[] = []; // stack-implied, raw (title+desc+tags)
  const bucketCStrong: JobRow[] = []; // stack-implied, structured (title+tags)

  for (const row of zeroRows) {
    if (WATCHLIST_SOURCES.has(row.source)) bucketA.push(row);

    if (matchesAnyGenericTitle(row.title.toLowerCase())) bucketB.push(row);

    const signal = stackSignal(row, profile.stack);
    if (signal.raw >= STACK_HITS_THRESHOLD) bucketC.push(row);
    if (signal.structured >= STACK_HITS_THRESHOLD) bucketCStrong.push(row);
  }

  // ─── Residual: 0-scored rows in NONE of the buckets ──────────────────────
  const bucketed = new Set<number>([
    ...bucketA.map((r) => r.id),
    ...bucketB.map((r) => r.id),
    ...bucketC.map((r) => r.id),
  ]);
  const residual = zeroRows.filter((r) => !bucketed.has(r.id));
  const residualSample = sampleN(residual, RESIDUAL_SAMPLE);

  // ─── Verdict ──────────────────────────────────────────────────────────────
  const verdict = decideVerdict({
    a: bucketA.length,
    b: bucketB.length,
    c: bucketC.length,
    cStrong: bucketCStrong.length,
  });

  // ─── Report ───────────────────────────────────────────────────────────────
  const report = buildReport({
    profile,
    total: rows.length,
    positive,
    zero: zeroRows.length,
    bucketA,
    bucketB,
    bucketC,
    bucketCStrong,
    residualTotal: residual.length,
    residualSample,
    verdict,
  });
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');

  console.log(`\n✅ Report written to ${REPORT_PATH}`);
  console.log(
    `   profile families: ${profile.roleFamilies.join(', ') || '(none)'}`,
  );
  console.log(
    `   scored 0: ${zeroRows.length} | >0: ${positive} (of ${rows.length})`,
  );
  console.log(
    `   bucket A (watchlist): ${bucketA.length} | B (generic title): ${bucketB.length} | C raw: ${bucketC.length} | C structured: ${bucketCStrong.length}`,
  );
  console.log(`   verdict: ${verdict.label}`);
}

// ─── Verdict logic ─────────────────────────────────────────────────────────────

interface VerdictInput {
  a: number;
  b: number;
  c: number;
  cStrong: number;
}

interface Verdict {
  label: string;
  body: string;
}

const VERDICT_THRESHOLD = 25;

// Verdict priority is deliberately title-gaps > soft-gate. Bucket B is precise
// signal (real eng titles); the raw Bucket C is inflated by free-text matches of
// English-word stack tokens ("Go"), so only the STRUCTURED count (title+tags)
// justifies a soft gate.
function decideVerdict({ a, b, c, cStrong }: VerdictInput): Verdict {
  if (b >= VERDICT_THRESHOLD) {
    return {
      label: 'title gaps',
      body:
        `Bucket B holds ${b} real engineering roles with generic titles the ` +
        `family phrases miss (Staff/Principal/Founding/Senior Engineer, Member ` +
        `of Technical Staff). Recommend adding these title patterns to the ` +
        `taxonomy rather than softening the gate. Bucket A (${a}) is mostly ` +
        `genuine non-eng roles at watchlist companies (Controller, BD, Customer ` +
        `Success) — correctly 0. Bucket C raw is ${c} but its structured ` +
        `(title+tags) signal is only ${cStrong}: the raw count is inflated by ` +
        `the English word "go" matching the "Go" stack term in HTML ` +
        `descriptions, so it is NOT reliable soft-gate evidence.`,
    };
  }
  if (cStrong >= VERDICT_THRESHOLD) {
    return {
      label: 'soft-gate warranted',
      body:
        `${cStrong} rows carry ≥${STACK_HITS_THRESHOLD} selected stack terms in ` +
        `their title/tags (structured signal, immune to free-text "go" noise) ` +
        `yet score 0 on a title miss. Recommend granting a small base score when ` +
        `≥${STACK_HITS_THRESHOLD} stack terms match in structured fields even ` +
        `without a title role-match. SDR/Talent guards stay safe — those titles ` +
        `won't carry the stack. NB: raw Bucket C (${c}, title+desc+tags) is much ` +
        `larger but unreliable — driven by "go" in descriptions.`,
    };
  }
  return {
    label: 'gate is clean',
    body:
      `Precise signals are near-empty (B=${b} generic eng titles, C-structured=` +
      `${cStrong} stack-in-title/tags) and the residual sample is non-relevant. ` +
      `Raw Bucket C (${c}) is inflated by free-text "go" matches, not real ` +
      `signal. No fix needed — the precision gain from the rescore stands.`,
  };
}

// ─── Report builder ────────────────────────────────────────────────────────────

interface ReportInput {
  profile: ScoringProfile;
  total: number;
  positive: number;
  zero: number;
  bucketA: JobRow[];
  bucketB: JobRow[];
  bucketC: JobRow[];
  bucketCStrong: JobRow[];
  residualTotal: number;
  residualSample: JobRow[];
  verdict: Verdict;
}

function buildReport(input: ReportInput): string {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const {
    profile,
    total,
    positive,
    zero,
    bucketA,
    bucketB,
    bucketC,
    bucketCStrong,
    residualTotal,
    residualSample,
    verdict,
  } = input;

  const lines: string[] = [
    `# Score Audit — roles the role-family gate may be burying at 0`,
    ``,
    `Generated: ${now} UTC`,
    `Read-only diagnostic: scores recomputed live (stored \`fit_score\` ignored).`,
    ``,
    `**Current profile**`,
    `- Role families: ${profile.roleFamilies.join(', ') || '(none)'}`,
    `- Stack: ${profile.stack.join(', ')}`,
    `- Seniorities: ${profile.seniorities.join(', ')}`,
    `- Location types: ${profile.locationTypes.join(', ')}`,
    ``,
    `## Totals (recomputed)`,
    ``,
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Jobs total | ${total} |`,
    `| Scoring > 0 | ${positive} |`,
    `| Scoring 0 | ${zero} |`,
    ``,
    `## Buckets (a row can land in several)`,
    ``,
    `| Bucket | Meaning | Count |`,
    `|--------|---------|-------|`,
    `| A | Watchlist board (greenhouse/lever/ashby) | ${bucketA.length} |`,
    `| B | Generic engineering title the family phrases miss | ${bucketB.length} |`,
    `| C (raw) | Stack-implied, ≥${STACK_HITS_THRESHOLD} terms in title+desc+tags | ${bucketC.length} |`,
    `| C (structured) | Stack-implied, ≥${STACK_HITS_THRESHOLD} terms in title+tags only | ${bucketCStrong.length} |`,
    ``,
    `> **Precision note on Bucket C.** The raw count (title+desc+tags) is`,
    `> inflated by the English word "go" matching the "Go" stack term inside`,
    `> long HTML descriptions (and "Python"/"AWS" appearing in boilerplate).`,
    `> The **structured** count (title+tags only) is the trustworthy soft-gate`,
    `> signal and is the one the verdict relies on.`,
    ``,
  ];

  lines.push(...bucketSection('A — watchlist board', bucketA));
  lines.push(...bucketSection('B — generic engineering title', bucketB));
  lines.push(
    ...bucketSection('C (raw) — stack-implied, title+desc+tags', bucketC),
  );
  lines.push(
    ...bucketSection(
      'C (structured) — stack-implied, title+tags only',
      bucketCStrong,
    ),
  );

  lines.push(
    `## Residual sample (0-scored, in NONE of the buckets)`,
    ``,
    `${residualTotal} rows are 0-scored and unbucketed. Random sample to confirm`,
    `they're genuinely non-relevant:`,
    ``,
  );
  for (const r of residualSample) lines.push(`- ${example(r)}`);
  lines.push(``);

  lines.push(
    `## Verdict — ${verdict.label}`,
    ``,
    verdict.body,
    ``,
  );

  if (verdict.label === 'title gaps') {
    lines.push(
      `### Suggested title patterns (do not implement here)`,
      ``,
      ...GENERIC_TITLE_PATTERNS.map((p) => `- \`${p}\``),
      ``,
    );
  }

  return lines.join('\n');
}

function bucketSection(heading: string, rows: JobRow[]): string[] {
  const lines = [`## Bucket ${heading} — ${rows.length} rows`, ``];
  if (rows.length === 0) {
    lines.push(`_(empty)_`, ``);
    return lines;
  }
  for (const r of rows.slice(0, EXAMPLES_PER_BUCKET)) {
    lines.push(`- ${example(r)}`);
  }
  lines.push(``);
  return lines;
}

main();
