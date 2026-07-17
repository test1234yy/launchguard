import type { ProjectSnapshot, Severity } from './types';
import { SEVERITIES } from './types';
import { findRootFile, parseJsonSafe } from './rules/helpers';
import { ruleById } from './rules';

/**
 * Optional in-repo scan configuration.
 *
 * A scanned project may ship a `launchguard.config.json` at its root to
 * suppress specific rules or hide low-severity noise. The file is untrusted
 * data: it is parsed defensively, unknown fields are ignored, and every
 * behavioral change it causes is surfaced as a report note so a hostile
 * config can never silently fake a clean report.
 */

export const SCAN_CONFIG_FILENAME = 'launchguard.config.json';

/** Upper bound on ignore entries so a hostile config cannot balloon the scan. */
const MAX_IGNORE_RULES = 100;

export interface ScanConfig {
  /** Rule ids to suppress entirely (validated against the rule set). */
  ignoreRules: string[];
  /** Findings below this severity are hidden ('medium' hides low and info). */
  minSeverity?: Severity;
  /** Human-readable notes about how (and whether) the config was applied. */
  notes: string[];
}

interface RawConfigShape {
  ignoreRules?: unknown;
  minSeverity?: unknown;
}

export function parseScanConfig(project: ProjectSnapshot): ScanConfig {
  const empty: ScanConfig = { ignoreRules: [], notes: [] };
  const file = findRootFile(project, SCAN_CONFIG_FILENAME);
  if (!file || file.binary) return empty;

  const raw = parseJsonSafe<RawConfigShape>(file.content);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ignoreRules: [], notes: [`${SCAN_CONFIG_FILENAME} is not valid JSON and was ignored.`] };
  }

  const notes: string[] = [];
  const ignoreRules: string[] = [];
  if (Array.isArray(raw.ignoreRules)) {
    const unknown: string[] = [];
    for (const entry of raw.ignoreRules.slice(0, MAX_IGNORE_RULES)) {
      if (typeof entry !== 'string') continue;
      const id = entry.trim().toUpperCase();
      if (!id) continue;
      if (ruleById(id)) {
        if (!ignoreRules.includes(id)) ignoreRules.push(id);
      } else {
        unknown.push(id);
      }
    }
    if (unknown.length > 0) {
      notes.push(`${SCAN_CONFIG_FILENAME} lists unknown rule id(s) ${unknown.slice(0, 5).join(', ')} — ignored.`);
    }
  }

  let minSeverity: Severity | undefined;
  if (raw.minSeverity !== undefined) {
    const value = String(raw.minSeverity).toLowerCase() as Severity;
    if (SEVERITIES.includes(value)) {
      minSeverity = value;
    } else {
      notes.push(`${SCAN_CONFIG_FILENAME} sets an invalid minSeverity ("${String(raw.minSeverity)}") — ignored.`);
    }
  }

  return { ignoreRules, minSeverity, notes };
}
