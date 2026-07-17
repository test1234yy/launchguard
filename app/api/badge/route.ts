import { badgeSvg } from '@/lib/report/badge';
import { gradeFor } from '@/lib/scanner/score';
import { apiError } from '@/lib/api/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Readiness badge as SVG: GET /api/badge?score=87
 * Embeddable in READMEs and dashboards after a scan.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = url.searchParams.get('score');
  if (raw === null || raw.trim() === '' || !/^\d{1,3}$/.test(raw.trim())) {
    return apiError('Provide an integer score between 0 and 100, e.g. /api/badge?score=87.');
  }
  const score = Number(raw.trim());
  if (score < 0 || score > 100) {
    return apiError('Score must be between 0 and 100.');
  }
  return new Response(badgeSvg(score, gradeFor(score)), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
