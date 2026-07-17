import type { ProjectSnapshot, ScannedFile } from '../scanner/types';

/**
 * A synthetic, intentionally-flawed project used by the no-key demo scan.
 *
 * These files are plain string literals defined here — they are DATA, not a
 * real repository, and are never executed. They are crafted to trigger a broad
 * cross-section of rules so the demo shows off the dashboard. The "secrets"
 * below are obviously fake, well-formed-looking tokens for pattern matching.
 */

function file(path: string, content: string): ScannedFile {
  const size = Buffer.byteLength(content, 'utf-8');
  return { path, content, size, binary: false };
}

const PACKAGE_JSON = `{
  "name": "acme-storefront",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma migrate dev && next build",
    "start": "next start",
    "test": "echo \\"Error: no test specified\\" && exit 1"
  },
  "dependencies": {
    "next": "latest",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "request": "^2.88.2",
    "colors": "1.4.1",
    "@prisma/client": "^5.9.0",
    "stripe": "*"
  },
  "devDependencies": {
    "prisma": "^5.9.0",
    "typescript": "^5.3.0"
  }
}
`;

const ENV_PRODUCTION = `# Production configuration for Acme Storefront
DATABASE_URL=postgresql://acme_admin:your-password-here@db.internal.acme.co:5432/store
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key_here
OPENAI_API_KEY=sk-proj-your_openai_key_here
JWT_SECRET=super-secret-signing-key-do-not-share-9x8y7z
`;

const NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  productionBrowserSourceMaps: true,
  env: {
    NEXT_PUBLIC_STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  },
};

module.exports = nextConfig;
`;

const DB_TS = `import { PrismaClient } from '@prisma/client';

// TODO: move this to an env var before launch
const FALLBACK_ADMIN_PASSWORD = "your-secure-password-here";

export const prisma = new PrismaClient();

export function connectionString() {
  return process.env.DATABASE_URL ?? process.env.SHADOW_DATABASE_URL;
}

export const adminToken = "your-github-token-here";
`;

const API_ROUTE = `import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const analyticsKey = process.env.ANALYTICS_WRITE_KEY;
  const region = process.env.FLY_REGION;
  const users = await prisma.user.findMany();
  res.status(200).json({ users, analyticsKey, region });
}
`;

const SCHEMA_PRISMA = `datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String?
}
`;

const DOCKERFILE = `FROM node:latest

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
`;

const README = `# Acme Storefront

A demo storefront. Run \`npm run dev\` to start.
`;

const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Zx9DEMOoNLYkeyMATERIALdoNOTuseANYWHEREthisISfake0000
Qf4kEXAMPLExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
-----END RSA PRIVATE KEY-----
`;

/** Build the demo project snapshot fresh on each call (callers may mutate). */
export function demoProject(): ProjectSnapshot {
  return {
    name: 'acme-storefront (demo)',
    files: [
      file('package.json', PACKAGE_JSON),
      file('.env.production', ENV_PRODUCTION),
      file('next.config.js', NEXT_CONFIG),
      file('lib/db.ts', DB_TS),
      file('pages/api/users.ts', API_ROUTE),
      file('prisma/schema.prisma', SCHEMA_PRISMA),
      file('Dockerfile', DOCKERFILE),
      file('README.md', README),
      file('certs/server.pem', PRIVATE_KEY),
    ],
  };
}

export const DEMO_NOTES = [
  'This is a synthetic demo project. Every credential shown is fake and redacted.',
  'No network access or API key is required for the demo scan.',
];
