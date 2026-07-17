import type { ProjectSnapshot, ScannedFile } from '../scanner/types';

/**
 * Shared limits and helpers for turning raw bytes into a ProjectSnapshot.
 *
 * SAFETY: every loader treats input as untrusted data. We never execute,
 * import, install or build anything. Limits below bound memory and CPU so a
 * hostile archive or repository cannot exhaust the server.
 */

export const LIMITS = {
  /** Maximum total uncompressed bytes we will hold in memory. */
  maxTotalBytes: 40 * 1024 * 1024, // 40 MB
  /** Maximum bytes we will decode as text for a single file. */
  maxFileBytes: 2 * 1024 * 1024, // 2 MB
  /** Maximum number of files we will scan. */
  maxFiles: 4000,
  /** Maximum compressed upload size accepted by the ZIP route. */
  maxUploadBytes: 15 * 1024 * 1024, // 15 MB
};

/** Directory segments that never carry deployment signal and only add noise. */
const IGNORED_SEGMENTS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'coverage',
  '.vercel',
  '.yarn',
  'out',
  'vendor',
  '__pycache__',
]);

/** Binary-ish extensions we record as metadata but never decode as text. */
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'avif',
  'pdf', 'zip', 'gz', 'tar', 'rar', '7z', 'bz2', 'xz',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'mov', 'avi', 'webm', 'wav', 'flac', 'ogg',
  'wasm', 'node', 'so', 'dll', 'dylib', 'exe', 'bin', 'class', 'jar',
  'lockb', // bun binary lockfile
]);

export function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

export function isIgnoredPath(path: string): boolean {
  return path.split('/').some((seg) => IGNORED_SEGMENTS.has(seg));
}

export function looksBinaryByExt(path: string): boolean {
  return BINARY_EXTENSIONS.has(extensionOf(path));
}

/** Heuristic: a NUL byte in the first chunk means binary content. */
export function looksBinaryByContent(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

const decoder = new TextDecoder('utf-8', { fatal: false });

export function decodeText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/**
 * Normalize a path from an archive or repo listing to a safe POSIX relative
 * path, or return null if it escapes the root (path traversal) or is absolute.
 */
export function normalizeSafePath(rawPath: string): string | null {
  const unified = rawPath.replace(/\\/g, '/');
  if (unified.includes('\0')) return null;
  // Reject absolute paths and Windows drive letters.
  if (unified.startsWith('/') || /^[a-zA-Z]:\//.test(unified)) return null;
  const segments: string[] = [];
  for (const segment of unified.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') return null; // traversal attempt: reject the whole entry
    segments.push(segment);
  }
  if (segments.length === 0) return null;
  return segments.join('/');
}

export interface CollectResult {
  files: ScannedFile[];
  totalBytes: number;
  skipped: number;
  truncated: boolean;
  /** True when node_modules paths were seen in the source (and dropped). */
  committedNodeModules: boolean;
}

/**
 * Accumulates files under the configured limits. Callers feed raw entries;
 * this enforces per-file, total-size and count caps and does binary detection.
 */
export class FileCollector {
  private files: ScannedFile[] = [];
  private totalBytes = 0;
  private skipped = 0;
  private truncated = false;
  private sawNodeModules = false;

  add(rawPath: string, bytes: Uint8Array): void {
    if (this.files.length >= LIMITS.maxFiles) {
      this.truncated = true;
      return;
    }
    const safePath = normalizeSafePath(rawPath);
    if (!safePath) {
      this.skipped += 1;
      return;
    }
    if (isIgnoredPath(safePath)) {
      // Record committed dependencies before dropping them, so CFG003 can fire
      // even though we never scan the (potentially huge) node_modules tree.
      if (safePath.split('/').includes('node_modules')) this.sawNodeModules = true;
      return; // silently drop dependency/build directories
    }
    if (this.totalBytes + bytes.length > LIMITS.maxTotalBytes) {
      this.truncated = true;
      return;
    }
    const size = bytes.length;
    const binary =
      looksBinaryByExt(safePath) ||
      size > LIMITS.maxFileBytes ||
      looksBinaryByContent(bytes);
    const content = binary ? '' : decodeText(bytes.subarray(0, LIMITS.maxFileBytes));
    this.files.push({ path: safePath, content, size, binary });
    this.totalBytes += size;
  }

  result(): CollectResult {
    return {
      files: this.files,
      totalBytes: this.totalBytes,
      skipped: this.skipped,
      truncated: this.truncated,
      committedNodeModules: this.sawNodeModules,
    };
  }
}

export function toSnapshot(name: string, result: CollectResult): ProjectSnapshot {
  return {
    name,
    files: result.files,
    meta: { committedNodeModules: result.committedNodeModules },
  };
}
