import { describe, it, expect } from 'vitest';
import {
  normalizeSafePath,
  FileCollector,
  looksBinaryByContent,
  extensionOf,
  isIgnoredPath,
} from '@/lib/sources/common';

describe('normalizeSafePath (path-traversal protection)', () => {
  it('rejects parent-directory traversal', () => {
    expect(normalizeSafePath('../../etc/passwd')).toBeNull();
    expect(normalizeSafePath('foo/../../bar')).toBeNull();
    expect(normalizeSafePath('a/b/../../../c')).toBeNull();
  });

  it('rejects absolute and drive-letter paths', () => {
    expect(normalizeSafePath('/etc/passwd')).toBeNull();
    expect(normalizeSafePath('C:/Windows/system32')).toBeNull();
  });

  it('rejects NUL bytes', () => {
    expect(normalizeSafePath('foo\0bar')).toBeNull();
  });

  it('normalizes backslashes and redundant segments', () => {
    expect(normalizeSafePath('src\\lib\\.\\index.ts')).toBe('src/lib/index.ts');
  });

  it('keeps ordinary relative paths', () => {
    expect(normalizeSafePath('app/page.tsx')).toBe('app/page.tsx');
  });

  it('returns null for empty results', () => {
    expect(normalizeSafePath('./')).toBeNull();
    expect(normalizeSafePath('')).toBeNull();
  });
});

describe('FileCollector', () => {
  const enc = new TextEncoder();

  it('drops traversal entries and counts them as skipped', () => {
    const c = new FileCollector();
    c.add('../evil.txt', enc.encode('x'));
    c.add('safe.txt', enc.encode('y'));
    const res = c.result();
    expect(res.files).toHaveLength(1);
    expect(res.files[0].path).toBe('safe.txt');
    expect(res.skipped).toBe(1);
  });

  it('silently ignores node_modules and build dirs', () => {
    const c = new FileCollector();
    c.add('node_modules/left-pad/index.js', enc.encode('x'));
    c.add('.next/build.js', enc.encode('x'));
    c.add('keep.js', enc.encode('x'));
    const res = c.result();
    expect(res.files.map((f) => f.path)).toEqual(['keep.js']);
  });

  it('remembers that node_modules was present after dropping it', () => {
    const c = new FileCollector();
    c.add('node_modules/x/index.js', enc.encode('x'));
    c.add('keep.js', enc.encode('x'));
    expect(c.result().committedNodeModules).toBe(true);

    const clean = new FileCollector();
    clean.add('keep.js', enc.encode('x'));
    expect(clean.result().committedNodeModules).toBe(false);
  });

  it('marks binary content and does not decode it', () => {
    const c = new FileCollector();
    c.add('image.bin', new Uint8Array([1, 2, 0, 3, 4]));
    const res = c.result();
    expect(res.files[0].binary).toBe(true);
    expect(res.files[0].content).toBe('');
  });

  it('enforces the total-bytes cap by truncating', () => {
    const c = new FileCollector();
    const big = new Uint8Array(1024 * 1024); // 1 MB of zeros -> binary
    for (let i = 0; i < 60; i++) c.add(`f${i}.bin`, big);
    const res = c.result();
    expect(res.truncated).toBe(true);
  });
});

describe('helpers', () => {
  it('extensionOf handles dotfiles and nested paths', () => {
    expect(extensionOf('a/b/c.TS')).toBe('ts');
    expect(extensionOf('.env')).toBe('');
    expect(extensionOf('Dockerfile')).toBe('');
  });
  it('looksBinaryByContent detects NUL bytes', () => {
    expect(looksBinaryByContent(new Uint8Array([65, 0, 66]))).toBe(true);
    expect(looksBinaryByContent(new Uint8Array([65, 66, 67]))).toBe(false);
  });
  it('isIgnoredPath flags dependency directories', () => {
    expect(isIgnoredPath('node_modules/x')).toBe(true);
    expect(isIgnoredPath('src/node_modules/x')).toBe(true);
    expect(isIgnoredPath('src/app.ts')).toBe(false);
  });
});
