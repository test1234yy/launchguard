'use client';

import { useEffect, useState } from 'react';
import type { ScanReport } from '@/lib/scanner/types';
import { ScanForm } from '@/components/ScanForm';
import { ScoreGauge } from '@/components/ScoreGauge';
import { SummaryCards } from '@/components/SummaryCards';
import { FindingsPanel } from '@/components/FindingsPanel';
import { FixPlanPanel } from '@/components/FixPlanPanel';
import { InsightsPanel } from '@/components/InsightsPanel';
import { ComparePanel } from '@/components/ComparePanel';
import { RuleCatalog } from '@/components/RuleCatalog';
import { HistoryPanel } from '@/components/HistoryPanel';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GlobalShortcuts } from '@/components/GlobalShortcuts';
import {
  clearHistory,
  entryFromReport,
  loadHistory,
  pushHistory,
  saveHistory,
  scoreDelta,
  type HistoryEntry,
} from '@/lib/ui/history';

export const dynamic = 'force-dynamic';

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ color: 'currentColor' }} aria-hidden="true">
      <path
        d="M12 2l7 3v6c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V5l7-3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HomePage() {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  function handleReport(next: ScanReport) {
    setDelta(scoreDelta(history, next));
    const updated = pushHistory(history, entryFromReport(next));
    setHistory(updated);
    saveHistory(updated);
    setReport(next);
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
  }

  return (
    <>
      <GlobalShortcuts />
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="site-header no-print">
        <div className="inner">
          <div className="brand">
            <span className="logo">
              <ShieldIcon />
            </span>
            LaunchGuard
          </div>
          <nav className="header-links">
            <a href="#scan">Scan</a>
            <a href="https://github.com/features/actions" target="_blank" rel="noreferrer">
              Docs
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="container" id="main">
        <section className="hero no-print">
          <h1>Ship with confidence.</h1>
          <p>
            LaunchGuard scans Next.js and Node.js projects for deployment risks — committed secrets,
            missing environment docs, unsafe dependencies, missing CI, Docker and Prisma pitfalls — and
            gives you a readiness score with concrete fixes.
          </p>
        </section>

        <section id="scan" className="no-print">
          <ScanForm onReport={handleReport} busy={busy} setBusy={setBusy} />
          <div className="safety-note">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2l7 3v6c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V5l7-3z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              Safety first: scanned code is treated purely as untrusted data. LaunchGuard never executes,
              installs, imports or builds it, redacts secret-like values, and never stores your uploads or
              repositories.
            </span>
          </div>
          <RuleCatalog />
        </section>

        {report && (
          <section className="results" aria-live="polite">
            <div className="results-top">
              <ScoreGauge score={report.score} grade={report.grade} projectName={report.projectName} delta={delta} />
              <SummaryCards report={report} />
            </div>
            <InsightsPanel report={report} />
            <FindingsPanel report={report} />
            <FixPlanPanel report={report} />
            <ComparePanel report={report} />
          </section>
        )}

        <div className="no-print">
          <HistoryPanel history={history} onClear={handleClearHistory} />
        </div>
      </main>

      <footer className="site-footer no-print">
        <div className="container">
          <div>LaunchGuard · deployment readiness scanning · secrets always redacted</div>
          <div className="shortcut-hint" aria-label="Keyboard shortcuts">
            Shortcuts: <kbd>/</kbd> filter · <kbd>e</kbd> expand all · <kbd>x</kbd> collapse all · <kbd>t</kbd> theme ·{' '}
            <kbd>p</kbd> print
          </div>
        </div>
      </footer>
    </>
  );
}
