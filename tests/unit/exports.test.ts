import { describe, it, expect } from 'vitest';
import { buildReport } from '@/lib/scanner/engine';
import { demoProject } from '@/lib/sources/demo';
import { reportToSarif } from '@/lib/report/sarif';
import { reportToHtml } from '@/lib/report/html';
import { badgeSvg, badgeColor } from '@/lib/report/badge';
import { reportToCsv, reportToXml, reportToMarkdown } from '@/lib/report/export';

const report = buildReport(demoProject(), { source: { type: 'demo', ref: 'demo' } });

describe('SARIF export', () => {
  const sarif = JSON.parse(reportToSarif(report));

  it('emits a valid SARIF 2.1.0 skeleton', () => {
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('LaunchGuard');
  });

  it('emits one result per finding with mapped levels', () => {
    expect(sarif.runs[0].results).toHaveLength(report.findings.length);
    const levels = new Set(sarif.runs[0].results.map((r: { level: string }) => r.level));
    for (const level of levels) expect(['error', 'warning', 'note']).toContain(level);
    const critical = report.findings.find((f) => f.severity === 'critical');
    const result = sarif.runs[0].results.find((r: { ruleId: string }) => r.ruleId === critical?.ruleId);
    expect(result.level).toBe('error');
  });

  it('describes every referenced rule exactly once', () => {
    const ruleIds = sarif.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    for (const result of sarif.runs[0].results) {
      expect(ruleIds).toContain(result.ruleId);
    }
  });

  it('omits locations for project-level findings', () => {
    const projectLevel = sarif.runs[0].results.filter(
      (r: { locations?: unknown[] }) => r.locations === undefined
    );
    // The demo triggers at least one "(project)" finding (e.g. missing CI).
    expect(projectLevel.length).toBeGreaterThan(0);
  });

  it('carries the score and fingerprint as run properties', () => {
    expect(sarif.runs[0].properties.score).toBe(report.score);
    expect(sarif.runs[0].properties.fingerprint).toBe(report.fingerprint);
  });
});

describe('HTML export', () => {
  it('produces a self-contained document with the score and findings', () => {
    const html = reportToHtml(report);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain(`${report.score}<span`);
    expect(html).toContain(report.findings[0].ruleId);
    expect(html).not.toContain('<script');
  });

  it('escapes HTML in dynamic content', () => {
    const hostile = {
      ...report,
      projectName: '<script>alert(1)</script>',
      findings: report.findings.slice(0, 1).map((f) => ({ ...f, evidence: '<img src=x onerror=alert(1)>' })),
    };
    const html = reportToHtml(hostile);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('badge SVG', () => {
  it('renders the clamped score with a threshold color', () => {
    const svg = badgeSvg(87, 'Nearly ready');
    expect(svg).toContain('87/100');
    expect(svg).toContain('launchguard');
    expect(svg).toContain(badgeColor(87));
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('clamps out-of-range scores', () => {
    expect(badgeSvg(150, 'x')).toContain('100/100');
    expect(badgeSvg(-5, 'x')).toContain('0/100');
  });

  it('maps score bands to distinct colors', () => {
    const colors = [95, 80, 60, 30, 5].map(badgeColor);
    expect(new Set(colors).size).toBe(5);
  });
});

describe('tabular exports', () => {
  it('CSV has a header and one row per finding', () => {
    const csv = reportToCsv(report);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Severity');
    expect(lines).toHaveLength(report.findings.length + 1);
  });

  it('XML escapes content and includes every finding', () => {
    const xml = reportToXml(report);
    expect(xml).toContain('<?xml version="1.0"');
    expect((xml.match(/<finding /g) ?? []).length).toBe(report.findings.length);
    expect(xml).not.toMatch(/<evidence>[^<]*<img/);
  });

  it('Markdown includes the new fingerprint and duration lines', () => {
    const md = reportToMarkdown(report);
    expect(md).toContain('**Scan duration:**');
    expect(md).toContain(`**Fingerprint:** \`${report.fingerprint}\``);
  });
});
