/**
 * Readiness badge: a self-contained shields.io-style SVG showing the score.
 * Pure string generation — usable from the API route and client downloads.
 */

export function badgeColor(score: number): string {
  if (score >= 90) return '#3fb950';
  if (score >= 75) return '#58a6ff';
  if (score >= 50) return '#d29922';
  if (score >= 25) return '#db6d28';
  return '#f85149';
}

/** Approximate Verdana text width used by the classic badge layout. */
function textWidth(text: string): number {
  return Math.round(text.length * 6.5) + 10;
}

export function badgeSvg(score: number, grade: string): string {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const label = 'launchguard';
  const value = `${clamped}/100`;
  const leftWidth = textWidth(label);
  const rightWidth = textWidth(value);
  const width = leftWidth + rightWidth;
  const color = badgeColor(clamped);
  const title = `LaunchGuard readiness score: ${clamped}/100 (${grade})`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${title}">
  <title>${title}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#555"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${leftWidth / 2}" y="14">${label}</text>
    <text x="${leftWidth + rightWidth / 2}" y="14" font-weight="bold">${value}</text>
  </g>
</svg>`;
}
