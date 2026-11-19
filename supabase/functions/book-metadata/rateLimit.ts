export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function createRateLimiter({ windowMs, max, now = Date.now }: RateLimiterOptions) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return function checkRateLimit(key: string): RateLimitResult {
    const current = now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= current) {
      buckets.set(key, { count: 1, resetAt: current + windowMs });
      if (buckets.size > 1000) {
        for (const [entryKey, entry] of buckets) {
          if (entry.resetAt <= current) buckets.delete(entryKey);
        }
      }
      return { allowed: true, remaining: max - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));
    if (bucket.count >= max) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    bucket.count += 1;
    return { allowed: true, remaining: max - bucket.count, retryAfterSeconds };
  };
}

export function getRateLimitKey(req: { headers: Headers }): string {
  const authorization = req.headers.get('authorization') || '';
  if (authorization.startsWith('Bearer ')) {
    const payload = authorization.slice(7).split('.')[1];
    if (payload) {
      try {
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
        const claims = JSON.parse(atob(padded));
        if (typeof claims.sub === 'string' && claims.sub) return `user:${claims.sub}`;
      } catch {}
    }
  }

  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anonymous';
  return `ip:${ip}`;
}
