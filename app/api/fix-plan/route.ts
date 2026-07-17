import { generateFixPlan } from '@/lib/fixplan/generate';
import { apiError, apiOk } from '@/lib/api/respond';
import type { ScanReport } from '@/lib/scanner/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FixPlanBody {
  report?: ScanReport;
}

/** Minimal shape + size check so we never hand malformed or oversized data to the generator. */
function isReport(value: unknown): value is ScanReport {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<ScanReport>;
  if (
    typeof r.projectName !== 'string' ||
    typeof r.score !== 'number' ||
    !Array.isArray(r.findings) ||
    typeof r.summary !== 'object'
  ) {
    return false;
  }
  // SEC-5: Bound report sizes to prevent unbounded OpenAI prompt inflation.
  if (r.projectName.length > 200) return false;
  if (r.findings.length > 40) return false;
  for (const f of r.findings) {
    if (typeof f.title !== 'string' || f.title.length > 500) return false;
    if (typeof f.evidence !== 'string' || f.evidence.length > 500) return false;
    if (typeof f.remediation !== 'string' || f.remediation.length > 1000) return false;
  }
  return true;
}

export async function POST(request: Request): Promise<Response> {
  let body: FixPlanBody;
  try {
    body = (await request.json()) as FixPlanBody;
  } catch {
    return apiError('Request body must be valid JSON.');
  }
  if (!isReport(body.report)) {
    return apiError('Request must include a valid scan "report".');
  }
  const plan = await generateFixPlan(body.report);
  return apiOk({ plan });
}
