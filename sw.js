/* Service worker: pre-cache the app shell so the game runs fully offline.
 * CACHE_NAME is rewritten to dixmille-build-<n> at deploy time, so every
 * deploy invalidates the cache and installed apps pick up the new version. */
const CACHE_NAME = 'dixmille-v4';

const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/version.js',
  './js/scoring.js',
  './js/ai.js',
  './js/game.js',
  './js/ui.js',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // 'no-cache' revalidates against the server: GitHub Pages serves with
      // a 10-minute HTTP cache, which could otherwise pre-cache stale files
      // right after a deploy.
      .then((cache) =>
        cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'no-cache' })))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* Cache-first: everything the game needs is pre-cached; the network is only
 * a fallback (and refreshes the cache when reachable). */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
