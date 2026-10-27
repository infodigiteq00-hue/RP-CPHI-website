// Expo meetings · admin: working without a connection (expo halls often have none).
//
// - The page itself loads from this device (sw.js keeps a copy of everything it loaded).
// - The last list of meetings, and the notes and follow-ups opened, are kept on the device (IndexedDB),
//   so everything stays readable offline.
// - Changes made offline are kept on the device, in order, and shown at once: status, accept, reschedule,
//   reject and cancel, block and unblock, Add meeting, notes (typed or from the handwriting pad), Mark complete
//   (with its voice note) and follow-up edits. When the connection is back they're uploaded in the same order;
//   after a meeting marked complete is uploaded, its minutes and follow-up draft are written, and an accepted,
//   moved or rejected meeting's email goes to the visitor then (sent by the Apps Script).
// - Needs the internet: signing in, writing minutes, handwriting conversion, banners and expo settings.
//
// Loaded before admin.js; admin.js's api() sends everything through Offline.api(). Uses admin.js's apiRaw,
// state, store, $, esc, COMPANY_ID, TOKEN_KEY, fmtDay, fmtRange, slotTime, meetingMinutes and expoNow when called.

window.Offline = (() => {
  const QUEUED = ["status", "decideMeeting", "block", "unblock", "addMeeting", "saveNotes", "complete", "saveFollowup", "markFollowupSent"];
  const PROBLEMS = {
    slot_taken: "that time was booked or blocked meanwhile",
    cancelled: "the meeting had been cancelled",
    completed: "the meeting was already complete",
    not_found: "the meeting no longer exists",
    already_sent: "it was already marked as sent",
    invalid_slot: "that time isn't part of the expo any more",
    too_long: "the notes became too long",
    not_open: "the meeting had already been completed or cancelled",
    meeting_changed: "the meeting was changed on another device; review its latest details",
    meeting_outside_hours: "the full meeting no longer fits within the expo's hours and breaks",
    same_time: "the meeting was already at that time",
  };
  let enabled = !!window.indexedDB;
  let offline = false;
  let pending = 0;
  let flushing = null;
  let cachedAt = "";
  let problems = [];

  // ---------- storage on the device ----------
  let dbp = null;
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open("expo-meetings-offline", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("outbox", { keyPath: "n", autoIncrement: true });
          r.result.createObjectStore("kv");
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  const os = async (name, mode) => (await db()).transaction(name, mode).objectStore(name);
  const kvGet = async (k) => req((await os("kv", "readonly")).get(`${COMPANY_ID}:${k}`));
  const kvSet = async (k, v) => req((await os("kv", "readwrite")).put(v, `${COMPANY_ID}:${k}`));
  const kvDel = async (k) => req((await os("kv", "readwrite")).delete(`${COMPANY_ID}:${k}`));
  const outbox = async () => (await req((await os("outbox", "readonly")).getAll())).filter((i) => i.company === COMPANY_ID);
  const outAdd = async (item) => req((await os("outbox", "readwrite")).add(item));
  const outDel = async (n) => req((await os("outbox", "readwrite")).delete(n));

  const isNetError = (ex) => ex instanceof TypeError || (ex && ex.message === "network");
  const now = () => new Date().toTimeString().slice(0, 5);
  const rowOf = (id) => state.rows.find((r) => r.id === id);
  const who = (id) => { const r = rowOf(id); return r ? r.name : "a meeting"; };

  // ---------- the API, offline or not ----------
  async function api(action, data) {
    if (!enabled) return apiRaw(action, data);
    try {
      // earlier offline changes go first, so the server sees everything in the order it happened
      if (action === "list" && pending) await flush();
      if (QUEUED.includes(action) && (pending || offline)) {
        if (!offline) await flush(); // known to be offline: don't wait on a network that may hang
        if (pending || offline) return queue(action, data);
      }
      const r = await apiRaw(action, data);
      setOffline(false);
      remember(action, data, r).catch(() => {});
      return r;
    } catch (ex) {
      if (!isNetError(ex)) throw ex;
      setOffline(true);
      if (QUEUED.includes(action)) return queue(action, data);
      if (action === "list") {
        const c = await kvGet("list").catch(() => null);
        if (c) { cachedAt = c.cachedAt || ""; render(); return c; }
      }
      if (action === "record") return { ok: true, record: ((await kvGet("records").catch(() => null)) || {})[data.id] || null };
      if (action === "followup") {
        const f = ((await kvGet("followups").catch(() => null)) || {})[data.id];
        if (f) return { ok: true, followup: f, catalogue: state.catalogue };
      }
      if (action === "minutes" && (await outbox()).some((i) => i.action === "complete" && i.data.id === data.id)) return { ok: false, error: "queued" };
      throw ex;
    }
  }

  // keeps what the server said, for reading it offline
  async function remember(action, data, r) {
    if (!r || !r.ok) return;
    if (action === "list") { cachedAt = now(); return kvSet("list", { ...r, cachedAt }); }
    const rec = (record) => kvGet("records").then((m) => kvSet("records", { ...(m || {}), [data.id]: record }));
    if ((action === "record" || action === "minutes") && r.record) return rec(r.record);
    if (["followup", "draftFollowup", "saveFollowup", "markFollowupSent"].includes(action) && r.followup) {
      return kvGet("followups").then((m) => kvSet("followups", { ...(m || {}), [data.id]: r.followup }));
    }
  }

  // the list as it now stands on this device (with the offline changes), for the next offline load
  function snapshot() {
    return kvSet("list", { ok: true, rows: state.rows, blocked: state.blocked, statuses: state.statuses, expos: state.expos,
      catalogue: state.catalogue, company: state.company, template: state.template, cachedAt: cachedAt || now() });
  }

  // ---------- changes made offline ----------
  async function queue(action, data) {
    const item = { company: COMPANY_ID, action, data: { ...data }, at: Date.now() };
    delete item.data.token; // the token at upload time is used
    if (action === "addMeeting") {
      item.data.cid = item.data.cid || Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
      item.tempId = `OFF-${item.data.cid.slice(0, 6).toUpperCase()}`;
    }
    if (action === "complete") item.after = true; // minutes and follow-up once uploaded
    item.label = describe(action, item.data);
    await outAdd(item);
    pending++;
    const out = await applyHere(action, item);
    await snapshot();
    render();
    return out;
  }

  function describe(action, d) {
    const t = d.time || d.slot;
    return {
      status: `${who(d.id)}: ${d.status}`,
      decideMeeting: `${who(d.id)}: ${d.decision === "accept" ? "accepted" : d.decision === "reject" ? "rejected"
        : `moved to ${d.date && fmtDay(d.date)}, ${d.time && fmtRange(d.time)}`}${d.notify ? ", email the visitor" : ""}`,
      block: `Block ${d.date && fmtDay(d.date)}, ${t && fmtRange(t)}`,
      unblock: `Unblock ${d.date && fmtDay(d.date)}, ${t && fmtRange(t)}`,
      addMeeting: `New meeting: ${d.name}, ${d.date && fmtDay(d.date)} ${t}`,
      saveNotes: `Notes for ${who(d.id)}`,
      complete: `${who(d.id)} marked complete`,
      saveFollowup: `Follow-up draft for ${who(d.id)}`,
      markFollowupSent: `Follow-up sent to ${who(d.id)}`,
    }[action];
  }

  // shows the change here at once, and answers as the server would
  async function applyHere(action, item) {
    const d = item.data;
    const records = async () => (await kvGet("records")) || {};
    switch (action) {
      case "status": return { ok: true, queued: true }; // admin.js has already changed the row
      case "decideMeeting": {
        // as Code.gs does it; the visitor's email is sent by the server when this uploads
        const row = rowOf(d.id);
        if (!row) return { ok: true, queued: true };
        const expo = state.expos.find((e) => e.id === row.expo) || {};
        const t = expoNow("Asia/Kolkata");
        const entry = { at: t ? `${t.date} ${String(Math.floor(t.min / 60)).padStart(2, "0")}:${String(t.min % 60).padStart(2, "0")}` : "",
          by: "", action: d.decision, from: row.status, to: d.decision === "reject" ? "Cancelled" : "Confirmed", note: d.note || "",
          emailed: d.notify ? "when online" : false };
        if (d.cid) entry.operation = d.cid;
        if (d.decision === "reschedule") {
          entry.from = `${row.date} ${slotTime(row)}`;
          row.date = d.date;
          row.slot = d.time;
          row.time = `${fmtRange(d.time, meetingMinutes(row) || expo.slotMinutes || 30)} ${expo.tzLabel || ""}`.trim();
          entry.to = `${row.date} ${row.time}`;
        }
        row.status = d.decision === "reject" ? "Cancelled" : "Confirmed";
        row.history = (row.history || []).concat([entry]).slice(-20);
        return { ok: true, queued: true };
      }
      case "block":
        state.blocked = state.blocked.filter((b) => !(b.date === d.date && b.slot === d.slot && b.expo === d.expo))
          .concat([{ date: d.date, slot: d.slot, reason: d.reason || "", by: "", at: "", expo: d.expo }]);
        return { ok: true, queued: true, blocked: state.blocked };
      case "unblock":
        state.blocked = state.blocked.filter((b) => !(b.date === d.date && b.slot === d.slot && b.expo === d.expo));
        return { ok: true, queued: true, blocked: state.blocked };
      case "addMeeting": {
        const expo = state.expos.find((e) => e.id === d.expo) || {};
        const minutes = d.minutes || expo.slotMinutes || 30;
        if (d.replaceBlock) state.blocked = state.blocked.filter((b) => !(b.date === d.date && b.expo === d.expo && rowSlots({ slot: d.time, page: `team:${minutes}` }, expo).includes(b.slot)));
        state.rows.push({ id: item.tempId, received: "", date: d.date, slot: d.time, time: `${fmtRange(d.time, minutes)} ${expo.tzLabel || ""}`.trim(),
          name: d.name, company: d.company || "", email: d.email || "", country: d.country || "", phone: d.phone || "", products: d.products || "",
          message: d.message || "", status: d.status === "New" ? "New" : "Confirmed", page: `team:${minutes}:offline:${d.cid}`, expo: d.expo,
          extra: [], minutes: "", followup: "", followupSentAt: "" });
        return { ok: true, queued: true, id: item.tempId, blocked: state.blocked };
      }
      case "saveNotes": {
        const m = await records();
        const before = (m[d.id] && m[d.id].notes) || "";
        const notes = typeof d.notes === "string" ? d.notes.trim() : (before ? `${before}\n\n` : "") + String(d.append || "").trim();
        await kvSet("records", { ...m, [d.id]: { ...(m[d.id] || {}), notes, status: notes ? "Draft" : "None" } });
        const row = rowOf(d.id);
        if (row) row.minutes = notes ? "Draft" : "None";
        return { ok: true, queued: true, notes, minutes: notes ? "Draft" : "None" };
      }
      case "complete": {
        const m = await records();
        const old = m[d.id] || {};
        const hasAudio = !!(d.audio && d.audio.data) || !!old.hasAudio;
        const state2 = d.notes || hasAudio ? "Pending" : "None";
        await kvSet("records", { ...m, [d.id]: { ...old, notes: d.notes || "", hasAudio, status: state2, minutes: null, updated: "", by: "you, on this device (not uploaded yet)" } });
        const row = rowOf(d.id);
        if (row) { row.status = "Completed"; row.minutes = state2; }
        return { ok: true, queued: true, minutes: state2 };
      }
      case "saveFollowup":
      case "markFollowupSent": {
        const m = (await kvGet("followups")) || {};
        const f = { ...(m[d.id] || {}), subject: d.subject, message: d.message, companyLine: d.companyLine || "", products: d.products || [],
          status: action === "markFollowupSent" ? "Sent" : "Draft", updated: "Saved on this device", sentAt: action === "markFollowupSent" ? "(when online)" : "" };
        await kvSet("followups", { ...m, [d.id]: f });
        const row = rowOf(d.id);
        if (row) row.followup = f.status;
        return { ok: true, queued: true, followup: f };
      }
    }
    return { ok: true, queued: true };
  }

  // ---------- uploading ----------
  function flush() {
    if (!flushing) flushing = upload().finally(() => { flushing = null; render(); });
    return flushing;
  }

  async function upload() {
    if (!enabled) return false;
    const items = await outbox();
    pending = items.length;
    if (!items.length || !store.get(TOKEN_KEY)) return false;
    const ids = (await kvGet("ids")) || {}; // meetings added offline: their temporary IDs and their real ones
    let done = 0;
    render(`Uploading ${items.length} change${items.length === 1 ? "" : "s"}…`);
    for (const item of items) {
      const data = { ...item.data, token: store.get(TOKEN_KEY) };
      if (data.id && ids[data.id]) data.id = ids[data.id];
      let r;
      try {
        r = await apiRaw(item.action, data);
      } catch (ex) {
        if (isNetError(ex)) { setOffline(true); break; }
        if (ex.message === "auth") break; // signed out: uploaded after the next sign-in
        r = { ok: false, error: ex.message };
      }
      setOffline(false);
      if (!r.ok && r.error === "busy") break; // try again shortly
      if (r.ok || (item.action === "markFollowupSent" && r.error === "already_sent")) {
        if (r.mailError) problems.push({ label: item.label, why: `status saved, but the visitor's email could not be sent: ${r.mailError}` });
        if (item.tempId && r.id) {
          ids[item.tempId] = r.id;
          await kvSet("ids", ids);
          moveLocal(item.tempId, r.id);
        }
        if (item.after && r.minutes && r.minutes !== "None") {
          // the meeting is complete on the server: write its minutes and follow-up now
          try {
            const m = await apiRaw("minutes", { token: store.get(TOKEN_KEY), id: data.id });
            if (m.ok) await apiRaw("draftFollowup", { token: store.get(TOKEN_KEY), id: data.id }).catch(() => {});
          } catch {}
        }
      } else {
        problems.push({ label: item.label, why: PROBLEMS[r.error] || r.detail || r.error || "unknown error" });
      }
      await outDel(item.n);
      pending--;
      done++;
    }
    pending = (await outbox()).length;
    return done > 0;
  }

  // a meeting added offline got its real ID: use it everywhere on this device
  function moveLocal(temp, real) {
    const row = rowOf(temp);
    if (row) row.id = real;
    ["records", "followups"].forEach((k) => kvGet(k).then((m) => {
      if (m && m[temp]) { m[real] = m[temp]; delete m[temp]; kvSet(k, m); }
    }).catch(() => {}));
    try {
      const ink = localStorage.getItem(`rp_ink_${temp}`); // handwriting pad (js/ink.js)
      if (ink) { localStorage.setItem(`rp_ink_${real}`, ink); localStorage.removeItem(`rp_ink_${temp}`); }
    } catch {}
  }

  // ---------- status bar ----------
  function setOffline(v) {
    if (offline === v) return;
    offline = v;
    render();
  }

  function render(busyText) {
    const bar = document.getElementById("netBar");
    if (!bar) return;
    const n = pending;
    const lines = [];
    if (offline) {
      lines.push(`<b>Offline.</b> Changes are saved on this device and upload by themselves when you're back online.${n ? ` ${n} waiting.` : ""}` +
        (cachedAt ? ` <span class="muted">Showing the list as of ${esc(cachedAt)}.</span>` : ""));
    } else if (busyText || flushing) {
      lines.push(esc(busyText || "Uploading changes…"));
    } else if (n) {
      lines.push(`${n} change${n === 1 ? "" : "s"} waiting to upload. <button class="link" type="button" data-net="retry">Upload now</button>`);
    }
    if (problems.length) {
      lines.push(`<span class="netbar__warn">${problems.length === 1 ? "An offline update needs" : `${problems.length} offline updates need`} attention:</span> ` +
        problems.map((p) => `${esc(p.label)} (${esc(p.why)})`).join("; ") + ` <button class="link" type="button" data-net="dismiss">Dismiss</button>`);
    }
    bar.innerHTML = lines.map((l) => `<p>${l}</p>`).join("");
    bar.hidden = !lines.length;
    bar.classList.toggle("is-offline", offline);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-net]");
    if (!b) return;
    if (b.dataset.net === "dismiss") { problems = []; render(); }
    if (b.dataset.net === "retry") sync();
  });

  // back online: upload, then show the server's list
  async function sync() {
    const changed = await flush().catch(() => false);
    if (changed && store.get(TOKEN_KEY) && !$("#appView").hidden) load();
  }
  window.addEventListener("online", sync);
  window.addEventListener("offline", () => setOffline(true));
  setInterval(() => { if (pending && navigator.onLine) sync(); }, 30000);

  // how many changes are waiting (for signing out)
  async function waiting() {
    if (!enabled) return 0;
    try { pending = (await outbox()).length; } catch { return 0; }
    return pending;
  }
  // signing out: the meetings stored on this device go; changes not yet uploaded stay, for the next sign-in
  async function forget() {
    if (!enabled) return;
    await Promise.all(["list", "records", "followups"].map((k) => kvDel(k).catch(() => {})));
    cachedAt = "";
  }

  // the page and its files, kept on the device for opening offline
  function keepPage() {
    if (!("serviceWorker" in navigator) || !window.caches) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    const urls = [location.href.split("#")[0],
      ...[...document.querySelectorAll("script[src]")].map((s) => s.src),
      ...[...document.querySelectorAll('link[rel="stylesheet"], link[rel="icon"]')].map((l) => l.href),
      ...[...document.querySelectorAll("img[src]")].map((i) => i.src)];
    caches.open("expo-meetings-v1").then((c) => Promise.allSettled(urls.filter((u) => /^https?:/.test(u)).map((u) => c.add(u)))).catch(() => {});
  }

  if (enabled) {
    db().catch(() => { enabled = false; });
    waiting().then(render);
  }
  window.addEventListener("load", keepPage);

  return { api, flush, sync, waiting, forget, isOffline: () => offline };
})();
