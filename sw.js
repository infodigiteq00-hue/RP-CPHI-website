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

// ---------- uploading offline changes with the dashboard closed ----------
// js/offline.js keeps changes made offline in IndexedDB (in order) and asks for a "sync" each time it keeps one.
// Browsers with Background Sync (Chrome, Edge, Android) wake this worker once the connection is back, even if no
// dashboard is open, and the changes are uploaded here exactly as js/offline.js would: in order, with the meeting's
// minutes and follow-up written after a meeting marked complete. Safari and Firefox upload when the dashboard is next
// open. A lock (shared with the page) makes sure a change is only ever uploaded once.

self.addEventListener("sync", (e) => {
  if (e.tag === "upload-outbox") e.waitUntil(uploadOutbox());
});

const idb = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function openOffline() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("expo-meetings-offline", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("outbox", { keyPath: "n", autoIncrement: true });
      r.result.createObjectStore("kv");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const kvGet = (db, k) => idb(db.transaction("kv").objectStore("kv").get(k));
const kvPut = (db, k, v) => idb(db.transaction("kv", "readwrite").objectStore("kv").put(v, k));

async function post(api, tenant, action, data) {
  const res = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, tenant, ...data }),
  });
  try { return await res.json(); } catch { throw new Error("network"); } // an error page instead of JSON: try later
}

function uploadOutbox() {
  const run = async () => {
    const db = await openOffline();
    const items = await idb(db.transaction("outbox").objectStore("outbox").getAll());
    let retry = false, uploaded = false;
    for (const co of [...new Set(items.map((i) => i.company))]) {
      const auth = await kvGet(db, `${co}:auth`);
      if (!auth || !auth.token || !auth.api) continue; // never signed in since this update: the dashboard uploads it
      const ids = (await kvGet(db, `${co}:ids`)) || {}; // meetings added offline: temporary ID -> real one
      const problems = [];
      for (const item of items.filter((i) => i.company === co)) {
        const data = { ...item.data, token: auth.token };
        if (data.id && ids[data.id]) data.id = ids[data.id];
        let r;
        try { r = await post(auth.api, co, item.action, data); } catch { retry = true; break; }
        if (!r.ok && r.error === "auth") break;              // signed out: uploaded after the next sign-in
        if (!r.ok && r.error === "busy") { retry = true; break; }
        if (r.ok || (item.action === "markFollowupSent" && r.error === "already_sent")) {
          if (r.mailError) problems.push({ label: item.label, error: "mail", detail: r.mailError });
          if (item.tempId && r.id) { ids[item.tempId] = r.id; await kvPut(db, `${co}:ids`, ids); }
          if (item.after && r.minutes && r.minutes !== "None") {
            // the meeting is complete on the server: write its minutes and follow-up now
            try {
              const m = await post(auth.api, co, "minutes", { token: auth.token, id: data.id });
              if (m.ok) await post(auth.api, co, "draftFollowup", { token: auth.token, id: data.id }).catch(() => {});
            } catch {}
          }
        } else {
          problems.push({ label: item.label, error: r.error || "", detail: r.detail || "" });
        }
        await idb(db.transaction("outbox", "readwrite").objectStore("outbox").delete(item.n));
        uploaded = true;
      }
      if (problems.length) await kvPut(db, `${co}:problems`, ((await kvGet(db, `${co}:problems`)) || []).concat(problems));
    }
    if (uploaded) (await self.clients.matchAll({ type: "window" })).forEach((c) => c.postMessage({ type: "outbox-uploaded" }));
    if (retry) throw new Error("retry"); // the browser tries the sync again later
  };
  return self.navigator.locks ? self.navigator.locks.request("expo-meetings-upload", run) : run();
}
