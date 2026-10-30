/* Retired service worker (29 Oct 2026). The old museum app installed a service worker that cached the old app on visitors' devices.
   The new public site has none. This file replaces the old one on those devices: it deletes every cache, removes itself and reloads the open pages,
   so nobody stays stuck on the old app. It never answers a request. Safe to keep forever. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try { var ks = await caches.keys(); await Promise.all(ks.map(function (k) { return caches.delete(k); })); } catch (_) { }
    try { await self.registration.unregister(); } catch (_) { }
    try { var cs = await self.clients.matchAll({ type: 'window' }); cs.forEach(function (c) { c.navigate(c.url); }); } catch (_) { }
  })());
});
