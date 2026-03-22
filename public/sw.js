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
  const url = event.request.url;

  // Sadece http/https isteklerini işle (chrome-extension vb. atla)
  if (!url.startsWith('http')) return;

  // API isteklerini cache'leme
  if (url.includes('/api/')) return;

  // POST isteklerini atla
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
