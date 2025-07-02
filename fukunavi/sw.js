const CACHE_NAME = 'fukuanvi-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://unpkg.com/vue@3.0.0',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/js/all.min.js'
];

// Install event - キャッシュを作成
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - キャッシュからレスポンスを返す
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュにあれば返す
        if (response) {
          return response;
        }
        
        // 天気APIの場合は常にネットワークから取得
        if (event.request.url.includes('api.open-meteo.com') || 
            event.request.url.includes('nominatim.openstreetmap.org')) {
          return fetch(event.request);
        }
        
        return fetch(event.request);
      }
    )
  );
});

// Activate event - 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
