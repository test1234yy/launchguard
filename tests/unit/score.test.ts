import { describe, it, expect } from 'vitest';
import { computeScore, gradeFor, countBySeverity, countByCategory } from '@/lib/scanner/score';
import type { Finding, Severity } from '@/lib/scanner/types';

function finding(severity: Severity, ruleId = 'X001', i = 0): Finding {
  return {
    id: `${ruleId}-${i}`,
    ruleId,
    title: 't',
    severity,
    category: 'secrets',
    file: 'f',
    evidence: 'e',
    remediation: 'r',
  };
}

describe('computeScore', () => {
  it('is 100 with no findings', () => {
    expect(computeScore([])).toBe(100);
  });

  it('decreases with severity', () => {
    const critical = computeScore([finding('critical')]);
    const low = computeScore([finding('low')]);
    expect(critical).toBeLessThan(low);
    expect(low).toBeLessThan(100);
  });

  it('never goes below 0', () => {
    const many = Array.from({ length: 50 }, (_, i) => finding('critical', `R${i}`, i));
    expect(computeScore(many)).toBe(0);
  });

  it('caps the penalty contributed by a single noisy rule', () => {
    const sameRule = Array.from({ length: 10 }, (_, i) => finding('medium', 'SAME', i));
    const scoreSame = computeScore(sameRule);
    const distinct = Array.from({ length: 10 }, (_, i) => finding('medium', `R${i}`, i));
    const scoreDistinct = computeScore(distinct);
    // Same-rule findings are capped, so they cost far less than distinct rules.
    expect(scoreSame).toBeGreaterThan(scoreDistinct);
  });

  it('is deterministic', () => {
    const fs = [finding('high'), finding('low', 'Y'), finding('critical', 'Z')];
    expect(computeScore(fs)).toBe(computeScore([...fs]));
  });
});

describe('gradeFor', () => {
  it('maps score ranges to grades', () => {
    expect(gradeFor(95)).toBe('Launch ready');
    expect(gradeFor(80)).toBe('Nearly ready');
    expect(gradeFor(60)).toBe('Needs work');
    expect(gradeFor(30)).toBe('At risk');
    expect(gradeFor(10)).toBe('Not ready');
  });
});

describe('counts', () => {
  it('counts by severity', () => {
    const counts = countBySeverity([finding('critical'), finding('critical'), finding('low')]);
    expect(counts.critical).toBe(2);
    expect(counts.low).toBe(1);
    expect(counts.high).toBe(0);
  });
  it('counts by category', () => {
    const counts = countByCategory([finding('low'), finding('low')]);
    expect(counts.secrets).toBe(2);
  });
});
