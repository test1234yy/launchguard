import { ALL_RULES } from '@/lib/scanner/rules';
import { CATEGORIES } from '@/lib/scanner/types';
import { apiOk } from '@/lib/api/respond';

/**
 * Machine-readable rule catalog: everything LaunchGuard checks, without
 * running a scan. The catalog is static per build, so this route can be
 * cached freely by clients.
 */
export async function GET(): Promise<Response> {
  return apiOk({
    count: ALL_RULES.length,
    categories: CATEGORIES,
    rules: ALL_RULES.map((rule) => ({
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      category: rule.category,
      description: rule.description,
    })),
  });
}
