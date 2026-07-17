import { describe, it, expect } from 'vitest';
import { GET as getRules } from '@/app/api/rules/route';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getBadge } from '@/app/api/badge/route';
import { GET as getOpenApi } from '@/app/api/openapi/route';
import { POST as postScan } from '@/app/api/scan/route';
import { POST as postFixPlan } from '@/app/api/fix-plan/route';
import { ALL_RULES } from '@/lib/scanner/rules';
import { APP_VERSION } from '@/lib/version';
import { buildReport } from '@/lib/scanner/engine';
import { demoProject } from '@/lib/sources/demo';

/**
 * Route-handler integration tests: the App Router handlers are plain
 * functions over Request/Response, so they can be exercised without a server.
 */

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('GET /api/rules', () => {
  it('returns the full catalog', async () => {
    const res = await getRules();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(ALL_RULES.length);
    expect(body.rules).toHaveLength(ALL_RULES.length);
    expect(body.categories).toContain('quality');
    const sec001 = body.rules.find((r: { id: string }) => r.id === 'SEC001');
    expect(sec001).toMatchObject({ severity: 'critical', category: 'secrets' });
  });
});

describe('GET /api/health', () => {
  it('reports healthy with version and rule count', async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, status: 'healthy', version: APP_VERSION, rules: ALL_RULES.length });
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(typeof body.timestamp).toBe('string');
  });
});

describe('GET /api/openapi', () => {
  it('serves a valid OpenAPI 3.1 document describing every route', async () => {
    const res = await getOpenApi();
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.version).toBe(APP_VERSION);
    for (const path of ['/api/scan', '/api/upload', '/api/fix-plan', '/api/rules', '/api/health', '/api/badge', '/api/openapi']) {
      expect(spec.paths[path]).toBeDefined();
    }
    expect(spec.components.schemas.ScanReport).toBeDefined();
    expect(spec.components.schemas.ErrorEnvelope).toBeDefined();
  });

  it('every $ref resolves to a defined schema', async () => {
    const res = await getOpenApi();
    const spec = await res.json();
    const refs = new Set<string>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') refs.add(value);
        else walk(value);
      }
    };
    walk(spec);
    expect(refs.size).toBeGreaterThan(0);
    for (const ref of refs) {
      const name = ref.replace('#/components/schemas/', '');
      expect(spec.components.schemas[name], `missing schema for ${ref}`).toBeDefined();
    }
  });
});

describe('GET /api/badge', () => {
  it('serves an SVG for a valid score', async () => {
    const res = await getBadge(new Request('http://localhost/api/badge?score=87'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    const svg = await res.text();
    expect(svg).toContain('87/100');
  });

  it('rejects missing, non-numeric and out-of-range scores', async () => {
    for (const qs of ['', '?score=', '?score=abc', '?score=101', '?score=-1', '?score=1e2']) {
      const res = await getBadge(new Request(`http://localhost/api/badge${qs}`));
      expect(res.status).toBe(400);
    }
  });
});

describe('POST /api/scan (demo mode)', () => {
  it('returns a full report for the demo project', async () => {
    const res = await postScan(jsonRequest('http://localhost/api/scan', { mode: 'demo' }, { 'x-forwarded-for': '198.51.100.10' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.report.score).toBeGreaterThanOrEqual(0);
    expect(body.report.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(body.report.findings.length).toBeGreaterThan(10);
  });

  it('rejects malformed bodies and unknown modes', async () => {
    const bad = await postScan(
      new Request('http://localhost/api/scan', { method: 'POST', body: '{nope', headers: { 'x-forwarded-for': '198.51.100.11' } })
    );
    expect(bad.status).toBe(400);
    const unknown = await postScan(jsonRequest('http://localhost/api/scan', { mode: 'ftp' }, { 'x-forwarded-for': '198.51.100.11' }));
    expect(unknown.status).toBe(400);
  });

  it('rate-limits an abusive client with 429 + Retry-After', async () => {
    const key = { 'x-forwarded-for': '203.0.113.99' };
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) {
      last = await postScan(jsonRequest('http://localhost/api/scan', { mode: 'demo' }, key));
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0);
    // A different client is unaffected.
    const other = await postScan(jsonRequest('http://localhost/api/scan', { mode: 'demo' }, { 'x-forwarded-for': '203.0.113.100' }));
    expect(other.status).toBe(200);
  });
});

describe('POST /api/fix-plan', () => {
  it('generates a deterministic plan for a scanned report', async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const report = buildReport(demoProject(), { source: { type: 'demo', ref: 'demo' } });
      const res = await postFixPlan(
        jsonRequest('http://localhost/api/fix-plan', { report }, { 'x-forwarded-for': '198.51.100.20' })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plan.source).toBe('deterministic');
      expect(body.plan.markdown).toContain('Fix plan');
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
  });

  it('rejects reports that fail shape validation', async () => {
    const res = await postFixPlan(
      jsonRequest('http://localhost/api/fix-plan', { report: { projectName: 'x' } }, { 'x-forwarded-for': '198.51.100.21' })
    );
    expect(res.status).toBe(400);
  });
});
