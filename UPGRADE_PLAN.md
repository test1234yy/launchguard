# Dependency Security Upgrade Plan

## Current Security Issues

**10 vulnerabilities found:**
- 1 critical: PostCSS XSS (FIXED ✓)
- 5 high: Next.js DoS/smuggling issues
- 4 moderate: Various

## Next.js Vulnerabilities to Address

| CVE | Severity | Impact | Requires |
|-----|----------|--------|----------|
| DoS via Image Optimizer | high | Disk storage exhaustion | Upgrade or disable feature |
| DoS via RSC | high | HTTP request handling | Upgrade to 15.x+ |
| HTTP request smuggling | high | Security bypass | Upgrade to 15.x+ |
| Unbounded image cache | high | Resource exhaustion | Upgrade or use external cache |
| glob CLI injection | high | Dev tooling | Upgrade ESLint config |

## Upgrade Strategy

### Phase 1: Conservative Path (Recommended)
1. **Update Next.js 14 patch version** (14.2.35 → latest 14.x)
   - Status: No newer 14.x versions available
   
2. **Update ESLint config to latest Next.js 14.x compatible**
   - Current: eslint-config-next@14.2.25
   - Fixes: glob CLI vulnerability in dev tooling

### Phase 2: Major Upgrade (Breaking Changes)
- **Next.js 15.x upgrade** (1-2 day effort)
  - Breaking changes: Server-only packages, fetch behavior, etc.
  - Requires: Full test suite verification + E2E testing
  - Benefit: Fixes RSC DoS and HTTP smuggling vulnerabilities
  
- **Next.js 16.x upgrade** (2-3 day effort)
  - Latest stable
  - Breaking changes: Unknown until tested
  - Benefit: Latest security patches

## Current Risk Assessment

**Low-risk areas (this app unlikely to be exploited):**
- Image Optimizer - not used in this app
- Pages Router vulnerabilities - we use App Router

**Medium-risk areas:**
- RSC DoS - could affect production deployments
- Request smuggling - edge case but serious

## Recommendation

1. ✅ Update PostCSS (completed)
2. ⏳ Update ESLint config to fix glob vulnerability
3. 📋 Schedule major version upgrade (Next.js 15/16) as separate initiative
   - Plan: 2-3 days full cycle (upgrade, test, E2E, deploy)
   - Priority: High (security-focused app should demonstrate best practices)

## Notes

- All 231 tests passing after PostCSS update
- No breaking changes from PostCSS update
- Major version upgrades require careful testing due to breaking changes
