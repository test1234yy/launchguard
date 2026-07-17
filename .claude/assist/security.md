# LaunchGuard — Defensive Security Review

- **Last reviewed:** 2026-07-17 (recurring every 25 minutes)
- **Latest update:** Cycle 7 — new `advanced.ts` rules module integrated (ADV001-ADV010 operational checks)
- **Reviewer scope:** Read-only defensive audit. This file is the only artifact updated; no production code, config, dependencies, Git history or tests are modified.
- **What LaunchGuard is:** A deployment-readiness scanner that ingests untrusted projects via **GitHub repo** or **ZIP upload**, pattern-matches them in memory, exposes results through Next.js App Router API routes, and optionally sends *redacted* findings to the OpenAI API for a fix plan.

## Status: All findings resolved ✅

All 5 concrete findings from prior cycles have been fixed in the codebase. See review log for details.

## Overall posture

Strong and deliberately defensive. Untrusted repository content is consistently treated as inert DATA — never executed, imported, installed, built, or written to disk. Redaction, resource limits, path normalization, host allowlisting, prompt-injection framing, escaped UI rendering and clean API error envelopes are all present and actively maintained. The codebase includes inline comments referencing each resolved finding (SEC-1 through SEC-5).

## Reviewed surface (current state)

| Area | File(s) | Status |
|------|---------|--------|
| ZIP ingest | `lib/sources/zip.ts`, `lib/sources/common.ts` | ✅ SEC-2 resolved |
| Upload API | `app/api/upload/route.ts` | ✅ SEC-4 resolved |
| Scan API (demo/github) | `app/api/scan/route.ts` | ✅ Clean |
| Fix-plan API | `app/api/fix-plan/route.ts` | ✅ SEC-5 resolved |
| GitHub ingest / SSRF | `lib/sources/github.ts` | ✅ SEC-3 resolved |
| OpenAI fix plan / prompt injection | `lib/fixplan/generate.ts` | ✅ Acceptable |
| Secret redaction | `lib/scanner/redact.ts` | ✅ SEC-1 resolved |
| API envelope / error leakage | `lib/api/respond.ts` | ✅ Clean |
| UI rendering (XSS) | `components/*.tsx`, `app/page.tsx` | ✅ No XSS |
| Report export | `lib/report/export.ts` | ✅ Clean |
| Rule engine + all rules | `lib/scanner/engine.ts`, `lib/scanner/rules/*` | ✅ Clean |
| Demo fixtures | `lib/sources/demo.ts` | ✅ Intentional fakes |

**Positive controls (maintained):**
- **Path traversal:** `normalizeSafePath` (`common.ts:82-95`) rejects `..`, absolute paths, drive letters and NUL bytes; loaders never touch the filesystem, so zip-slip has no write target.
- **SSRF:** GitHub host allowlist (`github.ts:31,50`), owner/repo/ref sanitized (`github.ts:66-78`), API/download hosts hardcoded — untrusted input cannot redirect fetches to internal hosts.
- **No XSS:** the AI-generated fix plan is rendered as `<pre>{plan.markdown}</pre>` (`FixPlanPanel.tsx:88`) and every finding field as escaped React text (`FindingsPanel.tsx:42,46`). Zero `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in the codebase.
- **API error hygiene:** `respond.ts` emits a fixed `{ok,error}` envelope with curated messages; routes map `ZipError`/`GithubError` to safe text and fall back to generic 500/502 — no stack traces or internals leak.
- **API validation:** upload enforces `multipart/form-data` and `.zip`; JSON bodies are parse-guarded; fix-plan shape-checks the report and enforces size limits; scan validates `mode`/`url`.
- **Prompt injection & redaction to OpenAI:** untrusted-data system prompt (`generate.ts:91-96`); only redacted, bounded evidence sent (`generate.ts:81-89`); uploads/repos never persisted; output non-executed.
- **Unsafe execution:** no `child_process`/`eval`/`require()` of scanned content anywhere; each rule runs in try/catch (`engine.ts:26-31`).
- **Committed credentials:** none real. Secret-shaped strings exist only as documented fakes in `demo.ts` and regex definitions in `redact.ts`. No real `.env` on disk; repo has no commits.

## Resolved findings (fixed in current codebase)

All findings from prior cycles have been addressed:

- **SEC-2** (zip.ts) — ZIP decompression unbounded during inflation → **FIXED** with cumulative inflation tracking (lines 36-48, comment on line 42)
- **SEC-4** (upload/route.ts) — Upload size limit checked after body buffered → **FIXED** with early Content-Length check (lines 17-21, comment on line 17)
- **SEC-1** (redact.ts) — Evidence clipped before redaction → **FIXED** by redacting first, then clipping (lines 76-79, comment on line 76)
- **SEC-5** (fix-plan/route.ts) — Unbounded report sent to paid API → **FIXED** with size bounds on all fields (lines 12-31, comment on line 24)
- **SEC-3** (github.ts) — GitHub URL validation accepts `.`/`..` → **FIXED** by explicitly rejecting reserved segments (lines 69-73, comment on line 69)

## Continuous monitoring

No new findings identified. The following checks remain in place and are evaluated on each cycle:

| Check | Status |
|-------|--------|
| ZIP traversal | ✅ Controlled |
| Upload limits | ✅ Early + post-parse guards |
| GitHub URL validation | ✅ Allowlist + reserved-segment rejection |
| Secret redaction | ✅ Redact-first ordering |
| Prompt injection | ✅ Untrusted-data framing |
| Unsafe repository execution | ✅ Data-only; no exec/eval/require |
| API validation | ✅ Type, shape, and size checks |
| Error leakage | ✅ Curated envelopes |
| Committed credentials | ✅ No real credentials |

## Review log

- **2026-07-17 (cycle 8):** No new code changes. All 5 prior fixes (SEC-1 through SEC-5) verified in place. No unsafe patterns detected (child_process, eval, dangerouslySetInnerHTML). Continuous monitoring shows all security controls maintained. No regressions.
- **2026-07-17 (cycle 7):** New `lib/scanner/rules/advanced.ts` module added with 10 operational/deployment-readiness checks (ADV001-ADV010). Properly integrated into rule index. No new security vulnerabilities in LaunchGuard code. All prior fixes maintained. No regressions.
- **2026-07-17 (cycle 6):** No new code changes. All 5 prior fixes confirmed in place and functional. No regressions detected. Continuous monitoring shows all security controls maintained.
- **2026-07-17 (cycle 5):** All 5 prior findings confirmed fixed in current codebase with inline comments. Codebase demonstrates active maintenance and security-conscious development. No new vulnerabilities identified.
- **2026-07-17 (cycle 4):** Write still blocked by classifier outage; work documented externally. SEC-2 and SEC-4 identified as fixed but write not persisted.
- **2026-07-17 (cycle 3):** API + UI layer reviewed. Identified SEC-2, SEC-4, SEC-1, SEC-5, SEC-3. All with evidence and safe corrections.
- **2026-07-17 (cycle 2):** Ingest + AI surface reviewed. Initial findings recorded.
- **2026-07-17 (cycle 1):** Baseline; scanner core + config only.
