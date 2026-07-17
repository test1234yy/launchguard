import { describe, it, expect } from 'vitest';
import { buildReport } from '@/lib/scanner/engine';
import { demoProject } from '@/lib/sources/demo';
import {
  entryFromReport,
  pushHistory,
  previousFor,
  scoreDelta,
  parseHistory,
  HISTORY_CAP,
  type HistoryEntry,
} from '@/lib/ui/history';

const report = buildReport(demoProject(), { source: { type: 'demo', ref: 'demo' } });

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return { ...entryFromReport(report), ...overrides };
}

describe('history list operations', () => {
  it('builds an entry from a report', () => {
    const e = entryFromReport(report);
    expect(e.projectName).toBe(report.projectName);
    expect(e.score).toBe(report.score);
    expect(e.fingerprint).toBe(report.fingerprint);
    expect(e.findings).toBe(report.summary.total);
  });

  it('prepends entries and caps the list', () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      list = pushHistory(list, entry({ projectName: `p${i}`, fingerprint: `f${i}` }));
    }
    expect(list).toHaveLength(HISTORY_CAP);
    expect(list[0].projectName).toBe(`p${HISTORY_CAP + 4}`);
  });

  it('collapses an immediately repeated identical scan', () => {
    const first = pushHistory([], entry());
    const second = pushHistory(first, entry());
    expect(second).toHaveLength(1);
  });

  it('keeps re-scans whose fingerprint changed', () => {
    const first = pushHistory([], entry({ fingerprint: 'aaaa1111' }));
    const second = pushHistory(first, entry({ fingerprint: 'bbbb2222' }));
    expect(second).toHaveLength(2);
  });

  it('previousFor finds the latest scan of the same project', () => {
    const list = [entry({ projectName: 'other' }), entry({ score: 40 })];
    expect(previousFor(list, report.projectName)?.score).toBe(40);
    expect(previousFor(list, 'missing')).toBeUndefined();
  });

  it('scoreDelta is null on first scan and signed afterwards', () => {
    expect(scoreDelta([], report)).toBeNull();
    const prev = [entry({ score: report.score - 12 })];
    expect(scoreDelta(prev, report)).toBe(12);
    const better = [entry({ score: report.score + 3 })];
    expect(scoreDelta(better, report)).toBe(-3);
  });
});

describe('history parsing (defensive)', () => {
  it('parses a valid payload', () => {
    const raw = JSON.stringify([entryFromReport(report)]);
    expect(parseHistory(raw)).toHaveLength(1);
  });

  it('drops malformed entries and survives garbage', () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory('not json')).toEqual([]);
    expect(parseHistory('{"a":1}')).toEqual([]);
    const mixed = JSON.stringify([entryFromReport(report), { projectName: 42 }, 'junk']);
    expect(parseHistory(mixed)).toHaveLength(1);
  });

  it('caps oversized payloads', () => {
    const many = JSON.stringify(Array.from({ length: 50 }, (_, i) => entry({ fingerprint: `f${i}` })));
    expect(parseHistory(many)).toHaveLength(HISTORY_CAP);
  });
});
