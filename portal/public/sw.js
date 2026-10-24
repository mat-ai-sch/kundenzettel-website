/* Löst ausschließlich den früheren Offline-Worker dieser öffentlichen Website ab. */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    for (const client of windows) {
      const url = new URL(client.url);
      if (url.origin !== self.location.origin) continue;
      // Ein neuer Dokument-URL umgeht auch einen alten HTTP-Cache. Route und übrige Parameter bleiben erhalten.
      url.searchParams.set('_kz_migrated', '20261024');
      // Navigationen nur anstoßen; ein geschlossenes Fenster darf die Ablösung nicht blockieren.
      client.navigate(url.href).catch(() => {});
    }
  })());
});
