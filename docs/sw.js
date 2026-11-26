const CACHE_NAME = 'stall-ops-shell-v2';
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles/tokens.css',
  './styles/app.css',
  './src/main.js',
  './src/domain.js',
  './src/storage.js',
  './src/audio.js',
  './src/render.js',
  './seed.json',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const accept = event.request.headers.get('accept') || '';
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    accept.includes('text/event-stream')
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request)),
  );
});
