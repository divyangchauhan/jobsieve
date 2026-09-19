import { AshbyAdapter } from '../adapters/ashby.adapter';
import { GreenhouseAdapter } from '../adapters/greenhouse.adapter';
import { LeverAdapter } from '../adapters/lever.adapter';
import { RemoteOKAdapter } from '../adapters/remote-ok.adapter';
import { Web3CareerAdapter } from '../adapters/web3career.adapter';
import { RemotiveAdapter } from '../adapters/remotive.adapter';
import { HimalayasAdapter } from '../adapters/himalayas.adapter';
import { WwrAdapter } from '../adapters/wwr.adapter';
import { COMPANIES } from '../registry/company-registry';
import type { SourceAdapter } from './source-adapter.interface';
const BATCH_SIZE = 10;
export const sourceBatches = [
  ...['remoteok', 'web3career', 'remotive', 'himalayas', 'wwr'],
  ...(['greenhouse', 'lever', 'ashby'] as const).flatMap((ats) =>
    Array.from(
      {
        length: Math.ceil(
          COMPANIES.filter((c) => c.ats === ats).length / BATCH_SIZE,
        ),
      },
      (_, i) => `${ats}:${i * BATCH_SIZE}`,
    ),
  ),
];
export function adapterFor(key: string): SourceAdapter {
  if (!sourceBatches.includes(key)) throw new Error('Unknown source batch');
  const [name, offset] = key.split(':');
  switch (name) {
    case 'greenhouse':
      return new GreenhouseAdapter(Number(offset), BATCH_SIZE);
    case 'lever':
      return new LeverAdapter(Number(offset), BATCH_SIZE);
    case 'ashby':
      return new AshbyAdapter(Number(offset), BATCH_SIZE);
    case 'remoteok':
      return new RemoteOKAdapter();
    case 'web3career':
      return new Web3CareerAdapter();
    case 'remotive':
      return new RemotiveAdapter();
    case 'himalayas':
      return new HimalayasAdapter();
    case 'wwr':
      return new WwrAdapter();
    default:
      throw new Error('Unknown source');
  }
}

export function sourceIntervalSeconds(key: string): number {
  if (key === 'remotive') return 6 * 60 * 60;
  if (['remoteok', 'himalayas', 'wwr'].includes(key)) return 60 * 60;
  if (key === 'web3career') return 15 * 60;
  return 15 * 60;
}
