# Architecture

LaunchGuard is a single Next.js 14 (App Router) application. There is no database
and no persistent state: every scan is computed on demand and returned to the
browser. This document explains the major pieces and the data flow.

## High-level flow

```
                 ┌─────────────────────────────────────────────┐
   Browser       │  app/page.tsx (client dashboard)            │
   ───────►      │   • ScanForm  → POST /api/scan | /api/upload │
                 │   • ScoreGauge (Δ vs last scan) / Summary    │
                 │   • InsightsPanel (projections, quick wins)  │
                 │   • FindingsPanel (filter/sort/expand)       │
                 │   • FixPlanPanel → POST /api/fix-plan        │
                 │   • Exports: MD/JSON/CSV/XML/SARIF/HTML/SVG  │
                 │   • RuleCatalog · HistoryPanel (localStorage)│
                 └───────────────┬─────────────────────────────┘
                                 │ JSON over fetch
                 ┌───────────────▼─────────────────────────────┐
   Server        │  app/api/* route handlers (Node runtime)    │
   (Next.js)     │   scan   → demo | github source  (rate-lim) │
                 │   upload → safe zip source       (rate-lim) │
                 │   fix-plan → OpenAI or deterministic (r-l)  │
                 │   rules | health | badge (GET utilities)    │
                 └───────────────┬─────────────────────────────┘
                                 │ ProjectSnapshot
                 ┌───────────────▼─────────────────────────────┐
                 │  lib/scanner (pure, deterministic)          │
                 │   config → in-repo launchguard.config.json  │
                 │   engine.runRules → rules/* → Finding[]     │
                 │   score.computeScore → 0–100                │
                 │   fingerprint · insights · redact           │
                 └─────────────────────────────────────────────┘
```

## Modules

### `lib/scanner` — the rule engine (pure, deterministic)

- **`types.ts`** — the domain model: `ProjectSnapshot`, `ScannedFile`, `Rule`,
  `Finding`, `ScanReport` and the `Severity` / `Category` enums.
- **`rules/*.ts`** — one file per category. Each rule is a pure function
  `check(project) => RuleMatch[]`. Rules only read strings; they never touch the
  network, filesystem, or evaluate code. `rules/index.ts` aggregates and sorts
  them by id.
- **`engine.ts`** — runs every rule (guarding against a rule throwing on hostile
  input), applies the in-repo scan config, redacts evidence, sorts findings by
  severity, and assembles a `ScanReport` (including duration, fingerprint,
  file-type breakdown and suppression counts).
- **`config.ts`** — parses an optional `launchguard.config.json` from the
  scanned project (`ignoreRules`, `minSeverity`). Treated as untrusted data:
  validated defensively, capped, and every effect is disclosed via report notes.
- **`score.ts`** — the readiness score. Starts at 100 and subtracts a
  severity-weighted penalty per finding, capping how much any single rule can
  subtract so one noisy rule can’t dominate the score.
- **`insights.ts`** — pure derivations for the dashboard: per-rule remediation
  **effort** (quick/moderate/involved), **projected scores** (“fix all criticals
  → N”), **quick wins**, and the file-type breakdown.
- **`fingerprint.ts`** — FNV-1a content hash over findings + score. Identical
  scan content yields an identical fingerprint (unlike the per-run report id),
  which powers history deduplication and change detection.
- **`redact.ts`** — the redaction layer. Masks well-known token formats,
  connection-string credentials, private keys and secret-named assignments, while
  leaving obvious placeholders readable. Idempotent.

The engine is intentionally free of I/O so it is trivially unit-testable and
deterministic: the same snapshot always yields the same report.

### `lib/sources` — untrusted input → `ProjectSnapshot`

- **`common.ts`** — shared limits (`LIMITS`), binary detection, and the
  **`normalizeSafePath`** function that rejects absolute paths, drive letters and
  `..` traversal. `FileCollector` enforces total-size, per-file and file-count
  caps and drops dependency/build directories.
- **`zip.ts`** — decompresses an in-memory archive with `fflate`, strips a common
  top-level directory, and funnels every entry through `FileCollector`. The
  upload is size-checked **before** decompression to bound zip-bomb risk.
- **`github.ts`** — parses many GitHub URL forms, resolves repo metadata via the
  public API, downloads the repository **zipball over HTTPS** (never a clone),
  and reuses the safe ZIP loader. Reads are size-capped as they stream in.
- **`demo.ts`** — a synthetic, intentionally-flawed project defined as string
  literals, used by the no-key demo. All “secrets” are fake.

### `lib/fixplan` — remediation plans

- **`generate.ts`** — if `OPENAI_API_KEY` is set, sends the **redacted** findings
  to the OpenAI Chat Completions API with a system prompt that treats findings as
  data, not instructions. Any absence or failure falls back to
  `deterministicFixPlan`, which builds a prioritized Markdown plan directly from
  the findings. The feature therefore always works.

### `lib/report` — exports

- **`export.ts`** — `reportToJson`, `reportToMarkdown`, `reportToCsv`,
  `reportToXml`. Exports are generated in the browser from the report the client
  already holds.
- **`sarif.ts`** — SARIF 2.1.0 output (severity → error/warning/note mapping,
  per-rule metadata, physical locations) for GitHub code scanning and SARIF
  viewers.
- **`html.ts`** — a self-contained, script-free HTML report (inline CSS,
  escaped content) suitable for tickets, email and printing.
- **`badge.ts`** — a shields-style readiness badge as an SVG string, shared by
  the client download and `GET /api/badge`.

### `lib/api` — route plumbing

- **`respond.ts`** — the `{ ok, ... }` envelope helpers, including 429 responses
  with `Retry-After`.
- **`ratelimit.ts`** — a dependency-free fixed-window in-memory rate limiter
  (injectable clock for tests) plus shared per-route limiter instances keyed by
  client IP.

### `app/api` — route handlers

All routes use the Node.js runtime and return a consistent
`{ ok, ... } | { ok: false, error }` envelope (`lib/api/respond.ts`). The three
POST routes are rate limited per client.

- **`POST /api/scan`** — `{ mode: 'demo' }` or `{ mode: 'github', url }`.
- **`POST /api/upload`** — `multipart/form-data` with a `file` field (`.zip`).
- **`POST /api/fix-plan`** — `{ report }` → `{ plan }`.
- **`GET /api/rules`** — the machine-readable rule catalog.
- **`GET /api/health`** — liveness probe (status, version, rule count, uptime).
- **`GET /api/badge?score=NN`** — readiness badge as `image/svg+xml`.

### `app` + `components` — the dashboard

`app/page.tsx` is a client component holding the current report, scan history
and score delta in React state. Presentational pieces live in `components/`:
`ScanForm` (demo/GitHub/ZIP tabs), `ScoreGauge` (SVG arc + delta vs last scan),
`SummaryCards`, `InsightsPanel` (projected scores, quick wins, file types),
`FindingsPanel` (severity/category/text filters, sorting, expand/collapse all,
`/` shortcut), `FixPlanPanel` (fix-plan generation, seven export formats, copy
summary, print), `RuleCatalog` (the full rule list) and `HistoryPanel` (recent
scans from localStorage). Styling is a hand-written design system in
`app/globals.css` (no UI framework) with dark/light themes (`lib/ui/theme.tsx`)
and print styles.

## Testing

- **Unit** (`tests/unit`) — redaction, scoring, path-safety, GitHub URL parsing,
  every rule (including the quality wave), scan config parsing, insights
  (effort/projections/quick wins), fingerprints, exports (SARIF/HTML/badge/CSV/
  XML), the rate limiter and history list operations.
- **Integration** (`tests/integration`) — the engine end-to-end on the demo
  project (including in-repo config suppression), in-memory ZIP loading, exports,
  the fix-plan fallback, and the API route handlers invoked as plain functions
  (rules/health/badge/scan/fix-plan, including the 429 path).
- **E2E** (`e2e/smoke.spec.ts`) — Playwright drives the built app: demo scan,
  filters, sorting, expand/collapse, insights, rule catalog, exports (download),
  scan history + delta, keyboard shortcut and the GET API endpoints.

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build → Playwright
on Node 20 for every push and PR to `main`.

## Design decisions

- **No database / auth / billing / auto-deploy** — deliberately out of scope so
  the tool stays a safe, stateless analyzer.
- **Determinism first** — the core is pure so results are reproducible and the AI
  layer is strictly optional sugar on top.
- **Defense in depth for untrusted input** — size caps, path normalization,
  binary skipping, redaction and “never execute” together bound the blast radius
  of a hostile repo or archive.
