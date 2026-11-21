import { lookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * Hosts OpenPress will connect to on behalf of plugins, imports, and webhooks.
 * A name that looks public is not enough: the connection itself uses a DNS
 * lookup that refuses private, loopback, and link-local answers.
 */

export function isPublicHostname(host: string) {
  const name = host.trim().toLowerCase().replace(/\.$/, '');
  if (!name || name === 'localhost' || name.endsWith('.localhost')) return false;
  if (name.endsWith('.local') || name.endsWith('.internal') || name.endsWith('.localdomain')) return false;
  if (name.includes(':') || name.includes('%')) return false;
  if (/^\d+$/.test(name) || name.startsWith('0x')) return false;
  if (isIP(name)) return isPublicIp(name);
  if (!/^[a-z0-9.-]+$/.test(name) || !name.includes('.') || !/[a-z]/.test(name)) return false;
  return true;
}

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}
blockedAddresses.addAddress('::', 'ipv6');
blockedAddresses.addAddress('::1', 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');
blockedAddresses.addSubnet('ff00::', 8, 'ipv6');

export function isPublicIp(address: string) {
  const version = isIP(address);
  if (version === 4) return !blockedAddresses.check(address, 'ipv4');
  if (version === 6) {
    if (blockedAddresses.check(address, 'ipv6')) return false;
    const mapped = address.toLowerCase().match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped && blockedAddresses.check(mapped[1], 'ipv4')) return false;
    return true;
  }
  return false;
}

export function hostAllowed(hostname: string, allowlist: string[]) {
  const host = hostname.toLowerCase();
  if (!isPublicHostname(host)) return false;
  return allowlist.some((entry) => {
    const rule = entry.toLowerCase();
    if (rule.startsWith('*.')) return host === rule.slice(2) || host.endsWith(rule.slice(1));
    return host === rule;
  });
}

export interface PublicResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export function requestPublic(
  target: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<PublicResponse> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return Promise.reject(new Error('Invalid URL'));
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return Promise.reject(new Error('Only HTTP(S) URLs are allowed'));
  }
  if (url.username || url.password) return Promise.reject(new Error('URLs with credentials are not allowed'));
  if (!isPublicHostname(url.hostname)) return Promise.reject(new Error('refused non-public URL'));

  const lib = url.protocol === 'https:' ? https : http;
  const maxBytes = init.maxBytes ?? 1_000_000;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: init.method ?? 'GET',
        headers: init.headers,
        lookup: publicLookup,
        timeout: init.timeoutMs ?? 10_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new Error('response too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') headers[key] = value;
            else if (Array.isArray(value)) headers[key] = value.join(', ');
          }
          resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks) });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

const publicLookup: LookupFunction = (hostname, options, callback) => {
  const done = typeof options === 'function' ? options : callback;
  if (!isPublicHostname(hostname)) {
    done(new Error('refused non-public URL'), '', 4);
    return;
  }
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error || !Array.isArray(addresses) || addresses.length === 0) {
      done(error ?? new Error('lookup failed'), '', 4);
      return;
    }
    if (addresses.some((item) => !isPublicIp(item.address))) {
      done(new Error('refused non-public address'), '', 4);
      return;
    }
    const chosen = addresses[0];
    done(null, chosen.address, chosen.family);
  });
};
