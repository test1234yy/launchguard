import { ALL_RULES } from '@/lib/scanner/rules';
import { APP_VERSION } from '@/lib/version';
import { apiOk } from '@/lib/api/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness/readiness probe for deploy targets and uptime monitors. */
export async function GET(): Promise<Response> {
  return apiOk({
    status: 'healthy',
    version: APP_VERSION,
    rules: ALL_RULES.length,
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
