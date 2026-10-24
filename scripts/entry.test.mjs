import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const entry = readFileSync(new URL('../site/entry.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../site/sw.js', import.meta.url), 'utf8');

async function navigate(hash = '', options = {}) {
  const removed = [];
  const unregistered = [];
  const requests = [];
  let documentConsumed = false;
  let destination;
  const registrations = ['https://kundenzettel.de/', 'https://kundenzettel.de/unrelated/'].map(scope => ({
    scope, unregister: async () => { unregistered.push(scope); },
  }));
  const caches = {
    keys: async () => ['workbox-precache-old', 'kundenzettel-old-assets'],
    delete: async key => { removed.push(key); },
  };
  const context = {
    URL, Map, Promise,
    location: { hash, origin: 'https://kundenzettel.de', replace: value => { destination = value; } },
    navigator: options.noWorker ? {} : { serviceWorker: { getRegistrations: options.denied ? async () => { throw Error('denied'); } : async () => registrations } },
    window: options.noCache ? {} : { caches }, caches,
    fetch: async (url, init) => {
      requests.push({url, cache: init.cache, credentials: init.credentials, removed: [...removed]});
      if (options.networkFailure) throw Error('offline');
      return {arrayBuffer: async () => { documentConsumed = true; return new ArrayBuffer(0); }};
    },
    setTimeout: fn => { const timer = setTimeout(fn, 30); timer.unref(); return timer; },
  };
  await vm.runInNewContext(entry, context);
  return { destination, removed, unregistered, requests, documentConsumed };
}

test('Startseite führt zur aktuellen Demo; nur Root-Worker und Offline-Dateien werden entfernt', async () => {
  const result = await navigate();
  assert.equal(result.destination, 'https://demo.kundenzettel.de/#/gespraeche');
  assert.deepEqual(result.unregistered, ['https://kundenzettel.de/']);
  assert.deepEqual(result.removed, ['workbox-precache-old', 'kundenzettel-old-assets']);
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(entry));
});

test('Alte Rechtsseiten-Hashes bleiben erreichbar', async () => {
  for (const page of ['impressum', 'datenschutz', 'anbieter', 'dienst-datenschutz']) {
    assert.equal((await navigate('#' + page)).destination, `https://kundenzettel.de/${page}/`);
  }
});

test('Nicht unterstützter oder gesperrter Speicher blockiert den Einstieg nicht', async () => {
  for (const options of [{noWorker: true, noCache: true}, {denied: true}, {networkFailure: true}]) {
    assert.equal((await navigate('', options)).destination, 'https://demo.kundenzettel.de/#/gespraeche');
  }
});

test('Kanonische Hauptseite wird nach dem Offline-Speicher im HTTP-Cache erneuert', async () => {
  const result = await navigate();
  assert.deepEqual(result.requests, [{
    url: 'https://kundenzettel.de/', cache: 'reload', credentials: 'omit',
    removed: ['workbox-precache-old', 'kundenzettel-old-assets'],
  }]);
  assert.equal(result.documentConsumed, true);
});

test('Gesperrte Worker-Abfrage verhindert weder Cache-Bereinigung noch frischen Hauptseitenabruf', async () => {
  const result = await navigate('', {denied: true});
  assert.equal(result.removed.length, 2);
  assert.equal(result.requests.length, 1);
  assert.equal(result.documentConsumed, true);
});

test('Ablöse-Worker entfernt alte Cache-Ausgabe und erhält Rechtstext-Pfade', async () => {
  const listeners = new Map();
  const targets = [];
  const actions = [];
  const clients = ['https://kundenzettel.de/#impressum', 'https://kundenzettel.de/datenschutz/', 'https://other.example/'].map(url => ({url, navigate: async next => targets.push(next)}));
  vm.runInNewContext(worker, {
    URL, Promise,
    caches: {keys: async () => ['old'], delete: async key => actions.push('delete:' + key)},
    self: {
      location: {origin: 'https://kundenzettel.de'},
      addEventListener: (type, callback) => listeners.set(type, callback),
      skipWaiting: async () => actions.push('skip'),
      clients: {claim: async () => actions.push('claim'), matchAll: async () => clients},
      registration: {unregister: async () => actions.push('unregister')},
    },
  });
  let completion;
  listeners.get('activate')({waitUntil: value => { completion = value; }});
  await completion;
  assert.deepEqual(actions, ['claim', 'delete:old', 'unregister']);
  assert.equal(targets.length, 2);
  assert.equal(new URL(targets[0]).pathname, '/_v/update.html');
  assert.equal(new URL(targets[0]).hash, '#impressum');
  assert.equal(new URL(targets[1]).pathname, '/datenschutz/');
});
