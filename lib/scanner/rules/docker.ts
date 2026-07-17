import type { Rule, RuleMatch } from '../types';
import type { ProjectSnapshot, ScannedFile } from '../types';
import { baseName, eachLine, findRootFile, isInNodeModules } from './helpers';

function dockerfiles(project: ProjectSnapshot): ScannedFile[] {
  return project.files.filter((f) => {
    if (f.binary || isInNodeModules(f.path)) return false;
    const name = baseName(f.path).toLowerCase();
    return name === 'dockerfile' || name.startsWith('dockerfile.');
  });
}

interface FromInfo {
  image: string;
  tag: string | null;
  alias: string | null;
  lineNo: number;
  raw: string;
}

function parseFromLines(content: string): FromInfo[] {
  const froms: FromInfo[] = [];
  eachLine(content, (line, lineNo) => {
    const m = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (!m) return;
    const ref = m[1];
    const alias = m[2] ?? null;
    const colon = ref.lastIndexOf(':');
    const hasDigest = ref.includes('@');
    const tag = hasDigest ? 'digest' : colon > 0 ? ref.slice(colon + 1) : null;
    const image = colon > 0 && !hasDigest ? ref.slice(0, colon) : ref.split('@')[0];
    froms.push({ image, tag, alias, lineNo, raw: line.trim() });
  });
  return froms;
}

/** DOC001: base image is unpinned (:latest or no tag). */
export const dockerMutableBase: Rule = {
  id: 'DOC001',
  title: 'Docker base image is not pinned',
  severity: 'medium',
  category: 'docker',
  description: 'FROM image:latest (or no tag) makes image builds unreproducible.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of dockerfiles(project)) {
      const froms = parseFromLines(file.content);
      const aliases = new Set(froms.map((f) => f.alias?.toLowerCase()).filter(Boolean));
      for (const from of froms) {
        if (aliases.has(from.image.toLowerCase())) continue; // multi-stage reference
        if (from.image.toLowerCase() === 'scratch') continue;
        if (from.image.startsWith('$')) continue; // ARG-driven, can't evaluate statically
        if (from.tag === null || from.tag.toLowerCase() === 'latest') {
          matches.push({
            file: file.path,
            line: from.lineNo,
            evidence: from.raw,
            remediation: `Pin the base image to a specific version tag (e.g. ${from.image}:20-alpine) or a digest.`,
          });
        }
      }
    }
    return matches;
  },
};

/** DOC002: container runs as root. */
export const dockerRootUser: Rule = {
  id: 'DOC002',
  title: 'Container runs as root (no USER instruction)',
  severity: 'medium',
  category: 'docker',
  description: 'Running as root inside the container widens the blast radius of any compromise.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of dockerfiles(project)) {
      const hasUser = /^\s*USER\s+\S+/im.test(file.content);
      if (!hasUser) {
        matches.push({
          file: file.path,
          evidence: `${file.path} contains no USER instruction; the container runs as root.`,
          remediation:
            'Create an unprivileged user in the image and switch to it (e.g. USER node for official Node images) before CMD/ENTRYPOINT.',
        });
      }
    }
    return matches;
  },
};

/** DOC003: image build can swallow secrets or node_modules. */
export const dockerCopiesSecrets: Rule = {
  id: 'DOC003',
  title: 'Docker build may copy secrets into the image',
  severity: 'high',
  category: 'docker',
  description: 'COPY . . without a protective .dockerignore bakes .env files and local artifacts into image layers.',
  check(project) {
    const matches: RuleMatch[] = [];
    const dockerignore = findRootFile(project, '.dockerignore');
    for (const file of dockerfiles(project)) {
      eachLine(file.content, (line, lineNo) => {
        if (/^\s*COPY\s+\.env(\s|$)/i.test(line)) {
          matches.push({
            file: file.path,
            line: lineNo,
            severity: 'critical',
            evidence: line.trim(),
            remediation:
              'Never COPY .env into an image. Inject configuration at runtime via environment variables or a secret manager.',
          });
          return;
        }
        const copyAll = /^\s*(COPY|ADD)\s+\.{1,2}\/?\s+/i.test(line);
        if (!copyAll) return;
        if (!dockerignore) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: `${line.trim()} — and the project has no .dockerignore.`,
            remediation:
              'Add a .dockerignore excluding .env*, node_modules, .git and build artifacts so they never enter the image context.',
          });
        } else {
          const ignore = dockerignore.content;
          const coversEnv = /(^|\n)\s*\.?\*?\.env/.test(ignore) || /(^|\n)\s*\*\.env\*?/.test(ignore);
          const coversModules = /(^|\n)\s*(\/)?node_modules/.test(ignore);
          if (!coversEnv || !coversModules) {
            const missing = [!coversEnv ? '.env files' : null, !coversModules ? 'node_modules' : null]
              .filter(Boolean)
              .join(' and ');
            matches.push({
              file: file.path,
              line: lineNo,
              evidence: `${line.trim()} — .dockerignore exists but does not exclude ${missing}.`,
              remediation: `Add ${missing} to .dockerignore to keep them out of image layers.`,
            });
          }
        }
      });
    }
    return matches;
  },
};

/** DOC004: npm install instead of npm ci in image builds. */
export const dockerNpmInstall: Rule = {
  id: 'DOC004',
  title: 'Dockerfile installs dependencies without npm ci',
  severity: 'low',
  category: 'docker',
  description: 'npm ci is faster, respects the lockfile exactly and fails on drift; npm install may mutate it.',
  check(project) {
    const matches: RuleMatch[] = [];
    for (const file of dockerfiles(project)) {
      eachLine(file.content, (line, lineNo) => {
        if (/^\s*RUN\b/i.test(line) && /\bnpm\s+(install|i)\b/.test(line) && !/npm\s+ci\b/.test(line)) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim(),
            remediation: 'Use `npm ci` (with a committed lockfile) in Docker builds for reproducible installs.',
          });
        }
        if (/^\s*RUN\b/i.test(line) && /\byarn\s+install\b/.test(line) && !/--frozen-lockfile|--immutable/.test(line)) {
          matches.push({
            file: file.path,
            line: lineNo,
            evidence: line.trim(),
            remediation: 'Use `yarn install --frozen-lockfile` (or `--immutable` on Yarn 2+) in Docker builds.',
          });
        }
      });
    }
    return matches;
  },
};

export const dockerRules: Rule[] = [dockerMutableBase, dockerRootUser, dockerCopiesSecrets, dockerNpmInstall];

export { dockerfiles, parseFromLines };
