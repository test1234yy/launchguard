'use client';

import { useRef, useState } from 'react';
import type { ScanReport } from '@/lib/scanner/types';

type Mode = 'demo' | 'github' | 'zip';

interface Props {
  onReport: (report: ScanReport) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}

const TABS: Array<{ id: Mode; label: string }> = [
  { id: 'demo', label: 'Demo scan' },
  { id: 'github', label: 'GitHub repo' },
  { id: 'zip', label: 'Upload ZIP' },
];

export function ScanForm({ onReport, busy, setBusy }: Props) {
  const [mode, setMode] = useState<Mode>('demo');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function parseResponse(res: Response): Promise<ScanReport> {
    const data = (await res.json()) as { ok: boolean; report?: ScanReport; error?: string };
    if (!res.ok || !data.ok || !data.report) {
      throw new Error(data.error || `Request failed (${res.status}).`);
    }
    return data.report;
  }

  async function runDemo() {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'demo' }),
    });
    onReport(await parseResponse(res));
  }

  async function runGithub() {
    if (!url.trim()) throw new Error('Enter a GitHub repository URL.');
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'github', url: url.trim() }),
    });
    onReport(await parseResponse(res));
  }

  async function runZip() {
    if (!file) throw new Error('Choose a .zip file to scan.');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    onReport(await parseResponse(res));
  }

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'demo') await runDemo();
      else if (mode === 'github') await runGithub();
      else await runZip();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      if (!dropped.name.toLowerCase().endsWith('.zip')) {
        setError('Only .zip archives are supported.');
        return;
      }
      setError(null);
      setFile(dropped);
    }
  }

  return (
    <div className="card card-pad scan-panel">
      <div className="tabs" role="tablist" aria-label="Scan source">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={mode === tab.id}
            className={`tab ${mode === tab.id ? 'active' : ''}`}
            onClick={() => {
              setMode(tab.id);
              setError(null);
            }}
            disabled={busy}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-body">
        {mode === 'demo' && (
          <div>
            <p style={{ margin: '0 0 16px', color: 'var(--text-muted)' }}>
              Scan a built-in, intentionally-flawed sample project. No API key, no network access, and
              every credential shown is fake and redacted.
            </p>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
              {busy ? <span className="spinner" /> : null}
              Run demo scan
            </button>
          </div>
        )}

        {mode === 'github' && (
          <div>
            <div className="field-row">
              <input
                className="input"
                type="text"
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && handleSubmit()}
                disabled={busy}
                aria-label="GitHub repository URL"
              />
              <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
                {busy ? <span className="spinner" /> : null}
                Scan repository
              </button>
            </div>
            <p className="hint">
              Public repositories only. LaunchGuard downloads a read-only archive — it never clones,
              installs, or runs any code.
            </p>
          </div>
        )}

        {mode === 'zip' && (
          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={(e) => {
                setError(null);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
            <div
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
            >
              <div>
                <strong>Click to choose</strong> or drag a <strong>.zip</strong> archive here
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                Max 15 MB. Contents are scanned in memory and never saved to disk.
              </div>
              {file && <div className="file-name">{file.name}</div>}
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={busy || !file}>
                {busy ? <span className="spinner" /> : null}
                Scan archive
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
