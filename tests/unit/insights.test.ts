import { describe, it, expect } from 'vitest';
import type { Finding } from '@/lib/scanner/types';
import { effortFor, projectedScores, quickWins, fileTypeBreakdown, EFFORT_LABEL } from '@/lib/scanner/insights';
import { reportFingerprint, fnv1a } from '@/lib/scanner/fingerprint';

function finding(overrides: Partial<Finding> & Pick<Finding, 'ruleId' | 'severity' | 'category'>): Finding {
  return {
    id: `${overrides.ruleId}-1`,
    title: overrides.ruleId,
    file: 'a.ts',
    evidence: 'e',
    remediation: 'r',
    ...overrides,
  } as Finding;
}

describe('effort model', () => {
  it('uses category defaults', () => {
    expect(effortFor('SEC001', 'secrets')).toBe('involved');
    expect(effortFor('DOC001', 'docker')).toBe('quick');
  });

  it('applies per-rule overrides', () => {
    expect(effortFor('DEP004', 'dependencies')).toBe('involved');
    expect(effortFor('CFG003', 'configuration')).toBe('involved');
    expect(effortFor('CI004', 'ci')).toBe('quick');
  });

  it('falls back to moderate for unknown categories', () => {
    expect(effortFor('ZZZ999', 'unknown' as never)).toBe('moderate');
  });

  it('labels every effort level', () => {
    expect(EFFORT_LABEL.quick).toBeTruthy();
    expect(EFFORT_LABEL.moderate).toBeTruthy();
    expect(EFFORT_LABEL.involved).toBeTruthy();
  });
});

describe('projected scores', () => {
  const findings = [
    finding({ ruleId: 'SEC001', severity: 'critical', category: 'secrets' }),
    finding({ ruleId: 'DEP001', severity: 'high', category: 'dependencies' }),
    finding({ ruleId: 'DOC001', severity: 'medium', category: 'docker' }),
    finding({ ruleId: 'CFG004', severity: 'low', category: 'configuration' }),
  ];

  it('projects monotonically increasing scores as severities are fixed', () => {
    const p = projectedScores(findings);
    expect(p.afterCriticals).toBeGreaterThanOrEqual(p.current);
    expect(p.afterCriticalsAndHighs).toBeGreaterThanOrEqual(p.afterCriticals);
    expect(p.afterCriticalsAndHighs).toBeLessThanOrEqual(100);
  });

  it('afterQuickWins removes only quick-effort findings', () => {
    const p = projectedScores(findings);
    // DOC001 (quick) and CFG004 (quick) drop; SEC001/DEP001 (involved/moderate) stay.
    expect(p.afterQuickWins).toBeGreaterThan(p.current);
    expect(p.afterQuickWins).toBeLessThan(100);
  });

  it('returns all 100s for a clean project', () => {
    const p = projectedScores([]);
    expect(p).toEqual({ current: 100, afterCriticals: 100, afterCriticalsAndHighs: 100, afterQuickWins: 100 });
  });
});

describe('quick wins', () => {
  it('returns only quick-effort findings, deduped by rule, ordered by severity', () => {
    const findings = [
      finding({ ruleId: 'CFG004', severity: 'low', category: 'configuration' }),
      finding({ ruleId: 'DOC001', severity: 'medium', category: 'docker' }),
      finding({ ruleId: 'DOC001', severity: 'medium', category: 'docker', file: 'b/Dockerfile' }),
      finding({ ruleId: 'SEC001', severity: 'critical', category: 'secrets' }), // involved: excluded
      finding({ ruleId: 'NXT001', severity: 'high', category: 'nextjs' }),
    ];
    const wins = quickWins(findings);
    expect(wins.map((w) => w.ruleId)).toEqual(['NXT001', 'DOC001', 'CFG004']);
  });

  it('honors the limit', () => {
    const findings = ['DOC001', 'DOC004', 'NXT001', 'NXT003', 'CFG002', 'CFG004'].map((ruleId, i) =>
      finding({ ruleId, severity: 'low', category: 'configuration', id: `${ruleId}-${i}` })
    );
    expect(quickWins(findings, 3)).toHaveLength(3);
  });
});

describe('file type breakdown', () => {
  it('counts extensions and buckets the tail into "other"', () => {
    const files = [
      { path: 'a.ts' },
      { path: 'b.ts' },
      { path: 'c.tsx' },
      { path: 'README.md' },
      { path: 'Dockerfile' },
      { path: '.env' },
    ];
    const breakdown = fileTypeBreakdown(files, 2);
    expect(breakdown.ts).toBe(2);
    expect(Object.values(breakdown).reduce((a, b) => a + b, 0)).toBe(6);
    expect(breakdown.other).toBeGreaterThan(0);
  });

  it('treats dotfiles and extensionless files as "(none)"', () => {
    const breakdown = fileTypeBreakdown([{ path: '.gitignore' }, { path: 'LICENSE' }]);
    expect(breakdown['(none)']).toBe(2);
  });
});

describe('report fingerprint', () => {
  const base = [
    finding({ ruleId: 'SEC001', severity: 'critical', category: 'secrets', file: '.env' }),
    finding({ ruleId: 'DEP001', severity: 'high', category: 'dependencies', file: 'package.json' }),
  ];

  it('is deterministic and 8 hex chars', () => {
    expect(reportFingerprint(base, 50)).toBe(reportFingerprint(base, 50));
    expect(reportFingerprint(base, 50)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is order-independent over findings', () => {
    expect(reportFingerprint(base, 50)).toBe(reportFingerprint([...base].reverse(), 50));
  });

  it('changes when findings or score change', () => {
    const other = [...base, finding({ ruleId: 'CFG001', severity: 'high', category: 'configuration' })];
    expect(reportFingerprint(other, 50)).not.toBe(reportFingerprint(base, 50));
    expect(reportFingerprint(base, 51)).not.toBe(reportFingerprint(base, 50));
  });

  it('fnv1a matches known reference values', () => {
    // Standard FNV-1a 32-bit test vectors.
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });
});
