import {
  assertPublicHttpUrl,
  isPublicIpAddress,
  resolvePublicHttpUrl,
} from './ai-company-network-policy.js';

describe('AI company discovery network policy', () => {
  it('rejects private, loopback, link-local, and mapped addresses', () => {
    expect(isPublicIpAddress('10.0.0.1')).toBe(false);
    expect(isPublicIpAddress('127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('169.254.169.254')).toBe(false);
    expect(isPublicIpAddress('::1')).toBe(false);
    expect(isPublicIpAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('fec0::1')).toBe(false);
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('rejects private discovery targets before requesting them', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/jobs')).rejects.toThrow(
      'non-public address',
    );
  });

  it('pins requests to the address that passed validation', async () => {
    const target = await resolvePublicHttpUrl('https://8.8.8.8/jobs');
    await expect(
      new Promise<{ address: string; family: number }>((resolve, reject) => {
        target.lookup('8.8.8.8', { family: 4 }, (error, address, family) => {
          if (error) return reject(error);
          if (typeof address !== 'string') {
            return reject(new Error('expected one pinned address'));
          }
          resolve({ address, family: family ?? 0 });
        });
      }),
    ).resolves.toEqual({ address: '8.8.8.8', family: 4 });
  });
});
