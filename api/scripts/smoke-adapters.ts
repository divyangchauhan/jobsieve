/*
 * Dev-only smoke test — runs outside NestJS DI.
 * Usage:
 *   cd api && pnpm smoke
 * (runs: tsc --project tsconfig.scripts.json && node dist-scripts/scripts/smoke-adapters.js)
 *
 * Prints name → count + first job for each adapter.
 * WEB3CAREER_TOKEN must be set in .env for web3career to produce results.
 */
import 'reflect-metadata';

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { ConfigService } from '@nestjs/config';

// .js extensions omitted: this file uses tsconfig.scripts.json (module: commonjs)
// which resolves imports without the nodenext .js requirement.
import { AshbyAdapter } from '../src/adapters/ashby.adapter';
import { GreenhouseAdapter } from '../src/adapters/greenhouse.adapter';
import { HimalayasAdapter } from '../src/adapters/himalayas.adapter';
import { LeverAdapter } from '../src/adapters/lever.adapter';
import { RemoteOKAdapter } from '../src/adapters/remote-ok.adapter';
import { RemotiveAdapter } from '../src/adapters/remotive.adapter';
import { Web3CareerAdapter } from '../src/adapters/web3career.adapter';
import { WwrAdapter } from '../src/adapters/wwr.adapter';
import { NormalizedJob } from '../src/ingestion/normalized-job.interface';
import { SourceAdapter } from '../src/ingestion/source-adapter.interface';

// ConfigService needs process.env; this minimal subclass works outside DI.
class EnvConfigService extends ConfigService {
  constructor() {
    super(process.env as Record<string, unknown>);
  }
}

async function main(): Promise<void> {
  const cfg = new EnvConfigService();

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
