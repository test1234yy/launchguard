import type { Rule, RuleMatch } from '../types';
import { eachLine, getRootPackageJson } from './helpers';

function ciConfigFiles(project: Parameters<Rule['check']>[0]): string[] {
  const paths: string[] = [];
  for (const file of project.files) {
    const p = file.path;
    if (
      (p.startsWith('.github/workflows/') && (p.endsWith('.yml') || p.endsWith('.yaml'))) ||
      p === '.gitlab-ci.yml' ||
      p === '.circleci/config.yml' ||
      p === 'azure-pipelines.yml' ||
      p === 'Jenkinsfile' ||
      p === '.travis.yml' ||
      p === 'bitbucket-pipelines.yml'
    ) {
      paths.push(p);
    }
  }
  return paths;
}

/** CI001: no continuous integration configuration at all. */
export const missingCi: Rule = {
  id: 'CI001',
  title: 'No continuous integration configuration found',
  severity: 'medium',
  category: 'ci',
  description: 'Without CI, broken builds and failing tests reach production unnoticed.',
  check(project) {
    if (ciConfigFiles(project).length > 0) return [];
    return [
      {
        file: '(project)',
        evidence:
          'No CI configuration found (.github/workflows, .gitlab-ci.yml, .circleci, azure-pipelines.yml, Jenkinsfile, …).',
        remediation:
          'Add a CI pipeline (e.g. a GitHub Actions workflow) that installs dependencies, lints, type-checks, tests and builds on every push.',
      },
    ];
  },
};

const PLACEHOLDER_TEST = /no test specified|^true$|^exit 0$/i;

/** CI002: package.json has no meaningful test script. */
export const missingTestScript: Rule = {
  id: 'CI002',
  title: 'No meaningful test script in package.json',
  severity: 'medium',
  category: 'ci',
  description: 'A real test script is the minimum gate before deploying.',
  check(project) {
    const found = getRootPackageJson(project);
    if (!found) return [];
    const test = found.pkg.scripts?.test?.trim();
    if (test && !PLACEHOLDER_TEST.test(test)) return [];
    return [
      {
        file: 'package.json',
        evidence: test
          ? `"test": "${test}" is a placeholder that runs no tests.`
          : 'package.json defines no "test" script.',
        remediation: 'Add a real test runner (vitest, jest, node --test, …) and wire it to the "test" script.',
      },
    ];
  },
};

const TEST_COMMAND =
  /\b(npm (run )?test|npm run test:\w+|yarn test|pnpm (run )?test|vitest|jest|playwright|cypress|pytest|go test|cargo test|mvn test)\b/;

/** CI003: CI exists but never executes tests. */
export const ciSkipsTests: Rule = {
  id: 'CI003',
  title: 'CI pipeline never runs tests',
  severity: 'low',
  category: 'ci',
  description: 'A pipeline that only builds gives false confidence.',
  check(project) {
    const configs = ciConfigFiles(project);
    if (configs.length === 0) return []; // CI001 covers this
    const runsTests = configs.some((path) => {
      const file = project.files.find((f) => f.path === path);
      return file && TEST_COMMAND.test(file.content);
    });
    if (runsTests) return [];
    return [
      {
        file: configs[0],
        evidence: `CI configuration (${configs.join(', ')}) contains no recognizable test command.`,
        remediation: 'Add a test step (e.g. `run: npm test`) to the pipeline so failures block the deploy.',
      },
    ];
  },
};

function githubWorkflows(project: Parameters<Rule['check']>[0]) {
  return project.files.filter(
    (f) => !f.binary && f.path.startsWith('.github/workflows/') && (f.path.endsWith('.yml') || f.path.endsWith('.yaml'))
  );
}

const PINNED_REF = /^[0-9a-f]{7,40}$|^v?\d+(\.\d+){0,2}([-.][\w.]+)?$/i;

/** CI004: GitHub Actions pinned to a mutable branch (or not pinned at all). */
export const unpinnedActions: Rule = {
  id: 'CI004',
  title: 'GitHub Action not pinned to a version',
  severity: 'medium',
  category: 'ci',
  description: 'Actions referenced by @main/@master (or no ref) can change under you — including maliciously.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of githubWorkflows(project)) {
      eachLine(file.content, (line, lineNo) => {
        if (matches.length >= 15) return;
        const m = /^\s*(?:-\s+)?uses:\s*([^\s#'"]+)/.exec(line);
        if (!m) return;
        const ref = m[1];
        if (ref.startsWith('./') || ref.startsWith('docker://')) return;
        const at = ref.lastIndexOf('@');
        if (at === -1) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim(),
            remediation: `Pin ${ref} to a release tag or, best, a full commit SHA (e.g. ${ref}@<sha>).`,
          });
          return;
        }
        const version = ref.slice(at + 1);
        if (/^(main|master|latest)$/i.test(version)) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim(),
            remediation: `Pin ${ref.slice(0, at)} to a release tag or a full commit SHA instead of the mutable "${version}" branch.`,
          });
        } else if (!PINNED_REF.test(version)) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim(),
            remediation: `"${version}" looks like a mutable branch; pin ${ref.slice(0, at)} to a release tag or commit SHA.`,
          });
        }
      });
    }
    return matches;
  },
};

const PR_HEAD_CHECKOUT = /ref:\s*\$\{\{\s*github\.event\.pull_request\.head/;

/** CI005: pull_request_target workflow checks out untrusted PR code. */
export const pwnRequestWorkflow: Rule = {
  id: 'CI005',
  title: 'pull_request_target workflow checks out untrusted PR code',
  severity: 'high',
  category: 'ci',
  description:
    'pull_request_target runs with repository secrets; checking out the PR head lets any fork execute code with those secrets ("pwn request").',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of githubWorkflows(project)) {
      if (!file.content.includes('pull_request_target')) continue;
      let refLine = 0;
      eachLine(file.content, (line, lineNo) => {
        if (!refLine && PR_HEAD_CHECKOUT.test(line)) refLine = lineNo;
      });
      if (!refLine) continue;
      matches.push({
        file: file.path,
        line: refLine,
        evidence: `Workflow uses pull_request_target and checks out \${{ github.event.pull_request.head }}.`,
        remediation:
          'Split the workflow: run untrusted PR code under the plain pull_request event (no secrets), and keep pull_request_target steps from checking out or executing fork code.',
      });
    }
    return matches;
  },
};

const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\/|_test\.go$|(^|\/)test_[^/]+\.py$/i;
const TEST_DIR_PATTERN = /(^|\/)(tests?|e2e|spec)(\/)/i;

/** CI006: the project ships no test files at all. */
export const noTestFiles: Rule = {
  id: 'CI006',
  title: 'No test files found in the project',
  severity: 'medium',
  category: 'ci',
  description: 'Without any tests, every deploy is an experiment run in production.',
  check(project) {
    if (!getRootPackageJson(project)) return [];
    const hasTests = project.files.some(
      (f) => TEST_FILE_PATTERN.test(f.path) || TEST_DIR_PATTERN.test(f.path)
    );
    if (hasTests) return [];
    return [
      {
        file: '(project)',
        evidence: 'No *.test.*, *.spec.*, __tests__/ or tests/ files exist anywhere in the project.',
        remediation:
          'Add at least a smoke test for the critical path (build boots, homepage renders, core API responds) and run it in CI.',
      },
    ];
  },
};

/** CI007: workflow steps that print secrets into build logs. */
export const secretsEchoedInCi: Rule = {
  id: 'CI007',
  title: 'Workflow echoes secrets into the build log',
  severity: 'high',
  category: 'ci',
  description: 'echo/printenv of ${{ secrets.* }} writes credential values into CI logs, where they outlive the run.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of githubWorkflows(project)) {
      eachLine(file.content, (line, lineNo) => {
        if (matches.length >= 10) return;
        if (line.includes('add-mask')) return; // ::add-mask:: is the safe pattern
        if (/\b(echo|printf|printenv)\b[^\n]*\$\{\{\s*secrets\./.test(line)) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim().slice(0, 160),
            remediation:
              'Never print secrets. Pass them via env: or with: inputs, and use `echo "::add-mask::$VALUE"` if a derived value could appear in logs.',
          });
        }
      });
    }
    return matches;
  },
};

export const ciRules: Rule[] = [
  missingCi,
  missingTestScript,
  ciSkipsTests,
  unpinnedActions,
  pwnRequestWorkflow,
  noTestFiles,
  secretsEchoedInCi,
];

export { ciConfigFiles };
