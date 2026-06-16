/*
 * Dev-only smoke test — runs outside NestJS DI.
 * Usage:
 *   cd api && pnpm smoke             # summary per adapter
 *   cd api && pnpm smoke --per-company   # + per-company breakdown for ATS adapters
 * (runs: tsc --project tsconfig.scripts.json && node dist-scripts/scripts/smoke-adapters.js [--per-company])
 */
import 'reflect-metadata';

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { ConfigService } from '@nestjs/config';

import { AshbyAdapter } from '../src/adapters/ashby.adapter';
import { GreenhouseAdapter } from '../src/adapters/greenhouse.adapter';
import { HimalayasAdapter } from '../src/adapters/himalayas.adapter';
import { LeverAdapter } from '../src/adapters/lever.adapter';
import { RemoteOKAdapter } from '../src/adapters/remote-ok.adapter';
import { RemotiveAdapter } from '../src/adapters/remotive.adapter';
import { Web3CareerAdapter } from '../src/adapters/web3career.adapter';
import { WwrAdapter } from '../src/adapters/wwr.adapter';
import { COMPANIES } from '../src/registry/company-registry';
import { NormalizedJob } from '../src/ingestion/normalized-job.interface';
import { SourceAdapter } from '../src/ingestion/source-adapter.interface';

import axios from 'axios';

const UA = { 'User-Agent': 'jobsieve-smoke/1.0' };
const TIMEOUT = 10_000;

class EnvConfigService extends ConfigService {
  constructor() {
    super(process.env as Record<string, unknown>);
  }
}

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
  const cfg = new EnvConfigService();

  if (perCompany) {
    console.log('Per-company ATS probe:\n');
    await runPerCompany();
    console.log('\n');
  }

  const adapters: SourceAdapter[] = [
    new RemoteOKAdapter(),
    new Web3CareerAdapter(cfg),
    new GreenhouseAdapter(),
    new LeverAdapter(),
    new AshbyAdapter(),
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
