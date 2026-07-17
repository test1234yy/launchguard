'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker in production. Silent no-op where
 * unsupported; failures never affect the app.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failing (private mode, unsupported) is fine — the app
      // simply behaves as a regular website.
    });
  }, []);
  return null;
}
