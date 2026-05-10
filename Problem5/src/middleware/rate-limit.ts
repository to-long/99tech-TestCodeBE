import { getConnInfo } from '@hono/node-server/conninfo';
import type { MiddlewareHandler } from 'hono';
import { LRUCache } from 'lru-cache';

interface RateLimitOpts {
  limit?: number;
  windowMs?: number;
  keyPrefix: string;
}

const buckets = new LRUCache<string, number[]>({ max: 10_000, ttl: 5 * 60_000 });

function clientIp(c: Parameters<MiddlewareHandler>[0]): string | null {
  const headers = c.req.raw.headers;
  const ip =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    null;
  if (ip) return ip;
  try {
    const raw = getConnInfo(c).remote.address ?? null;
    return raw?.startsWith('::ffff:') ? raw.slice(7) : raw;
  } catch {
    return null;
  }
}

export const rateLimit = (opts: RateLimitOpts): MiddlewareHandler => {
  const limit = opts.limit ?? 10;
  const windowMs = opts.windowMs ?? 60_000;
  return async (c, next) => {
    const ip = clientIp(c);
    if (!ip) return next();

    const key = `${opts.keyPrefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - windowMs;
    const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);

    if (hits.length >= limit) {
      const retryAfter = Math.ceil((hits[0] + windowMs - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests' }, 429);
    }

    hits.push(now);
    buckets.set(key, hits);
    await next();
  };
};
