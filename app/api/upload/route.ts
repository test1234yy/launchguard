import { buildReport } from '@/lib/scanner/engine';
import { loadZip, ZipError } from '@/lib/sources/zip';
import { LIMITS } from '@/lib/sources/common';
import { apiError, apiOk } from '@/lib/api/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ZIP upload scan.
 *
 * SAFETY: the archive is validated and size-capped before decompression, entry
 * paths are sanitized against traversal, and nothing from the archive is ever
 * written to disk or executed. The uploaded bytes are never persisted.
 */
export async function POST(request: Request): Promise<Response> {
  // SEC-4: Check Content-Length early, before buffering the body.
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > LIMITS.maxUploadBytes && contentLength > 0) {
    return apiError(`Upload exceeds the ${(LIMITS.maxUploadBytes / 1024 / 1024).toFixed(0)} MB limit.`, 413);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return apiError('Upload must be multipart/form-data with a "file" field.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('Could not parse the upload.');
  }

  const entry = form.get('file');
  if (!entry || typeof entry === 'string') {
    return apiError('No file was uploaded. Attach a .zip archive in the "file" field.');
  }

  const file = entry as File;
  // Post-parse size check (redundant but acts as backstop).
  if (file.size > LIMITS.maxUploadBytes) {
    return apiError(
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the ${(
        LIMITS.maxUploadBytes /
        1024 /
        1024
      ).toFixed(0)} MB limit.`,
      413
    );
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.zip')) {
    return apiError('Only .zip archives are supported.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const loaded = loadZip(file.name.replace(/\.zip$/i, '') || 'uploaded-archive', bytes);
    const report = buildReport(loaded.snapshot, {
      source: { type: 'zip', ref: file.name },
      skippedFiles: loaded.skippedFiles,
      notes: loaded.notes,
    });
    return apiOk({ report });
  } catch (err) {
    if (err instanceof ZipError) return apiError(err.message, 422);
    return apiError('Failed to scan the archive.', 500);
  }
}
