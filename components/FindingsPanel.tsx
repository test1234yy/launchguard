'use client';

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Finding, ScanReport, Severity } from '@/lib/scanner/types';
import { SEVERITY_LABEL, SEVERITY_ORDER } from '@/lib/ui/client';
import { effortFor, EFFORT_LABEL } from '@/lib/scanner/insights';

interface Props {
  report: ScanReport;
}

type SortMode = 'severity' | 'file' | 'rule';

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function Chevron() {
  return (
    <svg className="chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Memoized so toggling one finding (a new openIds Set) only re-renders the
 * rows whose open state actually changed — not all N rows. This keeps large
 * reports responsive. `onToggle` is a stable callback from the parent.
 */
const FindingRow = memo(function FindingRow({
  finding,
  open,
  onToggle,
}: {
  finding: Finding;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className={`finding sev-${finding.severity} ${open ? 'open' : ''}`}>
      <button className="finding-head" onClick={() => onToggle(finding.id)} aria-expanded={open}>
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
            <span className="effort-tag">{EFFORT_LABEL[effortFor(finding.ruleId, finding.category)]}</span>
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
});

export function FindingsPanel({ report }: Props) {
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('severity');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  // Deferring the query keeps typing smooth: the input updates immediately while
  // the (potentially large) filtered list re-computes at a lower priority.
  const deferredQuery = useDeferredValue(query);

  const categories = useMemo(() => {
    return Object.keys(report.summary.byCategory).sort() as Category[];
  }, [report]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = report.findings.filter((f) => {
      if (severity !== 'all' && f.severity !== severity) return false;
      if (category !== 'all' && f.category !== category) return false;
      if (q) {
        const haystack = `${f.title} ${f.file} ${f.evidence} ${f.remediation} ${f.ruleId}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...list];
    if (sort === 'file') {
      sorted.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
    } else if (sort === 'rule') {
      sorted.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.file.localeCompare(b.file));
    } else {
      sorted.sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          a.ruleId.localeCompare(b.ruleId) ||
          a.file.localeCompare(b.file)
      );
    }
    return sorted;
  }, [report, severity, category, deferredQuery, sort]);

  // Stable callback so memoized rows don't re-render when a sibling toggles.
  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setOpenIds(new Set(filtered.map((f) => f.id)));
  }, [filtered]);

  const collapseAll = useCallback(() => {
    setOpenIds(new Set());
  }, []);

  // Keep the latest filtered list reachable from the (stable) key handler
  // without re-subscribing on every keystroke.
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  // Findings shortcuts: "/" focuses the filter, "e" expands all, "x" collapses.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'e') {
        event.preventDefault();
        setOpenIds(new Set(filteredRef.current.map((f) => f.id)));
      } else if (event.key === 'x') {
        event.preventDefault();
        setOpenIds(new Set());
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="card card-pad">
      <div className="toolbar">
        <h2>
          Findings <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({filtered.length})</span>
        </h2>
        <div className="toolbar-actions">
          <label className="sort-label" htmlFor="sort-findings">
            Sort
          </label>
          <select
            id="sort-findings"
            className="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            aria-label="Sort findings"
          >
            <option value="severity">By severity</option>
            <option value="file">By file</option>
            <option value="rule">By rule</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={expandAll} disabled={filtered.length === 0}>
            Expand all
          </button>
          <button className="btn btn-ghost btn-sm" onClick={collapseAll} disabled={openIds.size === 0}>
            Collapse all
          </button>
        </div>
      </div>

      <div className="filters" style={{ marginTop: 16 }}>
        <div className="chip-group" role="group" aria-label="Filter by severity">
          <button
            className={`chip ${severity === 'all' ? 'active' : ''}`}
            aria-pressed={severity === 'all'}
            onClick={() => setSeverity('all')}
          >
            All severities
          </button>
          {SEVERITY_ORDER.map((sev) => (
            <button
              key={sev}
              className={`chip ${severity === sev ? 'active' : ''}`}
              aria-pressed={severity === sev}
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
            <button
              className={`chip ${category === 'all' ? 'active' : ''}`}
              aria-pressed={category === 'all'}
              onClick={() => setCategory('all')}
            >
              All categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`chip ${category === cat ? 'active' : ''}`}
                aria-pressed={category === cat}
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
          ref={searchRef}
          className="search-input"
          type="search"
          placeholder="Filter findings by text — press / to focus"
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
          filtered.map((f) => <FindingRow key={f.id} finding={f} open={openIds.has(f.id)} onToggle={toggle} />)
        )}
      </div>
    </div>
  );
}
