import type { Rule, RuleMatch, Severity } from '../types';
import { findRootFile, getRootPackageJson } from './helpers';

const LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
];

/** DEP001: no lockfile means unreproducible installs. */
export const missingLockfile: Rule = {
  id: 'DEP001',
  title: 'No dependency lockfile committed',
  severity: 'high',
  category: 'dependencies',
  description: 'Without a lockfile every deploy may install different dependency versions.',
  check(project) {
    const pkg = getRootPackageJson(project);
    if (!pkg) return [];
    const hasLockfile = LOCKFILES.some((name) => findRootFile(project, name));
    if (hasLockfile) return [];
    return [
      {
        file: 'package.json',
        evidence: 'package.json exists but no package-lock.json, yarn.lock, pnpm-lock.yaml or bun lockfile was found.',
        remediation:
          'Run npm install locally and commit package-lock.json (or the lockfile of your package manager) so CI and production install identical versions.',
      },
    ];
  },
};

const UNPINNED = /^(\*|latest|>=?[^|]*|x|)$/i;

/** DEP002: floating versions make builds non-deterministic. */
export const unpinnedDependencies: Rule = {
  id: 'DEP002',
  title: 'Dependency uses a floating version range',
  severity: 'medium',
  category: 'dependencies',
  description: 'Versions like "*", "latest" or ">=x" can pull breaking releases straight into production.',
  check(project) {
    const found = getRootPackageJson(project);
    if (!found) return [];
    const matches: RuleMatch[] = [];
    for (const section of ['dependencies', 'devDependencies'] as const) {
      const deps = found.pkg[section];
      if (!deps) continue;
      for (const [name, version] of Object.entries(deps)) {
        if (typeof version !== 'string') continue;
        if (UNPINNED.test(version.trim())) {
          matches.push({
            file: 'package.json',
            evidence: `"${name}": "${version}" in ${section}`,
            remediation: `Pin ${name} to a semver range such as ^x.y.z and rely on the lockfile for exact resolution.`,
          });
        }
      }
    }
    return matches;
  },
};

/** DEP003: git/http/file dependencies bypass the registry and its integrity checks. */
export const nonRegistryDependencies: Rule = {
  id: 'DEP003',
  title: 'Dependency resolved outside the npm registry',
  severity: 'medium',
  category: 'dependencies',
  description: 'git/file/http dependency sources skip registry integrity guarantees and often break in CI.',
  check(project) {
    const found = getRootPackageJson(project);
    if (!found) return [];
    const matches: RuleMatch[] = [];
    for (const section of ['dependencies', 'devDependencies'] as const) {
      const deps = found.pkg[section];
      if (!deps) continue;
      for (const [name, version] of Object.entries(deps)) {
        if (typeof version !== 'string') continue;
        const v = version.trim();
        const insecure = v.startsWith('http://');
        if (
          insecure ||
          v.startsWith('git+') ||
          v.startsWith('git://') ||
          v.startsWith('github:') ||
          v.startsWith('file:') ||
          v.startsWith('link:') ||
          v.startsWith('https://')
        ) {
          matches.push({
            file: 'package.json',
            severity: (insecure ? 'high' : 'medium') as Severity,
            evidence: `"${name}": "${version}" in ${section}`,
            remediation: `Publish or consume ${name} from the npm registry (or a private registry) so installs are verified and reproducible.`,
          });
        }
      }
    }
    return matches;
  },
};

interface RiskyPackage {
  reason: string;
  severity: Severity;
  /** When set, only these exact versions are flagged. */
  versions?: string[];
}

const RISKY_PACKAGES: Record<string, RiskyPackage> = {
  'event-stream': { reason: 'was compromised in a 2018 supply-chain attack and is unmaintained', severity: 'high' },
  'flatmap-stream': { reason: 'contained malicious code (event-stream incident)', severity: 'critical' },
  request: { reason: 'is deprecated and unmaintained since 2020', severity: 'medium' },
  'node-uuid': { reason: 'is deprecated; use the uuid package', severity: 'medium' },
  'left-pad': { reason: 'is deprecated; use String.prototype.padStart', severity: 'low' },
  'node-sass': { reason: 'is deprecated; use sass (dart-sass)', severity: 'low' },
  'ua-parser-js': {
    reason: 'these exact versions were hijacked with malware in October 2021',
    severity: 'critical',
    versions: ['0.7.29', '0.8.0', '1.0.0'],
  },
  colors: {
    reason: 'these exact versions contained an intentional infinite loop (January 2022 sabotage)',
    severity: 'high',
    versions: ['1.4.1', '1.4.2', '1.4.44-liberty-2'],
  },
  faker: {
    reason: 'this exact version was intentionally sabotaged (January 2022); use @faker-js/faker',
    severity: 'high',
    versions: ['6.6.6'],
  },
};

function normalizeVersion(range: string): string {
  return range.trim().replace(/^[\^~=v]+/, '');
}

/** DEP004: known-compromised or deprecated packages. */
export const riskyPackages: Rule = {
  id: 'DEP004',
  title: 'Known risky or deprecated package in dependencies',
  severity: 'high',
  category: 'dependencies',
  description: 'Flags packages with documented supply-chain incidents or formal deprecations.',
  check(project) {
    const found = getRootPackageJson(project);
    if (!found) return [];
    const matches: RuleMatch[] = [];
    for (const section of ['dependencies', 'devDependencies'] as const) {
      const deps = found.pkg[section];
      if (!deps) continue;
      for (const [name, version] of Object.entries(deps)) {
        const risky = RISKY_PACKAGES[name];
        if (!risky) continue;
        if (risky.versions && !risky.versions.includes(normalizeVersion(String(version)))) continue;
        matches.push({
          file: 'package.json',
          severity: risky.severity,
          evidence: `"${name}": "${version}" — ${name} ${risky.reason}.`,
          remediation: `Replace or upgrade ${name}; see the package's advisory/deprecation notice for the recommended successor.`,
        });
      }
    }
    return matches;
  },
};

/** DEP005: Node.js version not pinned anywhere. */
export const nodeVersionUnpinned: Rule = {
  id: 'DEP005',
  title: 'Node.js version is not pinned',
  severity: 'low',
  category: 'dependencies',
  description: 'Without engines.node, .nvmrc or .node-version, hosts pick an arbitrary Node.js version.',
  check(project) {
    const found = getRootPackageJson(project);
    if (!found) return [];
    if (found.pkg.engines?.node) return [];
    if (findRootFile(project, '.nvmrc', '.node-version')) return [];
    return [
      {
        file: 'package.json',
        evidence: 'No engines.node field, .nvmrc or .node-version file found.',
        remediation: 'Declare the supported Node.js version, e.g. "engines": { "node": ">=20" }, and add an .nvmrc.',
      },
    ];
  },
};

/** DEP006: the same package listed in dependencies and devDependencies. */
export const duplicateDependencies: Rule = {
  id: 'DEP006',
  title: 'Package listed in both dependencies and devDependencies',
  severity: 'low',
  category: 'dependencies',
  description: 'Duplicate entries drift apart and make it ambiguous whether the package ships to production.',
  check(project) {
    const found = getRootPackageJson(project);
    if (!found) return [];
    const deps = found.pkg.dependencies ?? {};
    const dev = found.pkg.devDependencies ?? {};
    const matches: RuleMatch[] = [];
    for (const name of Object.keys(deps)) {
      if (!(name in dev)) continue;
      matches.push({
        file: 'package.json',
        evidence: `"${name}" appears in dependencies ("${deps[name]}") and devDependencies ("${dev[name]}").`,
        remediation: `Keep ${name} in exactly one section: dependencies if it is needed at runtime, devDependencies otherwise.`,
      });
      if (matches.length >= 10) break;
    }
    return matches;
  },
};

interface LockfileShape {
  lockfileVersion?: number;
  packages?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
}

/** DEP007: package.json declares dependencies the lockfile does not resolve. */
export const lockfileDrift: Rule = {
  id: 'DEP007',
  title: 'Dependency missing from the committed lockfile',
  severity: 'medium',
  category: 'dependencies',
  description: 'A dependency in package.json but absent from package-lock.json makes `npm ci` fail and deploys unreproducible.',
  check(project) {
    const found = getRootPackageJson(project);
    if (!found) return [];
    const lockFile = findRootFile(project, 'package-lock.json', 'npm-shrinkwrap.json');
    if (!lockFile || lockFile.binary) return [];
    const lock = ((): LockfileShape | undefined => {
      try {
        return JSON.parse(lockFile.content) as LockfileShape;
      } catch {
        return undefined;
      }
    })();
    if (!lock) {
      return [
        {
          file: lockFile.path,
          evidence: `${lockFile.path} is not valid JSON.`,
          remediation: 'Regenerate the lockfile with `npm install` and commit the result; a corrupt lockfile breaks `npm ci`.',
        },
      ];
    }
    const resolved = (name: string): boolean => {
      if (lock.packages && `node_modules/${name}` in lock.packages) return true;
      if (lock.dependencies && name in lock.dependencies) return true;
      return false;
    };
    const matches: RuleMatch[] = [];
    for (const section of ['dependencies', 'devDependencies'] as const) {
      const deps = found.pkg[section];
      if (!deps) continue;
      for (const name of Object.keys(deps)) {
        if (resolved(name)) continue;
        matches.push({
          file: lockFile.path,
          evidence: `"${name}" is declared in package.json ${section} but has no entry in ${lockFile.path}.`,
          remediation: `Run npm install to re-sync the lockfile with package.json, then commit it; npm ci fails on drift.`,
        });
        if (matches.length >= 10) return matches;
      }
    }
    return matches;
  },
};

export const dependencyRules: Rule[] = [
  missingLockfile,
  unpinnedDependencies,
  nonRegistryDependencies,
  riskyPackages,
  nodeVersionUnpinned,
  duplicateDependencies,
  lockfileDrift,
];
