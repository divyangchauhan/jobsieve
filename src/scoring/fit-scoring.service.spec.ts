import { ConfigService } from '@nestjs/config';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { FitScoringService } from './fit-scoring.service.js';

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: 'test',
    title: 'Engineer',
    company: 'Acme',
    url: 'https://example.com/job',
    tags: [],
    remote: false,
    ...overrides,
  };
}

function makeService(stack: string, seniority: string): FitScoringService {
  const config = {
    get: (key: string, def = '') => {
      if (key === 'STACK_KEYWORDS') return stack;
      if (key === 'SENIORITY_KEYWORDS') return seniority;
      return def;
    },
  } as unknown as ConfigService;
  return new FitScoringService(config);
}

describe('FitScoringService', () => {
  describe('score', () => {
    it('returns 0 for a job with no keyword matches', () => {
      const svc = makeService('typescript,nestjs', 'senior,lead');
      expect(svc.score(makeJob({ title: 'Ruby Developer' }))).toBe(0);
    });

    it('adds +2 per matching stack keyword found in title', () => {
      const svc = makeService('typescript,nestjs', '');
      expect(svc.score(makeJob({ title: 'TypeScript NestJS Engineer' }))).toBe(4);
    });

    it('adds +2 for stack keywords found in description', () => {
      const svc = makeService('typescript', '');
      expect(svc.score(makeJob({ description: 'Must know TypeScript well' }))).toBe(2);
    });

    it('adds +3 per matching seniority keyword', () => {
      const svc = makeService('', 'senior,lead');
      expect(svc.score(makeJob({ title: 'Senior Lead Engineer' }))).toBe(6);
    });

    it('adds +2 when remote is true', () => {
      const svc = makeService('', '');
      expect(svc.score(makeJob({ remote: true }))).toBe(2);
    });

    it('combines stack, seniority, and remote scores', () => {
      const svc = makeService('typescript', 'senior');
      const job = makeJob({ title: 'Senior TypeScript Engineer', remote: true });
      // 3 (senior) + 2 (typescript) + 2 (remote)
      expect(svc.score(job)).toBe(7);
    });

    it('is case-insensitive for both keywords and job text', () => {
      const svc = makeService('TYPESCRIPT', 'SENIOR');
      expect(svc.score(makeJob({ title: 'Senior TypeScript Engineer' }))).toBe(5);
    });

    it('does not score a keyword twice if it appears multiple times', () => {
      const svc = makeService('typescript', '');
      expect(svc.score(makeJob({ title: 'TypeScript TypeScript Dev' }))).toBe(2);
    });

    it('returns 0 for empty keyword lists', () => {
      const svc = makeService('', '');
      expect(svc.score(makeJob({ title: 'Senior TypeScript Engineer' }))).toBe(0);
    });
  });
});
