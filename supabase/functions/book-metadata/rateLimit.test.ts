import { describe, expect, it } from 'vitest';
import { createRateLimiter, getRateLimitKey } from './rateLimit.ts';

describe('book-metadata rate limiter', () => {
  it('allows up to max requests then blocks until the window resets', () => {
    let now = 0;
    const check = createRateLimiter({ windowMs: 60_000, max: 2, now: () => now });

    expect(check('user:1').allowed).toBe(true);
    expect(check('user:1').allowed).toBe(true);
    const blocked = check('user:1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    now = 60_000;
    expect(check('user:1').allowed).toBe(true);
  });

  it('keeps separate buckets per key', () => {
    const check = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(check('user:a').allowed).toBe(true);
    expect(check('user:b').allowed).toBe(true);
    expect(check('user:a').allowed).toBe(false);
  });

  it('prefers the authenticated subject over the forwarded IP', () => {
    const payload = btoa(JSON.stringify({ sub: 'user-42' }));
    const headers = new Headers({
      authorization: `Bearer x.${payload}.y`,
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    });

    expect(getRateLimitKey({ headers })).toBe('user:user-42');
    expect(getRateLimitKey({ headers: new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }) })).toBe('ip:1.2.3.4');
  });
});
