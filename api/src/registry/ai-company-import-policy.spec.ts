import {
  aiCompanyImportModeError,
  classifyAiCompanyBoardResponse,
  detectAiCompanyBoard,
  extractAiCompanyUrls,
  isDefinitiveBoardRejection,
  isRelatedCareerUrl,
  isReusableDiscoverySource,
  preferRecentFundingWebsite,
  shouldGenerateAiCompanySource,
  shouldRunWebsiteDiscovery,
  typescriptStringLiteral,
} from './ai-company-import-policy.js';

describe('AI company import policy', () => {
  it('prefers a recent funding website while preserving older evidence', () => {
    expect(
      preferRecentFundingWebsite(
        {
          company_key: 'acme',
          website: 'https://old.acme.example',
          other_websites: 'https://alternate.acme.example',
        },
        { company_website: 'https://acme.example' },
      ),
    ).toEqual({
      company_key: 'acme',
      website: 'https://acme.example',
      other_websites: 'https://old.acme.example|https://alternate.acme.example',
    });
  });

  it('refuses generation that could erase uncached discoveries', () => {
    expect(
      aiCompanyImportModeError({
        discoveryRequested: false,
        probeRequested: false,
        refreshRequested: false,
        onlyCompany: undefined,
        cacheExists: false,
      }),
    ).toContain('catalog is missing');
    expect(
      aiCompanyImportModeError({
        discoveryRequested: true,
        probeRequested: true,
        refreshRequested: false,
        onlyCompany: undefined,
        cacheExists: false,
      }),
    ).toBeNull();
    expect(
      aiCompanyImportModeError({
        discoveryRequested: true,
        probeRequested: false,
        refreshRequested: true,
        onlyCompany: 'acme',
        cacheExists: true,
      }),
    ).toBe('--refresh cannot be combined with --company');
  });

  it('treats transport and retryable HTTP failures as indeterminate', () => {
    expect(isDefinitiveBoardRejection(undefined)).toBe(false);
    expect(isDefinitiveBoardRejection(429)).toBe(false);
    expect(isDefinitiveBoardRejection(500)).toBe(false);
    expect(isDefinitiveBoardRejection(404)).toBe(true);
    expect(isDefinitiveBoardRejection(410)).toBe(true);
  });

  it('treats an unexpected successful board payload as indeterminate', () => {
    expect(
      classifyAiCompanyBoardResponse('greenhouse', 200, { jobs: [] }),
    ).toBe('valid');
    expect(
      classifyAiCompanyBoardResponse('greenhouse', 200, '<h1>Maintenance</h1>'),
    ).toBe('indeterminate');
    expect(
      classifyAiCompanyBoardResponse('greenhouse', 404, { message: 'gone' }),
    ).toBe('definitive-rejection');
  });

  it('escapes multiline values for generated TypeScript', () => {
    expect(typescriptStringLiteral("Acme\nLabs\r'AI'")).toBe(
      '"Acme\\nLabs\\r\'AI\'"',
    );
  });

  it('detects canonical SmartRecruiters career boards', () => {
    expect(
      detectAiCompanyBoard(
        'https://careers.smartrecruiters.com/ExampleAI/open-roles',
      ),
    ).toMatchObject({ provider: 'smartrecruiters', slug: 'ExampleAI' });
  });

  it('extracts complete ATS URLs from escaped JSON payloads', () => {
    const [url] = extractAiCompanyUrls(
      String.raw`{"jobs":"https:\/\/jobs.ashbyhq.com\/acme"}`,
      'https://acme.example',
    );
    expect(url).toBe('https://jobs.ashbyhq.com/acme');
    expect(detectAiCompanyBoard(url ?? '')).toMatchObject({
      provider: 'ashby',
      slug: 'acme',
    });
  });

  it('emits each company through only its selected runtime source', () => {
    expect(shouldGenerateAiCompanySource('pollable-ats', 'ats')).toBe(true);
    expect(shouldGenerateAiCompanySource('pollable-ats', 'yc')).toBe(false);
    expect(shouldGenerateAiCompanySource('pollable-yc', 'ats')).toBe(false);
    expect(shouldGenerateAiCompanySource('pollable-yc', 'yc')).toBe(true);
    expect(shouldGenerateAiCompanySource('pollable-other', 'other')).toBe(true);
    expect(shouldGenerateAiCompanySource('no-board-found', 'other')).toBe(
      false,
    );
  });

  it('reuses verified website and probe discoveries', () => {
    expect(isReusableDiscoverySource('website')).toBe(true);
    expect(isReusableDiscoverySource('probe')).toBe(true);
    expect(isReusableDiscoverySource('csv')).toBe(false);
    expect(isReusableDiscoverySource('override')).toBe(false);
  });

  it('never crawls websites unless discovery was requested', () => {
    expect(
      shouldRunWebsiteDiscovery({
        discoveryRequested: false,
        hasCandidates: false,
        hasYcSlug: false,
        refreshRequested: false,
        targetedDiscoveryRequested: false,
        hasCachedEntry: false,
        cachedDiscoveryNote: undefined,
      }),
    ).toBe(false);
    expect(
      shouldRunWebsiteDiscovery({
        discoveryRequested: true,
        hasCandidates: false,
        hasYcSlug: false,
        refreshRequested: false,
        targetedDiscoveryRequested: false,
        hasCachedEntry: false,
        cachedDiscoveryNote: undefined,
      }),
    ).toBe(true);
    expect(
      shouldRunWebsiteDiscovery({
        discoveryRequested: true,
        hasCandidates: false,
        hasYcSlug: false,
        refreshRequested: false,
        targetedDiscoveryRequested: true,
        hasCachedEntry: true,
        cachedDiscoveryNote: 'no provider link found',
      }),
    ).toBe(true);
  });

  it('rescans a previously discovered source after its board is invalidated', () => {
    expect(
      shouldRunWebsiteDiscovery({
        discoveryRequested: true,
        hasCandidates: false,
        hasYcSlug: false,
        refreshRequested: false,
        targetedDiscoveryRequested: false,
        hasCachedEntry: true,
        cachedDiscoveryNote: 'provider link found on website',
      }),
    ).toBe(true);
    expect(
      shouldRunWebsiteDiscovery({
        discoveryRequested: true,
        hasCandidates: false,
        hasYcSlug: false,
        refreshRequested: false,
        targetedDiscoveryRequested: false,
        hasCachedEntry: true,
        cachedDiscoveryNote: 'provider board found by conservative slug probe',
      }),
    ).toBe(true);
  });

  it('recognizes career pages hosted on a company subdomain', () => {
    expect(
      isRelatedCareerUrl(
        'https://careers.example.com/openings',
        'https://www.example.com',
      ),
    ).toBe(true);
    expect(
      isRelatedCareerUrl(
        'https://unrelated.example.net/jobs',
        'https://example.com',
      ),
    ).toBe(false);
  });
});
