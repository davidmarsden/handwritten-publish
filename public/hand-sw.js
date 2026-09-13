const APP = new URL(self.location.href).searchParams.get('app') || 'hand';
const VERSION = 'v2';
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

async function precacheShell() {
  if (!config) return;

  const cache = await caches.open(CACHE);
  const response = await fetch(config.start, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not fetch ${APP} shell.`);

  await cache.put(config.start, response.clone());
  const html = await response.text();
  const builtAssets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match => match[1]);
  const staticShell = config.shell.filter(path => path !== config.start);
  await cache.addAll([...new Set([...staticShell, ...builtAssets])]);
}

self.addEventListener('install', event => {
  if (!config) return;
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
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
      fetch(event.request, { cache: 'no-store' })
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
