'use client';

import { useRef, useState } from 'react';
import type { Finding, ScanReport } from '@/lib/scanner/types';
import { diffReports, summarizeDiff, type ReportDiff } from '@/lib/report/diff';
import { SEVERITY_LABEL } from '@/lib/ui/client';

interface Props {
  report: ScanReport;
}

/** Loose runtime check that a parsed object is a usable ScanReport for diffing. */
function looksLikeReport(value: unknown): value is ScanReport {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<ScanReport>;
  return (
    typeof r.projectName === 'string' &&
    typeof r.score === 'number' &&
    typeof r.fingerprint === 'string' &&
    Array.isArray(r.findings)
  );
}

function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) return <span className="delta-chip flat">±0</span>;
  const up = delta > 0;
  return <span className={`delta-chip ${up ? 'up' : 'down'}`}>{up ? `+${delta}` : delta}</span>;
}

function FindingLine({ finding, mark }: { finding: Finding; mark: 'added' | 'removed' }) {
  return (
    <li className={`diff-finding ${mark}`}>
      <span className={`sev-badge sev-${finding.severity}`}>{finding.severity}</span>
      <span className="diff-finding-main">
        <span className="diff-finding-title">{finding.title}</span>
        <span className="diff-finding-file">
          {finding.file}
          {finding.line ? `:${finding.line}` : ''} · {finding.ruleId}
        </span>
      </span>
    </li>
  );
}

export function ComparePanel({ report }: Props) {
  const [diff, setDiff] = useState<ReportDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseName, setBaseName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadBaseline(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!looksLikeReport(parsed)) {
        throw new Error('That file is not a LaunchGuard JSON report.');
      }
      // Baseline is the loaded (older) report; current is this scan.
      setDiff(diffReports(parsed, report));
      setBaseName(file.name);
    } catch (err) {
      setDiff(null);
      setBaseName(null);
      setError(err instanceof SyntaxError ? 'Could not parse that file as JSON.' : (err as Error).message);
    }
  }

  return (
    <div className="card card-pad compare-panel no-print" data-testid="compare-panel">
      <div className="toolbar">
        <h2>Compare with a previous scan</h2>
        <div className="toolbar-actions">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadBaseline(file);
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => fileInput.current?.click()}>
            Load baseline JSON
          </button>
          {diff && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDiff(null);
                setBaseName(null);
                setError(null);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Load a previously exported <code>.json</code> report to see what changed since then — new findings, resolved
        findings and the score movement. Everything is computed in your browser.
      </p>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {diff && (
        <div className="diff-body" aria-live="polite">
          <div className="diff-summary">
            <span className="diff-summary-line">{summarizeDiff(diff)}</span>
            {baseName && <span className="diff-base-name">baseline: {baseName}</span>}
          </div>

          <div className="diff-scores">
            <div className="diff-score-box">
              <span className="diff-score-label">Baseline</span>
              <span className="diff-score-num">{diff.base.score}</span>
            </div>
            <div className="diff-arrow" aria-hidden="true">
              →
            </div>
            <div className="diff-score-box">
              <span className="diff-score-label">Current</span>
              <span className="diff-score-num">{diff.current.score}</span>
            </div>
            <DeltaChip delta={diff.scoreDelta} />
          </div>

          <table className="diff-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Before</th>
                <th>After</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {diff.bySeverity.map((row) => (
                <tr key={row.severity}>
                  <td>
                    <span className={`sev-badge sev-${row.severity}`}>{SEVERITY_LABEL[row.severity]}</span>
                  </td>
                  <td>{row.before}</td>
                  <td>{row.after}</td>
                  <td>
                    <DeltaChip delta={row.delta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="diff-lists">
            <div className="diff-list-col">
              <h3 className="diff-added-head">New findings ({diff.added.length})</h3>
              {diff.added.length === 0 ? (
                <p className="diff-empty">None — no regressions since the baseline.</p>
              ) : (
                <ul className="diff-list">
                  {diff.added.slice(0, 50).map((f) => (
                    <FindingLine key={f.id} finding={f} mark="added" />
                  ))}
                </ul>
              )}
            </div>
            <div className="diff-list-col">
              <h3 className="diff-removed-head">Resolved findings ({diff.removed.length})</h3>
              {diff.removed.length === 0 ? (
                <p className="diff-empty">None resolved since the baseline.</p>
              ) : (
                <ul className="diff-list">
                  {diff.removed.slice(0, 50).map((f) => (
                    <FindingLine key={f.id} finding={f} mark="removed" />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
