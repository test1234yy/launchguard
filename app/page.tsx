'use client';

import { useState } from 'react';
import type { ScanReport } from '@/lib/scanner/types';
import { ScanForm } from '@/components/ScanForm';
import { ScoreGauge } from '@/components/ScoreGauge';
import { SummaryCards } from '@/components/SummaryCards';
import { FindingsPanel } from '@/components/FindingsPanel';
import { FixPlanPanel } from '@/components/FixPlanPanel';

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l7 3v6c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V5l7-3z"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HomePage() {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <header className="site-header">
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
          </nav>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>Ship with confidence.</h1>
          <p>
            LaunchGuard scans Next.js and Node.js projects for deployment risks — committed secrets,
            missing environment docs, unsafe dependencies, missing CI, Docker and Prisma pitfalls — and
            gives you a readiness score with concrete fixes.
          </p>
        </section>

        <section id="scan">
          <ScanForm onReport={setReport} busy={busy} setBusy={setBusy} />
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
        </section>

        {report && (
          <section className="results" aria-live="polite">
            <div className="results-top">
              <ScoreGauge score={report.score} grade={report.grade} projectName={report.projectName} />
              <SummaryCards report={report} />
            </div>
            <FindingsPanel report={report} />
            <FixPlanPanel report={report} />
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="container">
          LaunchGuard · deterministic deployment-readiness scanning · secrets are always redacted
        </div>
      </footer>
    </>
  );
}
