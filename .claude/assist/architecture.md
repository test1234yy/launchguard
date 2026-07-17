# LaunchGuard Architecture Review

**Last Updated:** 2026-07-17 14:20 UTC (recurring review every 20 minutes)

## Summary

- **Scope match:** Strong and end-to-end. The product matches "deployment readiness scanner for Next.js/Node.js": a Next.js UI (`app/`, `components/`) feeds three input modes (demo, GitHub, ZIP) through the scanner engine, renders a scored report, and offers deterministic/OpenAI fix-plans plus JSON/Markdown export. Real CI (`.github/workflows`) runs lint, typecheck, unit+integration tests, build, and Playwright e2e.
- **Component separation:** Good overall. `lib/scanner` (engine + 8 rule categories), `lib/sources` (loaders), `lib/fixplan`, `lib/report`, and `lib/api` are cleanly layered through `scanner/types.ts`. The remaining seams are at the app boundary: the route→pipeline glue and the client↔server contract are duplicated rather than centralized.

## Current Implementation

```
app/            layout.tsx, page.tsx, api/{scan,upload,fix-plan}/route.ts
components/      ScanForm, ScoreGauge, SummaryCards, FindingsPanel, FixPlanPanel
lib/
  scanner/       engine, score, redact, types + rules/ (8 categories + index)
  sources/       common, zip, github, demo
  fixplan/       generate (OpenAI + deterministic fallback)
  report/        export (JSON + Markdown)
  api/           respond (JSON envelope)
  ui/            client (formatting helpers)
tests/           unit/ (5) + integration/scan.test.ts
e2e/            smoke.spec.ts
```

---

## Five Highest-Priority Architectural Problems

### 1. No orchestration / composition root — scan pipeline duplicated across routes
**Files:** `app/api/scan/route.ts:22-41` (demo + github), `app/api/upload/route.ts:52-59` (zip).

**Why it matters:** `buildReport(snapshot, { source, skippedFiles, notes })` is assembled three times across two endpoints, and the three input modes are split inconsistently (`/api/scan` handles demo+github, `/api/upload` handles zip). Each route re-derives `ScanMeta.source`, so the source→metadata mapping can drift and every new input type re-implements the glue.

**Smallest fix:** Add `lib/scan.ts` exposing `scanDemo()`, `scanGithub(url)`, `scanZip(name, bytes)` that each return a complete `ScanReport`. Routes become thin adapters; the loader→engine wiring lives in one place, reusable by tests.

### 2. Client↔server response contract is duplicated ad hoc
**Files:** `lib/api/respond.ts:4-9` (server envelope), redeclared inline at `components/ScanForm.tsx:29` and `components/FixPlanPanel.tsx:27`.

**Why it matters:** The `{ ok, ... , error }` envelope is defined server-side but each client component re-types and re-parses it by hand. `lib/ui/client.ts` holds only formatting helpers, not an API client, so fetch+parse logic and the envelope shape are copy-pasted. Any envelope change must be edited in several places with no compile-time link between them.

**Smallest fix:** Define a shared `ApiResponse<T>` type used by both `respond.ts` and the client, and a small typed `postJson<T>()` helper in `lib/ui/client.ts`. Components call the helper instead of re-declaring shapes.

### 3. Entire homepage is a client component
**Files:** `app/page.tsx:1` (`'use client'`).

**Why it matters:** The whole page — static header, hero copy, footer — is a client component holding all state, forfeiting React Server Component benefits and shipping static markup as JS. Only the scan form and results region need interactivity.

**Smallest fix:** Keep `page.tsx` a server component that renders the static chrome and mounts one `'use client'` island (form + results state), e.g. `components/ScanApp.tsx`.

### 4. Engine non-determinism and module-level mutable state
**Files:** `lib/scanner/engine.ts:58,63,65` (`reportCounter`, `Date.now()`).

**Why it matters:** The codebase advertises deterministic, pure rules, yet `buildReport` mutates a process-global `reportCounter` and reads `Date.now()` to form the report `id`. The counter is unbounded, not resettable, and order-dependent across concurrent scans — undercutting testability and the determinism contract everything else upholds.

**Smallest fix:** Derive `id` from a content hash, or inject `id`/clock via `ScanMeta`; remove the module-level counter.

### 5. Fix-plan route trusts a fully client-supplied report
**Files:** `app/api/fix-plan/route.ts:24-35` (`isReport` shape check only).

**Why it matters:** The route accepts an entire client-controlled `report` and forwards it to `generateFixPlan` (which may call OpenAI). `isReport` validates types but not size or bounds, so a client can submit an oversized/arbitrary report to burn OpenAI tokens — a cost/DoS trust-boundary gap. The plan is built from unverified client data rather than a server-held scan.

**Smallest fix:** Cap `findings` count/length before calling the generator and add basic rate limiting; longer term, cache reports server-side by `id` so the client submits an id, not the whole report.

---

## Scope & Separation Verdict

- **Matches scope:** Yes — a working, safety-conscious scanner with UI, three ingest paths, scoring, fix-plans, exports, and full CI. Untrusted-input discipline (redaction, path-traversal rejection, size caps, "never execute scanned code") is consistent throughout.
- **Cleanly separated:** Mostly. `lib/` layering is sound; the open seams are the app-boundary duplications in Problems 1–2 and the client/server split in Problem 3.
- **Priority order:** 1 and 2 remove duplication and drift risk; 3 restores the RSC boundary; 4 and 5 harden determinism and the fix-plan trust boundary.
