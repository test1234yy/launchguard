import { describe, it, expect } from 'vitest';
import { parseGithubUrl, GithubError } from '@/lib/sources/github';

describe('parseGithubUrl', () => {
  it('parses full https URLs', () => {
    expect(parseGithubUrl('https://github.com/vercel/next.js')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
    });
  });

  it('strips a trailing .git', () => {
    expect(parseGithubUrl('https://github.com/owner/repo.git')).toMatchObject({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('parses owner/repo shorthand', () => {
    expect(parseGithubUrl('facebook/react')).toEqual({ owner: 'facebook', repo: 'react' });
  });

  it('extracts a branch from a tree URL', () => {
    expect(parseGithubUrl('https://github.com/owner/repo/tree/feature/x')).toEqual({
      owner: 'owner',
      repo: 'repo',
      ref: 'feature/x',
    });
  });

  it('accepts host without protocol', () => {
    expect(parseGithubUrl('github.com/owner/repo')).toMatchObject({ owner: 'owner', repo: 'repo' });
  });

  it('rejects non-github hosts', () => {
    expect(() => parseGithubUrl('https://gitlab.com/owner/repo')).toThrow(GithubError);
  });

  it('rejects empty input', () => {
    expect(() => parseGithubUrl('   ')).toThrow(GithubError);
  });

  it('rejects URLs without a repo', () => {
    expect(() => parseGithubUrl('https://github.com/owner')).toThrow(GithubError);
  });

  it('rejects suspicious characters in names', () => {
    expect(() => parseGithubUrl('https://github.com/ow ner/re;po')).toThrow(GithubError);
  });
});
