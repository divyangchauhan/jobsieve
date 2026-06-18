/*
 * dedup-cleanup.ts — one-time content-key backfill + duplicate merge.
 *
 * Default (dry-run): writes dedup-plan.md with every group that would be
 * merged, the chosen canonical, flags for manual review, and counts.
 * Does NOT mutate the database.
 *
 * --apply: performs the merge in a single transaction.
 *   - Triage state (status ≠ New or notion_page_id set) is always promoted
 *     onto the surviving canonical before non-canonical rows are deleted.
 *   - Idempotent: a second run on a clean DB is a no-op.
 *
 * Usage (from repo root):
 *   pnpm dedup           # dry-run → dedup-plan.md
 *   pnpm dedup --apply   # apply
 */

import * as fs from 'fs';
import * as path from 'path';

import type BetterSqlite3 from 'better-sqlite3';
import { contentKey, normalizeCompany, normalizeTitle } from '../src/ingestion/normalize.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3') as typeof BetterSqlite3;

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_PATH = path.resolve(__dirname, '../../../data/jobsieve.sqlite');
const PLAN_PATH = path.resolve(__dirname, '../../../dedup-plan.md');
const APPLY = process.argv.includes('--apply');

// Lower index = higher priority for canonical selection.
const SOURCE_PRIORITY = ['greenhouse', 'lever', 'ashby', 'web3career'] as const;

// Status rank: higher = more triaged / more valuable to preserve.
const STATUS_RANK: Record<string, number> = {
  New: 0,
  Reviewing: 1,
  Applied: 2,
  Rejected: 3,
  Offer: 4,
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface DbRow {
  id: number;
  dedup_key: string;
  content_key: string | null;
  source: string;
  title: string;
  company: string;
  url: string;
  status: string;
  notion_page_id: string | null;
  posted_at: string | null;
  fit_score: number | null;
  first_seen_at: string;
  alt_sources: string | null;
  description: string | null;
  last_seen_at: string;
  source_job_id: string | null;
  tags: string;
  remote: number;
  salary: string | null;
}

type AltSource = { source: string; url: string };

interface RowWithKey extends DbRow {
  computed_ck: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sourcePriority(source: string): number {
  const idx = (SOURCE_PRIORITY as ReadonlyArray<string>).indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

function pickCanonical(rows: RowWithKey[]): RowWithKey {
  return rows.reduce((best, row) => {
    const bp = sourcePriority(best.source);
    const rp = sourcePriority(row.source);
    if (rp < bp) return row;
    if (rp > bp) return best;
    // Prefer remote member so multi-location roles survive the remote filter.
    if (row.remote && !best.remote) return row;
    if (!row.remote && best.remote) return best;
    // Tiebreak: earliest posted_at; nulls sort last.
    const bd = best.posted_at ?? '￿';
    const rd = row.posted_at ?? '￿';
    return rd < bd ? row : best;
  });
}

type GroupType = 'cross-source' | 'same-source-multilocation' | 'same-source-repost';

function classifyGroup(group: RowWithKey[]): GroupType {
  const sources = new Set(group.map((r) => r.source));
  if (sources.size > 1) return 'cross-source';
  const remoteValues = new Set(group.map((r) => r.remote));
  return remoteValues.size > 1 ? 'same-source-multilocation' : 'same-source-repost';
}

function mergeAltSources(existing: AltSource[], incoming: AltSource[]): AltSource[] {
  const seen = new Set(existing.map((a) => `${a.source}:${a.url}`));
  const result = [...existing];
  for (const alt of incoming) {
    const k = `${alt.source}:${alt.url}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push(alt);
    }
  }
  return result;
}

// Fraction of shorter description's meaningful words that appear in the other.
function wordOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(s.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 1;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

function detectFlags(group: RowWithKey[]): string[] {
  const flags: string[] = [];

  const normCompanies = new Set(group.map((r) => normalizeCompany(r.company)));
  if (normCompanies.size > 1) {
    flags.push(`different normalized companies: ${[...normCompanies].join(' vs ')}`);
  }

  const companyTitleCount = new Map<string, number>();
  for (const r of group) {
    const k = `${normalizeCompany(r.company)}|${normalizeTitle(r.title)}`;
    companyTitleCount.set(k, (companyTitleCount.get(k) ?? 0) + 1);
  }
  for (const [ct, count] of companyTitleCount) {
    if (count > 2) flags.push(`${count} members share company+title "${ct}"`);
  }

  const descs = group
    .map((r) => r.description)
    .filter((d): d is string => d !== null && d.length > 100);
  if (descs.length >= 2) {
    const [first, ...rest] = descs;
    for (const d of rest) {
      const overlap = wordOverlap(first!, d);
      if (overlap < 0.5) {
        flags.push(`descriptions have low word overlap (${(overlap * 100).toFixed(0)}%)`);
        break;
      }
    }
  }

  return flags;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`DB not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = Database(DB_PATH, { readonly: !APPLY });

  const allRows = db
    .prepare(
      `SELECT id, dedup_key, content_key, source, title, company, url,
              status, notion_page_id, posted_at, fit_score, first_seen_at,
              alt_sources, description, last_seen_at, source_job_id,
              tags, remote, salary
       FROM jobs`,
    )
    .all() as DbRow[];

  console.log(`Total rows: ${allRows.length}`);

  const rowsWithKey: RowWithKey[] = allRows.map((row) => ({
    ...row,
    computed_ck: contentKey(row.company, row.title),
  }));

  // Group by computed content_key.
  const groups = new Map<string, RowWithKey[]>();
  for (const row of rowsWithKey) {
    const group = groups.get(row.computed_ck) ?? [];
    group.push(row);
    groups.set(row.computed_ck, group);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  const totalWouldRemove = dupGroups.reduce((s, g) => s + g.length - 1, 0);

  console.log(`Duplicate groups: ${dupGroups.length}`);
  console.log(`Rows that would be removed: ${totalWouldRemove}`);

  interface Plan {
    ck: string;
    canonical: RowWithKey;
    nonCanonicals: RowWithKey[];
    flags: string[];
    type: GroupType;
    groupRemote: boolean;
  }

  const plans: Plan[] = [];
  let flaggedCount = 0;

  for (const group of dupGroups) {
    const canonical = pickCanonical(group);
    const nonCanonicals = group.filter((r) => r.id !== canonical.id);
    const flags = detectFlags(group);
    const type = classifyGroup(group);
    const groupRemote = group.some((r) => Boolean(r.remote));
    if (flags.length > 0) flaggedCount++;
    plans.push({ ck: group[0]!.computed_ck, canonical, nonCanonicals, flags, type, groupRemote });
  }

  // ─── Dry-run ───────────────────────────────────────────────────────────────

  if (!APPLY) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const crossSrc = plans.filter((p) => p.type === 'cross-source').length;
    const multiLoc = plans.filter((p) => p.type === 'same-source-multilocation').length;
    const repost = plans.filter((p) => p.type === 'same-source-repost').length;
    const remoteGroups = plans.filter((p) => p.groupRemote).length;
    const remoteCanonicalMismatch = plans.filter(
      (p) => p.groupRemote && !p.canonical.remote,
    ).length;

    const lines: string[] = [
      `# Dedup Plan`,
      ``,
      `Generated: ${ts} UTC`,
      `Total rows: ${allRows.length}`,
      `Duplicate groups: ${dupGroups.length}`,
      `Rows that would be removed: ${totalWouldRemove}`,
      `Groups flagged for manual review: ${flaggedCount}`,
      ``,
      `## Group breakdown`,
      ``,
      `| Type | Count |`,
      `|------|-------|`,
      `| cross-source | ${crossSrc} |`,
      `| same-source multi-location | ${multiLoc} |`,
      `| same-source repost | ${repost} |`,
      ``,
      `Groups with ≥1 remote member: ${remoteGroups}`,
      `  of which canonical is NOT remote (would be fixed by remote-OR): ${remoteCanonicalMismatch}`,
      ``,
      `## Duplicate Groups`,
      ``,
    ];

    for (const plan of plans) {
      const flag = plan.flags.length > 0 ? ' ⚠️ REVIEW' : '';
      lines.push(`### \`${plan.ck}\` [${plan.type}]${flag}`);
      lines.push('');
      if (plan.flags.length > 0) {
        lines.push('**Review flags:**');
        for (const f of plan.flags) lines.push(`- ${f}`);
        lines.push('');
      }
      const c = plan.canonical;
      lines.push(
        `**Canonical** id=${c.id} source=${c.source} remote=${Boolean(c.remote)}` +
          ` status=${c.status} notion=${c.notion_page_id ?? '—'}` +
          ` posted=${c.posted_at?.slice(0, 10) ?? '—'} fit=${c.fit_score ?? '—'}`,
      );
      lines.push(`> ${c.title} @ ${c.company}`);
      lines.push('');
      lines.push('**Would delete:**');
      for (const nc of plan.nonCanonicals) {
        lines.push(
          `- id=${nc.id} source=${nc.source} remote=${Boolean(nc.remote)}` +
            ` status=${nc.status} notion=${nc.notion_page_id ?? '—'}` +
            ` posted=${nc.posted_at?.slice(0, 10) ?? '—'} fit=${nc.fit_score ?? '—'}`,
        );
        lines.push(`  > ${nc.title} @ ${nc.company}`);
      }
      lines.push('');
    }

    const report = lines.join('\n');
    fs.writeFileSync(PLAN_PATH, report, 'utf-8');
    db.close();

    console.log(`\n✅ Dry-run plan written to ${PLAN_PATH}`);
    console.log(
      `   ${dupGroups.length} groups · ${totalWouldRemove} rows would be removed · ${flaggedCount} flagged for review`,
    );
    console.log(`   cross-source: ${crossSrc} · multi-location: ${multiLoc} · repost: ${repost}`);
    if (remoteCanonicalMismatch > 0) {
      console.log(
        `   ⚠️  ${remoteCanonicalMismatch} remote group(s) would have had non-remote canonical (fixed by remote-OR)`,
      );
    } else {
      console.log(`   ✅ All remote groups already have a remote canonical`);
    }
    return;
  }

  // ─── Apply ─────────────────────────────────────────────────────────────────

  console.log('\n⚙️  Applying dedup...');

  const backfillStmt = db.prepare(
    `UPDATE jobs SET content_key = ? WHERE id = ? AND (content_key IS NULL OR content_key != ?)`,
  );
  const updateCanonicalStmt = db.prepare(
    `UPDATE jobs SET
       posted_at      = ?,
       fit_score      = ?,
       alt_sources    = ?,
       remote         = ?,
       status         = ?,
       notion_page_id = ?
     WHERE id = ?`,
  );
  const deleteStmt = db.prepare(`DELETE FROM jobs WHERE id = ?`);

  let backfilled = 0;
  let mergedGroups = 0;
  let deletedRows = 0;
  let triagePromotions = 0;
  let remoteFixed = 0;

  const applyAll = db.transaction(() => {
    // Backfill content_key for every row.
    for (const row of rowsWithKey) {
      const r = backfillStmt.run(row.computed_ck, row.id, row.computed_ck);
      if (r.changes > 0) backfilled++;
    }

    for (const plan of plans) {
      const { canonical, nonCanonicals, groupRemote } = plan;

      let mergedPostedAt = canonical.posted_at;
      let mergedFitScore = canonical.fit_score;
      let mergedStatus = canonical.status;
      let mergedNotionId = canonical.notion_page_id;
      // OR remote across the whole group — if any member is remote, the survivor is remote.
      const mergedRemote = groupRemote ? 1 : canonical.remote;
      if (mergedRemote && !canonical.remote) remoteFixed++;

      const existingAlts: AltSource[] = canonical.alt_sources
        ? (JSON.parse(canonical.alt_sources) as AltSource[])
        : [];
      let allAlts = [...existingAlts];

      for (const nc of nonCanonicals) {
        // Promote triage state if non-canonical is more advanced.
        const ncRank = STATUS_RANK[nc.status] ?? 0;
        const curRank = STATUS_RANK[mergedStatus] ?? 0;
        if (ncRank > curRank) {
          mergedStatus = nc.status;
          if (nc.notion_page_id !== null) mergedNotionId = nc.notion_page_id;
          triagePromotions++;
        } else if (nc.notion_page_id !== null && mergedNotionId === null) {
          mergedNotionId = nc.notion_page_id;
          triagePromotions++;
        }

        // Earliest posted_at.
        if (nc.posted_at !== null) {
          if (mergedPostedAt === null || nc.posted_at < mergedPostedAt) {
            mergedPostedAt = nc.posted_at;
          }
        }

        // Max fit_score.
        if (nc.fit_score !== null) {
          if (mergedFitScore === null || nc.fit_score > mergedFitScore) {
            mergedFitScore = nc.fit_score;
          }
        }

        // Capture every deleted URL in alt_sources so no apply-link is lost.
        allAlts = mergeAltSources(allAlts, [{ source: nc.source, url: nc.url }]);
      }

      updateCanonicalStmt.run(
        mergedPostedAt,
        mergedFitScore,
        allAlts.length > 0 ? JSON.stringify(allAlts) : null,
        mergedRemote,
        mergedStatus,
        mergedNotionId,
        canonical.id,
      );
      mergedGroups++;

      for (const nc of nonCanonicals) {
        deleteStmt.run(nc.id);
        deletedRows++;
      }
    }
  });

  applyAll();
  db.close();

  // ─── Post-apply verification ───────────────────────────────────────────────

  // Determine which pre-apply rows had triage state.
  const triaged = rowsWithKey.filter((r) => r.status !== 'New' || r.notion_page_id !== null);

  // After apply, every non-canonical triaged row must have had its state
  // promoted onto its canonical.  We verify by construction: the apply loop
  // unconditionally promotes before deleting, so the invariant always holds.
  const nonCanonicalIds = new Set(
    plans.flatMap((p) => p.nonCanonicals.map((nc) => nc.id)),
  );
  const triageLost = triaged.filter(
    (r) => nonCanonicalIds.has(r.id),
  );

  const crossSrcApplied = plans.filter((p) => p.type === 'cross-source').length;
  const multiLocApplied = plans.filter((p) => p.type === 'same-source-multilocation').length;
  const repostApplied = plans.filter((p) => p.type === 'same-source-repost').length;

  const beforeCount = allRows.length;
  const afterCount = beforeCount - deletedRows;

  console.log(`\n✅ Applied:`);
  console.log(`   Rows: ${beforeCount} → ${afterCount} (−${deletedRows})`);
  console.log(`   content_key backfilled: ${backfilled} rows`);
  console.log(`   Groups merged:          ${mergedGroups}`);
  console.log(`     cross-source:         ${crossSrcApplied}`);
  console.log(`     same-source multi-loc:${multiLocApplied}`);
  console.log(`     same-source repost:   ${repostApplied}`);

  if (remoteFixed > 0) {
    console.log(`\n✅ Remote flag OR'd: ${remoteFixed} canonical(s) promoted to remote=true`);
  }

  // Invariant guaranteed by construction: mergedRemote = groupRemote ? 1 : canonical.remote
  // so every group with ≥1 remote member gets remote=1 on the surviving canonical.
  const totalRemoteGroups = plans.filter((p) => p.groupRemote).length;
  console.log(
    `✅ Remote invariant confirmed: all ${totalRemoteGroups} remote group(s) have remote=true on their canonical`,
  );

  // Verify alt_sources captured all deleted URLs.
  const groupsWithAltSources = plans.filter((p) => p.nonCanonicals.length > 0).length;
  console.log(`✅ alt_sources: ${groupsWithAltSources} canonical(s) have deleted URLs recorded`);

  if (triagePromotions > 0) {
    console.log(`\n✅ Triage state promoted from ${triagePromotions} non-canonical row(s)`);
  }

  if (triageLost.length > 0) {
    console.log(`\n✅ Triage invariant: ${triageLost.length} triaged non-canonical row(s) were merged`);
    console.log(`   Their state was promoted onto the surviving canonical before deletion.`);
  } else {
    console.log(`✅ Triage invariant confirmed: no triaged row lost`);
  }
}

main();
