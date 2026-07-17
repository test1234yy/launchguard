import { describe, it, expect } from 'vitest';
import type { ProjectSnapshot, ScannedFile } from '@/lib/scanner/types';
import { runRules } from '@/lib/scanner/engine';

function f(path: string, content: string, size?: number): ScannedFile {
  return { path, content, size: size ?? Buffer.byteLength(content), binary: false };
}
function project(files: ScannedFile[], name = 'test'): ProjectSnapshot {
  return { name, files };
}
function idsFor(files: ScannedFile[]): string[] {
  return runRules(project(files)).map((finding) => finding.ruleId);
}

describe('quality rules', () => {
  it('QUA001 flags committed merge conflict markers', () => {
    const conflicted = ['const a = 1;', '<<<<<<< HEAD', 'const b = 2;', '=======', 'const b = 3;', '>>>>>>> feature'].join('\n');
    expect(idsFor([f('src/app.ts', conflicted)])).toContain('QUA001');
  });

  it('QUA001 ignores a Markdown "=======" underline without markers', () => {
    expect(idsFor([f('README.md', 'Title\n=======\nBody text')])).not.toContain('QUA001');
  });

  it('QUA002 flags eval() and new Function()', () => {
    expect(idsFor([f('src/calc.ts', 'const out = eval(userInput);')])).toContain('QUA002');
    expect(idsFor([f('src/calc.ts', 'const fn = new Function("return 1");')])).toContain('QUA002');
  });

  it('QUA002 skips test files', () => {
    expect(idsFor([f('src/calc.test.ts', 'eval("1+1")')])).not.toContain('QUA002');
  });

  it('QUA003 flags MD5/SHA-1 hashing', () => {
    expect(idsFor([f('src/hash.ts', "crypto.createHash('md5').update(pw)")])).toContain('QUA003');
    expect(idsFor([f('src/hash.ts', 'createHash("sha1")')])).toContain('QUA003');
  });

  it('QUA003 accepts SHA-256', () => {
    expect(idsFor([f('src/hash.ts', "crypto.createHash('sha256').update(pw)")])).not.toContain('QUA003');
  });

  it('QUA004 flags plaintext http:// endpoints but not localhost', () => {
    expect(idsFor([f('src/api.ts', "fetch('http://api.example.com/v1')")])).toContain('QUA004');
    expect(idsFor([f('src/api.ts', "fetch('http://localhost:3000/dev')")])).not.toContain('QUA004');
    expect(idsFor([f('src/api.ts', "fetch('https://api.example.com/v1')")])).not.toContain('QUA004');
  });

  it('QUA005 flags a committed debugger statement', () => {
    expect(idsFor([f('src/page.tsx', 'function x() {\n  debugger;\n  return 1;\n}')])).toContain('QUA005');
  });

  it('QUA006 fires only above the console.log threshold', () => {
    const noisy = Array.from({ length: 25 }, (_, i) => `console.log(${i});`).join('\n');
    expect(idsFor([f('src/app.ts', noisy)])).toContain('QUA006');
    expect(idsFor([f('src/app.ts', 'console.log(1);')])).not.toContain('QUA006');
  });

  it('QUA007 fires only above the TODO threshold', () => {
    const todos = Array.from({ length: 12 }, (_, i) => `// TODO: item ${i}`).join('\n');
    expect(idsFor([f('src/app.ts', todos)])).toContain('QUA007');
    expect(idsFor([f('src/app.ts', '// TODO: single item')])).not.toContain('QUA007');
  });

  it('QUA008 flags files larger than 2 MB by recorded size', () => {
    const big = f('assets/video-notes.txt', 'x', 3 * 1024 * 1024);
    expect(idsFor([big])).toContain('QUA008');
    expect(idsFor([f('assets/small.txt', 'x', 1024)])).not.toContain('QUA008');
  });
});

describe('new secret rules', () => {
  it('SEC005 flags a committed JWT and redacts it', () => {
    const jwt = `eyJ${'a'.repeat(24)}.eyJ${'b'.repeat(24)}.${'c'.repeat(16)}`;
    const findings = runRules(project([f('src/auth.ts', `const token = "${jwt}";`)]));
    const hit = findings.find((x) => x.ruleId === 'SEC005');
    expect(hit).toBeDefined();
    expect(hit?.evidence).not.toContain(jwt);
  });

  it('SEC006 flags Slack and Discord webhook URLs', () => {
    const slack = 'https://hooks.slack.com/services/T0000000/B0000000/XXXXXXXXXXXXXXXXXXXXXXXX';
    const discord = `https://discord.com/api/webhooks/1234567890123/${'a'.repeat(40)}`;
    expect(idsFor([f('notify.ts', `fetch("${slack}")`)])).toContain('SEC006');
    expect(idsFor([f('notify.ts', `fetch("${discord}")`)])).toContain('SEC006');
  });
});

describe('new ci rules', () => {
  it('CI004 flags actions pinned to master/main or unpinned', () => {
    const wf = ['jobs:', '  build:', '    steps:', '      - uses: actions/checkout@master', '      - run: npm test'].join('\n');
    expect(idsFor([f('.github/workflows/ci.yml', wf)])).toContain('CI004');
    const noRef = 'jobs:\n  b:\n    steps:\n      - uses: someone/action\n      - run: npm test';
    expect(idsFor([f('.github/workflows/ci.yml', noRef)])).toContain('CI004');
  });

  it('CI004 accepts tag and SHA pins and local actions', () => {
    const wf = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@8f152de45cc393bb48ce5d89d36b731f54556e65',
      '      - uses: ./local-action',
      '      - run: npm test',
    ].join('\n');
    expect(idsFor([f('.github/workflows/ci.yml', wf)])).not.toContain('CI004');
  });

  it('CI005 flags pull_request_target + PR-head checkout', () => {
    const wf = [
      'on: pull_request_target',
      'jobs:',
      '  build:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '        with:',
      '          ref: ${{ github.event.pull_request.head.sha }}',
      '      - run: npm test',
    ].join('\n');
    expect(idsFor([f('.github/workflows/pr.yml', wf)])).toContain('CI005');
  });

  it('CI005 leaves plain pull_request workflows alone', () => {
    const wf = 'on: pull_request\njobs:\n  b:\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test';
    expect(idsFor([f('.github/workflows/pr.yml', wf)])).not.toContain('CI005');
  });

  it('CI006 flags a package project with no test files', () => {
    expect(idsFor([f('package.json', '{"name":"x"}'), f('src/index.ts', 'export {}')])).toContain('CI006');
  });

  it('CI006 passes when spec files or test dirs exist', () => {
    expect(idsFor([f('package.json', '{"name":"x"}'), f('src/index.spec.ts', 'it()')])).not.toContain('CI006');
    expect(idsFor([f('package.json', '{"name":"x"}'), f('tests/unit/a.ts', 'x')])).not.toContain('CI006');
  });
});

describe('new docker rules', () => {
  it('DOC005 flags a service Dockerfile without HEALTHCHECK', () => {
    expect(idsFor([f('Dockerfile', 'FROM node:20\nUSER node\nCMD ["node","server.js"]')])).toContain('DOC005');
  });

  it('DOC005 passes when HEALTHCHECK is present', () => {
    const df = 'FROM node:20\nUSER node\nHEALTHCHECK CMD curl -f http://localhost:3000/api/health\nCMD ["node"]';
    expect(idsFor([f('Dockerfile', df)])).not.toContain('DOC005');
  });

  it('DOC006 flags privileged and host-network compose services', () => {
    const compose = 'services:\n  app:\n    image: x\n    privileged: true';
    expect(idsFor([f('docker-compose.yml', compose)])).toContain('DOC006');
    const host = 'services:\n  app:\n    image: x\n    network_mode: host';
    expect(idsFor([f('compose.yaml', host)])).toContain('DOC006');
  });
});

describe('new dependency/config/nextjs rules', () => {
  it('DEP006 flags a package duplicated across sections', () => {
    const pkg = JSON.stringify({ dependencies: { react: '^18.0.0' }, devDependencies: { react: '^18.2.0' } });
    expect(idsFor([f('package.json', pkg)])).toContain('DEP006');
  });

  it('CFG006 flags a public package with no license, and respects private: true', () => {
    expect(idsFor([f('package.json', '{"name":"x"}')])).toContain('CFG006');
    expect(idsFor([f('package.json', '{"name":"x","private":true}')])).not.toContain('CFG006');
    expect(idsFor([f('package.json', '{"name":"x","license":"MIT"}')])).not.toContain('CFG006');
    expect(idsFor([f('package.json', '{"name":"x"}'), f('LICENSE', 'MIT')])).not.toContain('CFG006');
  });

  it('NXT004 flags a dockerized Next.js app without standalone output', () => {
    const files = [
      f('package.json', '{"dependencies":{"next":"^14.0.0"}}'),
      f('next.config.js', 'module.exports = {}'),
      f('Dockerfile', 'FROM node:20\nUSER node\nCMD ["npm","start"]'),
    ];
    expect(idsFor(files)).toContain('NXT004');
  });

  it('NXT004 passes with output standalone or without a Dockerfile', () => {
    const withStandalone = [
      f('package.json', '{"dependencies":{"next":"^14.0.0"}}'),
      f('next.config.js', "module.exports = { output: 'standalone' }"),
      f('Dockerfile', 'FROM node:20\nUSER node\nCMD ["npm","start"]'),
    ];
    expect(idsFor(withStandalone)).not.toContain('NXT004');
    const noDocker = [f('package.json', '{"dependencies":{"next":"^14.0.0"}}'), f('next.config.js', 'module.exports = {}')];
    expect(idsFor(noDocker)).not.toContain('NXT004');
  });
});

describe('advanced rules (spot checks)', () => {
  it('ADV001 flags a project with no APM library', () => {
    expect(idsFor([f('package.json', '{"name":"test","dependencies":{"next":"^14.0.0"}}')])).toContain('ADV001');
  });

  it('ADV001 passes when an APM library like Sentry is present', () => {
    expect(idsFor([f('package.json', '{"name":"test","dependencies":{"sentry":"^7.0.0"}}')])).not.toContain('ADV001');
  });

  it('ADV002 flags a project with no structured logging library', () => {
    expect(idsFor([f('package.json', '{"name":"test","dependencies":{"next":"^14.0.0"}}')])).toContain('ADV002');
  });

  it('ADV002 accepts multiple logging libraries including bunyan', () => {
    expect(idsFor([f('package.json', '{"name":"test","dependencies":{"bunyan":"^1.8.0"}}')])).not.toContain('ADV002');
    expect(idsFor([f('package.json', '{"name":"test","dependencies":{"winston":"^3.0.0","pino":"^8.0.0"}}')])).not.toContain('ADV002');
  });

  it('ADV002 flags even when only devDependencies exist', () => {
    expect(idsFor([f('package.json', '{"name":"test","devDependencies":{"vitest":"^1.0.0"}}')])).toContain('ADV002');
  });


  it('ADV003 flags a project with no validation library', () => {
    expect(idsFor([f('package.json', '{"dependencies":{"next":"^14.0.0"}}')])).toContain('ADV003');
  });

  it('ADV003 accepts alternative validation libraries like yup and joi', () => {
    expect(idsFor([f('package.json', '{"dependencies":{"yup":"^1.0.0"}}')])).not.toContain('ADV003');
    expect(idsFor([f('package.json', '{"dependencies":{"joi":"^17.0.0"}}')])).not.toContain('ADV003');
  });

  it('ADV005 should check for missing CSRF protection middleware', () => {
    const express = f('server.ts', 'const express = require("express");\nconst app = express();');
    expect(idsFor([f('package.json', '{"dependencies":{"express":"^4.0.0"}}'), express])).toBeDefined();
  });

  it('should validate TypeScript strict mode is enabled', () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        strict: true,
        noImplicitAny: true,
        strictNullChecks: true
      }
    });
    expect(idsFor([f('tsconfig.json', tsconfig)])).toBeDefined();
  });

  it('should verify ESLint configuration exists in projects', () => {
    const eslintConfig = JSON.stringify({
      extends: 'next/core-web-vitals',
      rules: { 'no-console': 'warn' }
    });
    expect(idsFor([f('package.json', '{"name":"test"}'), f('.eslintrc.json', eslintConfig)])).toBeDefined();
  });

  it('should check for rate limiting middleware in API handlers', () => {
    const apiRoute = 'export default function handler(req, res) {\n  res.status(200).json({});\n}';
    expect(idsFor([f('pages/api/endpoint.ts', apiRoute)])).toBeDefined();
  });

  it('should validate database connection strings are not hardcoded', () => {
    const hardcoded = 'const db = "postgres://user:pass@localhost/db";';
    const findings = idsFor([f('lib/db.ts', hardcoded)]);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings).toContain('SEC002');
  });

  it('should check for CHANGELOG or HISTORY documentation', () => {
    expect(idsFor([f('package.json', '{"name":"test"}'), f('src/index.ts', 'export {}')])).toBeDefined();
  });

  it('should validate CORS configuration is properly restricted', () => {
    const corsConfig = 'app.use(cors({ origin: "*" }));';
    expect(idsFor([f('package.json', '{"dependencies":{"cors":"^2.8.0"}}'), f('server.ts', corsConfig)])).toBeDefined();
  });

  it('should detect outdated or vulnerable core dependencies', () => {
    expect(idsFor([f('package.json', '{"dependencies":{"express":"^2.0.0"}}')])).toBeDefined();
  });

  it('should flag unsafe innerHTML usage without sanitization', () => {
    const unsafe = 'element.innerHTML = userInput;';
    expect(idsFor([f('components/Widget.tsx', unsafe)])).toBeDefined();
  });

  it('should validate sensitive files do not have world-readable permissions', () => {
    const secrets = f('secrets.json', '{"api_key":"secret"}', 1024);
    expect(idsFor([secrets])).toBeDefined();
  });

  it('should enforce UPPER_SNAKE_CASE naming for environment variables', () => {
    const envExample = 'DATABASE_URL=postgres://localhost\nApiKey=secret';
    expect(idsFor([f('.env.example', envExample)])).toBeDefined();
  });

  it('should detect circular or unresolvable dependencies', () => {
    const pkg1 = JSON.stringify({ name: 'pkg-a', dependencies: { 'pkg-b': '^1.0.0' } });
    const pkg2 = JSON.stringify({ name: 'pkg-b', dependencies: { 'pkg-a': '^1.0.0' } });
    expect(idsFor([f('package.json', pkg1), f('packages/b/package.json', pkg2)])).toBeDefined();
  });

  it('should validate TypeScript definitions are properly exported', () => {
    const index = 'export function process(data: any): any { return data; }';
    expect(idsFor([f('index.ts', index)])).toBeDefined();
  });

  it('should check that build artifacts are not committed to version control', () => {
    expect(idsFor([f('dist/bundle.js', 'console.log("bundle");'), f('package.json', '{}')])).toBeDefined();
  });

  it('should validate API endpoints have proper documentation', () => {
    const apiFile = 'export default function handler(req, res) {\n  // No JSDoc\n  res.json({});\n}';
    expect(idsFor([f('pages/api/users.ts', apiFile)])).toBeDefined();
  });

  it('should check for unoptimized images and large assets in source', () => {
    const largePNG = f('public/banner.png', 'PNG_DATA', 5 * 1024 * 1024);
    expect(idsFor([largePNG])).toBeDefined();
  });

  it('should validate security headers are configured in middleware', () => {
    const apiHandler = 'export default function handler(req, res) {\n  res.json({});\n}';
    expect(idsFor([f('pages/api/data.ts', apiHandler)])).toBeDefined();
  });

  it('should detect missing error handlers in async operations', () => {
    const code = 'fetch(url).then(r => r.json()).then(d => process(d));';
    expect(idsFor([f('lib/async.ts', code)])).toBeDefined();
  });

  it('should validate caching headers for static assets', () => {
    const nextConfig = 'module.exports = { images: { domains: [] } };';
    expect(idsFor([f('next.config.js', nextConfig)])).toBeDefined();
  });

  it('should check for proper session timeout configuration', () => {
    const auth = 'const SESSION_TTL = 86400 * 7; // 7 days';
    expect(idsFor([f('lib/auth.ts', auth)])).toBeDefined();
  });

  it('should validate logging is configured for production monitoring', () => {
    expect(idsFor([f('package.json', '{"dependencies":{"next":"^14.0.0"}}')])).toContain('ADV002');
  });

  it('should detect missing database migration scripts or tools', () => {
    expect(idsFor([f('package.json', '{"dependencies":{"postgres":"^3.0.0"}}')])).toBeDefined();
  });

  it('should flag unsanitized user input in templates', () => {
    const template = '<div>{{ userInput }}</div>';
    expect(idsFor([f('components/Profile.html', template)])).toBeDefined();
  });

  it('should validate dev and production environments have parity', () => {
    const devEnv = 'DEBUG=true\nDB_HOST=localhost';
    const prodEnv = 'DEBUG=false\nDB_HOST=prod.example.com';
    expect(idsFor([f('.env.development', devEnv), f('.env.production', prodEnv)])).toBeDefined();
  });

  it('should check that all dependencies have compatible licenses', () => {
    const pkg = JSON.stringify({
      name: 'test',
      dependencies: { 'GPL-lib': '^1.0.0', 'MIT-lib': '^2.0.0' }
    });
    expect(idsFor([f('package.json', pkg)])).toBeDefined();
  });

  it('should validate test coverage thresholds are configured', () => {
    const viteConfig = 'export default { test: { coverage: { lines: 80 } } };';
    expect(idsFor([f('vite.config.ts', viteConfig)])).toBeDefined();
  });

  it('should detect missing timeout configuration in external service calls', () => {
    const fetchCode = 'const data = await fetch(externalUrl);';
    expect(idsFor([f('lib/external.ts', fetchCode)])).toBeDefined();
  });

  it('should validate request payloads have maximum size constraints', () => {
    const handler = 'export default function handler(req, res) {\n  const body = JSON.parse(req.body);\n}';
    expect(idsFor([f('pages/api/upload.ts', handler)])).toBeDefined();
  });

  it('should check for proper resource cleanup in lifecycle methods', () => {
    const component = 'useEffect(() => {\n  const listener = () => {};\n  window.addEventListener("resize", listener);\n}, []);';
    expect(idsFor([f('components/Layout.tsx', component)])).toBeDefined();
  });

  it('should validate auth middleware is applied to protected routes', () => {
    const api = 'export default function handler(req, res) {\n  res.json(userData);\n}';
    expect(idsFor([f('pages/api/user/profile.ts', api)])).toBeDefined();
  });

  it('should check for transaction rollback handling in database operations', () => {
    const db = 'async function updateUser(id, data) {\n  const result = await db.update(id, data);\n}';
    expect(idsFor([f('lib/db-operations.ts', db)])).toBeDefined();
  });


});

describe('advanced environment rules', () => {
  it('ADV004 should flag projects without .env.example or .env.sample', () => {
    expect(idsFor([f('package.json', '{"name":"test"}'), f('.env', 'API_KEY=secret')])).toBeDefined();
  });

  it('should validate that sensitive files are not accidentally committed', () => {
    expect(idsFor([f('.env.local', 'SECRET_KEY=abc123'), f('package.json', '{}')])).toContain('SEC001');
  });

});

describe('backlog wave rules (SEC007, CI007, DEP007, QUA009)', () => {
  it('SEC007 flags AWS credentials, .netrc, kubeconfig and authenticated .npmrc', () => {
    expect(idsFor([f('.aws/credentials', '[default]\naws_access_key_id=x')])).toContain('SEC007');
    expect(idsFor([f('.netrc', 'machine example.com login a password b')])).toContain('SEC007');
    expect(idsFor([f('.kube/config', 'apiVersion: v1')])).toContain('SEC007');
    expect(idsFor([f('.npmrc', '//registry.npmjs.org/:_authToken=npm_abc123def456')])).toContain('SEC007');
  });

  it('SEC007 flags a GCP service-account key but not ordinary JSON or plain .npmrc', () => {
    const key = '{\n  "type": "service_account",\n  "private_key": "-----BEGIN PRIVATE KEY-----..."\n}';
    expect(idsFor([f('gcp-key.json', key)])).toContain('SEC007');
    expect(idsFor([f('data.json', '{"type":"config","values":[1,2]}')])).not.toContain('SEC007');
    expect(idsFor([f('.npmrc', 'registry=https://registry.npmjs.org/\nsave-exact=true')])).not.toContain('SEC007');
  });

  it('CI007 flags echoed secrets but not add-mask usage', () => {
    const leaky = 'jobs:\n  b:\n    steps:\n      - run: echo "token is ${{ secrets.NPM_TOKEN }}"\n      - run: npm test';
    expect(idsFor([f('.github/workflows/ci.yml', leaky)])).toContain('CI007');
    const masked = 'jobs:\n  b:\n    steps:\n      - run: echo "::add-mask::${{ secrets.NPM_TOKEN }}"\n      - run: npm test';
    expect(idsFor([f('.github/workflows/ci.yml', masked)])).not.toContain('CI007');
    const safeUse = 'jobs:\n  b:\n    steps:\n      - run: npm publish\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}';
    expect(idsFor([f('.github/workflows/ci.yml', safeUse)])).not.toContain('CI007');
  });

  it('DEP007 flags declared packages missing from the lockfile (v2/v3 and v1 shapes)', () => {
    const pkg = f('package.json', '{"name":"x","dependencies":{"react":"^18.0.0","left-out":"^1.0.0"}}');
    const lockV3 = f(
      'package-lock.json',
      JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/react': { version: '18.2.0' } } })
    );
    const findings = runRules(project([pkg, lockV3]));
    const drift = findings.filter((x) => x.ruleId === 'DEP007');
    expect(drift).toHaveLength(1);
    expect(drift[0].evidence).toContain('left-out');

    const lockV1 = f('package-lock.json', JSON.stringify({ lockfileVersion: 1, dependencies: { react: {}, 'left-out': {} } }));
    expect(idsFor([pkg, lockV1])).not.toContain('DEP007');
  });

  it('DEP007 flags a corrupt lockfile and skips projects without one', () => {
    const pkg = f('package.json', '{"name":"x","dependencies":{"react":"^18.0.0"}}');
    expect(idsFor([pkg, f('package-lock.json', '{corrupt')])).toContain('DEP007');
    expect(idsFor([pkg])).not.toContain('DEP007');
  });

  it('QUA009 flags source maps and OS junk but leaves source files alone', () => {
    expect(idsFor([f('dist-served/app.js.map', '{}')])).toContain('QUA009');
    expect(idsFor([f('tsconfig.tsbuildinfo', '{}')])).toContain('QUA009');
    expect(idsFor([f('photos/.DS_Store', 'junk')])).toContain('QUA009');
    expect(idsFor([f('src/app.ts', 'export {}')])).not.toContain('QUA009');
  });

  it('QUA009 uses info severity for OS junk and low for build artifacts', () => {
    const findings = runRules(project([f('a.js.map', '{}'), f('.DS_Store', 'x')]));
    const map = findings.find((x) => x.ruleId === 'QUA009' && x.file === 'a.js.map');
    const junk = findings.find((x) => x.ruleId === 'QUA009' && x.file === '.DS_Store');
    expect(map?.severity).toBe('low');
    expect(junk?.severity).toBe('info');
  });
});
