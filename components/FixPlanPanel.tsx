'use client';

import { useState } from 'react';
import type { ScanReport } from '@/lib/scanner/types';
import type { FixPlanResult } from '@/lib/fixplan/generate';
import { downloadText } from '@/lib/ui/client';
import { reportToJson, reportToMarkdown, reportFileStem, reportToCsv, reportToXml } from '@/lib/report/export';
import { reportToSarif } from '@/lib/report/sarif';
import { reportToHtml } from '@/lib/report/html';
import { badgeSvg } from '@/lib/report/badge';

interface Props {
  report: ScanReport;
}

/** The fix-plan API bounds accepted findings; trim oversized reports client-side too. */
const MAX_FINDINGS_SENT = 200;

/** Short, paste-anywhere Markdown digest of a report. */
function summaryMarkdown(report: ScanReport): string {
  const s = report.summary.bySeverity;
  const lines = [
    `LaunchGuard — ${report.projectName}`,
    `Score: ${report.score}/100 (${report.grade})`,
    `Findings: ${report.summary.total} (${s.critical} critical, ${s.high} high, ${s.medium} medium, ${s.low} low, ${s.info} info)`,
  ];
  const top = report.findings.slice(0, 5);
  if (top.length > 0) {
    lines.push('Top issues:');
    for (const f of top) {
      lines.push(`- [${f.severity.toUpperCase()}] ${f.title} (${f.file}${f.line ? `:${f.line}` : ''})`);
    }
  }
  return lines.join('\n');
}

export function FixPlanPanel({ report }: Props) {
  const [plan, setPlan] = useState<FixPlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const trimmed: ScanReport = { ...report, findings: report.findings.slice(0, MAX_FINDINGS_SENT) };
      const res = await fetch('/api/fix-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: trimmed }),
      });
      const data = (await res.json()) as { ok: boolean; plan?: FixPlanResult; error?: string };
      if (!res.ok || !data.ok || !data.plan) throw new Error(data.error || 'Failed to generate fix plan.');
      setPlan(data.plan);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryMarkdown(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not access the clipboard in this browser.');
    }
  }

  const stem = reportFileStem(report);

  return (
    <div className="card card-pad">
      <div className="toolbar">
        <h2>Fix plan &amp; exports</h2>
        <div className="toolbar-actions no-print">
          <button className="btn btn-ghost btn-sm" onClick={copySummary}>
            {copied ? 'Copied ✓' : 'Copy summary'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            Print report
          </button>
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            Generate fix plan
          </button>
        </div>
      </div>

      <div className="export-row no-print" aria-label="Export report">
        <span className="export-label">Export:</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => downloadText(`${stem}.md`, 'text/markdown', reportToMarkdown(report))}
        >
          Markdown
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadText(`${stem}.csv`, 'text/csv', reportToCsv(report))}>
          CSV
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadText(`${stem}.xml`, 'text/xml', reportToXml(report))}>
          XML
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => downloadText(`${stem}.json`, 'application/json', reportToJson(report))}
        >
          JSON
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => downloadText(`${stem}.sarif`, 'application/json', reportToSarif(report))}
        >
          SARIF
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => downloadText(`${stem}.html`, 'text/html', reportToHtml(report))}
        >
          HTML
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => downloadText(`${stem}-badge.svg`, 'image/svg+xml', badgeSvg(report.score, report.grade))}
        >
          Badge SVG
        </button>
      </div>

      <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        The fix plan uses the OpenAI API when <code>OPENAI_API_KEY</code> is configured, and falls back to
        a deterministic plan otherwise. Only redacted findings are ever sent to OpenAI. SARIF exports load
        directly into GitHub code scanning; the badge SVG is also served at <code>/api/badge?score={report.score}</code>.
      </p>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {plan && (
        <div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge-source">
              {plan.source === 'openai' ? `OpenAI · ${plan.model}` : 'Deterministic (no API key)'}
            </span>
            <button
              className="btn btn-ghost btn-sm no-print"
              onClick={() => downloadText(`${stem}-fix-plan.md`, 'text/markdown', plan.markdown)}
            >
              Download plan
            </button>
          </div>
          <div className="fixplan-body">
            <pre>{plan.markdown}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
