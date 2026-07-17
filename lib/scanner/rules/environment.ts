import type { Rule, RuleMatch } from '../types';
import { baseName, isInNodeModules, scannableText, textFiles } from './helpers';
import { isEnvExample } from './secrets';

/** Env vars that are provided by the platform/runtime and need no documentation. */
const WELL_KNOWN_ENV = new Set([
  'NODE_ENV', 'CI', 'PORT', 'HOME', 'PATH', 'PWD', 'TZ', 'HOSTNAME', 'TMPDIR',
  'NEXT_RUNTIME', 'NEXT_PHASE', 'NEXT_TELEMETRY_DISABLED',
  'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_REGION', 'VERCEL_GIT_COMMIT_SHA',
  'AWS_REGION', 'AWS_LAMBDA_FUNCTION_NAME', 'GITHUB_ACTIONS', 'RUNNER_OS',
]);

const ENV_REF_REGEX = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g;

const CODE_FILE = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/i;

/** Collect referenced env var names -> first file that references them. */
function collectEnvRefs(files: ReturnType<typeof textFiles>): Map<string, { file: string }> {
  const refs = new Map<string, { file: string }>();
  for (const file of files) {
    if (!CODE_FILE.test(file.path) || isInNodeModules(file.path)) continue;
    const text = scannableText(file);
    ENV_REF_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ENV_REF_REGEX.exec(text)) !== null) {
      const name = m[1] ?? m[2];
      if (!name || WELL_KNOWN_ENV.has(name) || name.startsWith('npm_')) continue;
      if (!refs.has(name)) refs.set(name, { file: file.path });
    }
  }
  return refs;
}

function envExampleFiles(project: Parameters<Rule['check']>[0]) {
  return project.files.filter((f) => isEnvExample(baseName(f.path)) && !isInNodeModules(f.path));
}

/** Variable names declared in an env-style file (KEY=... lines). */
function declaredEnvNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    names.add(line.slice(0, eq).trim().replace(/^export\s+/, ''));
  }
  return names;
}

/** ENV001: code reads env vars but the repo ships no .env.example. */
export const missingEnvExample: Rule = {
  id: 'ENV001',
  title: 'No .env.example documenting required environment variables',
  severity: 'medium',
  category: 'environment',
  description:
    'Deploys fail in surprising ways when required environment variables are undocumented.',
  check(project) {
    if (envExampleFiles(project).length > 0) return [];
    const refs = collectEnvRefs(textFiles(project));
    if (refs.size === 0) return [];
    const sample = [...refs.keys()].sort().slice(0, 6);
    return [
      {
        file: '(project)',
        evidence: `Code references ${refs.size} environment variable(s) (${sample.join(', ')}${
          refs.size > sample.length ? ', …' : ''
        }) but no .env.example exists.`,
        remediation:
          'Add a .env.example listing every required variable with placeholder values, and mention it in the README setup steps.',
      },
    ];
  },
};

/** ENV002: .env.example exists but misses variables the code reads. */
export const undocumentedEnvVars: Rule = {
  id: 'ENV002',
  title: 'Environment variable used in code but missing from .env.example',
  severity: 'low',
  category: 'environment',
  description: 'Each env var the code depends on should appear in .env.example.',
  check(project) {
    const examples = envExampleFiles(project);
    if (examples.length === 0) return [];
    const declared = new Set<string>();
    for (const example of examples) {
      for (const name of declaredEnvNames(example.content)) declared.add(name);
    }
    const refs = collectEnvRefs(textFiles(project));
    const matches: RuleMatch[] = [];
    const missing = [...refs.entries()].filter(([name]) => !declared.has(name));
    missing.sort(([a], [b]) => a.localeCompare(b));
    for (const [name, ref] of missing.slice(0, 15)) {
      matches.push({
        file: ref.file,
        evidence: `process.env.${name} is read here but ${name} is not documented in ${examples[0].path}.`,
        remediation: `Add ${name}= with a placeholder value to ${examples[0].path}.`,
      });
    }
    return matches;
  },
};

/** ENV003: .env.example appears to contain real (non-placeholder) secrets. */
export const envExampleRealValues: Rule = {
  id: 'ENV003',
  title: '.env.example contains what looks like a real credential',
  severity: 'high',
  category: 'environment',
  description: 'Example env files must contain placeholders only.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const example of envExampleFiles(project)) {
      for (const [i, rawLine] of example.content.split('\n').entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (value.length < 16) continue;
        const secretish = /(KEY|SECRET|TOKEN|PASSWORD|PASS|AUTH)/i.test(key);
        const highEntropy = /^[A-Za-z0-9+/_-]{16,}$/.test(value) && /\d/.test(value) && /[A-Za-z]/.test(value);
        if (secretish && highEntropy && !/example|sample|placeholder|your[-_]|xxx/i.test(value)) {
          matches.push({
            file: example.path,
            line: i + 1,
            evidence: `${key}= appears to hold a real value rather than a placeholder.`,
            remediation: `Replace the value of ${key} in ${example.path} with an obvious placeholder (e.g. ${key}=your-value-here) and rotate the credential if it was real.`,
          });
        }
      }
    }
    return matches;
  },
};

/** Used by tests to keep the allowlist in sync. */
export { WELL_KNOWN_ENV, declaredEnvNames };

export const environmentRules: Rule[] = [missingEnvExample, undocumentedEnvVars, envExampleRealValues];
