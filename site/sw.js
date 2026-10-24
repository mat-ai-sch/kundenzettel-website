/* Einmalige Ablösung des früheren Website-Offline-Workers; keine neue Offline-Veröffentlichung. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    await Promise.all((await caches.keys()).map(key => caches.delete(key)));
    await self.registration.unregister();
    for (const client of windows) {
      const previous = new URL(client.url);
      if (previous.origin !== self.location.origin) continue;
      const target = new URL(previous.pathname === '/' ? '/_v/update.html' : previous.pathname, previous.origin);
      target.searchParams.set('_kz_release', '20261024-landing-removed');
      target.hash = previous.hash;
      client.navigate(target.href).catch(() => {});
    }
  })());
});
