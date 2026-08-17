import axios from 'axios';

import {
  CompanyCareersAdapter,
  normalizeBambooJob,
  normalizeSmartRecruitersJob,
  normalizeWorkdayJob,
  normalizeWorkableJob,
  parseTeamtailorJobs,
} from './company-careers.adapter.js';
import { parseWorkdayBoardUrl } from '../registry/ai-company-import-policy.js';
import type { OtherAiCompanyBoard } from '../registry/ai-company-other-boards.generated.js';

const workableBoard = {
  company: 'AI Acquisition',
  provider: 'workable',
  slug: 'ai-acquisition',
  url: 'https://apply.workable.com/ai-acquisition',
} as const;

describe('CompanyCareersAdapter helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes a Workable job', () => {
    expect(
      normalizeWorkableJob(
        {
          title: 'Senior Backend Engineer',
          shortcode: 'ABC123',
          url: 'https://apply.workable.com/j/ABC123',
          telecommuting: true,
          department: 'Engineering',
          published_on: '2026-08-07',
        },
        workableBoard,
      ),
    ).toMatchObject({
      source: 'companycareers',
      sourceJobId: 'workable:ai-acquisition:ABC123',
      title: 'Senior Backend Engineer',
      company: 'AI Acquisition',
      remote: true,
    });
  });

  it('normalizes a BambooHR job', () => {
    expect(
      normalizeBambooJob(
        {
          id: '90',
          jobOpeningName: 'Senior Java Backend Engineer',
          departmentLabel: 'Engineering',
          locationType: '2',
          location: { city: 'Sofia', state: 'Sofia' },
        },
        {
          company: 'Graphwise',
          provider: 'bamboohr',
          slug: 'graphwise',
          url: 'https://graphwise.bamboohr.com/careers',
        },
      ),
    ).toMatchObject({
      sourceJobId: 'bamboohr:graphwise:90',
      company: 'Graphwise',
      remote: false,
    });
  });

  it('parses Teamtailor job cards', () => {
    const board = {
      company: 'Hyperion Robotics',
      provider: 'teamtailor',
      slug: 'hyperionrobotics',
      url: 'https://hyperionrobotics.teamtailor.com/',
    } as const;
    const html = `
      <a href="https://hyperionrobotics.teamtailor.com/jobs/7825247-lead-automation-engineer">
        <span title="(Lead) Automation Engineer">(Lead) Automation Engineer</span>
        <div>Product and R&amp;D · Espoo · Hybrid</div>
      </a>`;

    expect(parseTeamtailorJobs(html, board)).toEqual([
      expect.objectContaining({
        sourceJobId: 'teamtailor:hyperionrobotics:7825247',
        title: '(Lead) Automation Engineer',
        company: 'Hyperion Robotics',
      }),
    ]);
  });

  it('keeps a stable Teamtailor ID when the title slug changes', () => {
    const board = {
      company: 'Hyperion Robotics',
      provider: 'teamtailor',
      slug: 'hyperionrobotics',
      url: 'https://hyperionrobotics.teamtailor.com/',
    } as const;
    const parse = (path: string, title: string): string | undefined =>
      parseTeamtailorJobs(
        `<a href="https://hyperionrobotics.teamtailor.com/jobs/${path}"><span title="${title}">${title}</span></a>`,
        board,
      )[0]?.sourceJobId;

    expect(parse('7825247-lead-automation-engineer', 'Lead AI Engineer')).toBe(
      parse('7825247-principal-automation-engineer', 'Principal AI Engineer'),
    );
  });

  it('normalizes SmartRecruiters jobs to candidate-facing URLs', () => {
    expect(
      normalizeSmartRecruitersJob(
        {
          id: '12345',
          name: 'Senior AI Engineer',
          postingUrl:
            'https://jobs.smartrecruiters.com/ExampleAI/12345-senior-ai-engineer',
          location: { remote: true, fullLocation: 'Remote' },
        },
        {
          company: 'Example AI',
          provider: 'smartrecruiters',
          slug: 'ExampleAI',
          url: 'https://careers.smartrecruiters.com/ExampleAI',
        },
      ),
    ).toMatchObject({
      sourceJobId: 'smartrecruiters:ExampleAI:12345',
      url: 'https://jobs.smartrecruiters.com/ExampleAI/12345-senior-ai-engineer',
      remote: true,
    });
  });

  it('uses the unique Workday path instead of a shared display field for IDs', () => {
    const board = {
      company: 'Example AI',
      provider: 'workday',
      slug: 'example.wd5.myworkdayjobs.com',
      url: 'https://example.wd5.myworkdayjobs.com/Example',
    } as const;
    const first = normalizeWorkdayJob(
      {
        title: 'AI Engineer',
        externalPath: '/job/ai-engineer-1',
        bulletFields: ['Engineering'],
      },
      board,
      board.url,
    );
    const second = normalizeWorkdayJob(
      {
        title: 'AI Engineer',
        externalPath: '/job/ai-engineer-2',
        bulletFields: ['Engineering'],
      },
      board,
      board.url,
    );

    expect(first?.sourceJobId).toBe(
      'workday:example.wd5.myworkdayjobs.com:/job/ai-engineer-1',
    );
    expect(second?.sourceJobId).not.toBe(first?.sourceJobId);
  });

  it('parses localized Workday board URLs without treating the locale as the site', () => {
    expect(
      parseWorkdayBoardUrl(
        'https://tenant.wd5.myworkdayjobs.com/en-US/Careers',
      ),
    ).toEqual({
      endpoint:
        'https://tenant.wd5.myworkdayjobs.com/wday/cxs/tenant/Careers/jobs',
      baseUrl: 'https://tenant.wd5.myworkdayjobs.com/en-US/Careers',
    });
  });

  it('isolates rejected provider requests to their board', async () => {
    jest.spyOn(axios, 'get').mockRejectedValueOnce(new Error('timeout'));
    const adapter = new CompanyCareersAdapter() as unknown as {
      fetchBoard(board: OtherAiCompanyBoard): Promise<unknown[]>;
    };

    await expect(adapter.fetchBoard(workableBoard)).resolves.toEqual([]);
  });

  it('fetches every SmartRecruiters result page', async () => {
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({
        data: {
          offset: 0,
          limit: 1,
          totalFound: 2,
          content: [{ id: '1', name: 'Backend Engineer' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          offset: 1,
          limit: 1,
          totalFound: 2,
          content: [{ id: '2', name: 'Frontend Engineer' }],
        },
      });
    const board = {
      company: 'Example AI',
      provider: 'smartrecruiters',
      slug: 'ExampleAI',
      url: 'https://careers.smartrecruiters.com/ExampleAI',
    } as const;
    const adapter = new CompanyCareersAdapter() as unknown as {
      fetchSmartRecruiters(
        value: OtherAiCompanyBoard,
      ): Promise<ReadonlyArray<{ sourceJobId: string; url: string }>>;
    };

    await expect(adapter.fetchSmartRecruiters(board)).resolves.toEqual([
      expect.objectContaining({
        sourceJobId: 'smartrecruiters:ExampleAI:1',
        url: 'https://jobs.smartrecruiters.com/ExampleAI/1-backend-engineer',
      }),
      expect.objectContaining({
        sourceJobId: 'smartrecruiters:ExampleAI:2',
        url: 'https://jobs.smartrecruiters.com/ExampleAI/2-frontend-engineer',
      }),
    ]);
    expect(get).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ params: { limit: 100, offset: 0 } }),
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ params: { limit: 100, offset: 1 } }),
    );
  });

  it('stops SmartRecruiters pagination when the response offset does not advance', async () => {
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({
        data: {
          offset: 0,
          limit: 100,
          totalFound: 300,
          content: [{ id: '1', name: 'Backend Engineer' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          offset: 0,
          limit: 100,
          totalFound: 300,
          content: [{ id: '1', name: 'Backend Engineer' }],
        },
      });
    const board = {
      company: 'Example AI',
      provider: 'smartrecruiters',
      slug: 'ExampleAI',
      url: 'https://careers.smartrecruiters.com/ExampleAI',
    } as const;
    const adapter = new CompanyCareersAdapter() as unknown as {
      fetchSmartRecruiters(value: OtherAiCompanyBoard): Promise<unknown[]>;
    };

    await expect(adapter.fetchSmartRecruiters(board)).resolves.toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('caps SmartRecruiters pagination when the reported total is unreasonable', async () => {
    const get = jest.spyOn(axios, 'get').mockImplementation((_url, config) => {
      const offset = (config as { params: { offset: number } }).params.offset;
      return Promise.resolve({
        data: {
          offset,
          limit: 100,
          totalFound: 1_000_000,
          content: [{ id: String(offset), name: 'AI Engineer' }],
        },
      });
    });
    const board = {
      company: 'Example AI',
      provider: 'smartrecruiters',
      slug: 'ExampleAI',
      url: 'https://careers.smartrecruiters.com/ExampleAI',
    } as const;
    const adapter = new CompanyCareersAdapter() as unknown as {
      fetchSmartRecruiters(value: OtherAiCompanyBoard): Promise<unknown[]>;
    };

    await expect(adapter.fetchSmartRecruiters(board)).resolves.toHaveLength(
      100,
    );
    expect(get).toHaveBeenCalledTimes(100);
  });

  it('stops Workday pagination when a page makes no progress', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { total: 1_000_000, jobPostings: [] },
    });
    const board = {
      company: 'Example AI',
      provider: 'workday',
      slug: 'example.wd5.myworkdayjobs.com',
      url: 'https://example.wd5.myworkdayjobs.com/Example',
    } as const;
    const adapter = new CompanyCareersAdapter() as unknown as {
      fetchWorkday(value: OtherAiCompanyBoard): Promise<unknown[]>;
    };

    await expect(adapter.fetchWorkday(board)).resolves.toEqual([]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('stops and deduplicates Workday pagination when a page repeats', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        total: 1_000_000,
        jobPostings: [{ title: 'AI Engineer', externalPath: '/job/1' }],
      },
    });
    const board = {
      company: 'Example AI',
      provider: 'workday',
      slug: 'example.wd5.myworkdayjobs.com',
      url: 'https://example.wd5.myworkdayjobs.com/Example',
    } as const;
    const adapter = new CompanyCareersAdapter() as unknown as {
      fetchWorkday(value: OtherAiCompanyBoard): Promise<unknown[]>;
    };

    await expect(adapter.fetchWorkday(board)).resolves.toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('caps Workday pagination when every page is unique', async () => {
    const post = jest.spyOn(axios, 'post').mockImplementation((_url, body) => {
      const offset = (body as { offset: number }).offset;
      return Promise.resolve({
        data: {
          total: 1_000_000,
          jobPostings: [
            { title: 'AI Engineer', externalPath: `/job/${offset}` },
          ],
        },
      });
    });
    const board = {
      company: 'Example AI',
      provider: 'workday',
      slug: 'example.wd5.myworkdayjobs.com',
      url: 'https://example.wd5.myworkdayjobs.com/Example',
    } as const;
    const adapter = new CompanyCareersAdapter() as unknown as {
      fetchWorkday(value: OtherAiCompanyBoard): Promise<unknown[]>;
    };

    await expect(adapter.fetchWorkday(board)).resolves.toHaveLength(100);
    expect(post).toHaveBeenCalledTimes(100);
  });
});
