import type { ScanReport, Severity } from '../scanner/types';
import { ruleById } from '../scanner/rules';
import { APP_HOMEPAGE, APP_NAME, APP_VERSION } from '../version';

/**
 * SARIF 2.1.0 export — the interchange format understood by GitHub code
 * scanning, VS Code SARIF viewers and most security dashboards.
 */

type SarifLevel = 'error' | 'warning' | 'note';

const LEVEL_BY_SEVERITY: Record<Severity, SarifLevel> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

/** Numeric CVSS-style severity GitHub uses for sorting security results. */
const SECURITY_SEVERITY: Record<Severity, string> = {
  critical: '9.5',
  high: '7.5',
  medium: '5.0',
  low: '2.5',
  info: '0.0',
};

/** Findings at pseudo-paths ("(project)", "app/") carry no real location. */
function isRealFile(path: string): boolean {
  return path !== '(project)' && !path.endsWith('/');
}

export function reportToSarif(report: ScanReport): string {
  const usedRuleIds = [...new Set(report.findings.map((f) => f.ruleId))].sort();
  const rules = usedRuleIds.map((id) => {
    const rule = ruleById(id);
    return {
      id,
      name: id,
      shortDescription: { text: rule?.title ?? id },
      fullDescription: { text: rule?.description ?? '' },
      defaultConfiguration: { level: LEVEL_BY_SEVERITY[rule?.severity ?? 'medium'] },
      properties: {
        category: rule?.category ?? 'unknown',
        'security-severity': SECURITY_SEVERITY[rule?.severity ?? 'medium'],
      },
    };
  });

  const results = report.findings.map((finding) => ({
    ruleId: finding.ruleId,
    ruleIndex: usedRuleIds.indexOf(finding.ruleId),
    level: LEVEL_BY_SEVERITY[finding.severity],
    message: { text: `${finding.title}. ${finding.evidence} Remediation: ${finding.remediation}` },
    ...(isRealFile(finding.file)
      ? {
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.file, uriBaseId: 'ROOT' },
                ...(finding.line ? { region: { startLine: finding.line } } : {}),
              },
            },
          ],
        }
      : {}),
    partialFingerprints: { launchguardFindingId: finding.id },
  }));

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0' as const,
    runs: [
      {
        tool: {
          driver: {
            name: APP_NAME,
            informationUri: APP_HOMEPAGE,
            version: APP_VERSION,
            rules,
          },
        },
        originalUriBaseIds: { ROOT: { description: { text: 'Scanned project root' } } },
        properties: {
          projectName: report.projectName,
          score: report.score,
          grade: report.grade,
          fingerprint: report.fingerprint,
          scannedAt: report.scannedAt,
        },
        results,
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}
