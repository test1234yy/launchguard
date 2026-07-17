# Maintenance Guide

This document outlines ongoing maintenance tasks and monitoring for LaunchGuard.

## Weekly Checks

- [ ] Review [GitHub Issues](../../issues) for bug reports
- [ ] Check [GitHub Discussions](../../discussions) for user questions
- [ ] Monitor [Dependabot alerts](../../security/dependabot)
- [ ] Check CI/CD status (GitHub Actions)

## Monthly Maintenance

### Dependencies
```bash
# Check for outdated packages
npm outdated

# Check for security vulnerabilities
npm audit

# Review package-lock.json for drift
git diff package-lock.json
```

### Code Quality
```bash
# Run full test suite
npm run ci

# Check test coverage
npm test -- --coverage

# Verify builds
npm run build
```

### Documentation
- [ ] Review README.md for accuracy
- [ ] Check all links are working
- [ ] Verify CHANGELOG.md is up to date
- [ ] Review FAQ.md for new common issues

## Quarterly Tasks

### Security Audit
- [ ] Review SECURITY.md and known vulnerabilities
- [ ] Assess security advisory reports
- [ ] Plan major dependency upgrades if needed
- [ ] Review and update UPGRADE_PLAN.md

### Performance Review
- [ ] Profile test suite for regressions
- [ ] Monitor bundle size (npm run build)
- [ ] Check for performance issues reported by users

### Release Planning
- [ ] Review [ROADMAP.md](ROADMAP.md) milestones
- [ ] Plan upcoming releases
- [ ] Prioritize community contributions

## Known Vulnerabilities (as of v1.2.0)

**Status: DOCUMENTED & MANAGED**

| Severity | Package | Issue | Impact | Mitigation |
|----------|---------|-------|--------|-----------|
| High | Next.js 14 | Cache poisoning in RSC | Low risk* | Use v15+ when available |
| High | Next.js 14 | HTTP request smuggling | Low risk* | Use v15+ when available |
| High | Next.js 14 | DoS via Image Optimizer | Low risk* | Not used in this app |
| Moderate | esbuild | Development server | Low risk | Dev-only, no prod impact |
| Moderate | glob CLI | Command injection | Low risk | Dev-only, ESLint usage |
| ✅ Fixed | PostCSS | CSS XSS | Resolved | Updated to 8.5.19 |

*Low risk for this application because:
- LaunchGuard uses App Router (not affected by Pages Router vulnerability)
- No dynamic user-submitted content cached
- No image optimization feature used

## Upgrade Schedule

### v1.3.0 — Q3 2026
- Upgrade to Next.js 15
- Update dependencies to latest secure versions
- Full regression testing required
- Estimated 2-3 weeks effort

### v1.4.0 — Q4 2026
- Custom rules API
- Webhook support
- No major dependency upgrades expected

### v1.5.0+ — 2027+
- See [ROADMAP.md](ROADMAP.md)

## Monitoring & Alerts

### Enable GitHub Notifications
1. Go to [Settings → Security & analysis](../../settings/security_analysis)
2. Enable Dependabot alerts
3. Enable security alerts
4. Subscribe to [Security Advisories](../../security/advisories)

### CI/CD Pipeline
- GitHub Actions runs on every push/PR
- Tests must pass: `npm run ci`
- Workflows: [.github/workflows/](.github/workflows/)

## Responding to Security Reports

### When a Vulnerability is Reported
1. Acknowledge receipt within 24 hours
2. Assess impact on LaunchGuard
3. Develop patch in private branch
4. Test thoroughly (run full test suite)
5. Create GitHub security advisory
6. Release patch version
7. Announce publicly in releases/security advisories

### When Dependabot Reports Issues
1. Review the alert
2. If auto-fix available: test it
3. If major version: evaluate breaking changes
4. Create PR for dependency update
5. Run full test suite
6. Merge when tests pass
7. Monitor for regressions

## Release Process

### For Patch Releases (e.g., 1.2.1)
```bash
# Update version
npm version patch

# Create release on GitHub
gh release create v1.2.1

# Publish to npm (if applicable)
npm publish
```

### For Minor Releases (e.g., 1.3.0)
```bash
# Update version
npm version minor

# Update CHANGELOG.md
# Create GitHub release notes
gh release create v1.3.0 --draft --notes="..."

# Publish
```

### For Major Releases (e.g., 2.0.0)
1. Update CHANGELOG.md with migration guide
2. Create release notes with breaking changes
3. Update documentation
4. Create GitHub discussions for feedback
5. Publish release

## Monitoring Production

### If Using Vercel
1. Monitor deployment logs
2. Check error tracking (Sentry/similar)
3. Monitor API latency
4. Monitor scan success rates

### Health Check Endpoint
```bash
# Test liveness probe
curl https://launchguard.dev/api/health
```

Response should include:
- `status`: "healthy"
- `version`: Current version
- `rules`: Rule count
- `uptimeSec`: Uptime in seconds

## Troubleshooting Common Issues

### Build Fails
1. Run `npm ci` to clean install
2. Check Node.js version (20+)
3. Review build logs
4. Check for dependency conflicts

### Tests Fail
1. Run `npm test` locally
2. Check test logs for specifics
3. Review recent changes
4. Run `npm run typecheck` for type errors

### Performance Regression
1. Check git log for recent changes
2. Profile with `npm run build`
3. Run full test suite
4. Check for new dependencies

## Documentation Maintenance

### Files to Keep Updated
- README.md — Features, setup, API
- CHANGELOG.md — Release history
- CONTRIBUTING.md — Development guide
- SECURITY.md — Vulnerability disclosure
- FAQ.md — Common issues and solutions
- ROADMAP.md — Future plans
- UPGRADE_PLAN.md — Dependency strategy

### Annual Review Checklist
- [ ] Verify all external links work
- [ ] Update copyright year if needed
- [ ] Review API documentation for changes
- [ ] Check for outdated tool versions
- [ ] Verify examples still work

## Contact

- **Security Issues:** security@launchguard.dev or GitHub Security Advisory
- **Bug Reports:** GitHub Issues
- **Feature Requests:** GitHub Discussions
- **General Questions:** GitHub Discussions or FAQ.md

## Related Documents

- [SECURITY.md](SECURITY.md) — Vulnerability reporting and policies
- [UPGRADE_PLAN.md](UPGRADE_PLAN.md) — Dependency upgrade strategy
- [ROADMAP.md](ROADMAP.md) — Future release timeline
- [CONTRIBUTING.md](CONTRIBUTING.md) — Development guidelines
- [.github/workflows/](../.github/workflows/) — CI/CD configuration
