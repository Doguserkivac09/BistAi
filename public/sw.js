// BistAI Service Worker
const CACHE_NAME = 'bistai-v1';

// Offline'da gösterilecek sayfalar
const STATIC_CACHE = [
  '/',
  '/tarama',
  '/portfolyo',
  '/watchlist',
  '/makro',
  '/backtesting',
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_CACHE))
  );
  self.skipWaiting();
});

// Activate — eski cache'leri temizle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', (event) => {
  // API isteklerini cache'leme
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Başarılı yanıtı cache'e ekle
        if (res.ok && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
