import type { Severity } from '@/lib/scanner/types';

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

/** Trigger a client-side download of text content. */
export function downloadText(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL on the next tick so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function scoreColor(score: number): string {
  if (score >= 90) return 'var(--low)';
  if (score >= 75) return 'var(--info)';
  if (score >= 50) return 'var(--medium)';
  if (score >= 25) return 'var(--high)';
  return 'var(--critical)';
}
