import { buildReport } from '@/lib/scanner/engine';
import { demoProject, DEMO_NOTES } from '@/lib/sources/demo';
import { loadGithubRepo, GithubError } from '@/lib/sources/github';
import { apiError, apiOk, apiTooManyRequests } from '@/lib/api/respond';
import { clientKeyFrom, scanLimiter } from '@/lib/api/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ScanRequestBody {
  mode?: 'demo' | 'github';
  url?: string;
}

export async function POST(request: Request): Promise<Response> {
  const decision = scanLimiter.check(clientKeyFrom(request.headers));
  if (!decision.allowed) return apiTooManyRequests(decision.retryAfterSec);

  let body: ScanRequestBody;
  try {
    body = (await request.json()) as ScanRequestBody;
  } catch {
    return apiError('Request body must be valid JSON.');
  }

  if (body.mode === 'demo') {
    const report = buildReport(demoProject(), {
      source: { type: 'demo', ref: 'built-in demo project' },
      notes: DEMO_NOTES,
    });
    return apiOk({ report });
  }

  if (body.mode === 'github') {
    if (!body.url || typeof body.url !== 'string') {
      return apiError('Provide a GitHub repository URL.');
    }
    try {
      const loaded = await loadGithubRepo(body.url);
      const report = buildReport(loaded.snapshot, {
        source: { type: 'github', ref: loaded.resolvedRef },
        skippedFiles: loaded.skippedFiles,
        notes: loaded.notes,
      });
      return apiOk({ report });
    } catch (err) {
      if (err instanceof GithubError) {
        return apiError(err.message, err.status && err.status >= 400 && err.status < 500 ? err.status : 400);
      }
      return apiError('Failed to scan the repository. Please try again.', 502);
    }
  }

  return apiError('Unknown scan mode. Use "demo" or "github".');
}
