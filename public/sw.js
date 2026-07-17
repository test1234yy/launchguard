/*
 * LaunchGuard service worker (PWA support).
 *
 * Strategy:
 *  - /api/*            → network only (scans must never be served stale)
 *  - /_next/static/*   → cache-first (content-hashed, immutable)
 *  - navigations + app shell assets → network-first with cache fallback,
 *    so the shell still opens offline after a first visit.
 *
 * Keep CACHE in sync with APP_VERSION (lib/version.ts); bumping it drops old caches.
 */
const CACHE = 'launchguard-v1.2.0';
const SHELL = ['/', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // network only

  if (url.pathname.startsWith('/_next/static/')) {
    // Immutable, content-hashed assets: cache-first.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // App shell and navigations: network-first, cache fallback for offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (request.mode === 'navigate' || SHELL.includes(url.pathname))) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || (request.mode === 'navigate' ? caches.match('/') : undefined))
      )
  );
});
