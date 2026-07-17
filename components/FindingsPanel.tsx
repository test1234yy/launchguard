'use client';

import { useMemo, useState } from 'react';
import type { Category, Finding, ScanReport, Severity } from '@/lib/scanner/types';
import { SEVERITY_LABEL, SEVERITY_ORDER } from '@/lib/ui/client';

interface Props {
  report: ScanReport;
}

function Chevron() {
  return (
    <svg className="chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`finding sev-${finding.severity} ${open ? 'open' : ''}`}>
      <button className="finding-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`sev-badge sev-${finding.severity}`}>{finding.severity}</span>
        <span className="finding-main">
          <span className="finding-title">{finding.title}</span>
          <span className="finding-sub">
            <span className="file">
              {finding.file}
              {finding.line ? `:${finding.line}` : ''}
            </span>
            <span className="cat-tag">{finding.category}</span>
            <span className="rule-id">{finding.ruleId}</span>
          </span>
        </span>
        <Chevron />
      </button>
      {open && (
        <div className="finding-body">
          <div className="block">
            <div className="label">Evidence</div>
            <div className="evidence">{finding.evidence}</div>
          </div>
          <div className="block">
            <div className="label">Remediation</div>
            <div className="remediation">{finding.remediation}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FindingsPanel({ report }: Props) {
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');

  const categories = useMemo(() => {
    return Object.keys(report.summary.byCategory).sort() as Category[];
  }, [report]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return report.findings.filter((f) => {
      if (severity !== 'all' && f.severity !== severity) return false;
      if (category !== 'all' && f.category !== category) return false;
      if (q) {
        const haystack = `${f.title} ${f.file} ${f.evidence} ${f.remediation} ${f.ruleId}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [report, severity, category, query]);

  return (
    <div className="card card-pad">
      <div className="toolbar">
        <h2>
          Findings <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({filtered.length})</span>
        </h2>
      </div>

      <div className="filters" style={{ marginTop: 16 }}>
        <div className="chip-group" role="group" aria-label="Filter by severity">
          <button className={`chip ${severity === 'all' ? 'active' : ''}`} onClick={() => setSeverity('all')}>
            All severities
          </button>
          {SEVERITY_ORDER.map((sev) => (
            <button
              key={sev}
              className={`chip ${severity === sev ? 'active' : ''}`}
              onClick={() => setSeverity(sev)}
            >
              {SEVERITY_LABEL[sev]}
              <span className="chip-count">{report.summary.bySeverity[sev]}</span>
            </button>
          ))}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="filters" style={{ marginTop: 10 }}>
          <div className="chip-group" role="group" aria-label="Filter by category">
            <button className={`chip ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>
              All categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`chip ${category === cat ? 'active' : ''}`}
                onClick={() => setCategory(cat)}
                style={{ textTransform: 'capitalize' }}
              >
                {cat}
                <span className="chip-count">{report.summary.byCategory[cat]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filters" style={{ marginTop: 10 }}>
        <input
          className="search-input"
          type="search"
          placeholder="Filter findings by text (file, evidence, rule id…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter findings by text"
        />
      </div>

      <div className="findings">
        {filtered.length === 0 ? (
          <div className="empty-state">
            {report.findings.length === 0 ? (
              <>
                <div className="big">✅</div>
                <p>No deployment risks detected. This project looks launch-ready.</p>
              </>
            ) : (
              <p>No findings match the current filters.</p>
            )}
          </div>
        ) : (
          filtered.map((f) => <FindingRow key={f.id} finding={f} />)
        )}
      </div>
    </div>
  );
}
