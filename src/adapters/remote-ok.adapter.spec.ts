import { RemoteOKAdapter, RemoteOkEntry } from './remote-ok.adapter.js';

describe('RemoteOKAdapter', () => {
  let adapter: RemoteOKAdapter;

  beforeEach(() => {
    adapter = new RemoteOKAdapter();
  });

  describe('normalize', () => {
    const base: RemoteOkEntry = {
      id: 'remote-ts-engineer-acme-123456',
      position: 'Senior TypeScript Engineer',
      company: 'Acme Corp',
      url: 'https://remoteok.com/remote-jobs/123456',
      tags: ['typescript', 'nodejs'],
      date: '2024-05-18T00:00:00+00:00',
      description: '<p>Join us</p>',
      salary_min: 100_000,
      salary_max: 150_000,
      location: 'Worldwide',
    };

    it('maps all fields from a full fixture', () => {
      const job = adapter.normalize(base);

      expect(job).not.toBeNull();
      expect(job?.source).toBe('remoteok');
      expect(job?.sourceJobId).toBe('remote-ts-engineer-acme-123456');
      expect(job?.title).toBe('Senior TypeScript Engineer');
      expect(job?.company).toBe('Acme Corp');
      expect(job?.url).toBe('https://remoteok.com/remote-jobs/123456');
      expect(job?.tags).toEqual(['typescript', 'nodejs']);
      expect(job?.remote).toBe(true);
      expect(job?.salary).toBe('$100,000–$150,000');
      expect(job?.description).toBe('<p>Join us</p>');
      expect(job?.postedAt).toEqual(new Date('2024-05-18T00:00:00+00:00'));
    });

    it('returns null when position is missing', () => {
      expect(adapter.normalize({ ...base, position: undefined })).toBeNull();
    });

    it('returns null when company is missing', () => {
      expect(adapter.normalize({ ...base, company: undefined })).toBeNull();
    });

    it('returns null when url is missing', () => {
      expect(adapter.normalize({ ...base, url: undefined })).toBeNull();
    });

    it('formats salary with only salary_min as "N+"', () => {
      const job = adapter.normalize({ ...base, salary_max: undefined });
      expect(job?.salary).toBe('$100,000+');
    });

    it('omits salary when neither salary_min nor salary_max is set', () => {
      const job = adapter.normalize({ ...base, salary_min: undefined, salary_max: undefined });
      expect(job).not.toBeNull();
      expect('salary' in (job ?? {})).toBe(false);
    });

    it('marks remote=true for "Worldwide" location', () => {
      expect(adapter.normalize({ ...base, location: 'Worldwide' })?.remote).toBe(true);
    });

    it('marks remote=true for empty location', () => {
      expect(adapter.normalize({ ...base, location: '' })?.remote).toBe(true);
    });

    it('marks remote=true when location contains "remote"', () => {
      expect(adapter.normalize({ ...base, location: 'Remote (US)' })?.remote).toBe(true);
    });

    it('marks remote=false for an office-only location', () => {
      expect(adapter.normalize({ ...base, location: 'New York, NY' })?.remote).toBe(false);
    });

    it('omits postedAt when date is missing', () => {
      const job = adapter.normalize({ ...base, date: undefined });
      expect(job).not.toBeNull();
      expect('postedAt' in (job ?? {})).toBe(false);
    });

    it('omits sourceJobId when id is missing', () => {
      const job = adapter.normalize({ ...base, id: undefined });
      expect(job).not.toBeNull();
      expect('sourceJobId' in (job ?? {})).toBe(false);
    });

    it('defaults tags to empty array when missing', () => {
      const job = adapter.normalize({ ...base, tags: undefined });
      expect(job?.tags).toEqual([]);
    });
  });
});
