import { createHash } from 'crypto';
import { NormalizedJob } from './normalized-job.interface.js';

export function dedupKey(job: NormalizedJob): string {
  if (job.sourceJobId !== undefined && job.sourceJobId !== '') {
    return `${job.source}:${job.sourceJobId}`;
  }

  const parsed = new URL(job.url);
  const normalizedUrl =
    parsed.host.toLowerCase() + parsed.pathname.replace(/\/+$/, '');

  return createHash('sha1').update(normalizedUrl).digest('hex');
}
