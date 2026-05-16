const CACHE_VERSION = 'pp-automation-v1';
const ASSETS = [
  '.',
  'index.html',
  'styles.css',
  'app.js',
  'vendor/qrcode.min.js',
  'manifest.webmanifest',
  'assets/icon.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS))
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
  );
});
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (!response || response.status !== 200 || response.type !== 'basic') return response;
      const clone = response.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
      return response;
    })).catch(() => caches.match('/index.html'))
  );
});
