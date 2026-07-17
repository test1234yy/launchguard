/**
 * Minimal fixed-window in-memory rate limiter for the API routes.
 *
 * Deliberately dependency-free and per-process: it protects a single
 * LaunchGuard instance from accidental hammering and cheap abuse. (Behind a
 * multi-instance load balancer each instance enforces its own window, which
 * is still a meaningful cap.)
 */

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window (0 when denied). */
  remaining: number;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSec: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

/** Keys tracked before old windows are pruned (bounds memory under key spray). */
const MAX_TRACKED_KEYS = 5000;

export interface RateLimiter {
  check(key: string): RateLimitDecision;
  reset(): void;
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { limit, windowMs } = options;
  const now = options.now ?? Date.now;
  const windows = new Map<string, WindowState>();

  function prune(current: number): void {
    if (windows.size <= MAX_TRACKED_KEYS) return;
    for (const [key, state] of windows) {
      if (current - state.windowStart >= windowMs) windows.delete(key);
    }
  }

  return {
    check(key: string): RateLimitDecision {
      const current = now();
      prune(current);
      const state = windows.get(key);
      if (!state || current - state.windowStart >= windowMs) {
        windows.set(key, { count: 1, windowStart: current });
        return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
      }
      if (state.count < limit) {
        state.count += 1;
        return { allowed: true, remaining: limit - state.count, retryAfterSec: 0 };
      }
      const retryAfterMs = state.windowStart + windowMs - current;
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    },
    reset(): void {
      windows.clear();
    },
  };
}

/** Best-effort client key: first hop of x-forwarded-for, else a shared bucket. */
export function clientKeyFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'local';
}

/** Shared per-route limiters (per server process). */
export const scanLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
export const uploadLimiter = createRateLimiter({ limit: 12, windowMs: 60_000 });
export const fixPlanLimiter = createRateLimiter({ limit: 12, windowMs: 60_000 });
