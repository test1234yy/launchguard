# Contributing to LaunchGuard

Thank you for interest in contributing to LaunchGuard! This guide will help you get started.

## Development Setup

### Requirements
- Node.js 20+ (`node --version`)
- npm 10+ (`npm --version`)

### Getting Started

1. **Fork and clone** the repository
   ```bash
   git clone https://github.com/YOUR_USERNAME/launchguard.git
   cd launchguard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment** (optional, everything works without this)
   ```bash
   cp .env.example .env.local
   ```

4. **Start the dev server**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests (unit + integration)
npm test

# Run specific test file
npm test -- tests/unit/rules.test.ts

# Watch mode (re-runs on file changes)
npm test -- --watch

# E2E tests (requires build first)
npm run build
npm run test:e2e
```

### Building

```bash
# Production build
npm run build

# Start production server
npm start
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run typecheck

# Full CI pipeline (lint + typecheck + test + build)
npm run ci
```

## Project Structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

**Key directories:**
- `app/` — Next.js App Router pages and API routes
- `lib/scanner/` — Rule engine and scanning logic
- `lib/sources/` — GitHub, ZIP, and demo project loaders
- `lib/report/` — Export formats (JSON, CSV, HTML, SARIF, etc.)
- `components/` — React UI components
- `tests/` — Unit, integration, and E2E tests
- `docs/` — Architecture and guides

## Adding a New Rule

1. **Create the rule** in `lib/scanner/rules/`:
   ```typescript
   export const EXAMPLE_RULE: Rule = {
     id: 'EXA001',
     severity: 'medium',
     category: 'configuration',
     title: 'Example rule title',
     description: 'What the rule detects and why it matters.',
     check: (project: ProjectSnapshot) => {
       // Implement pattern matching logic
       // Return array of {file, line, evidence, remediation?}
       return [];
     },
   };
   ```

2. **Export the rule** in `lib/scanner/rules/index.ts`:
   ```typescript
   export const ALL_RULES: Rule[] = [
     // ... existing rules
     EXAMPLE_RULE,
   ];
   ```

3. **Add tests** in `tests/unit/new-rules.test.ts`:
   ```typescript
   it('EXA001 detects example issue', () => {
     expect(idsFor([f('file.ts', 'problematic code')])).toContain('EXA001');
   });
   ```

4. **Update documentation** in `README.md` (rules table).

## Adding a New API Endpoint

1. **Create the route** in `app/api/[endpoint]/route.ts`:
   ```typescript
   import { apiOk, apiError } from '@/lib/api/respond';

   export const runtime = 'nodejs';
   export const dynamic = 'force-dynamic';

   export async function GET(request: Request): Promise<Response> {
     try {
       // Implement logic
       return apiOk({ data: 'result' });
     } catch (err) {
       return apiError('Error message', 500);
     }
   }
   ```

2. **Use the standard envelope** (`{ok: true, ...}` or `{ok: false, error}`).

3. **Apply rate limiting** if needed:
   ```typescript
   import { clientKeyFrom, limiter } from '@/lib/api/ratelimit';
   
   const decision = limiter.check(clientKeyFrom(request.headers));
   if (!decision.allowed) return apiTooManyRequests(decision.retryAfterSec);
   ```

4. **Add integration tests** in `tests/integration/api.test.ts`.

5. **Update OpenAPI spec** in `lib/api/openapi.ts`.

## Testing Guidelines

### Unit Tests
- One test file per module in `tests/unit/`
- Test public APIs and edge cases
- Mock external dependencies
- Aim for >80% coverage per file

### Integration Tests
- Test full workflows in `tests/integration/`
- Use real (in-memory) implementations where possible
- Test API routes end-to-end

### E2E Tests
- Browser automation with Playwright in `e2e/`
- Test user workflows, not implementation details
- Verify UI interactions and data flow

### Test Patterns

**Expected to pass:**
```typescript
expect(idsFor([f('file.ts', '...')])).toContain('RULE123');
```

**Expected to NOT trigger:**
```typescript
expect(idsFor([f('file.ts', '...')])).not.toContain('RULE123');
```

**API testing:**
```typescript
const response = await request.post('/api/scan', {
  body: JSON.stringify({ mode: 'demo' }),
});
expect(response.ok()).toBeTruthy();
```

## Commit Guidelines

- Write clear commit messages describing the "why"
- Reference issues if applicable
- Keep commits focused and atomic
- Run tests before committing

**Commit message format:**
```
type: brief description

Longer explanation if needed. Reference issue #123.
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `ci`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all tests pass: `npm run ci`
4. Push to your fork and create a PR
5. Write a clear PR description explaining what and why
6. Respond to review feedback
7. Squash commits if requested

## Code Style

- **TypeScript:** Prefer strict types, avoid `any`
- **React:** Use functional components and hooks
- **Naming:** Clear, searchable names (`const userPreferences` not `const up`)
- **Comments:** Only for non-obvious "why", not for "what"
- **Formatting:** Prettier is run automatically by ESLint

## Performance Considerations

- Memoize expensive computations in React (`useMemo`)
- Lazy-load components when possible
- Use deferred state updates for UI responsiveness
- Profile bundle size: `npm run build` shows route sizes
- Avoid re-rendering large lists unnecessarily

## Security Considerations

- Never execute scanned code (`eval`, `new Function`, `require`, etc.)
- Always redact secret-like values before displaying
- Validate and sanitize all inputs at API boundaries
- Check path traversal in file operations
- Don't persist user uploads to disk
- Use rate limiting on expensive operations

See [UPGRADE_PLAN.md](UPGRADE_PLAN.md) for known security vulnerabilities and migration path.

## Debugging

### Dev Server Logs
```bash
npm run dev
# Logs appear in terminal
```

### Browser DevTools
- Inspect React components
- Check network requests in DevTools
- Use `console` object (but not in production code)

### Debugger
```typescript
debugger; // Set breakpoint, inspect with Chrome DevTools
```

## Deployment

LaunchGuard is designed to run on Vercel or any Node.js hosting:

1. Set environment variables (`OPENAI_API_KEY`, `GITHUB_TOKEN` optional)
2. Deploy via git push (Vercel automatic) or:
   ```bash
   npm run build
   npm start
   ```

See [UPGRADE_PLAN.md](UPGRADE_PLAN.md) for Next.js version upgrades.

## Questions?

- Check [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical deep-dives
- Review existing rules for patterns
- Open a discussion in GitHub Issues
- Submit a draft PR for early feedback

## License

All contributions are licensed under MIT by default.
