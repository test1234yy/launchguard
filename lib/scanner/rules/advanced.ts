import type { Rule, RuleMatch } from '../types';
import { eachLine, findRootFile, getRootPackageJson, scannableText } from './helpers';

/** ADV001: Missing performance monitoring/APM. */
export const missingAPM: Rule = {
  id: 'ADV001',
  title: 'No application performance monitoring (APM) configured',
  severity: 'low',
  category: 'configuration',
  description: 'Production deployments benefit from APM to track latency, errors, and resource usage.',
  check(project) {
    const pkg = getRootPackageJson(project);
    if (!pkg) return [];
    const deps = { ...pkg.pkg.dependencies, ...pkg.pkg.devDependencies };
    const apmTools = ['datadog', 'newrelic', 'elastic', 'sentry', 'rollbar', 'axiom', 'honeycomb'];
    const hasAPM = apmTools.some((tool) => Object.keys(deps).some((dep) => dep.includes(tool)));
    if (hasAPM) return [];
    return [
      {
        file: 'package.json',
        evidence: 'No APM or error-tracking library found in dependencies.',
        remediation: 'Consider adding Sentry, Datadog, New Relic, or similar for production observability.',
      },
    ];
  },
};

/** ADV002: Missing structured logging library. */
export const missingStructuredLogging: Rule = {
  id: 'ADV002',
  title: 'No structured logging library',
  severity: 'low',
  category: 'configuration',
  description: 'Structured logging (JSON, contextual fields) improves production debugging and log aggregation.',
  check(project) {
    const pkg = getRootPackageJson(project);
    if (!pkg) return [];
    const deps = { ...pkg.pkg.dependencies, ...pkg.pkg.devDependencies };
    const loggers = ['pino', 'winston', 'bunyan', 'loglevel', 'debug'];
    const hasLogger = loggers.some((logger) => Object.keys(deps).includes(logger));
    if (hasLogger) return [];
    return [
      {
        file: 'package.json',
        evidence: 'No structured logging library (pino, winston, bunyan) found.',
        remediation: 'Add a logging library for production monitoring; `console.log` is insufficient for production.',
      },
    ];
  },
};

/** ADV003: Missing request/response validation middleware. */
export const missingValidation: Rule = {
  id: 'ADV003',
  title: 'No request validation library',
  severity: 'medium',
  category: 'configuration',
  description: 'Unvalidated inputs lead to bugs and security issues.',
  check(project) {
    const pkg = getRootPackageJson(project);
    if (!pkg) return [];
    const deps = { ...pkg.pkg.dependencies, ...pkg.pkg.devDependencies };
    const validators = ['zod', 'joi', 'yup', 'superstruct', 'io-ts', 'class-validator'];
    const hasValidator = validators.some((v) => Object.keys(deps).includes(v));
    if (hasValidator) return [];
    return [
      {
        file: 'package.json',
        evidence: 'No schema validation library found.',
        remediation:
          'Add Zod, Yup, Joi or similar for request/response validation. TypeScript types alone do not validate runtime data.',
      },
    ];
  },
};

/** ADV004: Missing content security policy header documentation. */
export const missingCSP: Rule = {
  id: 'ADV004',
  title: 'No Content Security Policy documented',
  severity: 'medium',
  category: 'configuration',
  description: 'CSP headers protect against XSS by restricting resource origins.',
  check(project) {
    const hasCSP = project.files.some(
      (f) =>
        !f.binary &&
        (f.content.includes('Content-Security-Policy') || f.content.includes('csp') || f.content.includes('CSP'))
    );
    if (hasCSP) return [];
    const hasNextConfig = project.files.some((f) => f.path.includes('next.config'));
    if (hasNextConfig) {
      return [
        {
          file: 'next.config.mjs',
          evidence: 'No CSP headers configured in Next.js config or middleware.',
          remediation:
            'Set Content-Security-Policy headers in `next.config.mjs` via `headers()` or in middleware to protect against XSS.',
        },
      ];
    }
    return [];
  },
};

/** ADV005: Missing CORS configuration documentation. */
export const missingCORSConfig: Rule = {
  id: 'ADV005',
  title: 'CORS configuration not documented',
  severity: 'low',
  category: 'configuration',
  description: 'Explicit CORS configuration prevents accidental exposure to unintended origins.',
  check(project) {
    const hasCORS = project.files.some(
      (f) =>
        !f.binary &&
        (f.content.includes('cors') ||
          f.content.includes('Access-Control-Allow-Origin') ||
          f.content.includes('CORS'))
    );
    if (hasCORS) return [];
    const hasDocs = project.files.some((f) => f.path === 'README.md' && f.content.includes('CORS'));
    if (hasDocs) return [];
    return [
      {
        file: '(project)',
        evidence: 'CORS configuration not found in code or README.',
        remediation: 'Document CORS origins explicitly in middleware or next.config.mjs headers().',
      },
    ];
  },
};

/** ADV006: Missing rate limiting / DDoS protection. */
export const missingRateLimiting: Rule = {
  id: 'ADV006',
  title: 'No rate limiting or DDoS protection visible',
  severity: 'medium',
  category: 'configuration',
  description: 'Rate limiting protects APIs from abuse and DDoS attacks.',
  check(project) {
    const pkg = getRootPackageJson(project);
    if (!pkg) return [];
    const deps = { ...pkg.pkg.dependencies, ...pkg.pkg.devDependencies };
    const limiters = ['express-rate-limit', 'ratelimit', 'bottleneck', 'p-ratelimit'];
    const hasLimiter = limiters.some((l) => Object.keys(deps).includes(l));
    if (hasLimiter) return [];
    const hasCode = project.files.some(
      (f) =>
        !f.binary &&
        (f.content.includes('rateLimit') || f.content.includes('rate_limit') || f.content.includes('throttle'))
    );
    if (hasCode) return [];
    return [
      {
        file: 'package.json',
        evidence: 'No rate-limiting library found; API routes unprotected.',
        remediation:
          'Add express-rate-limit or implement rate limiting in middleware to protect against abuse and DDoS.',
      },
    ];
  },
};

/** ADV007: Missing HSTS (HTTP Strict Transport Security) header. */
export const missingHSTS: Rule = {
  id: 'ADV007',
  title: 'No HSTS header configured',
  severity: 'low',
  category: 'configuration',
  description: 'HSTS forces browsers to use HTTPS, preventing downgrade attacks.',
  check(project) {
    const hasHSTS = project.files.some(
      (f) =>
        !f.binary &&
        (f.content.includes('Strict-Transport-Security') ||
          f.content.includes('HSTS') ||
          f.content.includes('max-age='))
    );
    if (hasHSTS) return [];
    return [
      {
        file: 'next.config.mjs',
        evidence: 'No HSTS header found in config or middleware.',
        remediation:
          'Set `Strict-Transport-Security: max-age=31536000; includeSubDomains` header in next.config.mjs headers().',
      },
    ];
  },
};

/** ADV008: Build not configured to output source map integrity hashes. */
export const missingIntegrityHashes: Rule = {
  id: 'ADV008',
  title: 'No subresource integrity (SRI) configured',
  severity: 'low',
  category: 'nextjs',
  description: 'SRI hashes protect against tampering with CDN-served assets.',
  check(project) {
    const hasNext = project.files.some((f) => f.path === 'next.config.mjs' && f.content.includes('integrity'));
    if (hasNext) return [];
    return [
      {
        file: 'next.config.mjs',
        evidence: 'No subresource integrity configuration found.',
        remediation:
          'Enable SRI hashing for all generated JS/CSS to prevent CDN tampering; consider using Subresource Integrity headers.',
      },
    ];
  },
};

/** ADV009: API routes lack input sanitization validation. */
export const missingInputSanitization: Rule = {
  id: 'ADV009',
  title: 'No obvious input sanitization in API routes',
  severity: 'high',
  category: 'configuration',
  description: 'Unsanitized input allows injection attacks.',
  check(project) {
    const apiFiles = project.files.filter((f) => f.path.startsWith('app/api/') && f.path.endsWith('.ts'));
    const matches: RuleMatch[] = [];
    for (const file of apiFiles) {
      if (file.binary) continue;
      const hasSanitization = file.content.includes('sanitize') ||
        file.content.includes('escape') ||
        file.content.includes('validate') ||
        file.content.includes('zod') ||
        file.content.includes('joi');
      if (!hasSanitization) {
        matches.push({
          file: file.path,
          evidence: `API route ${file.path} has no visible input validation or sanitization.`,
          remediation:
            'Add schema validation (Zod, Yup) to all API routes to validate and sanitize user input before processing.',
        });
      }
    }
    return matches.slice(0, 5);
  },
};

/** ADV010: No explicit error boundary or global error handler. */
export const missingErrorHandler: Rule = {
  id: 'ADV010',
  title: 'No global error handler or ErrorBoundary component',
  severity: 'medium',
  category: 'nextjs',
  description: 'Unhandled errors crash the app or leak sensitive details in stack traces.',
  check(project) {
    const hasErrorBoundary = project.files.some(
      (f) => !f.binary && (f.content.includes('ErrorBoundary') || f.content.includes('error.tsx'))
    );
    if (hasErrorBoundary) return [];
    const hasGlobalHandler = project.files.some(
      (f) =>
        !f.binary && f.path.includes('app/') && (f.content.includes('catch') || f.content.includes('middleware'))
    );
    if (hasGlobalHandler) return [];
    return [
      {
        file: 'app/',
        evidence: 'No error.tsx, ErrorBoundary component, or global error handler found.',
        remediation:
          'Create `app/error.tsx` (Error Boundary) and `app/global-error.tsx` (Next.js 13 error handler) to catch and log unhandled errors.',
      },
    ];
  },
};

export const advancedRules: Rule[] = [
  missingAPM,
  missingStructuredLogging,
  missingValidation,
  missingCSP,
  missingCORSConfig,
  missingRateLimiting,
  missingHSTS,
  missingIntegrityHashes,
  missingInputSanitization,
  missingErrorHandler,
];
