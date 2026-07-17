# Architecture

LaunchGuard is a single Next.js 14 (App Router) application. There is no database
and no persistent state: every scan is computed on demand and returned to the
browser. This document explains the major pieces and the data flow.

## High-level flow

```
                 ┌─────────────────────────────────────────────┐
   Browser       │  app/page.tsx (client dashboard)            │
   ───────►      │   • ScanForm  → POST /api/scan | /api/upload │
                 │   • ScoreGauge / SummaryCards / Findings     │
                 │   • FixPlanPanel → POST /api/fix-plan        │
                 │   • Markdown / JSON export (client-side)     │
                 └───────────────┬─────────────────────────────┘
                                 │ JSON over fetch
                 ┌───────────────▼─────────────────────────────┐
   Server        │  app/api/* route handlers (Node runtime)    │
   (Next.js)     │   scan   → demo | github source             │
                 │   upload → safe zip source                  │
                 │   fix-plan → OpenAI or deterministic         │
                 └───────────────┬─────────────────────────────┘
                                 │ ProjectSnapshot
                 ┌───────────────▼─────────────────────────────┐
                 │  lib/scanner (pure, deterministic)          │
                 │   engine.runRules → rules/* → Finding[]     │
                 │   score.computeScore → 0–100                │
                 │   redact → mask secrets in evidence         │
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
  input), redacts evidence, sorts findings by severity, and assembles a
  `ScanReport`.
- **`score.ts`** — the readiness score. Starts at 100 and subtracts a
  severity-weighted penalty per finding, capping how much any single rule can
  subtract so one noisy rule can’t dominate the score.
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

- **`export.ts`** — `reportToJson` and `reportToMarkdown`. Exports are generated
  in the browser from the report the client already holds.

### `app/api` — route handlers

All routes use the Node.js runtime and return a consistent
`{ ok, ... } | { ok: false, error }` envelope (`lib/api/respond.ts`).

- **`POST /api/scan`** — `{ mode: 'demo' }` or `{ mode: 'github', url }`.
- **`POST /api/upload`** — `multipart/form-data` with a `file` field (`.zip`).
- **`POST /api/fix-plan`** — `{ report }` → `{ plan }`.

### `app` + `components` — the dashboard

`app/page.tsx` is a client component holding the current report in React state.
Presentational pieces live in `components/`: `ScanForm` (demo/GitHub/ZIP tabs),
`ScoreGauge` (SVG arc), `SummaryCards`, `FindingsPanel` (severity/category/text
filters + expandable findings) and `FixPlanPanel` (fix-plan generation + exports).
Styling is a hand-written design system in `app/globals.css` (no UI framework).

## Testing

- **Unit** (`tests/unit`) — redaction, scoring, path-safety, GitHub URL parsing
  and every rule.
- **Integration** (`tests/integration`) — the engine end-to-end on the demo
  project, in-memory ZIP loading, exports and the fix-plan fallback.
- **E2E** (`e2e/smoke.spec.ts`) — Playwright drives the built app: demo scan,
  filters and fix-plan generation.

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
