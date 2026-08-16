/*
 * Y Combinator public company directory + company profile pages.
 *
 * The directory's public Algolia index identifies which configured AI companies
 * are currently hiring. Only those profile pages are fetched; each page embeds
 * structured `jobPostings` data in its Inertia `data-page` payload.
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';
import { YC_AI_COMPANY_SLUGS } from '../registry/yc-ai-companies.generated.js';
import { runBatched } from './concurrency.js';
import { passesTitleFilter } from './title-filter.js';

const DIRECTORY_URL = 'https://www.ycombinator.com/companies';
const COMPANY_URL = 'https://www.ycombinator.com/companies';
const ALGOLIA_INDEX = 'YCCompany_production';
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 6;
const ALGOLIA_QUERY_BATCH_SIZE = 50;
const ALGOLIA_HITS_PER_SLUG = 10;
const ALGOLIA_RETRY_DELAYS_MS = [1_000] as const;
const ALGOLIA_BATCH_ATTEMPTS = ALGOLIA_RETRY_DELAYS_MS.length + 1;
const ALGOLIA_FAILURE_CIRCUIT = 2;
const ALGOLIA_MAX_RETRY_DELAY_MS = 30_000;
const USER_AGENT = 'jobsieve/1.0';

interface AlgoliaOptions {
  readonly app: string;
  readonly key: string;
}

interface AlgoliaHit {
  readonly slug?: string;
}

interface AlgoliaResponse {
  readonly hits?: readonly AlgoliaHit[];
}

interface AlgoliaMultiResponse {
  readonly results?: readonly AlgoliaResponse[];
}

export interface YcJobPosting {
  readonly id?: number;
  readonly title?: string;
  readonly url?: string;
  readonly location?: string;
  readonly type?: string;
  readonly role?: string;
  readonly roleSpecificType?: string | null;
  readonly prettyRole?: string;
  readonly salaryRange?: string;
  readonly minExperience?: string;
  readonly visa?: string;
  readonly skills?: readonly string[];
  readonly companyName?: string;
  readonly companyOneLiner?: string;
}

interface YcPagePayload {
  readonly props?: {
    readonly company?: { readonly name?: string };
    readonly jobPostings?: readonly YcJobPosting[];
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function algoliaRetryDelayMs(
  retryAfter: unknown,
  fallbackMs: number,
  now = Date.now(),
): number {
  const raw: unknown = Array.isArray(retryAfter)
    ? (retryAfter as unknown[])[0]
    : retryAfter;
  let requestedMs = 0;
  if (typeof raw === 'number' || typeof raw === 'string') {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      requestedMs = seconds * 1_000;
    } else if (typeof raw === 'string') {
      const date = Date.parse(raw);
      if (Number.isFinite(date)) requestedMs = Math.max(0, date - now);
    }
  }
  return Math.min(
    ALGOLIA_MAX_RETRY_DELAY_MS,
    Math.max(fallbackMs, requestedMs),
  );
}

function retryAfterHeader(error: unknown): unknown {
  if (!axios.isAxiosError<unknown>(error)) return undefined;
  const headers: unknown = error.response?.headers;
  if (typeof headers !== 'object' || headers === null) return undefined;
  return (headers as Record<string, unknown>)['retry-after'];
}

export function parseYcCompanyPage(html: string): {
  company: string;
  jobs: readonly YcJobPosting[];
} | null {
  const match = /data-page="([^"]+)"/.exec(html);
  if (match?.[1] === undefined) return null;
  try {
    const payload = JSON.parse(decodeHtmlEntities(match[1])) as YcPagePayload;
    const company = payload.props?.company?.name;
    const jobs = payload.props?.jobPostings;
    if (!company || !Array.isArray(jobs)) return null;
    return { company, jobs };
  } catch {
    return null;
  }
}

export function normalizeYcJob(
  posting: YcJobPosting,
  fallbackCompany: string,
): NormalizedJob | null {
  if (posting.id === undefined || !posting.title || !posting.url) return null;
  if (!passesTitleFilter(posting.title)) return null;

  const company = posting.companyName || fallbackCompany;
  let url: string;
  try {
    url = new URL(posting.url, COMPANY_URL).href;
  } catch {
    return null;
  }
  const location = posting.location ?? '';
  const tags = [
    posting.prettyRole,
    posting.role,
    posting.roleSpecificType ?? undefined,
    posting.type,
    posting.minExperience,
    posting.visa,
    ...(posting.skills ?? []),
    location,
  ].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  return {
    source: 'ycombinator',
    sourceJobId: String(posting.id),
    title: posting.title,
    company,
    url,
    tags,
    remote: /\b(remote|anywhere|worldwide)\b/i.test(location),
    ...(posting.salaryRange ? { salary: posting.salaryRange } : {}),
    ...(posting.companyOneLiner
      ? { description: posting.companyOneLiner }
      : {}),
  };
}

@Injectable()
export class YCombinatorAdapter implements SourceAdapter {
  readonly name = 'ycombinator';
  private readonly logger = new Logger(YCombinatorAdapter.name);
  private readonly configured: ReadonlySet<string> = new Set(
    YC_AI_COMPANY_SLUGS,
  );

  async fetchJobs(): Promise<NormalizedJob[]> {
    try {
      const hiringSlugs = await this.fetchHiringSlugs();
      const targets = hiringSlugs.filter((slug) => this.configured.has(slug));
      const tasks = targets.map(
        (slug) => async (): Promise<NormalizedJob[]> => this.fetchCompany(slug),
      );
      const jobs = (await runBatched(tasks, CONCURRENCY)).flat();
      this.logger.log(
        `ycombinator fetched ${jobs.length} jobs from ${targets.length}/${this.configured.size} configured AI companies currently hiring`,
      );
      return jobs;
    } catch (error) {
      this.logger.error(`ycombinator fetch failed: ${String(error)}`);
      return [];
    }
  }

  private async fetchHiringSlugs(): Promise<string[]> {
    const { data: directoryHtml } = await axios.get<string>(DIRECTORY_URL, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    const optionsMatch = /window\.AlgoliaOpts\s*=\s*(\{[^;]+\});/.exec(
      directoryHtml,
    );
    if (optionsMatch?.[1] === undefined) {
      throw new Error('YC directory did not expose Algolia options');
    }
    const options = JSON.parse(optionsMatch[1]) as AlgoliaOptions;
    if (!options.app || !options.key)
      throw new Error('Invalid YC Algolia options');

    const endpoint = `https://${options.app.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;
    const slugs = new Set<string>();
    const configured = [...this.configured];
    let consecutiveFailures = 0;
    for (
      let offset = 0;
      offset < configured.length;
      offset += ALGOLIA_QUERY_BATCH_SIZE
    ) {
      const batch = configured.slice(offset, offset + ALGOLIA_QUERY_BATCH_SIZE);
      const requests = batch.map((slug) => ({
        indexName: ALGOLIA_INDEX,
        params: new URLSearchParams({
          query: slug,
          hitsPerPage: String(ALGOLIA_HITS_PER_SLUG),
          facetFilters: JSON.stringify(['isHiring:true']),
          attributesToRetrieve: JSON.stringify(['slug']),
          attributesToHighlight: JSON.stringify([]),
          analytics: 'false',
        }).toString(),
      }));
      let data: AlgoliaMultiResponse | null = null;
      for (let attempt = 1; attempt <= ALGOLIA_BATCH_ATTEMPTS; attempt += 1) {
        try {
          const response = await axios.post<AlgoliaMultiResponse>(
            endpoint,
            { requests },
            {
              timeout: TIMEOUT_MS,
              headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
                'X-Algolia-Application-Id': options.app,
                'X-Algolia-API-Key': options.key,
              },
            },
          );
          data = response.data;
          break;
        } catch (error) {
          if (attempt < ALGOLIA_BATCH_ATTEMPTS) {
            await sleep(
              algoliaRetryDelayMs(
                retryAfterHeader(error),
                ALGOLIA_RETRY_DELAYS_MS[attempt - 1] ?? 1_000,
              ),
            );
          }
          if (attempt === ALGOLIA_BATCH_ATTEMPTS) {
            this.logger.warn(
              `ycombinator hiring batch ${offset / ALGOLIA_QUERY_BATCH_SIZE + 1} failed after ${ALGOLIA_BATCH_ATTEMPTS} attempts: ${String(error)}`,
            );
          }
        }
      }
      if (data === null) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= ALGOLIA_FAILURE_CIRCUIT) {
          this.logger.warn(
            `ycombinator hiring lookup stopped after ${consecutiveFailures} consecutive failed batches`,
          );
          break;
        }
        continue;
      }
      consecutiveFailures = 0;
      for (const [index, result] of data.results?.entries() ?? []) {
        const requestedSlug = batch[index];
        if (
          requestedSlug !== undefined &&
          result.hits?.some((hit) => hit.slug === requestedSlug) === true
        ) {
          slugs.add(requestedSlug);
        }
      }
    }
    return [...slugs];
  }

  private async fetchCompany(slug: string): Promise<NormalizedJob[]> {
    try {
      const { data: html } = await axios.get<string>(`${COMPANY_URL}/${slug}`, {
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      });
      const parsed = parseYcCompanyPage(html);
      if (parsed === null) {
        this.logger.warn(`ycombinator/${slug}: structured job data not found`);
        return [];
      }
      return parsed.jobs.flatMap((posting) => {
        const job = normalizeYcJob(posting, parsed.company);
        return job === null ? [] : [job];
      });
    } catch (error) {
      this.logger.warn(`ycombinator/${slug} failed: ${String(error)}`);
      return [];
    }
  }
}
