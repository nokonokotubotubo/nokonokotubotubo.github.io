// Service Worker - 可読性重視版
const CACHE_NAME = 'mysews-v1';

const urlsToCache = [
    '/mss/',
    '/mss/app.js',
    '/mss/styles.css',
    '/mss/manifest.json',
    '/mss/vite.svg',
    '/mss/icon-192.svg'
];

// インストール時のキャッシュ処理
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                return cache.addAll(urlsToCache);
            })
            .catch(function(error) {
                console.error('[SW] Cache failed:', error);
            })
    );
});

// リクエスト処理
self.addEventListener('fetch', function(event) {
    // MSS関連のリクエストのみ処理
    if (!event.request.url.includes('/mss/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
            .catch(function(error) {
                if (event.request.destination === 'document') {
                    return caches.match('/mss/');
                }
            })
    );
});

// 古いキャッシュの削除
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
