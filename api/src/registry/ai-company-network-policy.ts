import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const NON_PUBLIC_ADDRESSES = new BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fec0::', 10],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(address, prefix, 'ipv6');
}

export function isPublicIpAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, '');
  const family = isIP(normalized);
  if (family === 4) return !NON_PUBLIC_ADDRESSES.check(normalized, 'ipv4');
  if (family === 6) return !NON_PUBLIC_ADDRESSES.check(normalized, 'ipv6');
  return false;
}

export interface ResolvedPublicHttpUrl {
  readonly url: URL;
  readonly lookup: PinnedLookupFunction;
}

interface PinnedLookupAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

type PinnedLookupFunction = (
  hostname: string,
  options: object,
  callback: (
    error: Error | null,
    address: string | PinnedLookupAddress | PinnedLookupAddress[],
    family?: 4 | 6,
  ) => void,
) => void;

function normalizedHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

export async function resolvePublicHttpUrl(
  rawUrl: string,
): Promise<ResolvedPublicHttpUrl> {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`unsupported discovery URL protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('discovery URLs must not contain credentials');
  }

  const hostname = normalizedHostname(url.hostname);
  const literalFamily = isIP(hostname);
  const rawAddresses =
    literalFamily === 0
      ? await lookup(hostname, { all: true, verbatim: true })
      : [{ address: hostname, family: literalFamily as 4 | 6 }];
  const addresses = rawAddresses.flatMap((result): PinnedLookupAddress[] =>
    result.family === 4 || result.family === 6
      ? [{ address: result.address, family: result.family }]
      : [],
  );
  if (
    addresses.length === 0 ||
    addresses.some((result) => !isPublicIpAddress(result.address))
  ) {
    throw new Error(
      `discovery URL resolves to a non-public address: ${hostname}`,
    );
  }
  const pinnedLookup: PinnedLookupFunction = (
    requested,
    rawOptions,
    callback,
  ) => {
    if (normalizedHostname(requested) !== hostname) {
      const error = new Error(
        `refusing DNS lookup for unexpected host: ${requested}`,
      ) as NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';
      callback(error, '');
      return;
    }
    const options = rawOptions as {
      readonly all?: boolean;
      readonly family?: number;
    };
    const requestedFamily = options.family;
    const candidates =
      requestedFamily === 4 || requestedFamily === 6
        ? addresses.filter((result) => result.family === requestedFamily)
        : addresses;
    const first = candidates[0];
    if (first === undefined) {
      const error = new Error(
        `no validated address for requested family: ${String(requestedFamily)}`,
      ) as NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';
      callback(error, '');
      return;
    }
    if (options.all) callback(null, candidates);
    else callback(null, first.address, first.family);
  };
  return { url, lookup: pinnedLookup };
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  return (await resolvePublicHttpUrl(rawUrl)).url;
}
