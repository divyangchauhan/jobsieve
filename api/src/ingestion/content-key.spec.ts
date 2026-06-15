import { contentKey, normalizeCompany, normalizeTitle } from './normalize.js';

describe('normalizeTitle', () => {
  it('strips parenthetical location noise but keeps tech qualifiers', () => {
    expect(normalizeTitle('Senior Backend Engineer (Rust)')).toBe(
      'senior backend engineer rust',
    );
  });

  it('treats dash-separated qualifier identically to parenthetical', () => {
    expect(normalizeTitle('Senior Backend Engineer - Rust')).toBe(
      'senior backend engineer rust',
    );
  });

  it('strips Remote from comma-separated suffix', () => {
    expect(normalizeTitle('Senior Backend Engineer, Rust (Remote)')).toBe(
      'senior backend engineer rust',
    );
  });

  it('keeps Go as a distinct qualifier from Rust', () => {
    expect(normalizeTitle('Senior Backend Engineer (Go)')).not.toBe(
      normalizeTitle('Senior Backend Engineer (Rust)'),
    );
    expect(normalizeTitle('Senior Backend Engineer (Go)')).toBe(
      'senior backend engineer go',
    );
  });

  it('strips on-site (hyphenated)', () => {
    expect(normalizeTitle('Engineer On-Site')).toBe('engineer');
  });

  it('strips full-time (hyphenated)', () => {
    expect(normalizeTitle('Full-Time Rust Engineer')).toBe('rust engineer');
  });

  it('strips hybrid', () => {
    expect(normalizeTitle('Rust Engineer (Hybrid)')).toBe('rust engineer');
  });

  it('preserves order — Engineer Manager ≠ Manager Engineer', () => {
    expect(normalizeTitle('Engineering Manager')).not.toBe(
      normalizeTitle('Manager of Engineering'),
    );
  });
});

describe('normalizeCompany', () => {
  it('strips legal suffix inc', () => {
    expect(normalizeCompany('Acme Inc')).toBe('acme');
  });

  it('strips labs suffix', () => {
    expect(normalizeCompany('Acme Labs')).toBe('acme');
  });

  it('strips TLD .io', () => {
    expect(normalizeCompany('protocol.io')).toBe('');
  });

  it('handles slash-separated names', () => {
    const tokens = normalizeCompany('MakerDAO / Sky');
    expect(tokens).toContain('makerdao');
    expect(tokens).toContain('sky');
  });
});

describe('contentKey', () => {
  const company = 'Acme Labs';

  it('same key for parenthetical and dash-separated tech qualifier', () => {
    expect(contentKey(company, 'Senior Backend Engineer (Rust)')).toBe(
      contentKey(company, 'Senior Backend Engineer - Rust'),
    );
  });

  it('same key when Remote suffix is present', () => {
    expect(contentKey(company, 'Senior Backend Engineer (Rust)')).toBe(
      contentKey(company, 'Senior Backend Engineer, Rust (Remote)'),
    );
  });

  it('different keys for different tech languages', () => {
    expect(contentKey(company, 'Senior Backend Engineer (Rust)')).not.toBe(
      contentKey(company, 'Senior Backend Engineer (Go)'),
    );
  });

  it('same key when legal suffix differs', () => {
    expect(contentKey('Acme Labs', 'Staff Engineer')).toBe(
      contentKey('Acme Inc', 'Staff Engineer'),
    );
  });

  it('produces a 40-character hex string', () => {
    const key = contentKey('Acme', 'Engineer');
    expect(key).toMatch(/^[0-9a-f]{40}$/);
  });
});
