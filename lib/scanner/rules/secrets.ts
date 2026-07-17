import type { Rule, RuleMatch } from '../types';
import { isPlaceholder, maskValue } from '../redact';
import { baseName, isInNodeModules, lineAt, scannableText, secretScanTargets } from './helpers';

const ENV_EXAMPLE_NAMES = new Set([
  '.env.example', '.env.sample', '.env.template', '.env.defaults', '.env.example.local', '.env.dist',
]);

function isEnvExample(name: string): boolean {
  return ENV_EXAMPLE_NAMES.has(name.toLowerCase());
}

function isEnvFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === '.env' || (lower.startsWith('.env.') && !isEnvExample(lower));
}

/** SEC001: real environment files committed to the repository. */
export const committedEnvFile: Rule = {
  id: 'SEC001',
  title: 'Environment file committed to the repository',
  severity: 'critical',
  category: 'secrets',
  description:
    'Files such as .env or .env.production typically contain live credentials and must never be committed.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of project.files) {
      const name = baseName(file.path);
      if (!isEnvFile(name) || isInNodeModules(file.path)) continue;
      const sensitive = ['.env', '.env.local', '.env.production', '.env.prod', '.env.staging'].includes(
        name.toLowerCase()
      );
      matches.push({
        file: file.path,
        severity: sensitive ? 'critical' : 'medium',
        evidence: `File "${file.path}" (${file.size} bytes) is tracked in the repository.`,
        remediation: `Remove ${file.path} from version control (git rm --cached ${file.path}), add it to .gitignore, rotate every credential it contained, and document required variables in .env.example instead.`,
      });
    }
    return matches;
  },
};

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const HARDCODED_PATTERNS: SecretPattern[] = [
  { name: 'AWS access key ID', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'GitHub token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  { name: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{36,}\b/g },
  { name: 'Stripe live secret key', regex: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/g },
  { name: 'OpenAI API key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    name: 'Database connection string with credentials',
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/gi,
  },
];

/** SEC002: high-confidence credential material inside tracked files. */
export const hardcodedSecret: Rule = {
  id: 'SEC002',
  title: 'Hard-coded secret detected',
  severity: 'critical',
  category: 'secrets',
  description: 'Credential material matching well-known token formats was found inside the repository.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of secretScanTargets(project)) {
      const text = scannableText(file);
      for (const { name, regex } of HARDCODED_PATTERNS) {
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
          matches.push({
            file: file.path,
            line: lineAt(text, m.index),
            evidence: `${name}: ${maskValue(m[0])}`,
            remediation: `Rotate this ${name.toLowerCase()} immediately, move it to an environment variable or secret manager, and purge it from git history (e.g. git filter-repo).`,
          });
          if (matches.length >= 40) return matches;
        }
      }
    }
    return matches;
  },
};

const ASSIGNMENT_REGEX =
  /(password|passwd|secret|token|api[_-]?key|apikey|private[_-]?key|client[_-]?secret|access[_-]?key|auth[_-]?token)\s*['"]?\s*[:=]\s*['"]([^'"\n]{8,})['"]/gi;

const LOW_CONFIDENCE_VALUE = /^[a-z]+([ _-][a-z]+)*$/i;

/** SEC003: suspicious literal assignments to secret-named variables. */
export const secretAssignment: Rule = {
  id: 'SEC003',
  title: 'Secret assigned to a literal value in code',
  severity: 'high',
  category: 'secrets',
  description: 'A variable whose name suggests a credential is assigned a hard-coded literal.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of secretScanTargets(project)) {
      const name = baseName(file.path).toLowerCase();
      if (name.startsWith('.env')) continue; // covered by SEC001
      if (name === 'package.json' || name === 'tsconfig.json') continue;
      const text = scannableText(file);
      ASSIGNMENT_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ASSIGNMENT_REGEX.exec(text)) !== null) {
        const value = m[2];
        if (isPlaceholder(value)) continue;
        if (LOW_CONFIDENCE_VALUE.test(value)) continue; // plain words: likely a label, not a secret
        if (value.startsWith('process.env') || value.includes('${')) continue;
        matches.push({
          file: file.path,
          line: lineAt(text, m.index),
          evidence: `${m[1]} = ${maskValue(value)}`,
          remediation:
            'Read the credential from process.env (or a secret manager) instead of a source literal, then rotate the exposed value.',
        });
        if (matches.length >= 25) return matches;
      }
    }
    return matches;
  },
};

/** SEC004: private key files committed by extension. */
export const privateKeyFile: Rule = {
  id: 'SEC004',
  title: 'Private key or keystore file committed',
  severity: 'critical',
  category: 'secrets',
  description: 'Key material files must be kept out of version control.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of project.files) {
      const name = baseName(file.path).toLowerCase();
      if (isInNodeModules(file.path)) continue;
      if (
        name.endsWith('.pem') ||
        name.endsWith('.p12') ||
        name.endsWith('.pfx') ||
        name.endsWith('.keystore') ||
        name === 'id_rsa' ||
        name === 'id_ed25519' ||
        name === 'id_ecdsa'
      ) {
        matches.push({
          file: file.path,
          evidence: `Key material file "${file.path}" is tracked in the repository.`,
          remediation: `Remove ${file.path} from the repository, rotate the key pair, and load keys from a secret store at deploy time.`,
        });
      }
    }
    return matches;
  },
};

export const secretRules: Rule[] = [committedEnvFile, hardcodedSecret, secretAssignment, privateKeyFile];

export { isEnvExample, isEnvFile };
