// Service Worker - PWA機能実装（仕様書準拠）
const CACHE_NAME = 'your-news-v1.0.0';
const STATIC_CACHE_NAME = 'your-news-static-v1.0.0';
const DATA_CACHE_NAME = 'your-news-data-v1.0.0';

// キャッシュ対象ファイル（仕様書記載ファイル構成準拠）
const STATIC_FILES = [
  '/',
  '/index.html',
  '/pages/rss-manager.html',
  '/pages/favorites.html',
  '/pages/settings.html',
  '/styles/main.css',
  '/styles/responsive.css',
  '/styles/components.css',
  '/styles/themes.css',
  '/scripts/app.js',
  '/scripts/data-manager.js',
  '/scripts/rss-fetcher.js',
  '/scripts/ai-engine.js',
  '/scripts/ui-controller.js',
  '/scripts/article-card.js',
  '/scripts/utils.js',
  '/assets/manifest.json',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js'
];

// オフライン対応するAPI（RSS以外）
const DATA_URLS = [
  '/api/',
  'https://api.rss2json.com/',
  'https://api.allorigins.win/',
  'https://corsproxy.io/'
];

// インストール時の処理
self.addEventListener('install', event => {
  console.log('[SW] Install Event');
  
  event.waitUntil(
    Promise.all([
      // 静的ファイルキャッシュ
      caches.open(STATIC_CACHE_NAME).then(cache => {
        console.log('[SW] Pre-caching static files');
        return cache.addAll(STATIC_FILES);
      }),
      
      // データキャッシュ初期化
      caches.open(DATA_CACHE_NAME).then(cache => {
        console.log('[SW] Data cache initialized');
        return cache;
      })
    ]).then(() => {
      console.log('[SW] Installation completed');
      // 即座に新しいService Workerをアクティブに
      return self.skipWaiting();
    })
  );
});

// アクティベート時の処理
self.addEventListener('activate', event => {
  console.log('[SW] Activate Event');
  
  event.waitUntil(
    // 古いキャッシュ削除
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE_NAME && 
              cacheName !== DATA_CACHE_NAME &&
              cacheName.startsWith('your-news-')) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Activation completed');
      // 既存のクライアントも即座に制御
      return self.clients.claim();
    })
  );
});

// フェッチイベント処理（オフライン対応メイン機能）
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // HTML・JS・CSS等の静的ファイル
  if (request.destination === 'document' || 
      request.destination === 'script' || 
      request.destination === 'style' ||
      STATIC_FILES.some(file => request.url.includes(file))) {
    
    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          console.log('[SW] Serving from static cache:', request.url);
          return response;
        }
        
        return fetch(request).then(networkResponse => {
          // 成功時はキャッシュに保存
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // ネットワークエラー時のフォールバック
          console.log('[SW] Network failed, serving offline page');
          return caches.match('/index.html');
        });
      })
    );
    return;
  }
  
  // RSS・API データの処理
  if (isDataRequest(request)) {
    event.respondWith(
      // Network First戦略（最新データ優先、オフライン時はキャッシュ）
      fetch(request).then(networkResponse => {
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(DATA_CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
          console.log('[SW] Fresh data from network:', request.url);
        }
        return networkResponse;
      }).catch(() => {
        console.log('[SW] Network failed, trying cache:', request.url);
        return caches.match(request).then(response => {
          if (response) {
            console.log('[SW] Serving from data cache');
            return response;
          }
          
          // キャッシュにもない場合のフォールバック
          return new Response(
            JSON.stringify({
              success: false,
              offline: true,
              message: 'オフラインのため新しいデータを取得できません。キャッシュされたデータを表示しています。'
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            }
          );
        });
      })
    );
    return;
  }
  
  // その他のリクエスト（画像等）
  event.respondWith(
    caches.match(request).then(response => {
      return response || fetch(request).catch(() => {
        // 画像の場合はプレースホルダーを返す
        if (request.destination === 'image') {
          return new Response(
            `<svg width="200" height="120" xmlns="http://www.w3.org/2000/svg">
              <rect width="200" height="120" fill="#e0e0e0"/>
              <text x="100" y="60" text-anchor="middle" dominant-baseline="middle" 
                    font-family="Arial" font-size="14" fill="#666">
                📰 オフライン
              </text>
            </svg>`,
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
        
        return caches.match('/index.html');
      });
    })
  );
});

// データリクエスト判定
function isDataRequest(request) {
  return DATA_URLS.some(url => request.url.includes(url)) ||
         request.url.includes('/api/') ||
         request.headers.get('Accept')?.includes('application/json');
}

// バックグラウンド同期（PWA高度機能）
self.addEventListener('sync', event => {
  console.log('[SW] Background Sync:', event.tag);
  
  if (event.tag === 'background-rss-fetch') {
    event.waitUntil(doBackgroundRSSFetch());
  }
  
  if (event.tag === 'background-ai-learning') {
    event.waitUntil(doBackgroundAILearning());
  }
});

// バックグラウンドRSS取得
async function doBackgroundRSSFetch() {
  try {
    console.log('[SW] Background RSS fetch started');
    
    // localStorage からRSS設定を取得
    const rssFeeds = JSON.parse(localStorage.getItem('yourNews_rssFeeds') || '[]');
    const preferences = JSON.parse(localStorage.getItem('yourNews_userPrefs') || '{}');
    
    if (!preferences.autoRefresh || rssFeeds.length === 0) {
      console.log('[SW] Auto refresh disabled or no RSS feeds');
      return;
    }
    
    // 有効なRSSフィードのみ取得
    const enabledFeeds = rssFeeds.filter(feed => feed.enabled);
    console.log(`[SW] Fetching ${enabledFeeds.length} RSS feeds`);
    
    // RSS取得実行（簡易版）
    const results = await Promise.allSettled(
      enabledFeeds.map(feed => fetchRSSInBackground(feed))
    );
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[SW] Background RSS fetch completed: ${successCount}/${enabledFeeds.length} succeeded`);
    
    // 結果をブロードキャスト
    broadcastToClients({
      type: 'BACKGROUND_RSS_UPDATE',
      successCount: successCount,
      totalCount: enabledFeeds.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[SW] Background RSS fetch error:', error);
  }
}

// バックグラウンドAI学習
async function doBackgroundAILearning() {
  try {
    console.log('[SW] Background AI learning started');
    
    // 未処理のフィードバックデータを取得
    const feedbackHistory = JSON.parse(localStorage.getItem('yourNews_feedback') || '[]');
    const unprocessedFeedback = feedbackHistory.filter(f => !f.processed);
    
    if (unprocessedFeedback.length === 0) {
      console.log('[SW] No unprocessed feedback for AI learning');
      return;
    }
    
    console.log(`[SW] Processing ${unprocessedFeedback.length} feedback items`);
    
    // 簡易AI学習処理（バックグラウンド用）
    unprocessedFeedback.forEach(feedback => {
      feedback.processed = true;
      feedback.processedAt = new Date().toISOString();
    });
    
    // 更新保存
    localStorage.setItem('yourNews_feedback', JSON.stringify(feedbackHistory));
    
    console.log('[SW] Background AI learning completed');
    
    // 結果をブロードキャスト
    broadcastToClients({
      type: 'BACKGROUND_AI_UPDATE',
      processedCount: unprocessedFeedback.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[SW] Background AI learning error:', error);
  }
}

// 簡易RSS取得（バックグラウンド用）
async function fetchRSSInBackground(feed) {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(feed.url)}`;
  
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    console.log(`[SW] RSS fetched: ${feed.name}`);
    
    return { success: true, feed: feed.name };
  } catch (error) {
    console.error(`[SW] RSS fetch failed: ${feed.name}`, error);
    return { success: false, feed: feed.name, error: error.message };
  }
}

// クライアントへのメッセージ送信
function broadcastToClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(message);
    });
  });
}

// プッシュ通知処理（オプション機能）
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');
  
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body || '新しい記事が配信されました',
      icon: '/assets/manifest.json',
      badge: '/assets/manifest.json',
      tag: 'news-update',
      requireInteraction: false,
      actions: [
        {
          action: 'view',
          title: '記事を見る',
          icon: '/assets/manifest.json'
        },
        {
          action: 'dismiss',
          title: '閉じる',
          icon: '/assets/manifest.json'
        }
      ],
      data: {
        url: data.url || '/',
        timestamp: Date.now()
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(
        data.title || 'あなたのニュース',
        options
      )
    );
    
  } catch (error) {
    console.error('[SW] Push notification error:', error);
  }
});

// 通知クリック処理
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view') {
    const url = event.notification.data?.url || '/';
    event.waitUntil(
      clients.openWindow(url)
    );
  }
  // dismiss の場合は何もしない（通知を閉じるだけ）
});

// オンライン・オフライン状態の検出
self.addEventListener('online', event => {
  console.log('[SW] Online detected');
  broadcastToClients({
    type: 'NETWORK_STATUS_CHANGE',
    online: true,
    timestamp: new Date().toISOString()
  });
});

self.addEventListener('offline', event => {
  console.log('[SW] Offline detected');
  broadcastToClients({
    type: 'NETWORK_STATUS_CHANGE',
    online: false,
    timestamp: new Date().toISOString()
  });
});

// メモリ管理（キャッシュサイズ制限）
async function cleanupOldCaches() {
  try {
    const dataCache = await caches.open(DATA_CACHE_NAME);
    const requests = await dataCache.keys();
    
    // 7日以上古いキャッシュを削除
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const deletePromises = requests.map(async request => {
      const response = await dataCache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader && new Date(dateHeader).getTime() < oneWeekAgo) {
          console.log('[SW] Deleting old cache entry:', request.url);
          return dataCache.delete(request);
        }
      }
    });
    
    await Promise.all(deletePromises);
    console.log('[SW] Cache cleanup completed');
    
  } catch (error) {
    console.error('[SW] Cache cleanup error:', error);
  }
}

// 定期的なクリーンアップ実行
setInterval(cleanupOldCaches, 24 * 60 * 60 * 1000); // 24時間ごと

// Service Worker バージョン情報
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: CACHE_NAME,
      staticCache: STATIC_CACHE_NAME,
      dataCache: DATA_CACHE_NAME
    });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker loaded successfully');
