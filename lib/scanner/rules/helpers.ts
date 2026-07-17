import type { ProjectSnapshot, ScannedFile } from '../types';

/** Maximum characters of a file fed to regex-based rules (bounds CPU time). */
export const MAX_SCAN_CHARS = 400_000;

export function scannableText(file: ScannedFile): string {
  if (file.binary) return '';
  return file.content.length > MAX_SCAN_CHARS ? file.content.slice(0, MAX_SCAN_CHARS) : file.content;
}

export function baseName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

export function isRootFile(path: string): boolean {
  return !path.includes('/');
}

export function findRootFile(project: ProjectSnapshot, ...names: string[]): ScannedFile | undefined {
  const lowered = names.map((n) => n.toLowerCase());
  return project.files.find((f) => isRootFile(f.path) && lowered.includes(f.path.toLowerCase()));
}

export function filesNamed(project: ProjectSnapshot, name: string): ScannedFile[] {
  const lowered = name.toLowerCase();
  return project.files.filter((f) => baseName(f.path).toLowerCase() === lowered);
}

export function textFiles(project: ProjectSnapshot): ScannedFile[] {
  return project.files.filter((f) => !f.binary && f.content.length > 0);
}

export function parseJsonSafe<T = unknown>(content: string): T | undefined {
  try {
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

export interface PackageJsonShape {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
}

export function getRootPackageJson(
  project: ProjectSnapshot
): { file: ScannedFile; pkg: PackageJsonShape } | undefined {
  const file = findRootFile(project, 'package.json');
  if (!file || file.binary) return undefined;
  const pkg = parseJsonSafe<PackageJsonShape>(file.content);
  if (!pkg || typeof pkg !== 'object') return undefined;
  return { file, pkg };
}

/** 1-based line number of a character offset within content. */
export function lineAt(content: string, index: number): number {
  let line = 1;
  const bound = Math.min(index, content.length);
  for (let i = 0; i < bound; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** Iterate non-empty lines with 1-based numbers. */
export function eachLine(content: string, cb: (line: string, lineNo: number) => void): void {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    cb(lines[i], i + 1);
  }
}

const CODE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts',
  '.py', '.rb', '.go', '.java', '.php', '.cs',
  '.json', '.yml', '.yaml', '.toml', '.env', '.sh', '.ps1', '.tf',
];

export function isCodeLike(path: string): boolean {
  const lower = path.toLowerCase();
  return CODE_EXTENSIONS.some((ext) => lower.endsWith(ext)) || baseName(lower).startsWith('.env');
}

const LOCKFILE_NAMES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock',
]);

export function isLockfile(path: string): boolean {
  return LOCKFILE_NAMES.has(baseName(path).toLowerCase());
}

export function isInNodeModules(path: string): boolean {
  return path.split('/').includes('node_modules');
}

/** Files worth scanning for embedded secrets / config mistakes. */
export function secretScanTargets(project: ProjectSnapshot): ScannedFile[] {
  return textFiles(project).filter(
    (f) => isCodeLike(f.path) && !isLockfile(f.path) && !isInNodeModules(f.path)
  );
}
