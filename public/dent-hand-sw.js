const CACHE = 'dent-hand-shell-v5';
const SHELL = ['/social/', '/dent-hand.webmanifest', '/dent-hand-icon.svg'];

async function precacheShell() {
  const cache = await caches.open(CACHE);
  const response = await fetch('/social/', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not fetch Dent Hand shell.');

  await cache.put('/social/', response.clone());
  const html = await response.text();
  const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match => match[1]);
  await cache.addAll([...new Set([...SHELL.filter(path => path !== '/social/'), ...assets])]);
}

self.addEventListener('install', event => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('dent-hand-shell-') && key !== CACHE).map(key => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' && url.pathname.startsWith('/social')) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('/social/')));
    return;
  }

  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
