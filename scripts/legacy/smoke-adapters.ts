/*
 * Dev-only smoke test — runs outside NestJS DI.
 * Usage:
 *   cd api && pnpm smoke             # summary per adapter
 *   cd api && pnpm smoke --per-company   # + per-company breakdown for ATS adapters
 * (runs: tsc --project tsconfig.scripts.json && node dist-scripts/scripts/smoke-adapters.js [--per-company])
 */


import { loadEnvConfig } from '@next/env';
import * as path from 'path';

loadEnvConfig(process.cwd());



import { AshbyAdapter } from '../../lib/adapters/ashby.adapter';
import { GreenhouseAdapter } from '../../lib/adapters/greenhouse.adapter';
import { HimalayasAdapter } from '../../lib/adapters/himalayas.adapter';
import { LeverAdapter } from '../../lib/adapters/lever.adapter';
import { RemoteOKAdapter } from '../../lib/adapters/remote-ok.adapter';
import { RemotiveAdapter } from '../../lib/adapters/remotive.adapter';
import { Web3CareerAdapter } from '../../lib/adapters/web3career.adapter';
import { WwrAdapter } from '../../lib/adapters/wwr.adapter';
import { COMPANIES } from '../../lib/registry/company-registry';
import { NormalizedJob } from '../../lib/ingestion/normalized-job.interface';
import { SourceAdapter } from '../../lib/ingestion/source-adapter.interface';

import axios from 'axios';

const UA = { 'User-Agent': 'jobsieve-smoke/1.0' };
const TIMEOUT = 10_000;



interface CompanyResult {
  name: string;
  slug: string;
  jobs: number | null;
  status: 'ok' | 'empty' | 'not-found' | 'error';
}

async function probeGreenhouse(slug: string): Promise<number | null> {
  try {
    const { data } = await axios.get<{ jobs: unknown[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      { timeout: TIMEOUT, headers: UA },
    );
    return Array.isArray(data.jobs) ? data.jobs.length : null;
  } catch {
    return null;
  }
}

async function probeLever(slug: string): Promise<number | null> {
  try {
    const { data } = await axios.get<unknown>(
      `https://api.lever.co/v0/postings/${slug}`,
      { timeout: TIMEOUT, params: { mode: 'json' }, headers: UA },
    );
    return Array.isArray(data) ? (data as unknown[]).length : null;
  } catch {
    return null;
  }
}

async function probeAshby(slug: string): Promise<number | null> {
  try {
    const { data } = await axios.get<{ jobs: unknown[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
      { timeout: TIMEOUT, headers: UA },
    );
    return Array.isArray(data.jobs) ? data.jobs.length : null;
  } catch {
    return null;
  }
}

async function runPerCompany(): Promise<void> {
  const atsMap = {
    greenhouse: probeGreenhouse,
    lever: probeLever,
    ashby: probeAshby,
  } as const;

  for (const atsName of ['greenhouse', 'lever', 'ashby'] as const) {
    const companies = COMPANIES.filter((c) => c.ats === atsName);
    const fn = atsMap[atsName];
    const results: CompanyResult[] = [];

    process.stdout.write(`\n▶ ${atsName} (${companies.length} companies)\n`);

    for (const company of companies) {
      const count = await fn(company.slug);
      let status: CompanyResult['status'];
      if (count === null) status = 'not-found';
      else if (count === 0) status = 'empty';
      else status = 'ok';
      results.push({ name: company.name, slug: company.slug, jobs: count, status });
      const icon = status === 'ok' ? '✅' : status === 'empty' ? '○' : '❌';
      console.log(`  ${icon} ${company.name.padEnd(36)} ${company.slug.padEnd(24)} ${count ?? 'n/a'} jobs`);
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const empty = results.filter((r) => r.status === 'empty').length;
    const notFound = results.filter((r) => r.status === 'not-found').length;
    console.log(`\n  Summary: ${ok} with jobs | ${empty} empty boards | ${notFound} not-found`);
  }
}

async function main(): Promise<void> {
  const perCompany = process.argv.includes('--per-company');


  if (perCompany) {
    console.log('Per-company ATS probe:\n');
    await runPerCompany();
    console.log('\n');
  }

  const adapters: SourceAdapter[] = [
    new RemoteOKAdapter(),
    new Web3CareerAdapter(),
    new GreenhouseAdapter(0, Number.MAX_SAFE_INTEGER),
    new LeverAdapter(0, Number.MAX_SAFE_INTEGER),
    new AshbyAdapter(0, Number.MAX_SAFE_INTEGER),
    new RemotiveAdapter(),
    new HimalayasAdapter(),
    new WwrAdapter(),
  ];

  console.log(`\nAdapter smoke test (${perCompany ? 'post-probe totals' : 'full fetch'}):`);

  for (const adapter of adapters) {
    process.stdout.write(`\n▶ ${adapter.name} … `);
    const start = Date.now();
    try {
      const jobs: NormalizedJob[] = await adapter.fetchJobs();
      const elapsed = Date.now() - start;
      console.log(`${jobs.length} jobs (${elapsed}ms)`);
      const first = jobs[0];
      if (first !== undefined) {
        const preview = {
          title: first.title,
          company: first.company,
          remote: first.remote,
          url: first.url.slice(0, 80),
          tags: first.tags.slice(0, 4),
          ...(first.salary !== undefined ? { salary: first.salary } : {}),
          ...(first.postedAt !== undefined ? { postedAt: first.postedAt.toISOString().slice(0, 10) } : {}),
        };
        console.log('  →', JSON.stringify(preview));
      }
    } catch (err) {
      console.error(`THREW: ${String(err)}`);
    }
  }
  console.log('\ndone.');
}

main().catch((err: unknown) => {
  console.error('smoke-adapters fatal:', err);
  process.exitCode = 1;
});
