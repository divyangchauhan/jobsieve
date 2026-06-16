import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { FitScoringService, ScoringProfile } from './fit-scoring.service.js';

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

function makeProfile(overrides: Partial<ScoringProfile> = {}): ScoringProfile {
  return {
    roleFamilies: ['Backend'],
    seniorities: ['Senior', 'Staff', 'Lead'],
    stack: ['Rust', 'TypeScript', 'Go'],
    locationTypes: ['remote'],
    ...overrides,
  };
}

describe('FitScoringService', () => {
  const svc = new FitScoringService();

  describe('role family gate', () => {
    it('scores ~0 for "Senior Talent Partner, Engineering" (no role match)', () => {
      const job = makeJob({ title: 'Senior Talent Partner, Engineering' });
      expect(svc.score(job, makeProfile())).toBe(0);
    });

    it('scores ~0 for "Sales Development Representative @ LangChain"', () => {
      const job = makeJob({
        title: 'Sales Development Representative @ LangChain',
      });
      expect(svc.score(job, makeProfile())).toBe(0);
    });

    it('seniority alone does not count without a role match', () => {
      const job = makeJob({ title: 'Senior Sales Manager' });
      expect(svc.score(job, makeProfile())).toBe(0);
    });

    it('gives less for a description-only role match than a title match', () => {
      const titleMatch = svc.score(
        makeJob({ title: 'Backend Engineer' }),
        makeProfile({ seniorities: [], stack: [] }),
      );
      const descMatch = svc.score(
        makeJob({ title: 'Engineer', description: 'Backend role' }),
        makeProfile({ seniorities: [], stack: [] }),
      );
      expect(titleMatch).toBeGreaterThan(descMatch);
      expect(descMatch).toBeGreaterThan(0);
    });
  });

  describe('relevant roles', () => {
    it('scores "Senior Backend Engineer (Rust)" high', () => {
      const job = makeJob({
        title: 'Senior Backend Engineer (Rust)',
        remote: true,
      });
      // role title 5 + seniority title 3 + stack(rust) 2 + remote 1
      expect(svc.score(job, makeProfile())).toBe(11);
    });

    it('scores plain "Backend Engineer" (no seniority) moderate', () => {
      const job = makeJob({ title: 'Backend Engineer' });
      // role title 5, no seniority, no stack, not remote
      expect(svc.score(job, makeProfile())).toBe(5);
    });
  });

  describe('word-boundary matching', () => {
    it('does not match "Go" inside "Golang"', () => {
      const job = makeJob({ title: 'Golang Developer' });
      expect(svc.score(job, makeProfile({ roleFamilies: [] }))).toBe(0);
    });

    it('matches "Go" as a standalone word', () => {
      const job = makeJob({ title: 'Go Developer' });
      expect(svc.score(job, makeProfile({ roleFamilies: [] }))).toBe(2);
    });
  });

  describe('expanded taxonomy — multi-word phrases', () => {
    it('matches "Distributed Systems Engineer" under Backend', () => {
      const job = makeJob({ title: 'Distributed Systems Engineer' });
      expect(
        svc.score(job, makeProfile({ roleFamilies: ['Backend'] })),
      ).toBeGreaterThan(0);
    });

    it('matches "Site Reliability Engineer" under DevOps/SRE/Platform', () => {
      const job = makeJob({ title: 'Site Reliability Engineer' });
      expect(
        svc.score(job, makeProfile({ roleFamilies: ['DevOps/SRE/Platform'] })),
      ).toBeGreaterThan(0);
    });

    it('matches "Smart Contract Engineer (Solidity)" under Backend (web3 folded in)', () => {
      const job = makeJob({ title: 'Smart Contract Engineer (Solidity)' });
      expect(
        svc.score(job, makeProfile({ roleFamilies: ['Backend'] })),
      ).toBeGreaterThan(0);
    });

    it('matches "Smart Contract Auditor" under Security', () => {
      const job = makeJob({ title: 'Smart Contract Auditor' });
      expect(
        svc.score(job, makeProfile({ roleFamilies: ['Security'] })),
      ).toBeGreaterThan(0);
    });
  });

  describe('expanded taxonomy — short tokens match as whole words', () => {
    const cases: ReadonlyArray<{
      token: string;
      family: string;
      matching: string;
      nonMatching: string;
    }> = [
      {
        token: 'evm',
        family: 'Backend',
        matching: 'EVM Engineer',
        nonMatching: 'Devmode Engineer',
      },
      {
        token: 'sre',
        family: 'DevOps/SRE/Platform',
        matching: 'SRE Engineer',
        nonMatching: 'Software Sreliability Engineer',
      },
      {
        token: 'appsec',
        family: 'Security',
        matching: 'AppSec Engineer',
        nonMatching: 'Appseconds Engineer',
      },
      {
        token: 'etl',
        family: 'Data Engineering',
        matching: 'ETL Engineer',
        nonMatching: 'Metlife Engineer',
      },
      {
        token: 'sdet',
        family: 'QA',
        matching: 'SDET Engineer',
        nonMatching: 'Sdetective Engineer',
      },
    ];

    for (const { token, family, matching, nonMatching } of cases) {
      it(`matches "${token}" as a whole word but not as a substring`, () => {
        const profile = makeProfile({
          roleFamilies: [family],
          seniorities: [],
          stack: [],
        });
        expect(
          svc.score(makeJob({ title: matching }), profile),
        ).toBeGreaterThan(0);
        expect(svc.score(makeJob({ title: nonMatching }), profile)).toBe(0);
      });
    }
  });

  describe('graceful degradation', () => {
    it('with no role families, ranks by stack instead of hiding everything', () => {
      const job = makeJob({ title: 'Rust Engineer' });
      expect(svc.score(job, makeProfile({ roleFamilies: [] }))).toBe(2);
    });
  });

  describe('location boost', () => {
    it('adds a small boost when remote matches the profile', () => {
      const withRemote = svc.score(
        makeJob({ title: 'Backend Engineer', remote: true }),
        makeProfile({ seniorities: [], stack: [] }),
      );
      const withoutRemote = svc.score(
        makeJob({ title: 'Backend Engineer', remote: false }),
        makeProfile({ seniorities: [], stack: [] }),
      );
      expect(withRemote - withoutRemote).toBe(1);
    });

    it('no boost when remote not in profile location types', () => {
      const job = makeJob({ title: 'Backend Engineer', remote: true });
      const score = svc.score(
        job,
        makeProfile({ seniorities: [], stack: [], locationTypes: ['onsite'] }),
      );
      expect(score).toBe(5);
    });
  });
});
