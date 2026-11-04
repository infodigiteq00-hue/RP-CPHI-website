// Expo Manager · admin: keeps a voice note and typed notes on this device while they're being made, so a closed
// tab, a crash or a flat battery doesn't lose them. The voice note is saved second by second as it records
// (IndexedDB); typed notes as they're typed (localStorage). Both are cleared once the meeting is saved.
//
// Loaded before minutes.js, which calls it. Uses admin.js's COMPANY_ID and KEY_PREFIX when called.

window.Drafts = (() => {
  let enabled = !!window.indexedDB;
  let dbp = null;
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open("expo-meetings-drafts", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("chunks", { keyPath: "n", autoIncrement: true }).createIndex("key", "key");
          r.result.createObjectStore("meta", { keyPath: "key" });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  const key = (id) => `${COMPANY_ID}:${id}`;
  const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

  async function clearVoice(id) {
    if (!enabled) return;
    const t = (await db()).transaction(["chunks", "meta"], "readwrite");
    const ns = await req(t.objectStore("chunks").index("key").getAllKeys(key(id)));
    ns.forEach((n) => t.objectStore("chunks").delete(n));
    t.objectStore("meta").delete(key(id));
    return done(t);
  }

  // ---------- voice note ----------
  // a new recording (or a re-recording) for this meeting: whatever was kept before goes
  async function voiceStart(id, mime) {
    if (!enabled) return;
    await clearVoice(id);
    const t = (await db()).transaction("meta", "readwrite");
    t.objectStore("meta").put({ key: key(id), id, mime, startedAt: Date.now(), seconds: 0 });
    return done(t);
  }

  // one piece of the recording, in order; the file is the pieces joined
  async function voiceChunk(id, seq, blob, seconds) {
    if (!enabled || !blob || !blob.size) return;
    const t = (await db()).transaction(["chunks", "meta"], "readwrite");
    t.objectStore("chunks").add({ key: key(id), seq, blob });
    const meta = t.objectStore("meta");
    const m = await req(meta.get(key(id)));
    if (m) meta.put({ ...m, seconds, updatedAt: Date.now() });
    return done(t);
  }

  // an uploaded recording, kept the same way
  async function voiceFile(id, blob) {
    if (!enabled) return;
    await clearVoice(id);
    const t = (await db()).transaction(["chunks", "meta"], "readwrite");
    t.objectStore("meta").put({ key: key(id), id, mime: blob.type || "audio/webm", startedAt: Date.now(), seconds: null, uploaded: true });
    t.objectStore("chunks").add({ key: key(id), seq: 0, blob });
    return done(t);
  }

  async function voiceGet(id) {
    if (!enabled) return null;
    const t = (await db()).transaction(["chunks", "meta"], "readonly");
    const m = await req(t.objectStore("meta").get(key(id)));
    if (!m) return null;
    const parts = (await req(t.objectStore("chunks").index("key").getAll(key(id)))).sort((a, b) => a.seq - b.seq).map((c) => c.blob);
    if (!parts.length) return null;
    return { blob: new Blob(parts, { type: m.mime || parts[0].type || "audio/webm" }), startedAt: m.startedAt, seconds: m.seconds, uploaded: !!m.uploaded };
  }

  // meetings with a voice note kept here but not saved yet, for this company
  async function voiceList() {
    if (!enabled) return [];
    const all = await req((await db()).transaction("meta", "readonly").objectStore("meta").getAll());
    return all.filter((m) => m.key.startsWith(`${COMPANY_ID}:`));
  }

  // ---------- typed notes ----------
  const notesKey = (id) => `${KEY_PREFIX}_draft_${id}`;
  function notesSet(id, text) {
    try { text.trim() ? localStorage.setItem(notesKey(id), text) : localStorage.removeItem(notesKey(id)); } catch {}
  }
  function notesGet(id) {
    try { return localStorage.getItem(notesKey(id)) || ""; } catch { return ""; }
  }

  // the meeting was saved (or queued to upload): nothing to keep any more
  async function clear(id) {
    try { localStorage.removeItem(notesKey(id)); } catch {}
    await clearVoice(id).catch(() => {});
  }

  // a meeting added offline got its real ID (js/offline.js): move what's kept for it
  async function move(temp, real) {
    const n = notesGet(temp);
    if (n) { notesSet(real, n); notesSet(temp, ""); }
    if (!enabled) return;
    const t = (await db()).transaction(["chunks", "meta"], "readwrite");
    const m = await req(t.objectStore("meta").get(key(temp)));
    if (m) {
      t.objectStore("meta").delete(key(temp));
      t.objectStore("meta").put({ ...m, key: key(real), id: real });
      const chunks = await req(t.objectStore("chunks").index("key").getAll(key(temp)));
      chunks.forEach((c) => t.objectStore("chunks").put({ ...c, key: key(real) }));
    }
    return done(t);
  }

  if (enabled) db().catch(() => { enabled = false; });

  return { voiceStart, voiceChunk, voiceFile, voiceGet, voiceList, clearVoice, notesSet, notesGet, clear, move };
})();
