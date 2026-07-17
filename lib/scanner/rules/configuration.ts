import type { Rule, RuleMatch } from '../types';
import { eachLine, findRootFile, getRootPackageJson, isCodeLike, isInNodeModules, textFiles } from './helpers';

/** CFG001: no .gitignore at all. */
export const missingGitignore: Rule = {
  id: 'CFG001',
  title: 'No .gitignore file',
  severity: 'high',
  category: 'configuration',
  description: 'Without .gitignore, env files, node_modules and build output tend to get committed.',
  check(project) {
    if (findRootFile(project, '.gitignore')) return [];
    return [
      {
        file: '(project)',
        evidence: 'The repository root contains no .gitignore file.',
        remediation:
          'Add a .gitignore covering at least node_modules, .env*, build output (.next, dist) and OS junk files.',
      },
    ];
  },
};

/** CFG002: .gitignore exists but has dangerous gaps. */
export const gitignoreGaps: Rule = {
  id: 'CFG002',
  title: '.gitignore does not cover critical paths',
  severity: 'medium',
  category: 'configuration',
  description: 'Missing node_modules or .env entries invite accidental commits of huge or secret files.',
  check(project) {
    const gitignore = findRootFile(project, '.gitignore');
    if (!gitignore || gitignore.binary) return [];
    const content = gitignore.content;
    const matches: RuleMatch[] = [];
    const coversNodeModules = /(^|\n)\s*\/?node_modules(\/)?(\s|$)/.test(content);
    const coversEnv = /(^|\n)\s*(\.env(\.\*|\*)?|\*\.env[^\n]*|\.env\.local)/.test(content);
    if (!coversNodeModules && getRootPackageJson(project)) {
      matches.push({
        file: '.gitignore',
        evidence: '.gitignore does not list node_modules.',
        remediation: 'Add a node_modules line to .gitignore.',
      });
    }
    if (!coversEnv) {
      matches.push({
        file: '.gitignore',
        evidence: '.gitignore does not exclude .env files.',
        remediation: 'Add `.env` and `.env.*` (allowing !.env.example) to .gitignore.',
      });
    }
    return matches;
  },
};

/** CFG003: node_modules committed to the repository. */
export const committedNodeModules: Rule = {
  id: 'CFG003',
  title: 'node_modules directory committed to the repository',
  severity: 'high',
  category: 'configuration',
  description: 'Committing node_modules bloats the repository and ships unauditable third-party code.',
  check(project) {
    const present = project.files.filter((f) => isInNodeModules(f.path));
    if (present.length > 0) {
      const offender = present[0];
      const root = offender.path.slice(0, offender.path.indexOf('node_modules') + 'node_modules'.length);
      return [
        {
          file: root,
          evidence: `${present.length} file(s) under node_modules/ are tracked in the repository.`,
          remediation:
            'Remove node_modules from version control (git rm -r --cached node_modules), add it to .gitignore, and rely on the lockfile.',
        },
      ];
    }
    // The loader drops node_modules before scanning; this flag preserves the fact
    // that it was present in the source so the finding is not lost.
    if (project.meta?.committedNodeModules) {
      return [
        {
          file: 'node_modules',
          evidence: 'The source contains a committed node_modules directory (excluded from scanning).',
          remediation:
            'Remove node_modules from version control (git rm -r --cached node_modules), add it to .gitignore, and rely on the lockfile.',
        },
      ];
    }
    return [];
  },
};

/** CFG004: no README. */
export const missingReadme: Rule = {
  id: 'CFG004',
  title: 'No README documentation',
  severity: 'low',
  category: 'configuration',
  description: 'A README with setup and deploy steps is the first thing operators need.',
  check(project) {
    const readme = project.files.find(
      (f) => !f.path.includes('/') && /^readme(\.(md|txt|rst))?$/i.test(f.path)
    );
    if (readme) return [];
    return [
      {
        file: '(project)',
        evidence: 'The repository root has no README file.',
        remediation: 'Add a README.md covering setup, required environment variables, and how to run and deploy.',
      },
    ];
  },
};

/** CFG005: CORS configured wide open. */
export const corsWildcard: Rule = {
  id: 'CFG005',
  title: 'CORS allows any origin (*)',
  severity: 'medium',
  category: 'configuration',
  description: 'Access-Control-Allow-Origin: * on authenticated APIs enables cross-site data theft.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of textFiles(project)) {
      if (!isCodeLike(file.path) || isInNodeModules(file.path)) continue;
      eachLine(file.content, (line, lineNo) => {
        if (
          /access-control-allow-origin/i.test(line) &&
          /(['"`]\s*\*\s*['"`]|:\s*\*\s*$|=\s*\*\s*$)/.test(line)
        ) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim().slice(0, 160),
            remediation:
              'Restrict Access-Control-Allow-Origin to an explicit allowlist of origins instead of "*", especially on endpoints that use cookies or auth headers.',
          });
        }
      });
      if (matches.length >= 10) break;
    }
    return matches;
  },
};

export const configurationRules: Rule[] = [
  missingGitignore,
  gitignoreGaps,
  committedNodeModules,
  missingReadme,
  corsWildcard,
];
