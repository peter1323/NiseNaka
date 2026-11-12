// Service worker: guarda la app y los datos para poder jugar sin internet.

const CACHE = 'nisenaka-v1';
const BASE = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'data/index.json',
];

// Al instalar se guardan la app y todos los archivos de personajes.
self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(BASE);
    const indice = await (await cache.match('data/index.json')).json();
    await cache.addAll([...indice.categorias, ...indice.packs].map((g) => `data/${g.archivo}`));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    for (const nombre of await caches.keys()) if (nombre !== CACHE) await caches.delete(nombre);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const propia = new URL(peticion.url).origin === location.origin;

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(peticion);
    // Imágenes de personajes (otro dominio): no cambian, basta con la copia guardada.
    if (!propia && guardada) return guardada;
    const deRed = fetch(peticion).then((respuesta) => {
      if (respuesta.ok) cache.put(peticion, respuesta.clone());
      return respuesta;
    });
    // Archivos de la app: se responde con la copia y se actualiza por detrás para la próxima vez.
    if (propia) evento.waitUntil(deRed.catch(() => {}));
    return guardada || deRed;
  })());
});
