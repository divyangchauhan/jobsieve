import { parseValidatedCsv } from './ai-company-csv.js';

const options = {
  label: 'companies.csv',
  requiredHeaders: ['company_key', 'company_name'],
  keyHeader: 'company_key',
  minimumRows: 1,
} as const;

describe('AI company CSV validation', () => {
  it('parses escaped quotes and multiline fields', () => {
    expect(
      parseValidatedCsv(
        'company_key,company_name,description\nacme,"Acme, Inc.","first\nsecond ""line"""\n',
        options,
      ),
    ).toEqual([
      {
        company_key: 'acme',
        company_name: 'Acme, Inc.',
        description: 'first\nsecond "line"',
      },
    ]);
  });

  it('rejects an unbalanced quoted field', () => {
    expect(() =>
      parseValidatedCsv('company_key,company_name\nacme,"Acme\n', options),
    ).toThrow('unbalanced quoted field');
  });

  it('rejects content after a closing quote', () => {
    expect(() =>
      parseValidatedCsv('company_key,company_name\nacme,"Acme"junk\n', options),
    ).toThrow('unexpected character after a quoted field');
  });

  it('rejects rows with an inconsistent number of columns', () => {
    expect(() =>
      parseValidatedCsv('company_key,company_name\nacme\n', options),
    ).toThrow('has 1 columns; expected 2');
  });

  it('rejects an unexpectedly small corpus', () => {
    expect(() =>
      parseValidatedCsv('company_key,company_name\n', options),
    ).toThrow('found 0 rows; expected at least 1');
  });

  it('rejects missing and duplicate company keys', () => {
    expect(() =>
      parseValidatedCsv('company_key,company_name\n,Acme\n', options),
    ).toThrow('has an empty company_key');
    expect(() =>
      parseValidatedCsv(
        'company_key,company_name\nacme,Acme\nacme,Acme Two\n',
        options,
      ),
    ).toThrow('duplicate company_key value acme');
  });
});
