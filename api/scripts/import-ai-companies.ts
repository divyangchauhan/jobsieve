/*
 * Full-corpus AI company importer.
 *
 * Reads both CSVs from the repository root, extracts explicit ATS/YC sources,
 * optionally discovers job boards linked from company websites, and writes:
 *   - src/registry/ai-company-catalog.json (one resolution row per company)
 *   - src/registry/ai-company-ats.generated.ts (pollable big-three ATS boards)
 *   - src/registry/yc-ai-companies.generated.ts (YC profiles for the YC adapter)
 *   - src/registry/ai-company-other-boards.generated.ts (other pollable ATS boards)
 *
 * Usage:
 *   cd api && pnpm ai-import             # use CSV evidence + cached discoveries
 *   cd api && pnpm ai-import --discover  # scan unresolved company websites
 *   cd api && pnpm ai-import --discover --probe # verify conservative ATS slugs
 *   cd api && pnpm ai-import --discover --refresh
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import axios from 'axios';
import { format } from 'prettier';

import { parseValidatedCsv } from '../src/registry/ai-company-csv.js';
import {
  aiCompanyImportModeError,
  classifyAiCompanyBoardResponse,
  detectAiCompanyBoard,
  extractAiCompanyUrls,
  isRelatedCareerUrl,
  isReusableDiscoverySource,
  isDefinitiveBoardRejection,
  parseWorkdayBoardUrl,
  preferRecentFundingWebsite,
  relatedHosts,
  shouldGenerateAiCompanySource,
  shouldRunWebsiteDiscovery,
  typescriptStringLiteral,
  type AiCompanyCatalogStatus,
} from '../src/registry/ai-company-import-policy.js';
import { resolvePublicHttpUrl } from '../src/registry/ai-company-network-policy.js';

type BigThreeAts = 'greenhouse' | 'lever' | 'ashby';
type Provider =
  | BigThreeAts
  | 'workable'
  | 'recruitee'
  | 'smartrecruiters'
  | 'teamtailor'
  | 'bamboohr'
  | 'workday';

interface CsvCompany {
  readonly company_key: string;
  readonly company_name: string;
  readonly raw_names: string;
  readonly sources: string;
  readonly website: string;
  readonly other_websites: string;
  readonly jobs_urls: string;
  readonly source_profile_urls: string;
  readonly recently_funded: string;
}

interface FundingCompany {
  readonly company_key: string;
  readonly company_name: string;
  readonly company_website: string;
}

interface BoardResolution {
  readonly provider: Provider;
  readonly slug: string;
  readonly url: string;
  readonly source: 'csv' | 'website' | 'override' | 'probe';
}

interface CatalogEntry {
  readonly key: string;
  readonly name: string;
  readonly website: string | null;
  readonly recentlyFunded: boolean;
  readonly ycSlug: string | null;
  readonly boards: readonly BoardResolution[];
  readonly status: AiCompanyCatalogStatus;
  readonly discoveryNote: string;
}

interface CatalogFile {
  readonly generatedAt: string;
  readonly sourceRows: {
    readonly actualAiCompanies: number;
    readonly recentFunding: number;
  };
  readonly companies: readonly CatalogEntry[];
}

const REPO_ROOT = path.resolve(__dirname, '../../..');
const API_REGISTRY = path.resolve(__dirname, '../../src/registry');
const MASTER_CSV = path.join(REPO_ROOT, 'actual_ai_companies.csv');
const FUNDING_CSV = path.join(REPO_ROOT, 'ai_funding_last_3_months.csv');
const CATALOG_PATH = path.join(API_REGISTRY, 'ai-company-catalog.json');
const ATS_OUTPUT_PATH = path.join(API_REGISTRY, 'ai-company-ats.generated.ts');
const YC_OUTPUT_PATH = path.join(API_REGISTRY, 'yc-ai-companies.generated.ts');
const OTHER_BOARDS_OUTPUT_PATH = path.join(
  API_REGISTRY,
  'ai-company-other-boards.generated.ts',
);

const DISCOVER = process.argv.includes('--discover');
const PROBE = process.argv.includes('--probe');
const REFRESH = process.argv.includes('--refresh');
const ONLY_COMPANY = process.argv
  .find((arg) => arg.startsWith('--company='))
  ?.slice('--company='.length);
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 8;
const MAX_DISCOVERY_HTML_BYTES = 2_000_000;
const MAX_PROVIDER_RESPONSE_BYTES = 20_000_000;
const STRICT_PAGE_FETCH_ATTEMPTS = 2;
const USER_AGENT = 'jobsieve-ai-company-import/1.0';
const GENERATED_FORMAT_OPTIONS = {
  parser: 'typescript',
  singleQuote: true,
  trailingComma: 'all',
} as const;
const MASTER_REQUIRED_HEADERS = [
  'company_key',
  'company_name',
  'raw_names',
  'sources',
  'website',
  'other_websites',
  'jobs_urls',
  'source_profile_urls',
  'recently_funded',
] as const;
const FUNDING_REQUIRED_HEADERS = [
  'company_key',
  'company_name',
  'company_website',
] as const;
const MINIMUM_MASTER_ROWS = 1_900;
const MINIMUM_FUNDING_ROWS = 150;

// Branded/custom job URLs in the CSVs do not expose the underlying ATS slug.
// These overrides were verified against the public provider APIs on 2026-08-16.
const VERIFIED_OVERRIDES: Readonly<Record<string, BoardResolution>> = {
  cresta: {
    provider: 'greenhouse',
    slug: 'cresta',
    url: 'https://boards.greenhouse.io/cresta',
    source: 'override',
  },
  databricks: {
    provider: 'greenhouse',
    slug: 'databricks',
    url: 'https://boards.greenhouse.io/databricks',
    source: 'override',
  },
  mercor: {
    provider: 'ashby',
    slug: 'mercor',
    url: 'https://jobs.ashbyhq.com/mercor',
    source: 'override',
  },
  fireworksai: {
    provider: 'ashby',
    slug: 'fireworks',
    url: 'https://jobs.ashbyhq.com/fireworks',
    source: 'override',
  },
  wayve: {
    provider: 'greenhouse',
    slug: 'wayve',
    url: 'https://job-boards.greenhouse.io/wayve',
    source: 'override',
  },
  cerence: {
    provider: 'workday',
    slug: 'cerence.wd5.myworkdayjobs.com',
    url: 'https://cerence.wd5.myworkdayjobs.com/Cerence',
    source: 'override',
  },
  appen: {
    provider: 'lever',
    slug: 'appen-2',
    url: 'https://jobs.lever.co/appen-2',
    source: 'override',
  },
};

// Rebrands whose current board slug no longer resembles the CSV company name.
const VERIFIED_OWNER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  raiclabs: ['synthetaic'],
  spacexai: ['xai'],
};

// Provider metadata can retain a company's former domain after a rebrand.
const VERIFIED_WEBSITE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  extend: ['extend.app'],
};

const VERIFIED_COMPANY_NAMES: Readonly<Record<string, string>> = {
  kyork: 'Kyrok',
};

// Avoid duplicate jobs while a company exposes more than one live ATS board.
const VERIFIED_PROVIDER_PREFERENCES: Readonly<Record<string, BigThreeAts>> = {
  wayve: 'greenhouse',
};

function readCsv<T extends object>(
  filePath: string,
  options: {
    readonly label: string;
    readonly requiredHeaders: readonly string[];
    readonly minimumRows: number;
  },
): T[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required CSV not found: ${filePath}`);
  }
  return parseValidatedCsv<T>(fs.readFileSync(filePath, 'utf8'), {
    ...options,
    keyHeader: 'company_key',
  });
}

function splitUrls(value: string): string[] {
  return value
    .split('|')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

function detectBoard(
  rawUrl: string,
  source: BoardResolution['source'],
): BoardResolution | null {
  const detected = detectAiCompanyBoard(rawUrl);
  return detected === null ? null : { ...detected, source };
}

function normalizedIdentifier(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the original value when percent encoding is malformed.
  }
  return decoded.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function websiteIdentifier(website: string): string {
  try {
    const labels = new URL(website).hostname.replace(/^www\./, '').split('.');
    return normalizedIdentifier(labels[0] ?? '');
  } catch {
    return '';
  }
}

function ownerScore(company: CsvCompany, board: BoardResolution): number {
  if (board.source === 'csv' || board.source === 'override') return 100;
  const slug = normalizedIdentifier(board.slug);
  if (VERIFIED_OWNER_ALIASES[company.company_key]?.includes(slug) === true)
    return 90;

  const website = websiteIdentifier(company.website);
  if (slug.length >= 3 && slug === website) return 80;

  const identifiers = [
    company.company_key,
    company.company_name,
    ...company.raw_names.split('|'),
  ]
    .map(normalizedIdentifier)
    .filter((value) => value.length >= 3);
  if (identifiers.includes(slug)) return 70;
  if (
    slug.length >= 4 &&
    identifiers.some((value) => value.includes(slug) || slug.includes(value))
  ) {
    return 60;
  }
  if (
    website.length >= 4 &&
    (website.includes(slug) || slug.includes(website))
  ) {
    return 50;
  }
  return 0;
}

function providerApiUrl(board: BoardResolution): string | null {
  switch (board.provider) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.slug)}/jobs`;
    case 'lever':
      return `https://api.lever.co/v0/postings/${encodeURIComponent(board.slug)}?mode=json`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.slug)}`;
    case 'workable':
      return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(board.slug)}`;
    case 'recruitee':
      return `https://${board.slug}.recruitee.com/api/offers/`;
    case 'bamboohr':
      return `https://${board.slug}.bamboohr.com/careers/list`;
    case 'teamtailor':
      return `https://${board.slug}.teamtailor.com/jobs`;
    case 'smartrecruiters':
      return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board.slug)}/postings`;
    case 'workday':
      return parseWorkdayBoardUrl(board.url)?.endpoint ?? null;
  }
}

async function requestPublicProvider(
  url: string,
  body?: unknown,
): Promise<{ readonly status: number; readonly data: unknown }> {
  let current = url;
  let requestBody = body;
  let method: 'get' | 'post' = body === undefined ? 'get' : 'post';

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const target = await resolvePublicHttpUrl(current);
    const requestOptions = {
      timeout: TIMEOUT_MS,
      maxRedirects: 0,
      maxContentLength: MAX_PROVIDER_RESPONSE_BYTES,
      maxBodyLength: MAX_PROVIDER_RESPONSE_BYTES,
      lookup: target.lookup,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/html',
        ...(method === 'post'
          ? { 'Content-Type': 'application/json' }
          : undefined),
      },
      validateStatus: (status: number) => status >= 200 && status < 400,
    } as const;
    const response =
      method === 'post'
        ? await axios.post<unknown>(
            target.url.href,
            requestBody,
            requestOptions,
          )
        : await axios.get<unknown>(target.url.href, requestOptions);
    if (response.status < 300) {
      return { status: response.status, data: response.data };
    }

    const location: unknown = response.headers.location;
    if (typeof location !== 'string') {
      throw new Error(
        `provider redirect did not include a location: ${current}`,
      );
    }
    current = new URL(location, target.url).href;
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        method === 'post')
    ) {
      method = 'get';
      requestBody = undefined;
    }
  }
  throw new Error(`provider validation exceeded the redirect limit for ${url}`);
}

async function validateBoard(board: BoardResolution): Promise<boolean> {
  const url = providerApiUrl(board);
  if (url === null) return false;
  try {
    const response =
      board.provider === 'workday'
        ? await requestPublicProvider(url, {
            appliedFacets: {},
            limit: 1,
            offset: 0,
            searchText: '',
          })
        : await requestPublicProvider(url);
    const validation = classifyAiCompanyBoardResponse(
      board.provider,
      response.status,
      response.data,
    );
    if (validation === 'definitive-rejection') return false;
    if (validation === 'indeterminate') {
      throw new Error('provider returned an unexpected successful payload');
    }
    return true;
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      isDefinitiveBoardRejection(error.response?.status)
    ) {
      return false;
    }
    throw new Error(
      `${board.provider}/${board.slug} validation was indeterminate; registries were not updated`,
      { cause: error },
    );
  }
}

async function validateOwnedBoards(
  company: CsvCompany,
  boards: readonly BoardResolution[],
): Promise<BoardResolution[]> {
  const owned = uniqueBoards(boards).filter(
    (board) => ownerScore(company, board) > 0,
  );
  const expectedHosts = owned.some((board) => board.source === 'probe')
    ? await companyWebsiteHosts(company)
    : new Set<string>();
  const validation = await Promise.all(
    owned.map(async (board) => ({
      board,
      valid:
        (await validateBoard(board)) &&
        (board.source !== 'probe' ||
          (await validateProbeOwnership(board, expectedHosts))),
    })),
  );
  const valid = validation
    .filter((result) => result.valid)
    .map((result) => result.board);

  // A company normally has one board per provider. Prefer the strongest owner
  // match to eliminate demo/example boards embedded in vendor documentation.
  const byProvider = new Map<Provider, BoardResolution>();
  for (const board of valid) {
    const current = byProvider.get(board.provider);
    if (
      current === undefined ||
      ownerScore(company, board) > ownerScore(company, current) ||
      (ownerScore(company, board) === ownerScore(company, current) &&
        board.slug.length < current.slug.length)
    ) {
      byProvider.set(board.provider, board);
    }
  }
  return [...byProvider.values()];
}

function conservativeSlugCandidates(company: CsvCompany): string[] {
  if (!company.website.trim()) return [];
  let hostLabel = '';
  try {
    hostLabel =
      new URL(company.website).hostname.replace(/^www\./, '').split('.')[0] ??
      '';
  } catch {
    return [];
  }
  const nameSlug = company.company_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return [...new Set([hostLabel, nameSlug])].filter(
    (candidate) => normalizedIdentifier(candidate).length >= 3,
  );
}

async function probeBigThree(company: CsvCompany): Promise<BoardResolution[]> {
  for (const slug of conservativeSlugCandidates(company)) {
    const candidates: BoardResolution[] = [
      {
        provider: 'greenhouse',
        slug,
        url: `https://boards.greenhouse.io/${slug}`,
        source: 'probe',
      },
      {
        provider: 'lever',
        slug,
        url: `https://jobs.lever.co/${slug}`,
        source: 'probe',
      },
      {
        provider: 'ashby',
        slug,
        url: `https://jobs.ashbyhq.com/${slug}`,
        source: 'probe',
      },
    ];
    const validated = await validateOwnedBoards(company, candidates);
    if (validated.length > 0) {
      const preferred = VERIFIED_PROVIDER_PREFERENCES[company.company_key];
      if (preferred !== undefined) {
        const match = validated.find((board) => board.provider === preferred);
        if (match !== undefined) return [match];
      }
      return validated;
    }
  }
  return [];
}

function hostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

async function companyWebsiteHosts(company: CsvCompany): Promise<Set<string>> {
  const hosts = new Set<string>();
  const original = hostname(company.website);
  if (original !== null) hosts.add(original);
  for (const alias of VERIFIED_WEBSITE_ALIASES[company.company_key] ?? []) {
    const aliasHost = hostname(`https://${alias}`);
    if (aliasHost !== null) hosts.add(aliasHost);
  }
  const home = await fetchPage(company.website);
  const finalHost = home === null ? null : hostname(home.finalUrl);
  if (finalHost !== null) hosts.add(finalHost);
  return hosts;
}

async function validateProbeOwnership(
  board: BoardResolution,
  expectedHosts: ReadonlySet<string>,
): Promise<boolean> {
  if (expectedHosts.size === 0) return false;
  const landingUrl =
    board.provider === 'greenhouse'
      ? `https://job-boards.greenhouse.io/${encodeURIComponent(board.slug)}`
      : board.url;
  const page = await fetchPage(landingUrl, { abortOnIndeterminate: true });
  if (page === null) return false;
  const urls = [
    page.finalUrl,
    ...extractAiCompanyUrls(page.html, page.finalUrl),
  ];
  return urls.some((rawUrl) => {
    const candidate = hostname(rawUrl);
    return (
      candidate !== null &&
      [...expectedHosts].some((expected) => relatedHosts(candidate, expected))
    );
  });
}

function uniqueBoards(boards: readonly BoardResolution[]): BoardResolution[] {
  const seen = new Set<string>();
  return boards.filter((board) => {
    const key = `${board.provider}:${board.slug.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ycSlug(company: CsvCompany): string | null {
  for (const raw of splitUrls(company.source_profile_urls)) {
    try {
      const url = new URL(raw);
      if (url.hostname === 'www.ycombinator.com') {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments[0] === 'companies' && segments[1]) return segments[1];
      }
    } catch {
      // Ignore malformed profile URLs.
    }
  }
  return null;
}

function likelyCareerLinks(urls: readonly string[], website: string): string[] {
  return urls
    .filter((raw) => {
      try {
        return (
          detectBoard(raw, 'website') !== null ||
          isRelatedCareerUrl(raw, website)
        );
      } catch {
        return false;
      }
    })
    .slice(0, 4);
}

async function fetchPage(
  url: string,
  options: { readonly abortOnIndeterminate?: boolean } = {},
  attempt = 1,
): Promise<{ html: string; finalUrl: string } | null> {
  let current = url;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    try {
      const target = await resolvePublicHttpUrl(current);
      const response = await axios.get<string>(target.url.href, {
        timeout: TIMEOUT_MS,
        maxRedirects: 0,
        maxContentLength: MAX_DISCOVERY_HTML_BYTES,
        maxBodyLength: MAX_DISCOVERY_HTML_BYTES,
        lookup: target.lookup,
        responseType: 'text',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        validateStatus: (status) => status >= 200 && status < 400,
      });
      if (response.status >= 300) {
        const location: unknown = response.headers.location;
        if (typeof location !== 'string') return null;
        current = new URL(location, target.url).href;
        continue;
      }
      return { html: response.data, finalUrl: target.url.href };
    } catch (error) {
      if (
        options.abortOnIndeterminate === true &&
        !(
          axios.isAxiosError(error) &&
          isDefinitiveBoardRejection(error.response?.status)
        )
      ) {
        if (attempt < STRICT_PAGE_FETCH_ATTEMPTS) {
          return fetchPage(url, options, attempt + 1);
        }
        throw new Error(
          `probe ownership validation was indeterminate for ${url}; registries were not updated`,
          { cause: error },
        );
      }
      return null;
    }
  }
  if (options.abortOnIndeterminate === true) {
    throw new Error(
      `probe ownership validation exceeded the redirect limit for ${url}; registries were not updated`,
    );
  }
  return null;
}

async function discoverBoards(company: CsvCompany): Promise<{
  boards: BoardResolution[];
  note: string;
}> {
  if (!company.website.trim())
    return { boards: [], note: 'no website supplied' };

  const home = await fetchPage(company.website.trim());
  if (home === null) return { boards: [], note: 'website unreachable' };

  const homeUrls = extractAiCompanyUrls(home.html, home.finalUrl);
  const boards: BoardResolution[] = [home.finalUrl, ...homeUrls]
    .map((url) => detectBoard(url, 'website'))
    .filter((board): board is BoardResolution => board !== null);

  const validHomepageBoards = await validateOwnedBoards(company, boards);
  if (validHomepageBoards.length === 0) {
    const careerLinks = likelyCareerLinks(homeUrls, home.finalUrl);
    for (const link of careerLinks) {
      const page = await fetchPage(link);
      if (page === null) continue;
      for (const url of [
        page.finalUrl,
        ...extractAiCompanyUrls(page.html, page.finalUrl),
      ]) {
        const board = detectBoard(url, 'website');
        if (board !== null) boards.push(board);
      }
    }
  }

  return {
    boards: uniqueBoards(boards),
    note:
      boards.length > 0
        ? 'provider link found on website'
        : 'no provider link found',
  };
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await worker(item, index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => run()));
  return results;
}

function loadCachedCatalog(): Map<string, CatalogEntry> {
  if (REFRESH || !fs.existsSync(CATALOG_PATH)) return new Map();
  const parsed = JSON.parse(
    fs.readFileSync(CATALOG_PATH, 'utf8'),
  ) as CatalogFile;
  return new Map(parsed.companies.map((company) => [company.key, company]));
}

function statusFor(
  boards: readonly BoardResolution[],
  companyYcSlug: string | null,
  website: string,
): CatalogEntry['status'] {
  if (
    boards.some((board) =>
      ['greenhouse', 'lever', 'ashby'].includes(board.provider),
    )
  ) {
    return 'pollable-ats';
  }
  if (companyYcSlug !== null) return 'pollable-yc';
  if (boards.length > 0) return 'pollable-other';
  return website.trim() ? 'no-board-found' : 'no-website';
}

function renderCatalog(
  masterCount: number,
  fundingCount: number,
  companies: CatalogEntry[],
): string {
  const catalog: CatalogFile = {
    generatedAt: new Date().toISOString(),
    sourceRows: { actualAiCompanies: masterCount, recentFunding: fundingCount },
    companies: [...companies].sort((a, b) => a.name.localeCompare(b.name)),
  };
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function quote(value: string): string {
  return typescriptStringLiteral(value);
}

async function renderGeneratedRegistries(
  companies: readonly CatalogEntry[],
): Promise<{
  readonly ats: string;
  readonly yc: string;
  readonly other: string;
}> {
  const bigThree = new Map<
    string,
    { name: string; provider: BigThreeAts; slug: string }
  >();
  for (const company of companies) {
    if (!shouldGenerateAiCompanySource(company.status, 'ats')) continue;
    for (const board of company.boards) {
      if (!['greenhouse', 'lever', 'ashby'].includes(board.provider)) continue;
      const provider = board.provider as BigThreeAts;
      const key = `${provider}:${board.slug.toLowerCase()}`;
      if (!bigThree.has(key))
        bigThree.set(key, { name: company.name, provider, slug: board.slug });
    }
  }
  const atsRows = [...bigThree.values()].sort(
    (a, b) =>
      a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
  );
  const atsSource = [
    '// Generated by scripts/import-ai-companies.ts. Do not edit manually.',
    "import type { WatchlistCompany } from './company-registry.js';",
    '',
    'export const AI_COMPANY_ATS_BOARDS = [',
    ...atsRows.map(
      (row) =>
        `  { name: ${quote(row.name)}, ats: ${quote(row.provider)}, slug: ${quote(row.slug)}, tier: 2, domain: 'ai-infra' },`,
    ),
    '] as const satisfies readonly WatchlistCompany[];',
    '',
  ].join('\n');
  const atsOutput = await format(atsSource, GENERATED_FORMAT_OPTIONS);

  const ycSlugs = [
    ...new Set(
      companies.flatMap((company) =>
        shouldGenerateAiCompanySource(company.status, 'yc') &&
        company.ycSlug !== null
          ? [company.ycSlug]
          : [],
      ),
    ),
  ].sort();
  const ycSource = [
    '// Generated by scripts/import-ai-companies.ts. Do not edit manually.',
    'export const YC_AI_COMPANY_SLUGS = [',
    ...ycSlugs.map((slug) => `  ${quote(slug)},`),
    '] as const;',
    '',
  ].join('\n');
  const ycOutput = await format(ycSource, GENERATED_FORMAT_OPTIONS);

  const otherRows = companies
    .filter((company) => shouldGenerateAiCompanySource(company.status, 'other'))
    .flatMap((company) =>
      company.boards
        .filter(
          (board) => !['greenhouse', 'lever', 'ashby'].includes(board.provider),
        )
        .map((board) => ({
          company: company.name,
          provider: board.provider,
          slug: board.slug,
          url: board.url,
        })),
    )
    .sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        a.company.localeCompare(b.company),
    );
  const otherSource = [
    '// Generated by scripts/import-ai-companies.ts. Do not edit manually.',
    "export type OtherCareerProvider = 'workable' | 'recruitee' | 'smartrecruiters' | 'teamtailor' | 'bamboohr' | 'workday';",
    'export interface OtherAiCompanyBoard {',
    '  readonly company: string;',
    '  readonly provider: OtherCareerProvider;',
    '  readonly slug: string;',
    '  readonly url: string;',
    '}',
    '',
    'export const AI_COMPANY_OTHER_BOARDS = [',
    ...otherRows.map(
      (row) =>
        `  { company: ${quote(row.company)}, provider: ${quote(row.provider)}, slug: ${quote(row.slug)}, url: ${quote(row.url)} },`,
    ),
    '] as const satisfies readonly OtherAiCompanyBoard[];',
    '',
  ].join('\n');
  const otherOutput = await format(otherSource, GENERATED_FORMAT_OPTIONS);
  return { ats: atsOutput, yc: ycOutput, other: otherOutput };
}

function writeRenderedOutputs(
  catalog: string,
  registries: {
    readonly ats: string;
    readonly yc: string;
    readonly other: string;
  },
): void {
  fs.writeFileSync(ATS_OUTPUT_PATH, registries.ats);
  fs.writeFileSync(YC_OUTPUT_PATH, registries.yc);
  fs.writeFileSync(OTHER_BOARDS_OUTPUT_PATH, registries.other);
  fs.writeFileSync(CATALOG_PATH, catalog);
}

async function main(): Promise<void> {
  const modeError = aiCompanyImportModeError({
    discoveryRequested: DISCOVER,
    probeRequested: PROBE,
    refreshRequested: REFRESH,
    onlyCompany: ONLY_COMPANY,
    cacheExists: fs.existsSync(CATALOG_PATH),
  });
  if (modeError !== null) throw new Error(modeError);

  const master = readCsv<CsvCompany>(MASTER_CSV, {
    label: path.basename(MASTER_CSV),
    requiredHeaders: MASTER_REQUIRED_HEADERS,
    minimumRows: MINIMUM_MASTER_ROWS,
  });
  const funding = readCsv<FundingCompany>(FUNDING_CSV, {
    label: path.basename(FUNDING_CSV),
    requiredHeaders: FUNDING_REQUIRED_HEADERS,
    minimumRows: MINIMUM_FUNDING_ROWS,
  });
  const fundingByKey = new Map(
    funding.map((company) => [company.company_key, company]),
  );
  const mergedMaster = master.map((company) =>
    preferRecentFundingWebsite(company, fundingByKey.get(company.company_key)),
  );
  const masterKeys = new Set(
    mergedMaster.map((company) => company.company_key),
  );

  // Preserve any funding-only row if future source files stop being a strict subset.
  const fundingOnly: CsvCompany[] = funding
    .filter((company) => !masterKeys.has(company.company_key))
    .map((company) => ({
      company_key: company.company_key,
      company_name: company.company_name,
      raw_names: company.company_name,
      sources: 'recent_ai_funding',
      website: company.company_website,
      other_websites: '',
      jobs_urls: '',
      source_profile_urls: '',
      recently_funded: 'yes',
    }));
  const allCompanies = [...mergedMaster, ...fundingOnly];
  const cache = loadCachedCatalog();

  let processed = 0;
  const entries = await mapConcurrent(
    allCompanies,
    CONCURRENCY,
    async (company) => {
      const allEvidenceUrls = [
        ...splitUrls(company.jobs_urls),
        ...splitUrls(company.source_profile_urls),
        ...splitUrls(company.other_websites),
        ...splitUrls(company.website),
      ];
      const explicitBoards = allEvidenceUrls
        .map((url) => detectBoard(url, 'csv'))
        .filter((board): board is BoardResolution => board !== null);
      const override = VERIFIED_OVERRIDES[company.company_key];
      if (override !== undefined) explicitBoards.push(override);

      const cached = cache.get(company.company_key);
      let discovered: BoardResolution[] =
        cached?.boards.filter((board) =>
          isReusableDiscoverySource(board.source),
        ) ?? [];
      let discoveryNote = cached?.discoveryNote ?? 'discovery not requested';
      const shouldDiscover =
        DISCOVER &&
        (ONLY_COMPANY === undefined || ONLY_COMPANY === company.company_key);
      let candidates = await validateOwnedBoards(company, [
        ...explicitBoards,
        ...discovered,
      ]);
      if (
        shouldRunWebsiteDiscovery({
          discoveryRequested: shouldDiscover,
          hasCandidates: candidates.length > 0,
          hasYcSlug: ycSlug(company) !== null,
          refreshRequested: REFRESH,
          targetedDiscoveryRequested:
            shouldDiscover && ONLY_COMPANY !== undefined,
          hasCachedEntry: cached !== undefined,
          cachedDiscoveryNote: cached?.discoveryNote,
        })
      ) {
        const result = await discoverBoards(company);
        discovered = result.boards;
        discoveryNote = result.note;
        candidates = await validateOwnedBoards(company, [
          ...explicitBoards,
          ...discovered,
        ]);
      }
      if (
        shouldDiscover &&
        candidates.length === 0 &&
        ycSlug(company) === null &&
        PROBE
      ) {
        const probed = await probeBigThree(company);
        if (probed.length > 0) {
          candidates = probed;
          discoveryNote = 'provider board found by conservative slug probe';
        } else if (discoveryNote === 'no provider link found') {
          discoveryNote =
            'no provider link or conservative big-three slug match found';
        }
      }
      const boards = candidates;

      processed += 1;
      if (DISCOVER && processed % 50 === 0) {
        process.stdout.write(
          `  processed ${processed}/${allCompanies.length}\r`,
        );
      }

      const companyYcSlug = ycSlug(company);
      return {
        key: company.company_key,
        name:
          VERIFIED_COMPANY_NAMES[company.company_key] ?? company.company_name,
        website: company.website.trim() || null,
        recentlyFunded:
          company.recently_funded === 'yes' ||
          fundingByKey.has(company.company_key),
        ycSlug: companyYcSlug,
        boards,
        status: statusFor(boards, companyYcSlug, company.website),
        discoveryNote,
      } satisfies CatalogEntry;
    },
  );

  if (DISCOVER) process.stdout.write('\n');
  const catalog = renderCatalog(master.length, funding.length, entries);
  const registries = await renderGeneratedRegistries(entries);
  writeRenderedOutputs(catalog, registries);

  const counts = entries.reduce<Record<string, number>>((result, entry) => {
    result[entry.status] = (result[entry.status] ?? 0) + 1;
    return result;
  }, {});
  console.log(`Processed ${entries.length} unique companies from both CSVs.`);
  console.log(JSON.stringify(counts, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
