const CACHE_NAME = 'cricpro-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/pages/admin.html',
  '/pages/crick-store.html',
  '/pages/ongoing-matches.html',
  '/pages/overlay.html',
  '/pages/player-registration.html',
  '/pages/ranking.html',
  '/pages/score-match.html',
  '/css/main.css',
  '/js/admin.js',
  '/js/db.js',
  '/js/home.js',
  '/js/ongoing.js',
  '/js/overlay.js',
  '/js/ranking.js',
  '/js/registration.js',
  '/js/scorer.js',
  '/js/store.js',
  '/js/admin-match-input.js',
  '/js/instant-nrr.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) {
    // Skip non-HTTP requests (chrome-extension:// etc.)
    return;
  }
  const url = new URL(event.request.url);
  if (url.pathname.includes('/socket.io/') || url.pathname.includes('/sync/') || url.pathname.includes('/api/') || url.hostname.includes('slcrickpro-server')) {
    return; // Let API/Socket requests pass completely unintercepted
  }
  // Network first, falling back to cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone).catch(() => {
            // Ignore unsupported request scheme (e.g., chrome-extension://)
          });
        });
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
