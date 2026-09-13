const APP = new URL(self.location.href).searchParams.get('app') || 'hand';
const VERSION = 'v1';
const CONFIG = {
  writing: {
    start: '/setup/email/',
    shell: ['/setup/email/', '/setup/styles.css', '/brand/writing-hand.svg', '/writing-hand.webmanifest'],
  },
  publish: {
    start: '/publish/',
    shell: ['/publish/', '/brand/publish-hand.svg', '/publish-hand.webmanifest'],
  },
  bum: {
    start: '/bum/',
    shell: ['/bum/', '/bum/bum.css', '/bum/audio.css', '/bum/bum.js', '/brand/bum-hand.svg', '/bum-hand.webmanifest'],
  },
  markdown: {
    start: '/markdown/',
    shell: ['/markdown/', '/markdown/markdown.js', '/brand/markdown-hand.svg', '/markdown-hand.webmanifest'],
  },
};

const config = CONFIG[APP];
const CACHE = `helping-hand-${APP}-${VERSION}`;

self.addEventListener('install', event => {
  if (!config) return;
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(config.shell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(`helping-hand-${APP}-`) && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (!config || event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match(config.start)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (!response || response.status !== 200 || response.type === 'opaque') return response;
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    })),
  );
});
