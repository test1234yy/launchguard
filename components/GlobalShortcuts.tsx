'use client';

import { useEffect } from 'react';
import { useTheme } from '@/lib/ui/theme';

/**
 * App-wide keyboard shortcuts that don't belong to a single panel:
 *   t → toggle theme, p → print.
 * Findings-specific shortcuts (/, e, x) live in FindingsPanel, which owns that
 * state. All shortcuts are ignored while typing in a field or when a modifier
 * is held, so native combos (Ctrl+P, ⌘T) keep working.
 */
export function GlobalShortcuts() {
  const { toggle } = useTheme();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (event.key === 't') {
        event.preventDefault();
        toggle();
      } else if (event.key === 'p') {
        event.preventDefault();
        window.print();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return null;
}
