import { NextResponse } from 'next/server';
import { buildOpenApiSpec } from '@/lib/api/openapi';

/**
 * Machine-readable API documentation (OpenAPI 3.1). Static per build, so
 * clients and tools (Swagger UI, Postman, code generators) may cache it.
 */
export async function GET(): Promise<Response> {
  return NextResponse.json(buildOpenApiSpec(), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
