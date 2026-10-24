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
    const retireWorker = async () => {
      if (!('serviceWorker' in navigator)) return;
      const root = new URL('/', location.origin).href;
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(item => item.scope === root).map(item => item.unregister()));
    };
    // CacheStorage enthält hier öffentliche Offline-Dateien. Cookies und lokale Eingaben bleiben erhalten.
    const clearOfflineFiles = async () => {
      if (!('caches' in window)) return;
      await Promise.all((await caches.keys()).map(key => caches.delete(key)));
    };
    await Promise.allSettled([retireWorker(), clearOfflineFiles()]);

    // CacheStorage und HTTP-Cache sind getrennt. Auch den kanonischen Einstieg
    // frisch speichern, damit der nächste Aufruf ohne Zusatzparameter aktuell ist.
    const response = await fetch(new URL('/', location.origin).href, {
      cache: 'reload',
      credentials: 'omit',
    });
    await response.arrayBuffer();
  };
  try {
    await Promise.race([cleanup(), new Promise(resolve => setTimeout(resolve, 3000))]);
  } catch {
    // Ein gesperrter Browser-Speicher darf den Einstieg nicht verhindern.
  }
  location.replace(target);
})();
