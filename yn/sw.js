// Service Worker（プロジェクトルート対応版）
const CACHE_NAME = 'your-news-v1.0.0';
const BASE_PATH = '/yn';
const CACHE_URLS = [
    BASE_PATH + '/',
    BASE_PATH + '/index.html',
    BASE_PATH + '/styles/main.css',
    BASE_PATH + '/styles/responsive.css',
    BASE_PATH + '/styles/components.css',
    BASE_PATH + '/styles/themes.css',
    BASE_PATH + '/scripts/app.js',
    BASE_PATH + '/scripts/data-manager.js',
    BASE_PATH + '/scripts/rss-fetcher.js',
    BASE_PATH + '/scripts/article-card.js',
    BASE_PATH + '/scripts/ui-controller.js',
    BASE_PATH + '/scripts/ai-engine.js',
    BASE_PATH + '/scripts/utils.js',
    BASE_PATH + '/pages/rss-manager.html',
    BASE_PATH + '/pages/favorites.html',
    BASE_PATH + '/pages/settings.html',
    BASE_PATH + '/assets/manifest.json',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js'
];

// インストール時のキャッシュ
self.addEventListener('install', (event) => {
    console.log('[SW] Service Worker インストール開始');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] キャッシュオープン成功');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => {
                console.log('[SW] 全ファイルキャッシュ完了');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] キャッシュエラー:', error);
            })
    );
});

// アクティベート時の古いキャッシュ削除
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker アクティベート');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('your-news-')) {
                        console.log('[SW] 古いキャッシュ削除:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// フェッチ時のキャッシュ戦略
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // プロジェクトルート外のリクエストは無視
    if (!url.pathname.startsWith(BASE_PATH) && !url.hostname.includes('cdn.jsdelivr.net')) {
        return;
    }
    
    // HTMLファイルは常にネットワークを優先
    if (event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }
    
    // その他のリソースはキャッシュファーストで対応
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                
                return fetch(event.request)
                    .then((response) => {
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                        
                        return response;
                    });
            })
            .catch(() => {
                if (event.request.destination === 'image') {
                    return new Response('<svg width="200" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="120" fill="#e0e0e0"/><text x="100" y="60" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="14" fill="#666">オフライン</text></svg>', {
                        headers: { 'Content-Type': 'image/svg+xml' }
                    });
                }
                
                return new Response('オフラインです', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            })
    );
});

console.log('[SW] Service Worker loaded successfully');
