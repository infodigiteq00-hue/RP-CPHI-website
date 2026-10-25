// RP Industries · expo meeting requests admin. Everything shown is for the expo picked at the top.

const API = (window.RP_CONFIG && window.RP_CONFIG.API_URL) || "";
const TOKEN_KEY = "rp_admin_token";
const USER_KEY = "rp_admin_user";
const VIEW_KEY = "rp_admin_view";
const EXPO_KEY = "rp_admin_expo";

const $ = (s) => document.querySelector(s);
const state = {
  rows: [], blocked: [], statuses: ["New", "Confirmed", "Completed", "Cancelled"], day: "", q: "", status: "", sort: "meeting",
  schedDay: "", schedQ: "",                  // Scheduled view: day tab and search
  view: "requests", blocking: "", busy: "", // blocking: slot whose reason box is open; busy: slot being saved
  expos: [], expoId: "", catalogue: [],      // every expo's settings (from the server) and the one picked
};

// CPHI India 2026 as an older Apps Script (before expos) runs it: shown until Code.gs is updated
const OLD_SCRIPT_EXPO = {
  id: "cphi-india-2026", name: "CPHI India 2026", status: "Active", isDefault: true,
  headline: "World's No. 1 Prazole Intermediate Manufacturer", highlight: "Prazole Intermediate",
  subline: "Meet us in New Delhi, 23–25 November. Book a 30‑minute slot with our team.", booth: "2B59", hall: "Hall 2",
  venue: "IICC Yashobhoomi, Dwarka, New Delhi", banner: "", timezone: "Asia/Kolkata", tzLabel: "IST",
  days: ["2026-11-23", "2026-11-24", "2026-11-25"], start: "10:30", end: "18:00", slotMinutes: 30,
  breaks: [{ start: "12:30", end: "13:00", label: "Lunch" }],
  slots: ["10:30", "11:00", "11:30", "12:00", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"],
  fields: [
    { key: "name", label: "Name", type: "text", show: true, required: true, core: true },
    { key: "company", label: "Company", type: "text", show: true, required: true, builtin: true },
    { key: "email", label: "Email", type: "email", show: true, required: true, core: true },
    { key: "country", label: "Country", type: "country", show: true, required: true, builtin: true },
    { key: "phone", label: "Phone", type: "phone", show: true, required: true, builtin: true },
    { key: "products", label: "Products of interest", type: "products", show: true, required: true, builtin: true },
    { key: "message", label: "Message", type: "longtext", show: true, required: false, builtin: true },
  ],
  products: ["Apremilast", "Bilastine", "Carvedilol", "Dapagliflozin", "Dexlansoprazole", "Diminazene", "Empagliflozin", "Grapiprant",
    "Ilaprazole", "Itopride", "Lansoprazole", "Maribavir", "Mebeverine", "Mesalamine", "Nimorazole", "Omeprazole", "Pantoprazole",
    "Paroxetine", "Quetiapine", "Rabeprazole", "Terbinafine", "Theobromine", "Topiramate", "Trazodone", "Triclabendazole"]
    .map((n) => `${n} intermediates`)
    .concat(["Dexlansoprazole", "Esomeprazole Magnesium (3H₂O)", "Ilaprazole", "Lansoprazole", "Omeprazole", "Omeprazole Magnesium",
      "Pantoprazole Sodium", "Paroxetine"].map((n) => `${n} API`)),
};

// the expo picked at the top, its requests, and its days as tabs ("Mon 23")
const curExpo = () => state.expos.find((e) => e.id === state.expoId) || null;
const expoRows = () => state.rows.filter((r) => r.expo === state.expoId);
const expoDays = () => (curExpo() ? curExpo().days : []).map((d) => ({ id: d, label: fmtDayShort(d) }));
function fmtDayShort(d) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

// everything visitors typed goes through this before it reaches the page
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "10:30" -> "10:30 – 11:00 AM", "11:30" -> "11:30 AM – 12:00 PM" (same as the booking page)
function fmt12(hhmm) {
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
function fmtRange(hhmm, minutes = (curExpo() || {}).slotMinutes || 30) {
  const [h, m] = hhmm.split(":").map(Number);
  const end = h * 60 + m + minutes;
  const [a, ap] = fmt12(hhmm).split(" ");
  const [b, bp] = fmt12(`${Math.floor(end / 60)}:${end % 60}`).split(" ");
  return ap === bp ? `${a} – ${b} ${bp}` : `${a} ${ap} – ${b} ${bp}`;
}
// the meeting's time as saved with it, with its time zone: "10:30 – 11:00 AM IST"
const slotTime = (r) => r.time || fmtRange(r.slot);
// "CPHI India 2026, Booth 2B59, Hall 2" for a request
function expoLine(r) {
  const e = state.expos.find((x) => x.id === r.expo);
  return e ? [e.name, e.booth && `Booth ${e.booth}`, e.hall].filter(Boolean).join(", ") : "";
}

const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); } catch {} },
};

async function api(action, data = {}) {
  if (!API) throw new Error("not_configured_url");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...data }),
  });
  const json = await res.json();
  if (!json.ok && json.error === "auth") { signOut(); throw new Error("auth"); }
  return json;
}

// ---------- login ----------
const LOGIN_ERRORS = {
  invalid: "Wrong ID or password.",
  locked: "Too many wrong attempts. Try again in 15 minutes.",
  not_configured: "Admin login isn't set up yet. Add ADMIN_ID and ADMIN_PASSWORD in the Apps Script properties.",
  not_configured_url: "The Apps Script URL is missing in js/config.js.",
};

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#loginId").value.trim();
  const password = $("#loginPw").value;
  const err = $("#loginErr");
  err.hidden = true;
  if (!id || !password) { err.textContent = "Enter your ID and password."; err.hidden = false; return; }

  const btn = $("#loginBtn");
  btn.disabled = true;
  btn.textContent = "Signing in…";
  try {
    const r = await api("login", { id, password });
    if (!r.ok) throw new Error(r.error);
    store.set(TOKEN_KEY, r.token);
    store.set(USER_KEY, r.user);
    $("#loginPw").value = "";
    showApp();
  } catch (ex) {
    err.textContent = LOGIN_ERRORS[ex.message] || "Couldn't reach the server. Check your connection and try again.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

function signOut() {
  store.clear();
  state.rows = [];
  $("#appView").hidden = true;
  $("#loginView").hidden = false;
  $("#loginId").focus();
}
$("#logoutBtn").addEventListener("click", signOut);

function showApp() {
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#userName").textContent = store.get(USER_KEY) || "";
  load();
}

// ---------- data ----------
async function load() {
  const btn = $("#refreshBtn");
  btn.disabled = true;
  btn.textContent = "Loading…";
  $("#loadErr").hidden = true;
  try {
    const r = await api("list", { token: store.get(TOKEN_KEY) });
    if (!r.ok) throw new Error(r.error);
    state.rows = r.rows || [];
    state.blocked = r.blocked || [];
    if (r.statuses) state.statuses = r.statuses;
    // an Apps Script from before expos sends no expos: everything is CPHI India 2026
    state.expos = r.expos || [OLD_SCRIPT_EXPO];
    state.oldScript = !r.expos;
    state.catalogue = r.catalogue || OLD_SCRIPT_EXPO.products;
    state.rows.forEach((x) => { x.expo = x.expo || "cphi-india-2026"; x.extra = x.extra || []; });
    state.blocked.forEach((x) => { x.expo = x.expo || "cphi-india-2026"; });
    if (!curExpo()) {
      const pick = store.get(EXPO_KEY);
      state.expoId = (state.expos.find((e) => e.id === pick) || state.expos.find((e) => e.isDefault && e.status === "Active") || state.expos[0] || {}).id || "";
    }
    renderExpoSelect();
    renderFilters();
    render();
  } catch (ex) {
    if (ex.message === "auth") return;
    $("#loadErr").textContent = "Couldn't load requests. Try Refresh.";
    $("#loadErr").hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Refresh";
  }
}
$("#refreshBtn").addEventListener("click", load);

// ---------- expo picker ----------
function renderExpoSelect() {
  const active = state.expos.filter((e) => e.status === "Active");
  const archived = state.expos.filter((e) => e.status !== "Active");
  const opt = (e) => `<option value="${esc(e.id)}"${e.id === state.expoId ? " selected" : ""}>${esc(e.name)}${e.isDefault ? " (default)" : ""}</option>`;
  $("#expoSelect").innerHTML = active.map(opt).join("") +
    (archived.length ? `<optgroup label="Archived">${archived.map(opt).join("")}</optgroup>` : "");
}
function pickExpo(id) {
  state.expoId = id;
  store.set(EXPO_KEY, id);
  state.day = "";
  state.schedDay = "";
  state.blocking = "";
  renderExpoSelect();
  renderFilters();
  render();
}
$("#expoSelect").addEventListener("change", (e) => {
  if (state.view === "settings" && typeof settingsDirty === "function" && settingsDirty() &&
      !confirm("You have unsaved changes to this expo. Switch anyway?")) { renderExpoSelect(); return; }
  pickExpo(e.target.value);
});

// keep the list current: reload every minute and when the tab comes back into view,
// but not while someone is typing a block reason or changing a status
function autoRefresh() {
  if (document.hidden || $("#appView").hidden || !store.get(TOKEN_KEY)) return;
  if (document.querySelector("dialog[open]")) return; // don't redraw under an open pop-up
  if (state.view === "settings") return;              // or under expo settings being edited
  const f = document.activeElement;
  if (f && f.matches("#rows select, #avail input, #avail select, #avail textarea")) return;
  load();
}
setInterval(autoRefresh, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) autoRefresh(); });

function renderFilters() {
  const active = expoRows().filter((r) => r.status !== "Cancelled");
  const count = (d) => active.filter((r) => !d || r.date === d).length;
  $("#dayTabs").innerHTML = [{ id: "", label: "All days" }, ...expoDays()]
    .map((d) => `<button class="tab" role="tab" type="button" data-day="${d.id}" aria-selected="${state.day === d.id}">${d.label}<span>${count(d.id)}</span></button>`)
    .join("");
  const sel = $("#statusFilter");
  if (sel.options.length === 1) {
    sel.insertAdjacentHTML("beforeend", state.statuses.map((s) => `<option>${esc(s)}</option>`).join(""));
  }
}

$("#dayTabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (!b) return;
  state.day = b.dataset.day;
  $("#dayTabs").querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t === b)));
  render();
});
$("#search").addEventListener("input", (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
$("#statusFilter").addEventListener("change", (e) => { state.status = e.target.value; render(); });
$("#sortBy").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

function visibleRows() {
  const q = state.q;
  const rows = expoRows().filter((r) =>
    (!state.day || r.date === state.day) &&
    (!state.status || r.status === state.status) &&
    (!q || [r.name, r.company, r.email, r.phone, r.country, r.products, r.message, r.id, ...(r.extra || []).map((x) => x.value)]
      .join(" ").toLowerCase().includes(q))
  );
  const meetingKey = (r) => `${r.date} ${r.slot}`;
  rows.sort((a, b) => state.sort === "received"
    ? b.received.localeCompare(a.received)
    : meetingKey(a).localeCompare(meetingKey(b)) || a.received.localeCompare(b.received));
  return rows;
}

function fmtDay(d) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// ---------- views ----------
function showView(view) {
  state.view = ["scheduled", "slots", "settings"].includes(view) ? view : "requests";
  store.set(VIEW_KEY, state.view);
  try { history.replaceState(null, "", `#${state.view}`); } catch {} // admin.html#scheduled opens this view
  $("#viewTabs").querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === state.view)));
  $("#requestsView").hidden = state.view !== "requests";
  $("#scheduledView").hidden = state.view !== "scheduled";
  $("#slotsView").hidden = state.view !== "slots";
  $("#settingsView").hidden = state.view !== "settings";
  $("#csvBtn").hidden = !["requests", "scheduled"].includes(state.view);
  $("#refreshBtn").hidden = state.view === "settings";
  if (!$("#appView").hidden) render();
}
$("#viewTabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (!b) return;
  if (state.view === "settings" && b.dataset.view !== "settings" && typeof settingsDirty === "function" && settingsDirty() &&
      !confirm("You have unsaved changes to this expo. Leave anyway?")) return;
  showView(b.dataset.view);
});

function render() {
  if (state.view === "slots") return renderAvail();
  if (state.view === "scheduled") return renderScheduled();
  if (state.view === "settings") return renderSettings(); // js/expos.js
  const rows = visibleRows();
  const all = expoRows();
  // two or more live requests for the same slot
  const taken = {};
  all.forEach((r) => { if (r.status !== "Cancelled") { const k = `${r.date} ${r.slot}`; taken[k] = (taken[k] || 0) + 1; } });

  const total = all.length;
  const newCount = all.filter((r) => r.status === "New").length;
  const doneCount = all.filter((r) => r.status === "Completed").length;
  $("#countLine").textContent = total
    ? `${total} request${total === 1 ? "" : "s"} · ${newCount} new · ${doneCount} completed · showing ${rows.length}`
    : "No requests yet.";

  $("#rows").innerHTML = rows.map((r) => {
    const clash = r.status !== "Cancelled" && taken[`${r.date} ${r.slot}`] > 1;
    const tel = r.phone.replace(/[^\d+]/g, "");
    return `<tr class="${r.status === "Cancelled" ? "is-cancelled" : ""}">
      <td class="c-meeting" data-label="Meeting">
        <strong>${esc(fmtDay(r.date))} · ${esc(slotTime(r))}</strong>
        <small>Received ${esc(r.received)} · ${esc(r.id)}</small>
        ${clash ? `<div class="clash">${taken[`${r.date} ${r.slot}`]} requests for this slot</div>` : ""}
      </td>
      <td data-label="Visitor"><strong>${esc(r.name)}</strong><small>${esc(r.company)}</small><small>${esc(r.country)}</small></td>
      <td data-label="Contact"><a href="mailto:${esc(r.email)}">${esc(r.email)}</a><small><a href="tel:${esc(tel)}">${esc(r.phone)}</a></small></td>
      <td data-label="Products">${esc(r.products)}</td>
      <td class="c-msg" data-label="Message"><p>${esc(r.message) || "—"}</p>${(r.extra || []).map((x) =>
        `<p class="extra"><span>${esc(x.label)}</span> ${esc(x.value)}</p>`).join("")}</td>
      <td data-label="Status">
        <select class="status" data-id="${esc(r.id)}" data-v="${esc(r.status)}" aria-label="Status for ${esc(r.name)}"${state.busy === r.id ? " disabled" : ""}>
          ${state.statuses.map((s) => `<option${s === r.status ? " selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
        ${rowActions(r)}
      </td>
    </tr>`;
  }).join("");
  $("#empty").hidden = rows.length > 0 || !total;
  $("#table").hidden = rows.length === 0;
}

// links under the status: what can be done with this meeting next
function rowActions(r) {
  const id = esc(r.id);
  // kind: "primary" (the next thing to do), "" (plain button) or "quiet" / "quiet danger" (text only)
  const btn = (act, label, kind = "") => `<button class="act${kind ? kind.split(" ").map((k) => ` act--${k}`).join("") : ""}" type="button" data-act="${act}" data-id="${id}">${label}</button>`;
  if (r.status === "Cancelled") return "";
  if (r.status !== "Completed") return `<div class="row-actions">${meetingButtons(r)}</div>`;
  const m = r.minutes || "None";
  if (m === "Ready") {
    const f = followupLabel(r); // js/followup.js
    const kind = r.followup === "Sent" ? "quiet" : r.followup === "Failed" ? "danger" : "primary";
    return `<div class="row-actions">${btn("minutes", "View minutes")}${btn("followup", esc(f), kind)}</div>`;
  }
  if (m === "Processing" || m === "Pending") return `<div class="row-actions">${btn("minutes", "Writing minutes…", "quiet")}</div>`;
  if (m === "Failed") return `<div class="row-actions">${btn("retry-minutes", "Minutes failed · Retry", "danger")}</div>`;
  return `<div class="row-actions">${btn("add-notes", "Add notes", "primary")}</div>`;
}

// a meeting that hasn't happened yet: notes while it runs (js/ink.js), then complete or cancel it
function meetingButtons(r) {
  const id = esc(r.id);
  return `<button class="act act--primary" type="button" data-act="complete" data-id="${id}">Mark complete</button>` +
    `<button class="act" type="button" data-act="take-notes" data-id="${id}">${r.minutes === "Draft" ? "Open notes" : "Take notes"}</button>` +
    `<button class="act act--quiet act--danger" type="button" data-act="cancel-meeting" data-id="${id}">Cancel meeting</button>`;
}

// ---------- scheduled: confirmed meetings only ----------
const scheduledRows = () => expoRows().filter((r) => r.status === "Confirmed")
  .sort((a, b) => `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`));

// the date and time at the expo now: { date: "2026-11-23", min: 630 }
function expoNow(tz) {
  try {
    const p = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
  } catch { return null; }
}

function renderScheduled() {
  const expo = curExpo() || {};
  const all = scheduledRows();
  const q = state.schedQ;
  const count = (d) => all.filter((r) => !d || r.date === d).length;
  $("#schedDays").innerHTML = [{ id: "", label: "All days" }, ...expoDays()]
    .map((d) => `<button class="tab" role="tab" type="button" data-sday="${d.id}" aria-selected="${state.schedDay === d.id}">${d.label}<span>${count(d.id)}</span></button>`)
    .join("");

  // on now, next up, or over but not marked complete yet
  const now = expoNow(expo.timezone);
  const len = expo.slotMinutes || 30;
  const flags = {};
  let next = false;
  if (now) all.forEach((r) => {
    const [h, m] = r.slot.split(":").map(Number);
    const start = h * 60 + m;
    if (r.date < now.date || (r.date === now.date && start + len <= now.min)) flags[r.id] = "past";
    else if (r.date === now.date && start <= now.min) flags[r.id] = "now";
    else if (!next) { flags[r.id] = "next"; next = true; }
  });
  const FLAG = { now: "On now", next: "Next", past: "Over · mark it complete" };

  const rows = all.filter((r) => (!state.schedDay || r.date === state.schedDay) &&
    (!q || [r.name, r.company, r.email, r.phone, r.country, r.products, r.message, r.id, ...(r.extra || []).map((x) => x.value)]
      .join(" ").toLowerCase().includes(q)));
  const today = now ? all.filter((r) => r.date === now.date).length : 0;
  $("#countLine").textContent = all.length
    ? `${all.length} confirmed meeting${all.length === 1 ? "" : "s"}${today ? ` · ${today} today` : ""}${rows.length !== all.length ? ` · showing ${rows.length}` : ""}`
    : "No confirmed meetings yet.";

  // the labels this expo's booking form uses
  const label = (key, def) => ((expo.fields || []).find((f) => f.key === key) || {}).label || def;
  const card = (r) => {
    const tel = String(r.phone || "").replace(/[^\d+]/g, "");
    const info = [
      [label("email", "Email"), r.email && `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`],
      [label("phone", "Phone"), r.phone && `<a href="tel:${esc(tel)}">${esc(r.phone)}</a>`],
      [label("products", "Products of interest"), esc(r.products)],
      [label("message", "Message"), r.message && `<span class="pre">${esc(r.message)}</span>`],
      ...(r.extra || []).map((x) => [x.label, `<span class="pre">${esc(x.value)}</span>`]),
    ].filter((x) => x[1]);
    const f = flags[r.id];
    return `<article class="meet${f ? ` is-${f}` : ""}">
      <div class="meet__when"><strong>${esc(slotTime(r))}</strong>${f ? `<span class="meet__flag">${FLAG[f]}</span>` : ""}</div>
      <div class="meet__main">
        <h3>${esc(r.name)}</h3>
        <p class="meet__co">${[r.company, r.country].filter(Boolean).map(esc).join(" · ")}</p>
        ${info.length ? `<dl class="meet__info">${info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
        <small class="muted">Booked ${esc(r.received)} · ${esc(r.id)}</small>
      </div>
      <div class="meet__actions">${meetingButtons(r)}</div>
    </article>`;
  };
  const days = [...new Set(rows.map((r) => r.date))];
  $("#sched").innerHTML = rows.length
    ? days.map((d) => {
      const list = rows.filter((r) => r.date === d);
      return `<section class="sched__day"><h2>${esc(fmtDay(d))} <span>${list.length} meeting${list.length === 1 ? "" : "s"}</span></h2>${list.map(card).join("")}</section>`;
    }).join("")
    : `<p class="empty sched__empty">${all.length ? "No confirmed meetings match."
      : "No confirmed meetings yet. When you set a request to Confirmed on the Requests tab, it shows here."}</p>`;
}

$("#schedDays").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (!b) return;
  state.schedDay = b.dataset.sday;
  render();
});
$("#schedSearch").addEventListener("input", (e) => { state.schedQ = e.target.value.trim().toLowerCase(); render(); });
$("#sched").addEventListener("click", (e) => {
  const b = e.target.closest('button[data-act="cancel-meeting"]');
  if (b) cancelMeeting(b.dataset.id);
});

// ---------- status ----------
async function saveStatus(id, status) {
  const row = state.rows.find((r) => r.id === id);
  if (!row) return;
  const before = row.status;
  row.status = status;
  state.busy = id;
  render();
  try {
    const r = await api("status", { token: store.get(TOKEN_KEY), id, status });
    if (!r.ok) throw new Error(r.error);
  } catch (ex) {
    row.status = before;
    if (ex.message === "slot_taken") {
      alert("This time has been booked or blocked since the request was cancelled, so it can't be reopened. The list will now refresh.");
      load();
    } else if (ex.message !== "auth") alert("Couldn't save the status. Please try again.");
  } finally {
    state.busy = "";
  }
  renderFilters();
  render();
}

// asks first, then cancels: the time becomes free for visitors again
function cancelMeeting(id) {
  const r = state.rows.find((x) => x.id === id);
  if (!r) return;
  const who = r.company ? `${r.name} (${r.company})` : r.name;
  if (!confirm(`Cancel the meeting with ${who} on ${fmtDay(r.date)}, ${slotTime(r)}?\n\nThe time becomes free for visitors to book again.`)) return;
  saveStatus(id, "Cancelled");
}

$("#rows").addEventListener("change", (e) => {
  const sel = e.target.closest(".status");
  if (!sel) return;
  const row = state.rows.find((r) => r.id === sel.dataset.id);
  // completing goes through the notes pop-up (js/minutes.js), not straight to the sheet
  if (sel.value === "Completed" && row && row.status !== "Completed") {
    sel.value = row.status;
    openComplete(row.id);
    return;
  }
  saveStatus(sel.dataset.id, sel.value);
});
$("#rows").addEventListener("click", (e) => {
  const b = e.target.closest('button[data-act="cancel-meeting"]');
  if (b) cancelMeeting(b.dataset.id);
});

// ---------- availability ----------
function renderAvail() {
  const expo = curExpo();
  if (!expo) { $("#avail").innerHTML = ""; return; }
  const booked = {};
  expoRows().forEach((r) => { if (r.status !== "Cancelled") (booked[`${r.date} ${r.slot}`] = booked[`${r.date} ${r.slot}`] || []).push(r); });
  const blocked = {};
  state.blocked.filter((b) => b.expo === expo.id).forEach((b) => { blocked[`${b.date} ${b.slot}`] = b; });
  const n = { free: 0, booked: 0, blocked: 0 };

  $("#avail").innerHTML = expoDays().map((d) => `<section class="avail__day">
      <h2>${esc(fmtDay(d.id))}</h2>
      ${expo.slots.map((t) => {
        const k = `${d.id} ${t}`;
        const at = `data-day="${d.id}" data-slot="${t}"`;
        const time = `<span class="avail__time">${fmtRange(t)}</span>`;
        const busy = state.busy === k;
        if (booked[k]) {
          n.booked++;
          const who = booked[k].map((r) => r.company || r.name).join(", ");
          // normally one booking per slot; older clashing rows each get their own button
          const cancel = booked[k].filter((r) => r.status !== "Completed").map((r) => {
            const label = booked[k].length > 1 ? `Cancel ${esc(r.company || r.name)}` : "Cancel meeting";
            const saving = state.busy === r.id;
            return `<button class="link link--danger" type="button" data-act="cancel-meeting" data-id="${esc(r.id)}"${saving ? " disabled" : ""}>${saving ? "Saving…" : label}</button>`;
          }).join("");
          const label = booked[k].every((r) => r.status === "Completed") ? "Completed" : "Booked";
          return `<div class="avail__row is-booked">${time}<span class="avail__state" title="${esc(who)}">${label} · ${esc(who)}</span>${cancel}</div>`;
        }
        if (blocked[k]) {
          n.blocked++;
          const why = blocked[k].reason ? `Blocked · ${blocked[k].reason}` : "Blocked";
          return `<div class="avail__row is-blocked">${time}<span class="avail__state" title="${esc(why)}">${esc(why)}</span>
            <button class="link" type="button" data-act="unblock" ${at}${busy ? " disabled" : ""}>${busy ? "Saving…" : "Unblock"}</button></div>`;
        }
        n.free++;
        if (state.blocking === k) {
          return `<form class="avail__row avail__form" ${at}>${time}
            <input name="reason" maxlength="80" placeholder="Reason (optional)" aria-label="Reason for blocking ${fmtRange(t)}">
            <button class="link" type="submit">Block</button>
            <button class="link link--muted" type="button" data-act="cancel">Cancel</button></form>`;
        }
        return `<div class="avail__row">${time}<span class="avail__state">Free</span>
          <button class="link" type="button" data-act="block" ${at}${busy ? " disabled" : ""}>${busy ? "Saving…" : "Block"}</button></div>`;
      }).join("")}
    </section>`).join("");

  $("#countLine").textContent = `${n.free} free · ${n.booked} booked · ${n.blocked} blocked`;
  const input = $("#avail .avail__form input");
  if (input) input.focus();
}

$("#avail").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  if (b.dataset.act === "block") { state.blocking = `${b.dataset.day} ${b.dataset.slot}`; render(); }
  if (b.dataset.act === "cancel") { state.blocking = ""; render(); }
  if (b.dataset.act === "unblock") saveBlock("unblock", b.dataset.day, b.dataset.slot);
  if (b.dataset.act === "cancel-meeting") cancelMeeting(b.dataset.id);
});
$("#avail").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  saveBlock("block", f.dataset.day, f.dataset.slot, f.reason.value.trim());
});
$("#avail").addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.blocking) { state.blocking = ""; render(); }
});

async function saveBlock(action, date, slot, reason = "") {
  state.blocking = "";
  state.busy = `${date} ${slot}`;
  render();
  try {
    const r = await api(action, { token: store.get(TOKEN_KEY), expo: state.expoId, date, slot, reason });
    if (!r.ok) throw new Error(r.error);
    state.blocked = r.blocked || [];
  } catch (ex) {
    if (ex.message === "slot_taken") {
      alert("A visitor has just booked this time, so it can't be blocked. The list will now refresh.");
      load();
    } else if (ex.message !== "auth") alert("Couldn't save. Please try again.");
  } finally {
    state.busy = "";
  }
  render();
}

// ---------- CSV ----------
$("#csvBtn").addEventListener("click", () => {
  const cols = [["ID", "id"], ["Received (IST)", "received"], ["Meeting date", "date"], ["Meeting time", "time"], ["Name", "name"],
    ["Company", "company"], ["Email", "email"], ["Country", "country"], ["Phone", "phone"], ["Products", "products"],
    ["Message", "message"], ["Status", "status"], ["Minutes", "minutes"], ["Follow-up", "followup"], ["Follow-up sent (IST)", "followupSentAt"]];
  // a column for each of this expo's own questions
  const list = state.view === "scheduled" ? scheduledRows() : visibleRows();
  const extraLabels = [];
  list.forEach((r) => (r.extra || []).forEach((x) => { if (!extraLabels.includes(x.label)) extraLabels.push(x.label); }));
  extraLabels.forEach((l) => cols.splice(cols.length - 4, 0, [l, `extra:${l}`]));
  // quote every cell, and stop spreadsheet apps from running cells that start like a formula
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const value = (r, k) => (k === "time" ? slotTime(r)
    : k.startsWith("extra:") ? ((r.extra || []).find((x) => x.label === k.slice(6)) || {}).value || "" : r[k]);
  const csv = [cols.map((c) => cell(c[0])), ...list.map((r) => cols.map((c) => cell(value(r, c[1]))))].map((l) => l.join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `rp-${state.expoId || "expo"}-${state.view === "scheduled" ? "scheduled" : "requests"}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- start ----------
showView(location.hash.slice(1) || store.get(VIEW_KEY));
if (store.get(TOKEN_KEY)) showApp();
else $("#loginId").focus();
