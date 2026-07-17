import { describe, it, expect } from 'vitest';
import type { ScanReport, ScannedFile, ProjectSnapshot } from '@/lib/scanner/types';
import { buildReport } from '@/lib/scanner/engine';
import { diffReports, summarizeDiff, findingKey } from '@/lib/report/diff';

function f(path: string, content: string): ScannedFile {
  return { path, content, size: Buffer.byteLength(content), binary: false };
}
function project(files: ScannedFile[], name = 'proj'): ProjectSnapshot {
  return { name, files };
}
function report(files: ScannedFile[], name = 'proj'): ScanReport {
  return buildReport(project(files, name), { source: { type: 'zip', ref: `${name}.zip` } });
}

describe('findingKey', () => {
  it('is stable across rule/file/line and independent of evidence', () => {
    expect(findingKey({ ruleId: 'SEC001', file: '.env', line: 3 })).toBe('SEC001|.env|3');
    expect(findingKey({ ruleId: 'CI001', file: '(project)', line: undefined })).toBe('CI001|(project)|0');
  });
});

describe('diffReports', () => {
  it('reports identical when the same project is scanned twice', () => {
    const files = [f('package.json', '{"name":"x","dependencies":{"next":"latest"}}')];
    const diff = diffReports(report(files), report(files));
    expect(diff.identical).toBe(true);
    expect(diff.scoreDelta).toBe(0);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged.length).toBeGreaterThan(0);
  });

  it('detects resolved findings and a score improvement', () => {
    // Baseline has a committed .env (critical); current fixes it.
    const base = report([f('.env', 'SECRET=abcdef0123456789'), f('package.json', '{"name":"x"}')]);
    const current = report([f('package.json', '{"name":"x"}')]);
    const diff = diffReports(base, current);

    expect(diff.identical).toBe(false);
    expect(diff.removed.some((x) => x.ruleId === 'SEC001')).toBe(true);
    expect(diff.added.some((x) => x.ruleId === 'SEC001')).toBe(false);
    expect(diff.current.score).toBeGreaterThan(diff.base.score);
    expect(diff.scoreDelta).toBeGreaterThan(0);
  });

  it('detects newly introduced findings as additions', () => {
    const base = report([f('package.json', '{"name":"x"}')]);
    const current = report([f('.env', 'SECRET=abcdef0123456789'), f('package.json', '{"name":"x"}')]);
    const diff = diffReports(base, current);

    expect(diff.added.some((x) => x.ruleId === 'SEC001')).toBe(true);
    expect(diff.removed.some((x) => x.ruleId === 'SEC001')).toBe(false);
    expect(diff.scoreDelta).toBeLessThan(0);
  });

  it('partitions findings so added + unchanged equals the current total', () => {
    const base = report([f('.env', 'SECRET=abcdef0123456789'), f('package.json', '{"name":"x"}')]);
    const current = report([f('Dockerfile', 'FROM node:latest'), f('package.json', '{"name":"x"}')]);
    const diff = diffReports(base, current);

    expect(diff.added.length + diff.unchanged.length).toBe(diff.current.total);
    expect(diff.removed.length + diff.unchanged.length).toBe(diff.base.total);
  });

  it('builds a per-severity delta table in canonical order', () => {
    const base = report([f('.env', 'SECRET=abcdef0123456789'), f('package.json', '{"name":"x"}')]);
    const current = report([f('package.json', '{"name":"x"}')]);
    const diff = diffReports(base, current);

    expect(diff.bySeverity.map((r) => r.severity)).toEqual(['critical', 'high', 'medium', 'low', 'info']);
    for (const row of diff.bySeverity) {
      expect(row.delta).toBe(row.after - row.before);
    }
    // Fixing the .env removes at least one critical.
    expect(diff.bySeverity[0].delta).toBeLessThan(0);
  });

  it('sorts added findings by severity (critical first)', () => {
    const base = report([f('package.json', '{"name":"x"}')]);
    const current = report([
      f('.env', 'SECRET=abcdef0123456789'),
      f('Dockerfile', 'FROM node:latest'),
      f('package.json', '{"name":"x"}'),
    ]);
    const diff = diffReports(base, current);
    const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    for (let i = 1; i < diff.added.length; i++) {
      expect(rank[diff.added[i].severity]).toBeGreaterThanOrEqual(rank[diff.added[i - 1].severity]);
    }
  });
});

describe('summarizeDiff', () => {
  it('says "no change" for identical scans', () => {
    const files = [f('package.json', '{"name":"x"}')];
    expect(summarizeDiff(diffReports(report(files), report(files)))).toMatch(/no change/i);
  });

  it('summarizes score movement and counts', () => {
    const base = report([f('.env', 'SECRET=abcdef0123456789'), f('package.json', '{"name":"x"}')]);
    const current = report([f('package.json', '{"name":"x"}')]);
    const summary = summarizeDiff(diffReports(base, current));
    expect(summary).toMatch(/Score \d+ → \d+/);
    expect(summary).toMatch(/resolved/);
  });
});
