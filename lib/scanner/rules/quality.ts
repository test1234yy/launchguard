import type { Rule, RuleMatch } from '../types';
import { baseName, eachLine, isInNodeModules, scannableText, textFiles } from './helpers';

/**
 * Code-quality rules: hygiene problems that break or embarrass a deploy but
 * are not credentials or infrastructure misconfiguration.
 */

const JS_LIKE = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/i;

function jsFiles(project: Parameters<Rule['check']>[0]) {
  return textFiles(project).filter((f) => JS_LIKE.test(f.path) && !isInNodeModules(f.path));
}

function isTestPath(path: string): boolean {
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path) ||
    /(^|\/)(__tests__|tests?|e2e|spec)(\/|$)/i.test(path)
  );
}

/** Lines this long are almost certainly minified/vendored output, not hand-written code. */
const MINIFIED_LINE_LENGTH = 500;

/** QUA001: unresolved merge conflict markers committed. */
export const conflictMarkers: Rule = {
  id: 'QUA001',
  title: 'Unresolved merge conflict markers committed',
  severity: 'high',
  category: 'quality',
  description: 'Files containing <<<<<<< / >>>>>>> markers are broken and will fail at build or runtime.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of textFiles(project)) {
      if (isInNodeModules(file.path)) continue;
      const text = scannableText(file);
      // Require both opening and closing markers to avoid false positives
      // (e.g. "=======" used as a Markdown underline).
      if (!/^<{7} /m.test(text) || !/^>{7} /m.test(text)) continue;
      const lines = text.split('\n');
      const lineNo = lines.findIndex((l) => l.startsWith('<<<<<<< ')) + 1;
      matches.push({
        file: file.path,
        line: lineNo || undefined,
        evidence: `Merge conflict markers (<<<<<<< … >>>>>>>) are present in ${file.path}.`,
        remediation: 'Resolve the merge conflict, remove the marker lines, and re-run the build and tests before deploying.',
      });
      if (matches.length >= 10) break;
    }
    return matches;
  },
};

const EVAL_PATTERN = /\beval\s*\(|\bnew\s+Function\s*\(/;

/** QUA002: eval() / new Function() dynamic code execution. */
export const dynamicCodeExecution: Rule = {
  id: 'QUA002',
  title: 'Dynamic code execution via eval() or new Function()',
  severity: 'medium',
  category: 'quality',
  description: 'eval and new Function execute strings as code, enabling injection attacks and defeating bundler optimizations.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of jsFiles(project)) {
      if (isTestPath(file.path)) continue;
      eachLine(scannableText(file), (line, lineNo) => {
        if (matches.length >= 10) return;
        if (line.length > MINIFIED_LINE_LENGTH) return;
        if (EVAL_PATTERN.test(line)) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim().slice(0, 160),
            remediation:
              'Replace eval / new Function with explicit logic, JSON.parse for data, or a safe expression library. If input ever reaches this call it is remote code execution.',
          });
        }
      });
      if (matches.length >= 10) break;
    }
    return matches;
  },
};

const WEAK_HASH_PATTERN = /createHash\s*\(\s*['"](md5|sha1)['"]\s*\)|subtle\.digest\s*\(\s*['"]SHA-1['"]/i;

/** QUA003: weak hash algorithms used in code. */
export const weakCrypto: Rule = {
  id: 'QUA003',
  title: 'Weak hash algorithm (MD5/SHA-1) in use',
  severity: 'medium',
  category: 'quality',
  description: 'MD5 and SHA-1 are broken for security purposes (collisions are practical).',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of jsFiles(project)) {
      if (isTestPath(file.path)) continue;
      eachLine(scannableText(file), (line, lineNo) => {
        if (matches.length >= 10) return;
        if (line.length > MINIFIED_LINE_LENGTH) return;
        if (WEAK_HASH_PATTERN.test(line)) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim().slice(0, 160),
            remediation:
              'Use SHA-256 or stronger for integrity checks, and a dedicated password hash (bcrypt, scrypt, argon2) for credentials. MD5/SHA-1 are acceptable only for non-security fingerprinting — if so, document it.',
          });
        }
      });
      if (matches.length >= 10) break;
    }
    return matches;
  },
};

const INSECURE_URL_PATTERN =
  /\b(?:fetch|axios(?:\.\w+)?|got|request)\s*\(\s*['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])|\b(?:url|baseURL|endpoint)\s*[:=]\s*['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/;

/** QUA004: plaintext http:// endpoints in application code. */
export const insecureHttpUrl: Rule = {
  id: 'QUA004',
  title: 'Plaintext http:// endpoint in application code',
  severity: 'low',
  category: 'quality',
  description: 'Requests over http:// leak data and tokens in transit and can be tampered with.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of jsFiles(project)) {
      if (isTestPath(file.path)) continue;
      eachLine(scannableText(file), (line, lineNo) => {
        if (matches.length >= 10) return;
        if (line.length > MINIFIED_LINE_LENGTH) return;
        if (INSECURE_URL_PATTERN.test(line)) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim().slice(0, 160),
            remediation: 'Use https:// for every non-localhost endpoint; plain HTTP exposes payloads and credentials in transit.',
          });
        }
      });
      if (matches.length >= 10) break;
    }
    return matches;
  },
};

/** QUA005: debugger statements committed. */
export const debuggerStatements: Rule = {
  id: 'QUA005',
  title: 'debugger statement committed',
  severity: 'low',
  category: 'quality',
  description: 'A debugger statement pauses execution when devtools are open and should never ship.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of jsFiles(project)) {
      if (isTestPath(file.path)) continue;
      eachLine(scannableText(file), (line, lineNo) => {
        if (matches.length >= 10) return;
        if (/^\s*debugger\s*;?\s*$/.test(line)) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim(),
            remediation: 'Remove the debugger statement (add the no-debugger ESLint rule to catch this in CI).',
          });
        }
      });
      if (matches.length >= 10) break;
    }
    return matches;
  },
};

const CONSOLE_LOG_THRESHOLD = 20;

/** QUA006: heavy console.log usage across the codebase (aggregate). */
export const consoleLogFlood: Rule = {
  id: 'QUA006',
  title: 'Heavy console.log usage in application code',
  severity: 'info',
  category: 'quality',
  description: 'Scattered console.log calls leak internals to production logs and hint at missing structured logging.',
  check(project) {
    let count = 0;
    let topFile = '';
    let topCount = 0;
    for (const file of jsFiles(project)) {
      if (isTestPath(file.path)) continue;
      const text = scannableText(file);
      const inFile = (text.match(/\bconsole\.log\s*\(/g) ?? []).length;
      count += inFile;
      if (inFile > topCount) {
        topCount = inFile;
        topFile = file.path;
      }
    }
    if (count <= CONSOLE_LOG_THRESHOLD) return [];
    return [
      {
        file: topFile || '(project)',
        evidence: `${count} console.log call(s) across application code (most in ${topFile}: ${topCount}).`,
        remediation:
          'Route logging through a structured logger with levels (pino, winston) and strip or gate debug logs before production.',
      },
    ];
  },
};

const TODO_THRESHOLD = 10;
const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX)\b/g;

/** QUA007: high density of TODO/FIXME markers (aggregate). */
export const todoDensity: Rule = {
  id: 'QUA007',
  title: 'High density of TODO/FIXME markers',
  severity: 'info',
  category: 'quality',
  description: 'Many unresolved TODO/FIXME/HACK markers suggest unfinished work shipping to production.',
  check(project) {
    let count = 0;
    let topFile = '';
    let topCount = 0;
    for (const file of textFiles(project)) {
      if (isInNodeModules(file.path) || isTestPath(file.path)) continue;
      if (!JS_LIKE.test(file.path) && !/\.(py|rb|go|java|css|scss|md)$/i.test(file.path)) continue;
      const text = scannableText(file);
      TODO_PATTERN.lastIndex = 0;
      const inFile = (text.match(TODO_PATTERN) ?? []).length;
      count += inFile;
      if (inFile > topCount) {
        topCount = inFile;
        topFile = file.path;
      }
    }
    if (count < TODO_THRESHOLD) return [];
    return [
      {
        file: topFile || '(project)',
        evidence: `${count} TODO/FIXME/HACK marker(s) in tracked source (most in ${topFile}: ${topCount}).`,
        remediation: 'Triage the markers into tracked issues and resolve launch-blocking ones before deploying.',
      },
    ];
  },
};

/** Matches the loader's per-file decode cap; larger files arrive with content dropped. */
const LARGE_FILE_BYTES = 2 * 1024 * 1024;

/** QUA008: very large files tracked in the repository. */
export const oversizedFiles: Rule = {
  id: 'QUA008',
  title: 'Very large file committed to the repository',
  severity: 'low',
  category: 'quality',
  description: 'Files over 2 MB bloat clones and deploys and usually belong in object storage or Git LFS.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of project.files) {
      if (isInNodeModules(file.path)) continue;
      if (file.size <= LARGE_FILE_BYTES) continue;
      matches.push({
        file: file.path,
        evidence: `${baseName(file.path)} is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
        remediation: 'Move large assets to object storage, a CDN, or Git LFS; keep the repository lean for fast clones and deploys.',
      });
      if (matches.length >= 5) break;
    }
    return matches;
  },
};

/** QUA009: build artifacts and OS junk tracked in the repository. */
export const committedArtifacts: Rule = {
  id: 'QUA009',
  title: 'Build artifacts or OS junk files committed',
  severity: 'low',
  category: 'quality',
  description: 'Source maps, TypeScript build info and OS metadata files are generated output that does not belong in git.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of project.files) {
      if (isInNodeModules(file.path)) continue;
      const name = baseName(file.path).toLowerCase();
      if (name.endsWith('.js.map') || name.endsWith('.css.map') || name.endsWith('.tsbuildinfo')) {
        matches.push({
          file: file.path,
          evidence: `Generated artifact "${file.path}" is tracked in the repository.`,
          remediation: 'Add build output (*.map, *.tsbuildinfo) to .gitignore and remove the tracked copies; they are regenerated on every build.',
        });
      } else if (name === '.ds_store' || name === 'thumbs.db' || name === 'desktop.ini') {
        matches.push({
          file: file.path,
          severity: 'info',
          evidence: `OS metadata file "${file.path}" is tracked in the repository.`,
          remediation: 'Add OS junk files (.DS_Store, Thumbs.db, desktop.ini) to .gitignore and remove the tracked copies.',
        });
      }
      if (matches.length >= 8) break;
    }
    return matches;
  },
};

export const qualityRules: Rule[] = [
  conflictMarkers,
  dynamicCodeExecution,
  weakCrypto,
  insecureHttpUrl,
  debuggerStatements,
  consoleLogFlood,
  todoDensity,
  oversizedFiles,
  committedArtifacts,
];
