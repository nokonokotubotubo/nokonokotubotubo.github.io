const CACHE_NAME = 'mysews-v1';
const urlsToCache = [
  '/mss/',
  '/mss/app.js',
  '/mss/styles.css',
  '/mss/manifest.json',
  '/mss/vite.svg',
  '/mss/icon-192.svg'
];

self.addEventListener('install', function(event) {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Caching files');
        return cache.addAll(urlsToCache);
      })
      .catch(function(error) {
        console.error('[SW] Cache failed:', error);
      })
  );
});

self.addEventListener('fetch', function(event) {
  if (!event.request.url.includes('/mss/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          console.log('[SW] Found in cache:', event.request.url);
          return response;
        }
        
        console.log('[SW] Fetching:', event.request.url);
        return fetch(event.request);
      })
      .catch(function(error) {
        console.log('[SW] Fetch failed:', error);
        if (event.request.destination === 'document') {
          return caches.match('/mss/');
        }
      })
  );
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
