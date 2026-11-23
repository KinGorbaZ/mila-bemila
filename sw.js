// Offline support: fresh from the network when possible, cached copy otherwise.
const CACHE = 'mbm-v9';
const SHELL = ['./', 'index.html', 'style.css', 'js/app.js', 'js/engine.js', 'js/content.js',
  'data/he.dawg', 'data/he.json', 'data/fr.dawg', 'data/fr.json', 'data/he.common.dawg', 'data/fr.common.dawg',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    // bypass the browser's 10-minute HTTP cache for our own files so updates show at once
    (sameOrigin ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request)).then(res => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
