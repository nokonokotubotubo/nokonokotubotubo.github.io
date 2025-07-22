const CACHE_NAME='minews-v1';
const urlsToCache=['/mss/','/mss/app.js','/mss/styles.css','/mss/manifest.json','/mss/vite.svg','/mss/icon-192.svg'];

self.addEventListener('install',e=>{
console.log('[SW] Install');
e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(urlsToCache)).catch(err=>console.error('[SW] Cache failed:',err)));
});

self.addEventListener('fetch',e=>{
if(!e.request.url.includes('/mss/'))return;
e.respondWith(caches.match(e.request).then(response=>response||fetch(e.request)).catch(err=>{
console.log('[SW] Fetch failed:',err);
return e.request.destination==='document'?caches.match('/mss/'):null;
}));
});

self.addEventListener('activate',e=>{
console.log('[SW] Activate');
e.waitUntil(caches.keys().then(names=>Promise.all(names.map(name=>name!==CACHE_NAME?caches.delete(name):null))));
});
