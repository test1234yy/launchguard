'use client';

import { useMemo } from 'react';
import type { ScanReport } from '@/lib/scanner/types';
import { projectedScores, quickWins, effortFor, EFFORT_LABEL } from '@/lib/scanner/insights';
import { scoreColor } from '@/lib/ui/client';

interface Props {
  report: ScanReport;
}

function ProjectionRow({ label, projected, current }: { label: string; projected: number; current: number }) {
  const gain = projected - current;
  return (
    <div className="projection-row">
      <span className="projection-label">{label}</span>
      <span className="projection-score" style={{ color: scoreColor(projected) }}>
        {projected}
      </span>
      <span className={`delta-chip ${gain > 0 ? 'up' : 'flat'}`}>{gain > 0 ? `+${gain} pts` : 'no change'}</span>
    </div>
  );
}

/** Projected scores, quick wins and scan composition for the current report. */
export function InsightsPanel({ report }: Props) {
  const projections = useMemo(() => projectedScores(report.findings), [report]);
  const wins = useMemo(() => quickWins(report.findings, 5), [report]);
  const fileTypes = useMemo(
    () => Object.entries(report.fileTypes).sort((a, b) => b[1] - a[1]).slice(0, 9),
    [report]
  );

  if (report.findings.length === 0) return null;

  return (
    <div className="card card-pad insights" data-testid="insights-panel">
      <div className="toolbar">
        <h2>Insights</h2>
        <div className="meta-inline">
          Scanned in {report.durationMs} ms · fingerprint <code>{report.fingerprint}</code>
          {report.suppressedFindings > 0 && <> · {report.suppressedFindings} finding(s) suppressed by config</>}
        </div>
      </div>

      <div className="insights-grid">
        <div className="insight-block">
          <h3>Projected score</h3>
          <p className="insight-hint">Where the readiness score lands as you fix groups of findings.</p>
          <ProjectionRow label="Fix all criticals" projected={projections.afterCriticals} current={projections.current} />
          <ProjectionRow
            label="Fix criticals + highs"
            projected={projections.afterCriticalsAndHighs}
            current={projections.current}
          />
          <ProjectionRow label="Do every quick fix" projected={projections.afterQuickWins} current={projections.current} />
        </div>

        <div className="insight-block">
          <h3>Quick wins</h3>
          <p className="insight-hint">Low-effort fixes with real score impact — start here.</p>
          {wins.length === 0 ? (
            <p className="insight-hint">No quick-fix findings — remaining issues need deeper work.</p>
          ) : (
            <ul className="win-list">
              {wins.map((win) => (
                <li key={win.id} className="win-row">
                  <span className={`sev-badge sev-${win.severity}`}>{win.severity}</span>
                  <span className="win-main">
                    <span className="win-title">{win.title}</span>
                    <span className="win-file">{win.file}</span>
                  </span>
                  <span className="effort-tag">{EFFORT_LABEL[effortFor(win.ruleId, win.category)]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="insight-block">
          <h3>Scanned files</h3>
          <p className="insight-hint">
            {report.fileCount} file(s) by extension{report.skippedFiles > 0 ? `, ${report.skippedFiles} skipped` : ''}.
          </p>
          <div className="filetype-chips">
            {fileTypes.map(([ext, count]) => (
              <span key={ext} className="filetype-chip">
                <span className="ext">{ext}</span>
                <span className="count">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
