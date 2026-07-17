# Security Policy

## Security Model

LaunchGuard is designed with security as a first-class concern. The application never executes, imports, installs, or builds scanned code.

### Safety Guarantees

**Scanned code is never:**
- Executed via `eval()`, `Function()`, or dynamic imports
- Installed via `npm install` or package managers
- Imported into the Node.js module system
- Built or compiled
- Interpreted as configuration or instructions
- Written to disk during scanning

**User uploads:**
- Validated for size before decompression
- Scanned entirely in-memory
- Never persisted to disk
- Path-traversal protected
- Cleaned up immediately after scan

**Sensitive values:**
- Always redacted in output (except evidence field for remediation)
- Environment variables sanitized before display
- API keys/tokens masked with `***`
- Never sent to OpenAI unless already redacted

## Reporting Security Vulnerabilities

If you discover a security vulnerability in LaunchGuard:

1. **Do NOT open a public GitHub issue**
2. **Email** security details to: (security contact - TBD)
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

We will:
- Acknowledge receipt within 48 hours
- Investigate and validate the issue
- Develop a fix in private
- Coordinate public disclosure timing
- Credit the reporter (unless anonymity preferred)

## Known Vulnerabilities

### Current Dependencies (v1.2.0)

| Severity | Package | Issue | Status | Fix ETA |
|----------|---------|-------|--------|---------|
| High | Next.js 14.2.35 | Cache poisoning in RSC | Documented | Next.js 15.x |
| High | Next.js 14.2.35 | HTTP request smuggling | Documented | Next.js 15.x |
| High | Next.js 14.2.35 | DoS via Image Optimizer | Documented | Next.js 15.x |
| Moderate | Glob | Command injection in CLI | Documented | Next.js 15.x |
| ✅ Fixed | PostCSS < 8.5.19 | XSS in CSS stringify | Resolved | 8.5.19+ |

See [UPGRADE_PLAN.md](UPGRADE_PLAN.md) for detailed vulnerability analysis.

### Why v14 is Still Used

- **Risk Assessment:** Vulnerabilities don't affect this specific app architecture
  - RSC poisoning: No dynamic user-submitted content cached
  - Request smuggling: Uses standard HTTP patterns
  - Image Optimizer: Not used in scanning
- **Stability:** Major upgrades (v14→15/16) have breaking changes
- **Timeline:** Planned upgrade documented in UPGRADE_PLAN.md

## Security Best Practices

### When Deploying LaunchGuard

1. **Environment Variables**
   - Keep `OPENAI_API_KEY` and `GITHUB_TOKEN` secret
   - Use `.env.local` (never committed to git)
   - Rotate keys periodically

2. **Rate Limiting**
   - API endpoints implement per-client rate limits
   - Protects against abuse and resource exhaustion
   - `429 Too Many Requests` returns `Retry-After` header

3. **File Uploads**
   - 15 MB maximum file size enforced
   - Only `.zip` format accepted
   - Path traversal protection enabled
   - In-memory processing only

4. **Secrets Handling**
   - All redacted before output
   - Evidence field shows masked values
   - Config file suppression logged in report

## Scanning Safety

### What's Protected

✅ **Environment files** (.env, .env.local) — detected as SEC001
✅ **Hard-coded secrets** (passwords, tokens) — detected as SEC002/SEC003
✅ **Private keys** (RSA, certificates) — detected as SEC004
✅ **API keys and credentials** — detected as SEC006/SEC007
✅ **Webhook URLs** (Slack, Discord) — detected as SEC006

### What's NOT Scanned

- ❌ Binary files (images, PDFs, compiled code)
- ❌ Node modules (configurable via `.gitignore`)
- ❌ Build artifacts (node_modules, dist, .next)
- ❌ Files >2MB (QUA008 rule flags this)

### Scan Scope

- Configurable via `launchguard.config.json` in scanned repo
- Rules can be suppressed per-project
- Minimum severity threshold can be set
- All suppressions disclosed in report

## Access Control

LaunchGuard is stateless and has no authentication:

- ✅ **No database** — everything is ephemeral
- ✅ **No login** — anonymous public use
- ✅ **No session storage** — server-side (except rate limiting key derivation)
- ✅ **No personal data** — only scan reports

**Rate limiting** is the only access control:
- Per-client IP address (derived from request headers)
- Fixed-window limiter in memory
- Returns `429 Too Many Requests` when exceeded

## Dependency Security

### Monitoring

- `npm audit` checked regularly
- Security advisories monitored
- Critical issues trigger hotfix releases
- Version updates tested before release

### Pinning

- All production dependencies pinned to specific versions
- Package-lock.json committed to git
- Reproducible builds guaranteed

### Auditing

```bash
npm audit                    # Check for vulnerabilities
npm audit fix                # Auto-fix safe updates
npm audit fix --force        # Includes breaking changes
npm outdated                 # Check for updates
```

## Transport Security

- **HTTPS Only** — Enforce in production deployments
- **CSP Headers** — Content Security Policy configured
- **HSTS** — See ADV007 rule for HTTP Strict Transport Security
- **CORS** — Configured for same-origin by default

## Data Handling

### Uploads
- Received via `multipart/form-data`
- Size-checked before buffering
- Decompressed in memory only
- Bytes discarded after processing
- Never logged or cached

### Exports
- User controls output format
- Can include sensitive rule evidence
- Recommends keeping reports confidential
- SARIF format for GitHub integration

### Local Storage
- Scan history stored in browser (`localStorage`)
- Never sent to server
- User controls retention
- Cleared on cache/history clear

## Compliance

LaunchGuard does not:
- Collect personal data
- Use analytics or tracking
- Send scans to external services (except optional OpenAI)
- Store reports server-side
- Require authentication or PII

**When OPENAI_API_KEY is set:**
- Only redacted findings sent to OpenAI
- Raw file contents NEVER shared
- Raw credentials NEVER shared
- Review OpenAI's data policy

## Testing

- **Unit tests** verify redaction behavior
- **Integration tests** validate end-to-end safety
- **E2E tests** confirm no data leaks
- **Fuzzing** with adversarial inputs
- **Static analysis** via ESLint

## Incident Response

If a security vulnerability is discovered:

1. **Fix is developed privately**
2. **Tests added to prevent regression**
3. **Patch released to npm**
4. **GitHub advisory posted**
5. **Reporter credited** (if desired)

## Future Security Improvements

- [ ] Content Security Policy hardening
- [ ] Signed releases and checksums
- [ ] Security audit by third party
- [ ] SBOM (Software Bill of Materials)
- [ ] Next.js 15/16 upgrade (security patches)

## Questions?

See [CONTRIBUTING.md](CONTRIBUTING.md) for development security guidelines.

Report security issues responsibly to: (security contact - TBD)
