import type { Rule, RuleMatch, Severity } from '../types';
import { eachLine, getRootPackageJson, isRootFile, scannableText, secretScanTargets } from './helpers';
import { dockerfiles } from './docker';

function nextConfigFiles(project: Parameters<Rule['check']>[0]) {
  return project.files.filter(
    (f) =>
      !f.binary &&
      isRootFile(f.path) &&
      /^next\.config\.(js|mjs|cjs|ts)$/.test(f.path)
  );
}

/** NXT001: build configured to ignore TypeScript/ESLint errors. */
export const nextIgnoresBuildErrors: Rule = {
  id: 'NXT001',
  title: 'next.config disables build-time error checking',
  severity: 'high',
  category: 'nextjs',
  description:
    'ignoreBuildErrors / ignoreDuringBuilds ship type errors and lint violations straight to production.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const config of nextConfigFiles(project)) {
      eachLine(config.content, (line, lineNo) => {
        if (/ignoreBuildErrors\s*:\s*true/.test(line)) {
          matches.push({
            file: config.path,
            line: lineNo,
            evidence: line.trim(),
            remediation: 'Remove typescript.ignoreBuildErrors and fix the underlying type errors before deploying.',
          });
        }
        if (/ignoreDuringBuilds\s*:\s*true/.test(line)) {
          matches.push({
            file: config.path,
            line: lineNo,
            evidence: line.trim(),
            remediation: 'Remove eslint.ignoreDuringBuilds and fix lint errors, or scope lint rules deliberately.',
          });
        }
      });
    }
    return matches;
  },
};

const PUBLIC_ENV_REGEX = /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|TOKEN|API_KEY|ACCESS_KEY)[A-Z0-9_]*/g;

function severityForPublicVar(name: string): Severity {
  return /(SECRET|PRIVATE|SERVICE_ROLE|PASSWORD)/.test(name) ? 'critical' : 'high';
}

/** NXT002: secret-named NEXT_PUBLIC_ variables are exposed to the browser. */
export const publicEnvLeak: Rule = {
  id: 'NXT002',
  title: 'Secret-like variable exposed with NEXT_PUBLIC_ prefix',
  severity: 'critical',
  category: 'nextjs',
  description:
    'Anything prefixed NEXT_PUBLIC_ is inlined into the client JavaScript bundle and readable by every visitor.',
  check(project) {
    const matches: RuleMatch[] = [];
    const seen = new Set<string>();
    for (const file of secretScanTargets(project)) {
      const text = scannableText(file);
      PUBLIC_ENV_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = PUBLIC_ENV_REGEX.exec(text)) !== null) {
        const name = m[0];
        const key = `${file.path}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({
          file: file.path,
          line: text.slice(0, m.index).split('\n').length,
          severity: severityForPublicVar(name),
          evidence: `${name} — NEXT_PUBLIC_ values are embedded in the public client bundle.`,
          remediation: `If ${name} is genuinely secret, drop the NEXT_PUBLIC_ prefix and read it only in server code; if it is a public key, rename it so the name does not claim to be a secret.`,
        });
        if (matches.length >= 20) return matches;
      }
    }
    return matches;
  },
};

/** NXT003: production browser source maps expose original source. */
export const browserSourceMaps: Rule = {
  id: 'NXT003',
  title: 'Production browser source maps are enabled',
  severity: 'low',
  category: 'nextjs',
  description: 'productionBrowserSourceMaps: true publishes readable application source to every visitor.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const config of nextConfigFiles(project)) {
      eachLine(config.content, (line, lineNo) => {
        if (/productionBrowserSourceMaps\s*:\s*true/.test(line)) {
          matches.push({
            file: config.path,
            line: lineNo,
            evidence: line.trim(),
            remediation:
              'Disable productionBrowserSourceMaps unless you intentionally publish source, e.g. for an open-source app.',
          });
        }
      });
    }
    return matches;
  },
};

/** NXT004: dockerized Next.js app without output: 'standalone'. */
export const missingStandaloneOutput: Rule = {
  id: 'NXT004',
  title: "Dockerized Next.js app without output: 'standalone'",
  severity: 'low',
  category: 'nextjs',
  description:
    "Without output: 'standalone', a Next.js Docker image needs the full node_modules tree and often breaks at runtime.",
  check(project) {
    if (dockerfiles(project).length === 0) return [];
    const pkg = getRootPackageJson(project);
    if (!pkg?.pkg.dependencies?.next) return [];
    const configs = nextConfigFiles(project);
    if (configs.length === 0) return [];
    const hasStandalone = configs.some((c) => /output\s*:\s*['"]standalone['"]/.test(c.content));
    if (hasStandalone) return [];
    return [
      {
        file: configs[0].path,
        evidence: `${configs[0].path} does not set output: 'standalone' although the project ships a Dockerfile.`,
        remediation:
          "Set output: 'standalone' in next.config and copy .next/standalone into the image for a small, self-contained runtime.",
      },
    ];
  },
};

export const nextjsRules: Rule[] = [nextIgnoresBuildErrors, publicEnvLeak, browserSourceMaps, missingStandaloneOutput];
