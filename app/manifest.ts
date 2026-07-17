import type { MetadataRoute } from 'next';

/** Web app manifest — makes LaunchGuard installable as a PWA. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LaunchGuard — Deployment readiness scanner',
    short_name: 'LaunchGuard',
    description:
      'Scan Next.js and Node.js projects for deployment risks: committed secrets, missing env docs, unsafe dependencies, Docker and Prisma problems, and more.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b1020',
    theme_color: '#0b1020',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
