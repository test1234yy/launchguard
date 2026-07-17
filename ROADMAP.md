# LaunchGuard Roadmap

## Vision
LaunchGuard helps development teams ship with confidence by automatically scanning for deployment risks before they become production incidents.

## Current Version: 1.2.0
- 62 deterministic scanning rules
- Multiple report formats (JSON, CSV, XML, SARIF, HTML, Markdown)
- Client-side report comparison and diff
- OpenAI-powered fix plans with deterministic fallback
- PWA support with offline-capable app shell
- Comprehensive test coverage (270+ tests)

## Planned Releases

### 1.3.0 (Next.js 15 Upgrade) — Q3 2026
**Priority:** High (Security & Performance)

- **Next.js 15 Migration**
  - Upgrade from Next.js 14.2.35 to 15.x
  - Resolve RSC cache poisoning vulnerability
  - Resolve HTTP request smuggling vulnerability
  - Breaking changes: Full regression testing required
  - Estimated effort: 2-3 weeks

- **Enhanced Performance**
  - Implement server-side caching for repeat scans
  - Optimize report generation for large projects (>10k files)
  - Bundle size analysis and optimization
  - Image optimization for badges

- **Monitoring & Observability**
  - OpenTelemetry integration for production monitoring
  - Performance metrics tracking
  - Error rate monitoring
  - Scan duration analytics

### 1.4.0 (Extensibility) — Q4 2026
**Priority:** Medium (Developer Experience)

- **Custom Rules API**
  - Allow users to define project-specific scanning rules
  - Rule registry/marketplace for community rules
  - YAML configuration for custom rules

- **Webhook Support**
  - Scan result webhooks for CI/CD integration
  - GitHub Actions integration with automatic comments
  - GitLab CI integration

- **Enhanced Reporting**
  - Custom report templates
  - Baseline establishment and trend tracking
  - Compliance report generation (SOC2, PCI-DSS)

### 1.5.0 (Enterprise Features) — Q1 2027
**Priority:** Medium (Business Value)

- **Multi-Project Management**
  - Dashboard for scanning multiple repositories
  - Project-level configuration and policies
  - Scanning as a service (SaaS)

- **Advanced Analytics**
  - Security score trends over time
  - Rule adoption metrics
  - Fix plan effectiveness tracking

- **SSO & RBAC**
  - Single sign-on integration (OAuth2, SAML)
  - Role-based access control for multi-tenant deployments
  - Audit logging for compliance

### 2.0.0 (Advanced Analysis) — 2027-2028
**Priority:** Low (Innovation)

- **ML-Powered Analysis**
  - Anomaly detection in code patterns
  - Risk scoring refinement via ML models
  - Predictive security insights

- **Multi-Language Support**
  - Extend rules beyond Node.js/Next.js projects
  - Python/Django support
  - Go/Rust support
  - Java/Spring Boot support

- **Interactive Remediation**
  - Automated fixes for certain rule types
  - Pull request generation for fixes
  - Interactive walkthrough for complex remediation

## Known Limitations & Workarounds

### Current
- **Single-language focus:** Currently JavaScript/TypeScript/Next.js only
  - Workaround: Can analyze projects with these technologies mixed with others
  - Future: Multi-language support in 2.0

- **No authentication:** LaunchGuard is stateless
  - Workaround: Deploy behind auth layer (Vercel authentication, etc.)
  - Future: SSO in 1.5

- **In-memory scanning:** Entire project loaded into memory
  - Workaround: Project size limit of ~500MB
  - Future: Streaming processing in 2.0

- **No webhook support:** Can't push results to external services automatically
  - Workaround: Manual export and integration
  - Future: Webhooks in 1.4

## Breaking Changes Policy

- **Semantic versioning:** MAJOR.MINOR.PATCH
- **MAJOR version:** Breaking changes (1.0 → 2.0)
- **MINOR version:** New features, potentially breaking in unusual edge cases
- **PATCH version:** Bug fixes only

Breaking changes will be:
1. Clearly documented in CHANGELOG.md
2. Announced with 30 days notice
3. Migration guide provided
4. Support for 2 previous versions maintained

## Contributing to the Roadmap

Want to influence the roadmap? 

1. **Open an issue** — Describe your use case and needs
2. **Start a discussion** — Share feedback on proposed features
3. **Vote on issues** — React with 👍 to prioritize features
4. **Submit a PR** — Implement features from the roadmap

## Feedback

Help shape LaunchGuard's future:

- **Feature requests:** GitHub Issues with [FEATURE] tag
- **Bug reports:** GitHub Issues with [BUG] tag
- **Discussions:** GitHub Discussions for design conversations
- **Security:** See [SECURITY.md](SECURITY.md) for responsible disclosure

## Timeline Estimates

Estimates are best-effort and subject to change based on:
- Community feedback and contribution
- Dependency updates and security issues
- Technical discoveries during development
- Resource availability

All dates are approximate and may shift by 1-2 quarters.

## Success Metrics

We'll measure success by:

- **Adoption:** Number of projects scanned
- **Engagement:** Community contributions and discussions
- **Impact:** Security issues prevented through early detection
- **Quality:** Test coverage and bug resolution rate
- **Performance:** Scan speed and reliability

## Questions?

- Check [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines
- Review [ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical details
- Open an issue with the [QUESTION] tag
