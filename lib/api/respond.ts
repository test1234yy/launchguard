import { NextResponse } from 'next/server';

/** Consistent JSON error envelope for all API routes. */
export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function apiOk<T extends object>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status });
}
