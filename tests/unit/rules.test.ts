import { describe, it, expect } from 'vitest';
import type { ProjectSnapshot, ScannedFile } from '@/lib/scanner/types';
import { ALL_RULES, ruleById } from '@/lib/scanner/rules';
import { runRules } from '@/lib/scanner/engine';

function f(path: string, content: string): ScannedFile {
  return { path, content, size: Buffer.byteLength(content), binary: false };
}
function project(files: ScannedFile[], name = 'test'): ProjectSnapshot {
  return { name, files };
}
function idsFor(files: ScannedFile[]): string[] {
  return runRules(project(files)).map((finding) => finding.ruleId);
}

describe('rule set', () => {
  it('exposes at least 15 unique deterministic rules', () => {
    const ids = new Set(ALL_RULES.map((r) => r.id));
    expect(ids.size).toBe(ALL_RULES.length);
    expect(ids.size).toBeGreaterThanOrEqual(15);
  });

  it('covers every documented category', () => {
    const categories = new Set(ALL_RULES.map((r) => r.category));
    for (const c of ['secrets', 'environment', 'dependencies', 'ci', 'docker', 'prisma', 'nextjs', 'configuration']) {
      expect(categories.has(c as never)).toBe(true);
    }
  });

  it('produces identical output on repeated runs (determinism)', () => {
    const files = [f('.env', 'SECRET=abcdef123456ghijkl'), f('package.json', '{"name":"x"}')];
    expect(JSON.stringify(runRules(project(files)))).toBe(JSON.stringify(runRules(project(files))));
  });
});

describe('secret rules', () => {
  it('SEC001 flags a committed .env file', () => {
    expect(idsFor([f('.env', 'DATABASE_URL=postgres://a:b@h/db')])).toContain('SEC001');
  });

  it('SEC002 flags a hard-coded AWS key', () => {
    expect(idsFor([f('config.js', 'const k = "AKIAIOSFODNN7EXAMPLE"')])).toContain('SEC002');
  });

  it('SEC002 redacts the secret in the evidence', () => {
    const finding = runRules(project([f('c.js', 'x = "AKIAIOSFODNN7EXAMPLE"')])).find((x) => x.ruleId === 'SEC002');
    expect(finding?.evidence).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('SEC004 flags committed private key files', () => {
    expect(idsFor([f('certs/key.pem', 'nope')])).toContain('SEC004');
  });

  it('does not flag a placeholder value in code', () => {
    expect(idsFor([f('c.ts', 'const apiKey = "your-api-key-here"')])).not.toContain('SEC003');
  });
});

describe('environment rules', () => {
  it('ENV001 fires when env vars are used but no example exists', () => {
    const ids = idsFor([f('app.ts', 'const x = process.env.MY_SERVICE_URL')]);
    expect(ids).toContain('ENV001');
  });

  it('ENV002 flags an undocumented variable', () => {
    const ids = idsFor([
      f('app.ts', 'const a = process.env.DOCUMENTED; const b = process.env.MISSING_VAR'),
      f('.env.example', 'DOCUMENTED=placeholder'),
    ]);
    expect(ids).toContain('ENV002');
  });
});

describe('dependency rules', () => {
  const pkg = (deps: object, extra: object = {}) =>
    f('package.json', JSON.stringify({ name: 'x', dependencies: deps, ...extra }));

  it('DEP001 flags a missing lockfile', () => {
    expect(idsFor([pkg({ next: '^14.0.0' })])).toContain('DEP001');
  });

  it('DEP002 flags a floating version', () => {
    expect(idsFor([pkg({ next: 'latest' })])).toContain('DEP002');
  });

  it('DEP004 flags a known-risky package', () => {
    expect(idsFor([pkg({ 'event-stream': '^3.0.0' })])).toContain('DEP004');
  });

  it('DEP005 flags an unpinned Node version', () => {
    expect(idsFor([pkg({ next: '^14.0.0' })])).toContain('DEP005');
  });

  it('DEP005 passes when engines.node is set', () => {
    const ids = idsFor([pkg({ next: '^14.0.0' }, { engines: { node: '>=20' } }), f('package-lock.json', '{}')]);
    expect(ids).not.toContain('DEP005');
  });
});

describe('ci rules', () => {
  it('CI001 flags missing CI config', () => {
    expect(idsFor([f('package.json', '{"name":"x"}')])).toContain('CI001');
  });

  it('CI002 flags a placeholder test script', () => {
    const ids = idsFor([f('package.json', JSON.stringify({ scripts: { test: 'echo "no test specified" && exit 1' } }))]);
    expect(ids).toContain('CI002');
  });

  it('CI001 passes when a workflow exists', () => {
    const ids = idsFor([
      f('package.json', '{"name":"x"}'),
      f('.github/workflows/ci.yml', 'jobs:\n  build:\n    steps:\n      - run: npm test'),
    ]);
    expect(ids).not.toContain('CI001');
  });
});

describe('docker rules', () => {
  it('DOC001 flags an unpinned base image', () => {
    expect(idsFor([f('Dockerfile', 'FROM node:latest\nUSER node')])).toContain('DOC001');
  });

  it('DOC002 flags a missing USER instruction', () => {
    expect(idsFor([f('Dockerfile', 'FROM node:20\nCMD ["node"]')])).toContain('DOC002');
  });

  it('DOC003 flags COPY . . with no .dockerignore', () => {
    expect(idsFor([f('Dockerfile', 'FROM node:20\nUSER node\nCOPY . .')])).toContain('DOC003');
  });

  it('DOC003 does not fire when .dockerignore covers env and node_modules', () => {
    const ids = idsFor([
      f('Dockerfile', 'FROM node:20-alpine\nUSER node\nCOPY . .'),
      f('.dockerignore', 'node_modules\n.env\n.env.*'),
    ]);
    expect(ids).not.toContain('DOC003');
  });
});

describe('prisma rules', () => {
  it('PRI001 flags a schema with no migrations', () => {
    expect(idsFor([f('prisma/schema.prisma', 'datasource db { provider = "postgresql" }')])).toContain('PRI001');
  });

  it('PRI002 flags db push in a build script', () => {
    const ids = idsFor([
      f('package.json', JSON.stringify({ scripts: { build: 'prisma db push && next build' } })),
    ]);
    expect(ids).toContain('PRI002');
  });

  it('PRI003 flags a sqlite datasource', () => {
    expect(idsFor([f('prisma/schema.prisma', 'datasource db {\n provider = "sqlite"\n}')])).toContain('PRI003');
  });
});

describe('nextjs rules', () => {
  it('NXT001 flags ignoreBuildErrors', () => {
    expect(idsFor([f('next.config.js', 'module.exports = { typescript: { ignoreBuildErrors: true } }')])).toContain(
      'NXT001'
    );
  });

  it('NXT002 flags a secret exposed via NEXT_PUBLIC_', () => {
    expect(idsFor([f('app.ts', 'const k = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY')])).toContain('NXT002');
  });
});

describe('configuration rules', () => {
  it('CFG001 flags a missing .gitignore', () => {
    expect(idsFor([f('package.json', '{"name":"x"}')])).toContain('CFG001');
  });

  it('CFG003 flags committed node_modules', () => {
    expect(idsFor([f('node_modules/x/index.js', 'x'), f('package.json', '{}')])).toContain('CFG003');
  });

  it('CFG003 fires from the loader flag even when node_modules was dropped', () => {
    const snap: ProjectSnapshot = {
      name: 'x',
      files: [f('package.json', '{}')],
      meta: { committedNodeModules: true },
    };
    expect(runRules(snap).map((finding) => finding.ruleId)).toContain('CFG003');
  });

  it('CFG005 flags a wildcard CORS header', () => {
    expect(idsFor([f('api.ts', "res.setHeader('Access-Control-Allow-Origin', '*')")])).toContain('CFG005');
  });
});

describe('robustness', () => {
  it('never throws on empty projects', () => {
    expect(() => runRules(project([]))).not.toThrow();
  });

  it('handles malformed package.json without crashing', () => {
    expect(() => runRules(project([f('package.json', '{not json')]))).not.toThrow();
  });

  it('ruleById resolves known ids', () => {
    expect(ruleById('SEC001')?.category).toBe('secrets');
    expect(ruleById('NOPE')).toBeUndefined();
  });
});
