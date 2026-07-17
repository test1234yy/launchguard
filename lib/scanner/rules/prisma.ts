import type { Rule, RuleMatch } from '../types';
import { getRootPackageJson } from './helpers';

function schemaFiles(project: Parameters<Rule['check']>[0]) {
  return project.files.filter((f) => !f.binary && f.path.endsWith('schema.prisma'));
}

/** PRI001: schema.prisma exists but no committed migrations. */
export const prismaMissingMigrations: Rule = {
  id: 'PRI001',
  title: 'Prisma schema has no committed migrations',
  severity: 'high',
  category: 'prisma',
  description:
    'Without prisma/migrations, production databases cannot be evolved reproducibly with prisma migrate deploy.',
  check(project) {
    const schemas = schemaFiles(project);
    if (schemas.length === 0) return [];
    const matches: RuleMatch[] = [];
    for (const schema of schemas) {
      const dir = schema.path.includes('/') ? schema.path.slice(0, schema.path.lastIndexOf('/')) : '';
      const migrationsPrefix = dir ? `${dir}/migrations/` : 'migrations/';
      const hasMigrations = project.files.some((f) => f.path.startsWith(migrationsPrefix));
      if (!hasMigrations) {
        matches.push({
          file: schema.path,
          evidence: `${schema.path} exists but no ${migrationsPrefix} directory is committed.`,
          remediation:
            'Create migrations with `prisma migrate dev` during development, commit the prisma/migrations directory, and run `prisma migrate deploy` on release.',
        });
      }
    }
    return matches;
  },
};

const RISKY_SCRIPT = /prisma\s+(db\s+push|migrate\s+dev)\b/;
const DEPLOY_SCRIPTS = ['build', 'start', 'deploy', 'postinstall', 'vercel-build', 'prestart', 'release'];

/** PRI002: prisma db push / migrate dev wired into deploy scripts. */
export const prismaDbPushInScripts: Rule = {
  id: 'PRI002',
  title: 'Deploy script uses prisma db push or migrate dev',
  severity: 'high',
  category: 'prisma',
  description:
    'db push and migrate dev are development tools; in production they can drop data or prompt interactively.',
  check(project) {
    const found = getRootPackageJson(project);
    if (!found?.pkg.scripts) return [];
    const matches: RuleMatch[] = [];
    for (const [name, command] of Object.entries(found.pkg.scripts)) {
      if (typeof command !== 'string') continue;
      const m = RISKY_SCRIPT.exec(command);
      if (m && DEPLOY_SCRIPTS.includes(name)) {
        matches.push({
          file: 'package.json',
          evidence: `"${name}": "${command}"`,
          remediation: `Replace \`prisma ${m[1]}\` in the "${name}" script with \`prisma migrate deploy\`, which applies committed migrations non-interactively.`,
        });
      }
    }
    return matches;
  },
};

/** PRI003: SQLite datasource in a repo that looks deploy-bound. */
export const prismaSqliteDatasource: Rule = {
  id: 'PRI003',
  title: 'Prisma datasource uses SQLite',
  severity: 'medium',
  category: 'prisma',
  description:
    'SQLite files do not survive redeploys on serverless/ephemeral hosts and do not support concurrent writers well.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const schema of schemaFiles(project)) {
      const m = /provider\s*=\s*"sqlite"/.exec(schema.content);
      if (m) {
        matches.push({
          file: schema.path,
          line: schema.content.slice(0, m.index).split('\n').length,
          evidence: 'datasource provider = "sqlite"',
          remediation:
            'Use a managed database (PostgreSQL, MySQL, …) for production deploys, or document that this project is local-only.',
        });
      }
    }
    return matches;
  },
};

export const prismaRules: Rule[] = [prismaMissingMigrations, prismaDbPushInScripts, prismaSqliteDatasource];
