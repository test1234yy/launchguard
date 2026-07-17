# LaunchGuard Quality Report

**Generated:** 2026-07-17 (recurring check every 15 minutes)
**Last run:** 2026-07-17 08:01-08:02 UTC

## Quality Checks Summary

| Check | Status | Details |
|-------|--------|---------|
| Typecheck | ✅ PASSED | No TypeScript errors |
| Lint | ✅ PASSED | No ESLint warnings or errors |
| Tests | ❌ FAILED | 1 test failed; 87 passed |
| Build | ✅ PASSED | Production build compiled successfully |

---

## Failing Test

### `tests/integration/scan.test.ts > safe ZIP loading (integration) > rejects an archive with no scannable files`

**Status:** FAILED (expected to throw, but didn't)  
**Test location:** [tests/integration/scan.test.ts:76-79](tests/integration/scan.test.ts#L76-L79)  
**Affected code:** [lib/sources/zip.ts:50-56](lib/sources/zip.ts#L50-L56)  

**Root cause:** The `commonTopLevelDir` function detects and strips common top-level directory prefixes from archive entries (designed for GitHub's auto-wrapping of repos like `repo-name/`). When an archive contains *only* `node_modules/x/index.js`:

1. `commonTopLevelDir(['node_modules/x/index.js'])` returns `'node_modules/'`
2. The prefix is stripped: `'node_modules/x/index.js'` → `'x/index.js'`
3. `FileCollector.add('x/index.js', bytes)` is called
4. `isIgnoredPath('x/index.js')` returns `false` (no `node_modules` segment)
5. The file is added to the collector
6. Collector has 1 file instead of 0, so no `ZipError` is thrown

**Expected behavior:** Should throw `ZipError('The archive contained no scannable files.')`  
**Actual behavior:** Returns successfully with 1 file in snapshot

**Suggested fix:** Don't strip the prefix if it's itself an ignored directory:

```typescript
// In lib/sources/zip.ts, around line 50-56:
let prefix = commonTopLevelDir(entryNames);
// Don't strip ignored directories like node_modules, .next, .git, etc.
if (prefix && isIgnoredPath(prefix.slice(0, -1))) {
  prefix = null;
}
```

Alternatively, recheck the original path before stripping:

```typescript
for (const [rawName, bytes] of Object.entries(entries)) {
  // Check the original path for ignored entries first
  if (isIgnoredPath(rawName)) continue;
  
  const relative = prefix && rawName.startsWith(prefix) ? rawName.slice(prefix.length) : rawName;
  collector.add(relative, bytes);
}
```

---

## No Blocking Errors

- **Compilation:** ✅ All files compile without errors
- **Linting:** ✅ No code style violations
- **Build:** ✅ Next.js production build succeeds (5 routes, 87.2 kB shared JS)
- **Core user flows:** ✅ 87 of 88 tests passing (demo scan, GitHub loader, ZIP upload, report export, fix-plan generation all working)

---

## Test Suite Status

| File | Tests | Status |
|------|-------|--------|
| tests/unit/score.test.ts | 8 | ✅ PASS |
| tests/unit/redact.test.ts | 13 | ✅ PASS |
| tests/unit/path-safety.test.ts | 14 | ✅ PASS |
| tests/unit/github-url.test.ts | 9 | ✅ PASS |
| tests/unit/rules.test.ts | 34 | ✅ PASS |
| tests/integration/scan.test.ts | 10 | ❌ 1 FAIL / 9 PASS |

**Failure details:**  
- Line 76-79: Edge case where ZIP contains only files in ignored directories (node_modules)
- Impact: Low — defensive check for malformed archives; core scanning logic unaffected
- Duration: 1.30s total, 11ms for failing test

---

## Advisory Findings (Non-blocking)

Earlier static analysis found two advisory issues (not failing checks):

1. **[lib/scanner/redact.ts:74-78](lib/scanner/redact.ts#L74-L78)** (MEDIUM): `toEvidence` clips evidence to 200 chars before redacting secrets. If a token straddles the boundary and is truncated below the regex's minimum length, it won't be masked. Mitigation: most rules pre-mask via `maskValue()` before calling `toEvidence`.

2. **[lib/scanner/rules/dependencies.ts:36](lib/scanner/rules/dependencies.ts#L36)** (LOW): DEP002's `UNPINNED` regex misses compound OR ranges like `">=1.0.0 || <2.0.0"` (false negative for floating versions).

---

## Next Steps

1. **Fix the `commonTopLevelDir` stripping logic** in [lib/sources/zip.ts](lib/sources/zip.ts) to not strip ignored directories, so archives with only node_modules/etc. correctly return 0 scannable files.
2. Re-run tests to verify the fix.
3. (Optional) Address the redaction boundary and dependency-range advisory findings.
