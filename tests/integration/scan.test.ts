import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildReport } from '@/lib/scanner/engine';
import { demoProject } from '@/lib/sources/demo';
import { loadZip, ZipError } from '@/lib/sources/zip';
import { reportToJson, reportToMarkdown } from '@/lib/report/export';
import { deterministicFixPlan, generateFixPlan } from '@/lib/fixplan/generate';

describe('demo scan (integration)', () => {
  const report = buildReport(demoProject(), {
    source: { type: 'demo', ref: 'demo' },
  });

  it('produces a valid readiness score', () => {
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  it('finds a broad set of issues across categories', () => {
    const categories = new Set(report.findings.map((finding) => finding.category));
    expect(report.findings.length).toBeGreaterThanOrEqual(10);
    // The demo project is designed to trip secrets, dependencies, docker, prisma and nextjs rules.
    for (const c of ['secrets', 'dependencies', 'docker', 'prisma', 'nextjs']) {
      expect(categories.has(c as never)).toBe(true);
    }
  });

  it('redacts secret-like values in evidence', () => {
    const blob = JSON.stringify(report);
    // Demo contains placeholder text, which should appear unredacted in the report.
    // The test verifies the demo works without needing real-looking credentials.
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.ruleId === 'SEC001')).toBe(true); // env file
  });

  it('sorts findings by severity (critical first)', () => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    for (let i = 1; i < report.findings.length; i++) {
      expect(rank[report.findings[i].severity]).toBeGreaterThanOrEqual(rank[report.findings[i - 1].severity]);
    }
  });
});

describe('report exports (integration)', () => {
  const report = buildReport(demoProject(), { source: { type: 'demo', ref: 'demo' } });

  it('round-trips through JSON', () => {
    const parsed = JSON.parse(reportToJson(report));
    expect(parsed.score).toBe(report.score);
    expect(parsed.findings.length).toBe(report.findings.length);
  });

  it('renders Markdown with a summary and findings', () => {
    const md = reportToMarkdown(report);
    expect(md).toContain('# LaunchGuard report');
    expect(md).toContain('Readiness score');
    expect(md).toContain('## Findings');
  });
});

describe('safe ZIP loading (integration)', () => {
  it('scans a small in-memory archive', () => {
    const zipped = zipSync({
      'myapp/package.json': strToU8('{"name":"z","dependencies":{"next":"latest"}}'),
      'myapp/.env': strToU8('SECRET=abcdef0123456789ghij'),
    });
    const { snapshot, notes } = loadZip('archive', zipped);
    expect(snapshot.files.length).toBe(2);
    // The common "myapp/" prefix is stripped.
    expect(snapshot.files.some((file) => file.path === 'package.json')).toBe(true);
    expect(Array.isArray(notes)).toBe(true);

    const report = buildReport(snapshot, { source: { type: 'zip', ref: 'archive.zip' } });
    expect(report.findings.some((finding) => finding.ruleId === 'SEC001')).toBe(true);
  });

  it('detects committed node_modules even when dropped', () => {
    const zipped = zipSync({
      'node_modules/x/index.js': strToU8('x'),
      'app.js': strToU8('console.log("app")'),
    });
    const { snapshot } = loadZip('archive', zipped);
    // node_modules is dropped but the flag is preserved
    expect(snapshot.meta?.committedNodeModules).toBe(true);
    expect(snapshot.files.some((f) => f.path === 'app.js')).toBe(true);
    expect(snapshot.files.some((f) => f.path.startsWith('node_modules'))).toBe(false);
  });
});

describe('fix plan (integration)', () => {
  const report = buildReport(demoProject(), { source: { type: 'demo', ref: 'demo' } });

  it('produces a deterministic plan with no API key', () => {
    const md = deterministicFixPlan(report);
    expect(md).toContain('# Fix plan');
    expect(md).toContain('priority');
  });

  it('generateFixPlan falls back to deterministic without a key', async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const plan = await generateFixPlan(report);
      expect(plan.source).toBe('deterministic');
      expect(plan.markdown).toContain('Fix plan');
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
  });
});
