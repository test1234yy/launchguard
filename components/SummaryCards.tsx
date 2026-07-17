'use client';

import type { ScanReport } from '@/lib/scanner/types';
import { SEVERITY_LABEL, SEVERITY_ORDER } from '@/lib/ui/client';

interface Props {
  report: ScanReport;
}

/** Severity stat tiles plus scan metadata. */
export function SummaryCards({ report }: Props) {
  return (
    <div className="card card-pad">
      <div className="summary-grid">
        {SEVERITY_ORDER.map((sev) => (
          <div key={sev} className={`stat sev-${sev}`}>
            <span className="stat-num">{report.summary.bySeverity[sev]}</span>
            <span className="stat-label">{SEVERITY_LABEL[sev]}</span>
          </div>
        ))}
        <div className="stat">
          <span className="stat-num">{report.summary.total}</span>
          <span className="stat-label">Total</span>
        </div>
      </div>
      <div className="meta-row">
        <span>
          {report.fileCount} file{report.fileCount === 1 ? '' : 's'} scanned
        </span>
        <span>{report.rulesEvaluated} rules evaluated</span>
        <span>
          Source: {report.source.type} — {report.source.ref}
        </span>
        {report.skippedFiles > 0 && <span>{report.skippedFiles} entries skipped</span>}
      </div>
      {report.notes.length > 0 && (
        <div className="meta-row">
          {report.notes.map((note, i) => (
            <span key={i} className="note">
              • {note}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
