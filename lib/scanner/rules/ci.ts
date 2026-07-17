import type { Rule } from '../types';
import { getRootPackageJson } from './helpers';

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

export const ciRules: Rule[] = [missingCi, missingTestScript, ciSkipsTests];

export { ciConfigFiles };
