# LaunchGuard Quality Report

**Generated:** 2026-07-17 (recurring check every 15 minutes)
**Last run:** 2026-07-17 12:00-12:01 UTC

## Quality Checks Summary

| Check | Status | Details |
|-------|--------|---------|
| Typecheck | ✅ PASSED | No TypeScript errors |
| Lint | ✅ PASSED | No ESLint warnings or errors |
| Tests | ✅ PASSED | All 88 tests passing |
| Build | ❌ FAILED | Production build blocked during static page prerendering |

---

## Critical Build Error (Unresolved)

### `Error: useTheme must be inside ThemeProvider`

**Status:** BLOCKING — Production build cannot complete (exit code 1)  
**Affected page:** `/` (home page prerendering)  
**Error digest:** 1477254302

**Files involved:**
- [app/layout.tsx](app/layout.tsx) — Root layout (server component)
- [app/page.tsx:5,55](app/page.tsx#L5) — Home page (client component using `useTheme()`)
- [lib/ui/theme.tsx](lib/ui/theme.tsx) — ThemeProvider and useTheme hook

**Root cause:** `app/layout.tsx` is a server component wrapping children with `ThemeProvider` (a client component). During Next.js static page prerendering, the server cannot properly initialize the client-side React context. When `app/page.tsx` calls `useTheme()`, the context is unavailable.

**Current issue:**
- Server-side prerendering cannot execute client component context initialization
- `ThemeProvider` doesn't establish context during SSR
- `app/page.tsx` throws error when calling `useTheme()` without context

**Solution:** Ensure `ThemeProvider` properly initializes before `useTheme()` is called. Two approaches:

**Fix Option 1 (Recommended):** Add `'use client'` directive to `app/layout.tsx`:
```typescript
'use client';

import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/lib/ui/theme';
import './globals.css';

export const metadata: Metadata = { /* ... */ };
export const viewport: Viewport = { /* ... */ };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

**Fix Option 2 (Alternative):** Create a client wrapper component:
```typescript
// lib/ui/theme-provider-wrapper.tsx
'use client';
import { ThemeProvider } from './theme';

export function ThemeProviderWrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
```

Then use it in `app/layout.tsx` (which can remain a server component):
```typescript
import { ThemeProviderWrapper } from '@/lib/ui/theme-provider-wrapper';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
      </body>
    </html>
  );
}
```

---

## Test Results Summary

✅ **All 88 tests passing** (1.49s total)

| Test Suite | Count | Status | Time |
|-----------|-------|--------|------|
| tests/unit/path-safety.test.ts | 14 | ✅ PASS | 16ms |
| tests/unit/redact.test.ts | 13 | ✅ PASS | 17ms |
| tests/unit/score.test.ts | 8 | ✅ PASS | 10ms |
| tests/unit/github-url.test.ts | 9 | ✅ PASS | 13ms |
| tests/unit/rules.test.ts | 34 | ✅ PASS | 69ms |
| tests/integration/scan.test.ts | 10 | ✅ PASS | 27ms |

**Verification:** All core scanning logic, security rules, ZIP loading, GitHub integration, and report export features are tested and working correctly.

---

## Build Status

| Phase | Status | Notes |
|-------|--------|-------|
| Compilation | ✅ | TypeScript compiles successfully |
| Linting | ✅ | Type validation passes |
| Page generation | ❌ | Fails on "/" due to context error |
| Final export | ❌ | Cannot complete due to "/" failure |

---

## Deployment Status

🚫 **BLOCKED** — Production deployment cannot proceed until build succeeds.

The issue is purely a Next.js component architecture problem, not a logic or test failure. All core functionality is verified working through comprehensive test coverage.

---

## Next Steps

1. Apply one of the fixes above to resolve the `ThemeProvider` context issue
2. Run `npm run build` to verify the fix works
3. Confirm all pages prerender successfully
4. Proceed with production deployment
