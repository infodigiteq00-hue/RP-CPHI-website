// Expo meetings · keeps the pages and their files on the device, so the admin dashboard opens without a
// connection (expo halls often have none). Always tries the network first, so it never shows an old version
// while online; only when the network fails (or takes too long) does it answer from the copy kept here.
// The Apps Script (the data) is never cached here: js/offline.js handles that.

const CACHE = "expo-meetings-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || /script\.google(usercontent)?\.com/.test(req.url) || !/^https?:/.test(req.url)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // a hall with Wi-Fi but no internet makes requests hang: give up after a while and use the copy
      const res = await Promise.race([fetch(req), timeout(req.mode === "navigate" ? 8000 : 15000)]);
      if (res && (res.ok || res.type === "opaque") && !res.redirected) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      // the dashboard is one page for every company (?c=…), so any kept copy of it will do
      const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
      if (hit) return hit;
      throw err;
    }
  })());
});
