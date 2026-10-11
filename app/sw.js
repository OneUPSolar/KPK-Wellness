/* Panel de KPK — service worker.
   Existe para que la app se pueda instalar y para que abra sin red. Bump CACHE
   en cada cambio de esta lista. */
const CACHE = 'kpk-app-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Que falte un archivo no debe abortar la instalación completa.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Las llamadas al backend y los datos nunca se sirven de caché: una
  // cotización vieja servida desde el teléfono es peor que un error de red.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/content/')) return;

  // Red primero para las páginas, caché solo como respaldo sin conexión.
  // (La tarjeta digital se congeló una vez por hacer lo contrario.)
  const esHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (esHTML) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
      }
      return res;
    })),
  );
});
