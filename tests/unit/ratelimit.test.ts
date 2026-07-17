import { describe, it, expect } from 'vitest';
import { createRateLimiter, clientKeyFrom } from '@/lib/api/ratelimit';

describe('rate limiter', () => {
  it('allows requests under the limit and reports remaining', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => 1000 });
    expect(limiter.check('a')).toEqual({ allowed: true, remaining: 2, retryAfterSec: 0 });
    expect(limiter.check('a').remaining).toBe(1);
    expect(limiter.check('a').remaining).toBe(0);
  });

  it('denies the request over the limit with a retry hint', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => 1000 });
    limiter.check('a');
    limiter.check('a');
    const denied = limiter.check('a');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
    expect(denied.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 1000 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('opens a fresh window after windowMs', () => {
    let clock = 1000;
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => clock });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    clock += 10_001;
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('reset() clears all windows', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 1000 });
    limiter.check('a');
    limiter.reset();
    expect(limiter.check('a').allowed).toBe(true);
  });
});

describe('clientKeyFrom', () => {
  it('uses the first x-forwarded-for hop', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(clientKeyFrom(headers)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip, then a shared bucket', () => {
    expect(clientKeyFrom(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientKeyFrom(new Headers())).toBe('local');
  });
});
