import { describe, it, expect } from 'vitest';
import { apiError, apiOk, apiTooManyRequests } from '../../lib/api/respond';

describe('API response utilities', () => {
  it('apiError returns 400 with error envelope by default', async () => {
    const response = apiError('Something went wrong');
    expect(response.status).toBe(400);

    const body = await response.json() as any;
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Something went wrong');
  });

  it('apiError accepts custom status codes', async () => {
    const response = apiError('Not found', 404);
    expect(response.status).toBe(404);

    const body = await response.json() as any;
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Not found');
  });

  it('apiOk returns 200 with data and ok=true by default', async () => {
    const response = apiOk({ count: 42, name: 'test' });
    expect(response.status).toBe(200);

    const body = await response.json() as any;
    expect(body.ok).toBe(true);
    expect(body.count).toBe(42);
    expect(body.name).toBe('test');
  });

  it('apiOk accepts custom status codes', async () => {
    const response = apiOk({ id: 123 }, 201);
    expect(response.status).toBe(201);

    const body = await response.json() as any;
    expect(body.ok).toBe(true);
    expect(body.id).toBe(123);
  });

  it('apiTooManyRequests returns 429 with Retry-After header', async () => {
    const response = apiTooManyRequests(60);
    expect(response.status).toBe(429);

    const retryAfter = response.headers.get('Retry-After');
    expect(retryAfter).toBe('60');

    const body = await response.json() as any;
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Too many requests');
    expect(body.error).toContain('60s');
  });

  it('apiTooManyRequests correctly formats Retry-After for various durations', async () => {
    const response = apiTooManyRequests(5);
    expect(response.headers.get('Retry-After')).toBe('5');

    const response2 = apiTooManyRequests(3600);
    expect(response2.headers.get('Retry-After')).toBe('3600');
  });

  it('apiError envelope does not include ok property', async () => {
    const response = apiError('Invalid request', 400);
    const body = await response.json() as any;

    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('error');
  });

  it('apiOk spreads data into response body', async () => {
    const data = { score: 85, findings: 3, timestamp: '2026-01-01T00:00:00Z' };
    const response = apiOk(data);
    const body = await response.json() as any;

    expect(body.ok).toBe(true);
    expect(body.score).toBe(85);
    expect(body.findings).toBe(3);
    expect(body.timestamp).toBe('2026-01-01T00:00:00Z');
  });
});
