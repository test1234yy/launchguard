'use client';

import { useState } from 'react';
import type { ScanReport } from '@/lib/scanner/types';
import type { FixPlanResult } from '@/lib/fixplan/generate';
import { downloadText } from '@/lib/ui/client';
import { reportToJson, reportToMarkdown, reportFileStem } from '@/lib/report/export';

interface Props {
  report: ScanReport;
}

export function FixPlanPanel({ report }: Props) {
  const [plan, setPlan] = useState<FixPlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fix-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report }),
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

  const stem = reportFileStem(report);

  return (
    <div className="card card-pad">
      <div className="toolbar">
        <h2>Fix plan &amp; exports</h2>
        <div className="toolbar-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => downloadText(`${stem}.md`, 'text/markdown', reportToMarkdown(report))}
          >
            Export Markdown
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => downloadText(`${stem}.json`, 'application/json', reportToJson(report))}
          >
            Export JSON
          </button>
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            Generate fix plan
          </button>
        </div>
      </div>

      <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        The fix plan uses the OpenAI API when <code>OPENAI_API_KEY</code> is configured, and falls back to
        a deterministic plan otherwise. Only redacted findings are ever sent to OpenAI.
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
              className="btn btn-ghost btn-sm"
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
