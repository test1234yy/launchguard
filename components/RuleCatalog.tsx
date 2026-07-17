'use client';

import { useMemo } from 'react';
import { ALL_RULES } from '@/lib/scanner/rules';
import type { Category } from '@/lib/scanner/types';

/** Collapsible catalog of every rule the scanner evaluates. */
export function RuleCatalog() {
  const groups = useMemo(() => {
    const byCategory = new Map<Category, typeof ALL_RULES>();
    for (const rule of ALL_RULES) {
      const list = byCategory.get(rule.category) ?? [];
      list.push(rule);
      byCategory.set(rule.category, list);
    }
    return [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, []);

  return (
    <details className="card rule-catalog">
      <summary>
        What we check <span className="rule-count">({ALL_RULES.length} rules)</span>
      </summary>
      <div className="rule-catalog-body">
        {groups.map(([category, rules]) => (
          <div key={category} className="rule-group">
            <h3>{category}</h3>
            <ul>
              {rules.map((rule) => (
                <li key={rule.id}>
                  <span className={`sev-badge sev-${rule.severity}`}>{rule.severity}</span>
                  <span className="rule-id">{rule.id}</span>
                  <span className="rule-title">{rule.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="hint">
          Every rule is deterministic and runs on your project as untrusted data — nothing is executed. The same
          catalog is available as JSON at <code>/api/rules</code>.
        </p>
      </div>
    </details>
  );
}
