import { NextResponse } from 'next/server';

/** Consistent JSON error envelope for all API routes. */
export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function apiOk<T extends object>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status });
}

/** 429 envelope with a standards-compliant Retry-After header. */
export function apiTooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { ok: false, error: `Too many requests. Try again in ${retryAfterSec}s.` },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}
