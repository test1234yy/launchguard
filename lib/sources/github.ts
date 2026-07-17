import type { ProjectSnapshot } from '../scanner/types';
import { LIMITS } from './common';
import { loadZip, ZipError } from './zip';

/**
 * Public GitHub repository loader.
 *
 * SAFETY: we download the repository as a ZIP archive over HTTPS and hand it to
 * the safe ZIP loader. We never clone, never run install/build hooks, never
 * execute repository code. Only public repositories are supported and no
 * credentials are required (an optional GITHUB_TOKEN only raises rate limits).
 */

export interface GithubRef {
  owner: string;
  repo: string;
  /** Optional branch/tag/commit. */
  ref?: string;
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'GithubError';
  }
}

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

/** Parse a variety of GitHub URL / shorthand forms into an owner/repo ref. */
export function parseGithubUrl(input: string): GithubRef {
  const trimmed = input.trim();
  if (!trimmed) throw new GithubError('Enter a GitHub repository URL.');

  // owner/repo shorthand
  const shorthand = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(trimmed);
  if (shorthand && !trimmed.includes('://') && !trimmed.includes(' ')) {
    return sanitizeRef({ owner: shorthand[1], repo: shorthand[2] });
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new GithubError('That does not look like a valid GitHub URL.');
  }
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    throw new GithubError('Only public github.com repositories are supported.');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new GithubError('URL must include an owner and repository, e.g. https://github.com/owner/repo.');
  }
  const [owner, rawRepo, kind, ...rest] = segments;
  const repo = rawRepo.replace(/\.git$/, '');
  let ref: string | undefined;
  if ((kind === 'tree' || kind === 'commit') && rest.length > 0) {
    ref = rest.join('/');
  }
  return sanitizeRef({ owner, repo, ref });
}

const NAME_RE = /^[\w.-]+$/;

function sanitizeRef(ref: GithubRef): GithubRef {
  // SEC-3: Reject reserved path segments that could redirect the API call.
  const bad = (s: string) => !NAME_RE.test(s) || s === '.' || s === '..';
  if (bad(ref.owner) || bad(ref.repo)) {
    throw new GithubError('Repository owner and name contain unexpected characters.');
  }
  if (ref.ref && !/^[\w./-]+$/.test(ref.ref)) {
    throw new GithubError('Branch or ref contains unexpected characters.');
  }
  return ref;
}

interface RepoMeta {
  defaultBranch: string;
  fullName: string;
  archived: boolean;
  sizeKb: number;
}

async function fetchRepoMeta(ref: GithubRef): Promise<RepoMeta> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'LaunchGuard-Scanner',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, { headers });
  if (res.status === 404) {
    throw new GithubError('Repository not found. Check the owner/name and that it is public.', 404);
  }
  if (res.status === 403) {
    throw new GithubError('GitHub API rate limit reached. Try again later or set GITHUB_TOKEN.', 403);
  }
  if (!res.ok) {
    throw new GithubError(`GitHub API returned ${res.status}.`, res.status);
  }
  const body = (await res.json()) as {
    default_branch?: string;
    full_name?: string;
    archived?: boolean;
    size?: number;
  };
  return {
    defaultBranch: body.default_branch ?? 'main',
    fullName: body.full_name ?? `${ref.owner}/${ref.repo}`,
    archived: Boolean(body.archived),
    sizeKb: body.size ?? 0,
  };
}

async function downloadZipball(ref: GithubRef, branch: string): Promise<Uint8Array> {
  const headers: Record<string, string> = { 'User-Agent': 'LaunchGuard-Scanner' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const url = `https://codeload.github.com/${ref.owner}/${ref.repo}/zip/refs/heads/${encodeURIComponent(
    branch
  )}`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) {
    // Fall back to the tag namespace for tags/commit refs.
    const tagUrl = `https://codeload.github.com/${ref.owner}/${ref.repo}/zip/${encodeURIComponent(branch)}`;
    const tagRes = await fetch(tagUrl, { headers, redirect: 'follow' });
    if (!tagRes.ok) {
      throw new GithubError(`Could not download repository archive (HTTP ${res.status}).`, res.status);
    }
    return readCapped(tagRes);
  }
  return readCapped(res);
}

/** Read a response body but abort if it exceeds the upload cap (guards zip bombs). */
async function readCapped(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > LIMITS.maxUploadBytes) {
      throw new GithubError('Repository archive is too large to scan.');
    }
    return buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > LIMITS.maxUploadBytes) {
        await reader.cancel();
        throw new GithubError(
          `Repository archive exceeds the ${(LIMITS.maxUploadBytes / 1024 / 1024).toFixed(
            0
          )} MB scan limit.`
        );
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export interface GithubLoadResult {
  snapshot: ProjectSnapshot;
  skippedFiles: number;
  notes: string[];
  resolvedRef: string;
}

export async function loadGithubRepo(input: string): Promise<GithubLoadResult> {
  const ref = parseGithubUrl(input);
  const meta = await fetchRepoMeta(ref);
  if (meta.sizeKb > LIMITS.maxUploadBytes / 1024) {
    throw new GithubError(
      `Repository is ~${(meta.sizeKb / 1024).toFixed(0)} MB, larger than the scan limit.`
    );
  }
  const branch = ref.ref ?? meta.defaultBranch;
  const data = await downloadZipball(ref, branch);

  let loaded;
  try {
    loaded = loadZip(meta.fullName, data);
  } catch (err) {
    if (err instanceof ZipError) throw new GithubError(err.message);
    throw err;
  }

  const notes = [...loaded.notes];
  if (meta.archived) notes.push('Repository is archived on GitHub.');
  return {
    snapshot: loaded.snapshot,
    skippedFiles: loaded.skippedFiles,
    notes,
    resolvedRef: `${meta.fullName}@${branch}`,
  };
}
