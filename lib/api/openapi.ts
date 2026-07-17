import { APP_HOMEPAGE, APP_NAME, APP_VERSION } from '../version';
import { LIMITS } from '../sources/common';

/**
 * OpenAPI 3.1 description of the LaunchGuard HTTP API, built as a plain
 * object so it stays type-checkable and cheap to serve. The spec documents
 * the same envelope every route really uses ({ ok, ... } | { ok, error }).
 */

const errorResponse = {
  description: 'Error envelope',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
  },
};

const reportResponse = {
  description: 'Scan completed',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['ok', 'report'],
        properties: {
          ok: { const: true },
          report: { $ref: '#/components/schemas/ScanReport' },
        },
      },
    },
  },
};

const tooManyRequests = {
  description: 'Rate limit exceeded. Retry-After header carries the wait in seconds.',
  headers: { 'Retry-After': { schema: { type: 'string' }, description: 'Seconds until the window resets' } },
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
};

export function buildOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: `${APP_NAME} API`,
      version: APP_VERSION,
      description:
        'Deployment readiness scanning for Next.js and Node.js projects. Scanned content is treated as untrusted data: never executed, never persisted, secrets always redacted.',
      license: { name: 'MIT', url: `${APP_HOMEPAGE}/blob/main/LICENSE` },
    },
    servers: [{ url: '/' }],
    paths: {
      '/api/scan': {
        post: {
          summary: 'Scan the demo project or a public GitHub repository',
          description: 'Rate limited per client (30/min).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      type: 'object',
                      required: ['mode'],
                      properties: { mode: { const: 'demo' } },
                    },
                    {
                      type: 'object',
                      required: ['mode', 'url'],
                      properties: {
                        mode: { const: 'github' },
                        url: { type: 'string', examples: ['https://github.com/owner/repo', 'owner/repo'] },
                      },
                    },
                  ],
                },
              },
            },
          },
          responses: { '200': reportResponse, '400': errorResponse, '429': tooManyRequests, '502': errorResponse },
        },
      },
      '/api/upload': {
        post: {
          summary: 'Scan an uploaded ZIP archive',
          description: `multipart/form-data with a "file" field. Max ${Math.round(
            LIMITS.maxUploadBytes / 1024 / 1024
          )} MB compressed; contents are scanned in memory and never persisted. Rate limited per client (12/min).`,
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: { file: { type: 'string', format: 'binary', description: '.zip archive' } },
                },
              },
            },
          },
          responses: {
            '200': reportResponse,
            '400': errorResponse,
            '413': errorResponse,
            '422': errorResponse,
            '429': tooManyRequests,
          },
        },
      },
      '/api/fix-plan': {
        post: {
          summary: 'Generate a prioritized remediation plan for a report',
          description:
            'Uses the OpenAI API when OPENAI_API_KEY is configured (only redacted findings are sent) and falls back to a deterministic plan otherwise. Rate limited per client (12/min).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['report'],
                  properties: { report: { $ref: '#/components/schemas/ScanReport' } },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Fix plan generated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['ok', 'plan'],
                    properties: {
                      ok: { const: true },
                      plan: {
                        type: 'object',
                        required: ['source', 'markdown'],
                        properties: {
                          source: { enum: ['openai', 'deterministic'] },
                          model: { type: 'string' },
                          markdown: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': errorResponse,
            '429': tooManyRequests,
          },
        },
      },
      '/api/rules': {
        get: {
          summary: 'The full rule catalog',
          responses: {
            '200': {
              description: 'Every rule the scanner evaluates',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['ok', 'count', 'categories', 'rules'],
                    properties: {
                      ok: { const: true },
                      count: { type: 'integer' },
                      categories: { type: 'array', items: { type: 'string' } },
                      rules: { type: 'array', items: { $ref: '#/components/schemas/RuleInfo' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/health': {
        get: {
          summary: 'Liveness probe',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['ok', 'status', 'version', 'rules'],
                    properties: {
                      ok: { const: true },
                      status: { const: 'healthy' },
                      version: { type: 'string' },
                      rules: { type: 'integer' },
                      uptimeSec: { type: 'integer' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/badge': {
        get: {
          summary: 'Readiness badge as SVG',
          parameters: [
            {
              name: 'score',
              in: 'query',
              required: true,
              schema: { type: 'integer', minimum: 0, maximum: 100 },
              description: 'Readiness score to render',
            },
          ],
          responses: {
            '200': { description: 'Badge image', content: { 'image/svg+xml': { schema: { type: 'string' } } } },
            '400': errorResponse,
          },
        },
      },
      '/api/openapi': {
        get: {
          summary: 'This document',
          responses: {
            '200': { description: 'OpenAPI 3.1 spec', content: { 'application/json': { schema: { type: 'object' } } } },
          },
        },
      },
    },
    components: {
      schemas: {
        ErrorEnvelope: {
          type: 'object',
          required: ['ok', 'error'],
          properties: { ok: { const: false }, error: { type: 'string' } },
        },
        RuleInfo: {
          type: 'object',
          required: ['id', 'title', 'severity', 'category', 'description'],
          properties: {
            id: { type: 'string', examples: ['SEC001'] },
            title: { type: 'string' },
            severity: { $ref: '#/components/schemas/Severity' },
            category: { type: 'string' },
            description: { type: 'string' },
          },
        },
        Severity: { enum: ['critical', 'high', 'medium', 'low', 'info'] },
        Finding: {
          type: 'object',
          required: ['id', 'ruleId', 'title', 'severity', 'category', 'file', 'evidence', 'remediation'],
          properties: {
            id: { type: 'string' },
            ruleId: { type: 'string' },
            title: { type: 'string' },
            severity: { $ref: '#/components/schemas/Severity' },
            category: { type: 'string' },
            file: { type: 'string' },
            line: { type: 'integer' },
            evidence: { type: 'string', description: 'Already redacted; never contains raw secrets' },
            remediation: { type: 'string' },
          },
        },
        ScanReport: {
          type: 'object',
          required: ['id', 'projectName', 'source', 'scannedAt', 'score', 'grade', 'summary', 'findings'],
          properties: {
            id: { type: 'string' },
            projectName: { type: 'string' },
            source: {
              type: 'object',
              properties: { type: { enum: ['demo', 'github', 'zip'] }, ref: { type: 'string' } },
            },
            scannedAt: { type: 'string', format: 'date-time' },
            durationMs: { type: 'integer' },
            fingerprint: { type: 'string', description: 'Content-stable hash: identical scan input ⇒ identical value' },
            fileCount: { type: 'integer' },
            skippedFiles: { type: 'integer' },
            rulesEvaluated: { type: 'integer' },
            suppressedFindings: { type: 'integer' },
            fileTypes: { type: 'object', additionalProperties: { type: 'integer' } },
            score: { type: 'integer', minimum: 0, maximum: 100 },
            grade: { type: 'string' },
            summary: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                bySeverity: { type: 'object', additionalProperties: { type: 'integer' } },
                byCategory: { type: 'object', additionalProperties: { type: 'integer' } },
              },
            },
            findings: { type: 'array', items: { $ref: '#/components/schemas/Finding' } },
            notes: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  };
}
