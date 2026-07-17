'use client';

import type { HistoryEntry } from '@/lib/ui/history';
import { scoreColor } from '@/lib/ui/client';

interface Props {
  history: HistoryEntry[];
  onClear: () => void;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Recent scans stored locally in this browser (never sent anywhere). */
export function HistoryPanel({ history, onClear }: Props) {
  if (history.length === 0) return null;

  return (
    <div className="card card-pad history-panel" data-testid="history-panel">
      <div className="toolbar">
        <h2>
          Recent scans <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({history.length})</span>
        </h2>
        <button className="btn btn-ghost btn-sm" onClick={onClear}>
          Clear history
        </button>
      </div>
      <div className="history-list">
        {history.map((entry, index) => (
          <div key={`${entry.fingerprint}-${entry.scannedAt}-${index}`} className="history-row">
            <span className="history-score" style={{ color: scoreColor(entry.score) }}>
              {entry.score}
            </span>
            <span className="history-main">
              <span className="history-name">{entry.projectName}</span>
              <span className="history-sub">
                {entry.grade} · {entry.findings} finding(s) · {entry.sourceType} · {formatWhen(entry.scannedAt)}
              </span>
            </span>
            <code className="history-fp">{entry.fingerprint}</code>
          </div>
        ))}
      </div>
      <p className="hint">History lives only in this browser&apos;s localStorage — scans are never stored server-side.</p>
    </div>
  );
}
