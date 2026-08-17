/* Polls AI-company boards discovered on providers outside Greenhouse/Lever/Ashby. */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';
import {
  AI_COMPANY_OTHER_BOARDS,
  type OtherAiCompanyBoard,
} from '../registry/ai-company-other-boards.generated.js';
import { parseWorkdayBoardUrl } from '../registry/ai-company-import-policy.js';
import { runBatched } from './concurrency.js';
import { passesTitleFilter } from './title-filter.js';

const TIMEOUT_MS = 15_000;
const CONCURRENCY = 5;
const USER_AGENT = 'jobsieve/1.0';
const WORKDAY_PAGE_SIZE = 20;
const WORKDAY_MAX_PAGES = 100;
const SMARTRECRUITERS_PAGE_SIZE = 100;
const SMARTRECRUITERS_MAX_PAGES = 100;

interface WorkableJob {
  readonly title?: string;
  readonly shortcode?: string;
  readonly employment_type?: string;
  readonly telecommuting?: boolean;
  readonly department?: string;
  readonly url?: string;
  readonly published_on?: string;
  readonly country?: string;
  readonly city?: string;
  readonly state?: string;
  readonly experience?: string;
  readonly function?: string;
}

interface RecruiteeOffer {
  readonly id?: number;
  readonly title?: string;
  readonly careers_url?: string;
  readonly location?: string;
  readonly remote?: boolean;
  readonly hybrid?: boolean;
  readonly published_at?: string;
  readonly employment_type_code?: string;
  readonly category_code?: string;
  readonly department?: string | null;
  readonly tags?: readonly string[];
  readonly description?: string;
  readonly requirements?: string;
}

interface BambooJob {
  readonly id?: string;
  readonly jobOpeningName?: string;
  readonly departmentLabel?: string | null;
  readonly employmentStatusLabel?: string | null;
  readonly isRemote?: boolean | null;
  readonly locationType?: string | null;
  readonly location?: {
    readonly city?: string | null;
    readonly state?: string | null;
  };
  readonly atsLocation?: {
    readonly country?: string | null;
    readonly state?: string | null;
    readonly province?: string | null;
    readonly city?: string | null;
  };
}

interface WorkdayPosting {
  readonly title?: string;
  readonly externalPath?: string;
  readonly locationsText?: string;
  readonly bulletFields?: readonly string[];
}

interface WorkdayResponse {
  readonly total?: number;
  readonly jobPostings?: readonly WorkdayPosting[];
}

interface SmartRecruitersPosting {
  readonly id?: string;
  readonly name?: string;
  readonly releasedDate?: string;
  readonly postingUrl?: string;
  readonly location?: {
    readonly remote?: boolean;
    readonly fullLocation?: string;
  };
}

interface SmartRecruitersResponse {
  readonly content?: readonly SmartRecruitersPosting[];
  readonly limit?: number;
  readonly offset?: number;
  readonly totalFound?: number;
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&middot;/gi, '·')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateOrUndefined(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function compactTags(values: readonly (string | null | undefined)[]): string[] {
  return values.filter(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );
}

export function normalizeWorkableJob(
  job: WorkableJob,
  board: OtherAiCompanyBoard,
): NormalizedJob | null {
  if (!job.title || !job.shortcode || !job.url) return null;
  if (!passesTitleFilter(job.title)) return null;
  const postedAt = dateOrUndefined(job.published_on);
  return {
    source: 'companycareers',
    sourceJobId: `workable:${board.slug}:${job.shortcode}`,
    title: job.title,
    company: board.company,
    url: job.url,
    ...(postedAt ? { postedAt } : {}),
    tags: compactTags([
      job.department,
      job.function,
      job.employment_type,
      job.experience,
      job.city,
      job.state,
      job.country,
    ]),
    remote: job.telecommuting === true,
  };
}

export function normalizeRecruiteeOffer(
  offer: RecruiteeOffer,
  board: OtherAiCompanyBoard,
): NormalizedJob | null {
  if (offer.id === undefined || !offer.title || !offer.careers_url) return null;
  if (!passesTitleFilter(offer.title)) return null;
  const postedAt = dateOrUndefined(offer.published_at);
  const description = cleanText(
    `${offer.description ?? ''} ${offer.requirements ?? ''}`,
  );
  return {
    source: 'companycareers',
    sourceJobId: `recruitee:${board.slug}:${String(offer.id)}`,
    title: offer.title,
    company: board.company,
    url: offer.careers_url,
    ...(postedAt ? { postedAt } : {}),
    tags: compactTags([
      offer.department,
      offer.category_code,
      offer.employment_type_code,
      ...(offer.tags ?? []),
      offer.location,
      offer.hybrid ? 'hybrid' : undefined,
    ]),
    remote: offer.remote === true || /\bremote\b/i.test(offer.location ?? ''),
    ...(description ? { description } : {}),
  };
}

export function normalizeBambooJob(
  job: BambooJob,
  board: OtherAiCompanyBoard,
): NormalizedJob | null {
  if (!job.id || !job.jobOpeningName) return null;
  if (!passesTitleFilter(job.jobOpeningName)) return null;
  const location = compactTags([
    job.location?.city,
    job.location?.state,
    job.atsLocation?.city,
    job.atsLocation?.state,
    job.atsLocation?.province,
    job.atsLocation?.country,
  ]).join(', ');
  return {
    source: 'companycareers',
    sourceJobId: `bamboohr:${board.slug}:${job.id}`,
    title: job.jobOpeningName.trim(),
    company: board.company,
    url: `https://${board.slug}.bamboohr.com/careers/${job.id}`,
    tags: compactTags([
      job.departmentLabel,
      job.employmentStatusLabel,
      location,
    ]),
    remote:
      job.isRemote === true ||
      job.locationType === '1' ||
      /\bremote\b/i.test(location),
  };
}

export function normalizeSmartRecruitersJob(
  job: SmartRecruitersPosting,
  board: OtherAiCompanyBoard,
): NormalizedJob | null {
  if (!job.id || !job.name || !passesTitleFilter(job.name)) return null;
  const postedAt = dateOrUndefined(job.releasedDate);
  const titleSlug = job.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return {
    source: 'companycareers',
    sourceJobId: `smartrecruiters:${board.slug}:${job.id}`,
    title: job.name,
    company: board.company,
    url:
      job.postingUrl ??
      `https://jobs.smartrecruiters.com/${encodeURIComponent(board.slug)}/${encodeURIComponent(job.id)}-${titleSlug}`,
    ...(postedAt ? { postedAt } : {}),
    tags: compactTags([job.location?.fullLocation]),
    remote: job.location?.remote === true,
  };
}

export function normalizeWorkdayJob(
  job: WorkdayPosting,
  board: OtherAiCompanyBoard,
  baseUrl: string,
): NormalizedJob | null {
  if (!job.title || !job.externalPath) return null;
  if (!passesTitleFilter(job.title)) return null;
  return {
    source: 'companycareers',
    sourceJobId: `workday:${board.slug}:${job.externalPath}`,
    title: job.title,
    company: board.company,
    url: `${baseUrl}${job.externalPath}`,
    tags: compactTags([job.locationsText]),
    remote: /\bremote\b/i.test(job.locationsText ?? ''),
  };
}

export function parseTeamtailorJobs(
  html: string,
  board: OtherAiCompanyBoard,
): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
  const escapedSlug = board.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cardPattern = new RegExp(
    `<a[^>]+href="(https://${escapedSlug}\\.teamtailor\\.com/jobs/([^"?#]+))"[^>]*>([\\s\\S]*?)<\\/a>`,
    'gi',
  );
  for (const match of html.matchAll(cardPattern)) {
    const url = match[1];
    const sourceId = match[2];
    const body = match[3];
    if (!url || !sourceId || !body) continue;
    const title = /\btitle="([^"]+)"/i.exec(body)?.[1];
    if (!title || !passesTitleFilter(title)) continue;
    const text = cleanText(body);
    const stableId = /^(\d+)(?:-|$)/.exec(sourceId)?.[1] ?? sourceId;
    jobs.push({
      source: 'companycareers',
      sourceJobId: `teamtailor:${board.slug}:${stableId}`,
      title: cleanText(title),
      company: board.company,
      url,
      tags: text ? [text] : [],
      remote: /\b(remote|anywhere|worldwide)\b/i.test(text),
    });
  }
  return jobs;
}

@Injectable()
export class CompanyCareersAdapter implements SourceAdapter {
  readonly name = 'companycareers';
  private readonly logger = new Logger(CompanyCareersAdapter.name);

  async fetchJobs(): Promise<NormalizedJob[]> {
    const tasks = AI_COMPANY_OTHER_BOARDS.map(
      (board) => async (): Promise<NormalizedJob[]> => this.fetchBoard(board),
    );
    const jobs = (await runBatched(tasks, CONCURRENCY)).flat();
    this.logger.log(
      `companycareers fetched ${jobs.length} jobs from ${AI_COMPANY_OTHER_BOARDS.length} AI company boards`,
    );
    return jobs;
  }

  private async fetchBoard(
    board: OtherAiCompanyBoard,
  ): Promise<NormalizedJob[]> {
    try {
      switch (board.provider) {
        case 'workable':
          return await this.fetchWorkable(board);
        case 'recruitee':
          return await this.fetchRecruitee(board);
        case 'bamboohr':
          return await this.fetchBamboo(board);
        case 'teamtailor':
          return await this.fetchTeamtailor(board);
        case 'workday':
          return await this.fetchWorkday(board);
        case 'smartrecruiters':
          return await this.fetchSmartRecruiters(board);
      }
    } catch (error) {
      this.logger.warn(
        `${board.provider}/${board.slug} fetch failed: ${String(error)}`,
      );
      return [];
    }
  }

  private async fetchWorkable(
    board: OtherAiCompanyBoard,
  ): Promise<NormalizedJob[]> {
    const { data } = await axios.get<{
      readonly jobs?: readonly WorkableJob[];
    }>(`https://apply.workable.com/api/v1/widget/accounts/${board.slug}`, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    });
    return (data.jobs ?? []).flatMap((job) => {
      const normalized = normalizeWorkableJob(job, board);
      return normalized === null ? [] : [normalized];
    });
  }

  private async fetchRecruitee(
    board: OtherAiCompanyBoard,
  ): Promise<NormalizedJob[]> {
    const { data } = await axios.get<{
      readonly offers?: readonly RecruiteeOffer[];
    }>(`https://${board.slug}.recruitee.com/api/offers/`, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    });
    return (data.offers ?? []).flatMap((offer) => {
      const normalized = normalizeRecruiteeOffer(offer, board);
      return normalized === null ? [] : [normalized];
    });
  }

  private async fetchBamboo(
    board: OtherAiCompanyBoard,
  ): Promise<NormalizedJob[]> {
    const { data } = await axios.get<{
      readonly result?: readonly BambooJob[];
    }>(`https://${board.slug}.bamboohr.com/careers/list`, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    });
    return (data.result ?? []).flatMap((job) => {
      const normalized = normalizeBambooJob(job, board);
      return normalized === null ? [] : [normalized];
    });
  }

  private async fetchTeamtailor(
    board: OtherAiCompanyBoard,
  ): Promise<NormalizedJob[]> {
    const { data } = await axios.get<string>(
      `https://${board.slug}.teamtailor.com/jobs`,
      {
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      },
    );
    return parseTeamtailorJobs(data, board);
  }

  private async fetchWorkday(
    board: OtherAiCompanyBoard,
  ): Promise<NormalizedJob[]> {
    const parsed = parseWorkdayBoardUrl(board.url);
    if (parsed === null) return [];
    const jobs: WorkdayPosting[] = [];
    const seenPaths = new Set<string>();
    let offset = 0;
    let total = 1;
    let pages = 0;
    while (offset < total && pages < WORKDAY_MAX_PAGES) {
      const { data } = await axios.post<WorkdayResponse>(
        parsed.endpoint,
        {
          appliedFacets: {},
          limit: WORKDAY_PAGE_SIZE,
          offset,
          searchText: '',
        },
        {
          timeout: TIMEOUT_MS,
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/json',
          },
        },
      );
      const page = data.jobPostings ?? [];
      if (page.length === 0) break;
      const unseen = page.filter((job) => {
        if (!job.externalPath || seenPaths.has(job.externalPath)) return false;
        seenPaths.add(job.externalPath);
        return true;
      });
      if (unseen.length === 0) break;
      jobs.push(...unseen);
      pages += 1;
      total =
        Number.isSafeInteger(data.total) && (data.total ?? -1) >= 0
          ? Math.min(data.total ?? 0, WORKDAY_PAGE_SIZE * WORKDAY_MAX_PAGES)
          : offset + page.length;
      offset += WORKDAY_PAGE_SIZE;
    }
    return jobs.flatMap((job) => {
      const normalized = normalizeWorkdayJob(job, board, parsed.baseUrl);
      return normalized === null ? [] : [normalized];
    });
  }

  private async fetchSmartRecruiters(
    board: OtherAiCompanyBoard,
  ): Promise<NormalizedJob[]> {
    // Kept here so newly discovered SmartRecruiters boards work without another
    // adapter change. The current CSV corpus contains none after validation.
    const postings: SmartRecruitersPosting[] = [];
    let offset = 0;
    let total = 1;
    let pages = 0;
    while (offset < total && pages < SMARTRECRUITERS_MAX_PAGES) {
      const { data } = await axios.get<SmartRecruitersResponse>(
        `https://api.smartrecruiters.com/v1/companies/${board.slug}/postings`,
        {
          timeout: TIMEOUT_MS,
          headers: { 'User-Agent': USER_AGENT },
          params: { limit: SMARTRECRUITERS_PAGE_SIZE, offset },
        },
      );
      const page = data.content ?? [];
      const pageSize = data.limit ?? SMARTRECRUITERS_PAGE_SIZE;
      const responseOffset = data.offset ?? offset;
      const nextOffset = responseOffset + pageSize;
      if (
        page.length === 0 ||
        !Number.isSafeInteger(pageSize) ||
        pageSize <= 0 ||
        !Number.isSafeInteger(responseOffset) ||
        responseOffset < 0 ||
        !Number.isSafeInteger(nextOffset) ||
        nextOffset <= offset
      ) {
        break;
      }
      postings.push(...page);
      pages += 1;
      total =
        Number.isSafeInteger(data.totalFound) && (data.totalFound ?? -1) >= 0
          ? Math.min(
              data.totalFound ?? 0,
              SMARTRECRUITERS_PAGE_SIZE * SMARTRECRUITERS_MAX_PAGES,
            )
          : nextOffset;
      offset = nextOffset;
    }
    return postings.flatMap((job) => {
      const normalized = normalizeSmartRecruitersJob(job, board);
      return normalized === null ? [] : [normalized];
    });
  }
}
