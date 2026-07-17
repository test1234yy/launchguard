import { describe, it, expect } from 'vitest';
import type { ProjectSnapshot, ScannedFile } from '@/lib/scanner/types';
import { parseScanConfig } from '@/lib/scanner/config';
import { buildReport } from '@/lib/scanner/engine';

function f(path: string, content: string): ScannedFile {
  return { path, content, size: Buffer.byteLength(content), binary: false };
}
function project(files: ScannedFile[], name = 'cfg-test'): ProjectSnapshot {
  return { name, files };
}

const SOURCE = { source: { type: 'zip' as const, ref: 'test.zip' } };

describe('parseScanConfig', () => {
  it('returns an empty config when no file exists', () => {
    const config = parseScanConfig(project([f('package.json', '{}')]));
    expect(config.ignoreRules).toEqual([]);
    expect(config.minSeverity).toBeUndefined();
    expect(config.notes).toEqual([]);
  });

  it('notes and ignores invalid JSON', () => {
    const config = parseScanConfig(project([f('launchguard.config.json', '{nope')]));
    expect(config.ignoreRules).toEqual([]);
    expect(config.notes.join(' ')).toContain('not valid JSON');
  });

  it('accepts known rule ids case-insensitively and reports unknown ones', () => {
    const config = parseScanConfig(
      project([f('launchguard.config.json', '{"ignoreRules":["cfg004","NOPE123","CFG004"]}')])
    );
    expect(config.ignoreRules).toEqual(['CFG004']);
    expect(config.notes.join(' ')).toContain('NOPE123');
  });

  it('validates minSeverity', () => {
    expect(parseScanConfig(project([f('launchguard.config.json', '{"minSeverity":"medium"}')])).minSeverity).toBe('medium');
    const bad = parseScanConfig(project([f('launchguard.config.json', '{"minSeverity":"apocalyptic"}')]));
    expect(bad.minSeverity).toBeUndefined();
    expect(bad.notes.join(' ')).toContain('invalid minSeverity');
  });
});

describe('engine applies scan config', () => {
  // A project that reliably trips CFG001 (no .gitignore), CFG004 (no README) and DEP005.
  const baseFiles = [f('package.json', '{"name":"x","private":true,"license":"MIT"}'), f('src/index.spec.ts', 'it()')];

  it('suppresses ignored rules, counts them, and notes the config', () => {
    const without = buildReport(project(baseFiles), SOURCE);
    expect(without.findings.some((x) => x.ruleId === 'CFG001')).toBe(true);

    const withConfig = buildReport(
      project([...baseFiles, f('launchguard.config.json', '{"ignoreRules":["CFG001"]}')]),
      SOURCE
    );
    expect(withConfig.findings.some((x) => x.ruleId === 'CFG001')).toBe(false);
    expect(withConfig.suppressedFindings).toBeGreaterThan(0);
    expect(withConfig.notes.join(' ')).toContain('CFG001');
    expect(withConfig.score).toBeGreaterThanOrEqual(without.score);
  });

  it('hides findings below minSeverity', () => {
    const report = buildReport(
      project([...baseFiles, f('launchguard.config.json', '{"minSeverity":"high"}')]),
      SOURCE
    );
    expect(report.findings.every((x) => x.severity === 'critical' || x.severity === 'high')).toBe(true);
    expect(report.notes.join(' ')).toContain('below "high"');
  });

  it('always carries duration, fingerprint and fileTypes', () => {
    const report = buildReport(project(baseFiles), SOURCE);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(report.fileTypes.json).toBe(1);
    expect(report.suppressedFindings).toBe(0);
  });

  it('produces identical fingerprints for identical content across runs', () => {
    const a = buildReport(project(baseFiles), SOURCE);
    const b = buildReport(project(baseFiles), SOURCE);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.id).not.toBe(b.id); // ids stay unique per run
  });
});
