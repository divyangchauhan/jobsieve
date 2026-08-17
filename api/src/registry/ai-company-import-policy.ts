export type AiCompanyCatalogStatus =
  | 'pollable-ats'
  | 'pollable-yc'
  | 'pollable-other'
  | 'no-board-found'
  | 'no-website';

export type GeneratedAiCompanySource = 'ats' | 'yc' | 'other';

export type DetectedAiCompanyProvider =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'recruitee'
  | 'smartrecruiters'
  | 'teamtailor'
  | 'bamboohr'
  | 'workday';

export type AiCompanyBoardValidation =
  | 'valid'
  | 'definitive-rejection'
  | 'indeterminate';

export interface DetectedAiCompanyBoard {
  readonly provider: DetectedAiCompanyProvider;
  readonly slug: string;
  readonly url: string;
}

interface CompanyWebsiteEvidence {
  readonly website: string;
  readonly other_websites: string;
}

interface FundingWebsiteEvidence {
  readonly company_website: string;
}

export function preferRecentFundingWebsite<T extends CompanyWebsiteEvidence>(
  company: T,
  funding: FundingWebsiteEvidence | undefined,
): T {
  const fundingWebsite = funding?.company_website.trim() ?? '';
  if (!fundingWebsite || fundingWebsite === company.website.trim()) {
    return company;
  }
  const alternatives = [
    company.website.trim(),
    ...company.other_websites.split('|').map((website) => website.trim()),
  ].filter((website) => website.length > 0 && website !== fundingWebsite);
  return {
    ...company,
    website: fundingWebsite,
    other_websites: [...new Set(alternatives)].join('|'),
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function detectAiCompanyBoard(
  rawUrl: string,
): DetectedAiCompanyBoard | null {
  try {
    const url = new URL(decodeHtml(rawUrl));
    const host = url.hostname.toLowerCase();
    const first = url.pathname.split('/').filter(Boolean)[0] ?? null;

    if (host === 'boards-api.greenhouse.io') {
      const segments = url.pathname.split('/').filter(Boolean);
      const boardsIndex = segments.indexOf('boards');
      const slug = boardsIndex >= 0 ? segments[boardsIndex + 1] : null;
      if (slug) return { provider: 'greenhouse', slug, url: url.href };
    }
    if (
      host === 'boards.greenhouse.io' ||
      host === 'job-boards.greenhouse.io'
    ) {
      const slug = url.searchParams.get('for') ?? first;
      if (slug) return { provider: 'greenhouse', slug, url: url.href };
    }
    if (host === 'jobs.lever.co' && first !== null) {
      return { provider: 'lever', slug: first, url: url.href };
    }
    if (host === 'jobs.ashbyhq.com' && first !== null) {
      return { provider: 'ashby', slug: first, url: url.href };
    }
    if (host === 'apply.workable.com' && first !== null) {
      if (['cdn-cgi', 'api', 'j'].includes(first.toLowerCase())) return null;
      return { provider: 'workable', slug: first, url: url.href };
    }
    if (host.endsWith('.recruitee.com')) {
      return {
        provider: 'recruitee',
        slug: host.slice(0, -'.recruitee.com'.length),
        url: url.href,
      };
    }
    if (
      (host === 'jobs.smartrecruiters.com' ||
        host === 'careers.smartrecruiters.com') &&
      first !== null
    ) {
      return { provider: 'smartrecruiters', slug: first, url: url.href };
    }
    if (host.endsWith('.teamtailor.com')) {
      return {
        provider: 'teamtailor',
        slug: host.slice(0, -'.teamtailor.com'.length),
        url: url.href,
      };
    }
    if (host.endsWith('.bamboohr.com')) {
      return {
        provider: 'bamboohr',
        slug: host.slice(0, -'.bamboohr.com'.length),
        url: url.href,
      };
    }
    if (host.endsWith('.myworkdayjobs.com') || host.endsWith('.workday.com')) {
      return { provider: 'workday', slug: host, url: url.href };
    }
  } catch {
    // Ignore malformed URLs from scraped source data.
  }
  return null;
}

export function extractAiCompanyUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = match[1];
    if (raw === undefined) continue;
    try {
      urls.add(new URL(decodeHtml(raw), baseUrl).href);
    } catch {
      // Ignore malformed links.
    }
  }

  // Script payloads often JSON-escape every slash in an embedded ATS URL.
  const unescapedHtml = html.replace(/\\\//g, '/');
  for (const match of unescapedHtml.matchAll(/https?:\/\/[^"'<>\s\\]+/gi)) {
    urls.add(decodeHtml(match[0]));
  }
  return [...urls];
}

export function shouldGenerateAiCompanySource(
  status: AiCompanyCatalogStatus,
  source: GeneratedAiCompanySource,
): boolean {
  return status === `pollable-${source}`;
}

export function isReusableDiscoverySource(source: string): boolean {
  return source === 'website' || source === 'probe';
}

export function shouldRunWebsiteDiscovery(options: {
  readonly discoveryRequested: boolean;
  readonly hasCandidates: boolean;
  readonly hasYcSlug: boolean;
  readonly refreshRequested: boolean;
  readonly targetedDiscoveryRequested: boolean;
  readonly hasCachedEntry: boolean;
  readonly cachedDiscoveryNote: string | undefined;
}): boolean {
  const invalidatedDiscovery =
    options.cachedDiscoveryNote === 'provider link found on website' ||
    options.cachedDiscoveryNote ===
      'provider board found by conservative slug probe';
  return (
    options.discoveryRequested &&
    !options.hasCandidates &&
    !options.hasYcSlug &&
    (options.refreshRequested ||
      options.targetedDiscoveryRequested ||
      !options.hasCachedEntry ||
      invalidatedDiscovery ||
      options.cachedDiscoveryNote === 'discovery not requested')
  );
}

export function aiCompanyImportModeError(options: {
  readonly discoveryRequested: boolean;
  readonly probeRequested: boolean;
  readonly refreshRequested: boolean;
  readonly onlyCompany: string | undefined;
  readonly cacheExists: boolean;
}): string | null {
  if (options.probeRequested && !options.discoveryRequested) {
    return '--probe requires --discover';
  }
  if (options.refreshRequested && !options.discoveryRequested) {
    return '--refresh requires --discover';
  }
  if (options.refreshRequested && options.onlyCompany !== undefined) {
    return '--refresh cannot be combined with --company';
  }
  if (
    !options.cacheExists &&
    (!options.discoveryRequested || options.onlyCompany !== undefined)
  ) {
    return 'the discovery catalog is missing; run a full --discover import before generating registries';
  }
  return null;
}

export function isDefinitiveBoardRejection(
  status: number | undefined,
): boolean {
  return status === 404 || status === 410;
}

export function classifyAiCompanyBoardResponse(
  provider: DetectedAiCompanyProvider,
  status: number,
  data: unknown,
): AiCompanyBoardValidation {
  if (isDefinitiveBoardRejection(status)) return 'definitive-rejection';
  if (status < 200 || status >= 300) return 'indeterminate';

  let valid = false;
  switch (provider) {
    case 'greenhouse':
    case 'ashby':
    case 'workable':
      valid =
        typeof data === 'object' &&
        data !== null &&
        Array.isArray((data as { jobs?: unknown }).jobs);
      break;
    case 'lever':
      valid = Array.isArray(data);
      break;
    case 'recruitee':
      valid =
        typeof data === 'object' &&
        data !== null &&
        Array.isArray((data as { offers?: unknown }).offers);
      break;
    case 'bamboohr':
      valid =
        typeof data === 'object' &&
        data !== null &&
        Array.isArray((data as { result?: unknown }).result);
      break;
    case 'smartrecruiters':
      valid =
        typeof data === 'object' &&
        data !== null &&
        Array.isArray((data as { content?: unknown }).content);
      break;
    case 'teamtailor':
      valid = typeof data === 'string';
      break;
    case 'workday':
      valid =
        typeof data === 'object' &&
        data !== null &&
        Array.isArray((data as { jobPostings?: unknown }).jobPostings);
      break;
  }
  return valid ? 'valid' : 'indeterminate';
}

export function typescriptStringLiteral(value: string): string {
  return JSON.stringify(value);
}

export function parseWorkdayBoardUrl(rawUrl: string): {
  readonly endpoint: string;
  readonly baseUrl: string;
} | null {
  try {
    const url = new URL(rawUrl);
    const tenant = url.hostname.split('.')[0];
    const segments = url.pathname.split('/').filter(Boolean);
    const hasLocale =
      segments.length > 1 &&
      /^[a-z]{2}(?:[-_][a-z]{2})$/i.test(segments[0] ?? '');
    const site = segments[hasLocale ? 1 : 0];
    if (!tenant || !site) return null;
    const candidatePath = hasLocale ? `${segments[0]}/${site}` : site;
    return {
      endpoint: `https://${url.hostname}/wday/cxs/${tenant}/${site}/jobs`,
      baseUrl: `https://${url.hostname}/${candidatePath}`,
    };
  } catch {
    return null;
  }
}

export function relatedHosts(left: string, right: string): boolean {
  return (
    left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)
  );
}

export function isRelatedCareerUrl(rawUrl: string, website: string): boolean {
  try {
    const url = new URL(rawUrl);
    const websiteUrl = new URL(website);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const websiteHost = websiteUrl.hostname.replace(/^www\./, '').toLowerCase();
    return (
      relatedHosts(host, websiteHost) &&
      /(?:career|jobs?|join(?:-us)?|openings?|vacanc|work-with-us)/i.test(
        `${url.pathname}${url.search}`,
      )
    );
  } catch {
    return false;
  }
}
