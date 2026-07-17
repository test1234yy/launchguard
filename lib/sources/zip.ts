import { unzipSync } from 'fflate';
import type { ProjectSnapshot } from '../scanner/types';
import { FileCollector, LIMITS, toSnapshot } from './common';

/**
 * Safe ZIP loader.
 *
 * SAFETY:
 *  - The upload size is capped before we ever decompress (LIMITS.maxUploadBytes).
 *  - Every entry path is normalized and traversal / absolute paths are rejected
 *    (FileCollector -> normalizeSafePath), so nothing can be written or read
 *    outside the logical root. We never touch the filesystem regardless.
 *  - Total uncompressed bytes, per-file bytes and file count are all capped,
 *    which bounds zip-bomb impact. Decompression inflations are also tracked and
 *    aborted if they exceed the total cap, preventing OOM during decompression.
 *  - Archive contents are only ever pattern-matched, never executed.
 */

export interface ZipLoadResult {
  snapshot: ProjectSnapshot;
  skippedFiles: number;
  notes: string[];
}

export function loadZip(name: string, data: Uint8Array): ZipLoadResult {
  if (data.length > LIMITS.maxUploadBytes) {
    throw new ZipError(
      `Upload is ${(data.length / 1024 / 1024).toFixed(1)} MB, which exceeds the ${(
        LIMITS.maxUploadBytes /
        1024 /
        1024
      ).toFixed(0)} MB limit.`
    );
  }

  let accumulatedInflatedBytes = 0;

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter(file) {
        // SEC-2: Track cumulative inflated bytes and abort decompression if it exceeds the cap.
        // Per-entry cap is 4x LIMITS.maxFileBytes to allow some tolerance; stop the whole
        // archive if accumulated size exceeds the total-bytes limit.
        accumulatedInflatedBytes += file.originalSize;
        if (accumulatedInflatedBytes > LIMITS.maxTotalBytes) {
          throw new Error('Archive exceeds the total uncompressed size limit.');
        }
        return !file.name.endsWith('/') && file.originalSize <= LIMITS.maxFileBytes * 4;
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('exceeds the total uncompressed')) {
      throw new ZipError('Archive is too large (compression bomb detected).');
    }
    throw new ZipError(`Could not read the ZIP archive: ${msg}`);
  }

  const collector = new FileCollector();
  const entryNames = Object.keys(entries);

  // Detect and strip a single common top-level directory (e.g. GitHub "repo-main/").
  const prefix = commonTopLevelDir(entryNames);

  for (const [rawName, bytes] of Object.entries(entries)) {
    const relative = prefix && rawName.startsWith(prefix) ? rawName.slice(prefix.length) : rawName;
    collector.add(relative, bytes);
  }

  const result = collector.result();
  if (result.files.length === 0) {
    throw new ZipError('The archive contained no scannable files.');
  }

  const notes: string[] = [];
  if (result.truncated) {
    notes.push('Archive exceeded scan limits; some files were not scanned.');
  }
  return {
    snapshot: toSnapshot(name, result),
    skippedFiles: result.skipped,
    notes,
  };
}

function commonTopLevelDir(names: string[]): string | null {
  if (names.length === 0) return null;
  const first = names[0].replace(/\\/g, '/');
  const slash = first.indexOf('/');
  if (slash === -1) return null;
  const candidate = first.slice(0, slash + 1);
  return names.every((n) => n.replace(/\\/g, '/').startsWith(candidate)) ? candidate : null;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}
