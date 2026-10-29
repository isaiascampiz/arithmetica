// Never cache student records, authenticated documents, or mutation requests.
const CACHE = 'arithmetica-shell-v7';
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['/offline.html', '/icon.svg', '/icon-192.png', '/icon-512.png'])),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                (k.startsWith('centerflow-shell-') ||
                  k.startsWith('cadrin-shell-') ||
                  k.startsWith('centerbook-shell-') ||
                  k.startsWith('auvrell-shell-') ||
                  k.startsWith('arithmetica-shell-')) &&
                k !== CACHE,
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin)
    return;
  if (event.request.mode === 'navigate')
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
