/* Öffentlicher Einstieg: ausschließlich die aktuelle GitHub-Demo und erhaltene Rechtsseiten. */
(async () => {
  const legal = new Map([
    ['#impressum', '/impressum/'],
    ['#datenschutz', '/datenschutz/'],
    ['#anbieter', '/anbieter/'],
    ['#dienst-datenschutz', '/dienst-datenschutz/'],
  ]);
  const oldLegalPath = legal.get(location.hash.toLowerCase());
  const target = oldLegalPath
    ? new URL(oldLegalPath, location.origin).href
    : 'https://demo.kundenzettel.de/#/gespraeche';

  const cleanup = async () => {
    if ('serviceWorker' in navigator) {
      const root = new URL('/', location.origin).href;
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(item => item.scope === root).map(item => item.unregister()));
    }
    // CacheStorage enthält hier öffentliche Offline-Dateien. Cookies und lokale Eingaben bleiben erhalten.
    if ('caches' in window) {
      await Promise.all((await caches.keys()).map(key => caches.delete(key)));
    }
  };
  try {
    await Promise.race([cleanup(), new Promise(resolve => setTimeout(resolve, 1500))]);
  } catch {
    // Ein gesperrter Browser-Speicher darf den Einstieg nicht verhindern.
  }
  location.replace(target);
})();
