/*
 * Al-Basmi Orth — offline application shell.
 * Same-origin app assets are cached as they are loaded; navigation falls back
 * to the last successfully cached app shell when the network is unavailable.
 */
const CACHE_PREFIX = 'albasmi-orth-pwa-';
const CACHE_VERSION = 'v1';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const APP_SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Do not cache API responses: sync and AI must reflect real network status.
  if (sameOrigin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__'))) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(APP_SHELL, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match(APP_SHELL)) ||
          new Response('Al-Basmi Orth is not available offline yet. Open it once while connected to the internet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }
    })());
    return;
  }

  if (sameOrigin) {
    // Cache-first for versioned JS/CSS, WASM, icons and other app resources.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline resource unavailable' });
      }
    })());
    return;
  }

  // Cache third-party font assets only after the browser has successfully fetched them.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return cached || new Response('', { status: 504, statusText: 'Offline font unavailable' });
      }
    })());
  }
});
