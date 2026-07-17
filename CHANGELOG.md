# Changelog

All notable changes to LaunchGuard are documented in this file.

## [1.2.0] - 2026-07-17

### Added
- **Report comparison feature** — Client-side diff tool to compare baseline vs current scan reports
- **PWA support** — Installable web app with service worker for offline-capable app shell
- **OpenAPI specification** — Machine-readable API documentation at `/api/openapi`
- **Rate limiting middleware** — Protect API endpoints from abuse with per-client limits
- **Badge API** — SVG readiness badges for GitHub/README integration (`/api/badge?score=NN`)
- **Advanced scanning rules** (ADV001-ADV010) — APM, logging, validation, security checks
- **Quality rules** (QUA001-QUA009) — Code quality, merge conflicts, console usage, TODOs
- **Health check endpoint** — Liveness probe with version and rule count
- **Keyboard shortcuts** — Global navigation (`e`/`x` expand/collapse, `t` theme, `p` print, `/` filter)
- **Dark/light theme** — System-aware theme selection with persistent preference
- **Local scan history** — Browser localStorage-based comparison with score deltas
- **Comprehensive test suite** — 263 unit, integration, and API tests

### Fixed
- **PostCSS XSS vulnerability** (GHSA-qx2v-qp2m-jg93) — Updated to 8.5.19
- **API response envelope consistency** — All endpoints follow `{ok, ...}` pattern
- **Accessibility improvements** — Skip link, focus rings, reduced-motion support, mobile tap targets

### Security
- Increased from 58 to 62 scanning rules
- Added advanced configuration rule checks
- Added quality/correctness pattern detection
- Created respond.ts utility tests for API contract verification
- Documented security vulnerabilities in UPGRADE_PLAN.md

### Performance
- Memoized filtering in FindingsPanel for large reports
- Deferred state updates for responsive UI
- Service worker caching strategy for static assets
- Stable report fingerprints for change detection

### Documentation
- Added ARCHITECTURE.md with component breakdown
- Created UPGRADE_PLAN.md for Next.js 15/16 migration
- Documented all 62 rules in README
- Added OpenAPI 3.1.0 specification endpoint
- Comprehensive JSDoc comments in scanner engine

### Dependencies
- Next.js 14.2.35 (stable, with documented upgrade path)
- React 18.3.1
- TypeScript 5.9.3
- PostCSS 8.5.19 (security fix)
- Vitest 2.1.9 (testing)
- Playwright 1.49.1 (E2E)

## [1.1.0] - 2026-01-15

### Added
- Initial LaunchGuard release
- 58 deterministic scanning rules
- Readiness score (0-100) with human-readable grades
- Quick wins and projected score calculations
- Multi-format export (Markdown, JSON, CSV, XML, SARIF, HTML)
- Fix plan generation (OpenAI + deterministic fallback)
- GitHub repository scanning
- ZIP file upload scanning
- Demo scan with intentionally-flawed sample project
- In-repo configuration (launchguard.config.json)
- Unit and integration test suite

## Security

### Known Vulnerabilities
- Next.js cache poisoning in RSC (requires 15.x+)
- Next.js HTTP request smuggling (requires 15.x+)
- Next.js DoS via Image Optimizer (requires 15.x+)
- Mitigated: PostCSS XSS (8.5.19+)

### Security Model
- Scanned code is never executed, imported, installed or built
- All secret-like values are redacted before display
- Uploads are never persisted to disk
- Network isolation for ZIP scanning
- Content validation and path sanitization
- Rate limiting on scan endpoints

## Migration Guide

### From 1.1.0 to 1.2.0
No breaking changes. New features are opt-in:
- Report comparison available in UI
- Theme toggle now includes dark/light preference
- Keyboard shortcuts available via help in footer
- Additional rules may flag new issues in existing projects

### Planned: 1.3.0 (Next.js 15)
- Major dependency upgrade (Next.js 14 → 15)
- Breaking changes expected in build/deployment
- Enhanced performance and security

## Contributing

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for development setup and testing guidelines.

## License

MIT — See LICENSE file
