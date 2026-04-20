import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

export function isPrivateIp(ip: string): boolean {
  if (isIPv4(ip)) {
    if (ip === '0.0.0.0') return true;
    if (ip.startsWith('127.')) return true;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('169.254.')) return true;

    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1], 10);
      if (second >= 16 && second <= 31) return true;
    }

    return false;
  }

  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (/^fe[89ab]/i.test(lower)) return true;
    return false;
  }

  return false;
}

const BLOCKED_HOSTNAMES = new Set(['localhost']);

export async function isSafeUrl(href: string): Promise<boolean> {
  try {
    const parsed = new URL(href);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname;

    if (BLOCKED_HOSTNAMES.has(hostname)) return false;
    if (hostname.endsWith('.local')) return false;
    if (hostname === '169.254.169.254') return false;

    const { address } = await lookup(hostname);

    if (isPrivateIp(address)) return false;

    return true;
  } catch {
    return false;
  }
}
