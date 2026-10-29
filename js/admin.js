// Expo meetings · a company's admin dashboard. Everything shown is for the expo picked at the top.
// The company comes from ?c= (a /xyz/admin link sends you there); none means RP Industries.
// The owners' dashboard (super.html) opens it signed in, with #auth=<token>.

const API = (window.RP_CONFIG && window.RP_CONFIG.API_URL) || "";
const COMPANY_ID = (new URLSearchParams(location.search).get("c") || "rp").toLowerCase().replace(/[^a-z0-9-]/g, "");
// RP keeps its old key names, so its people stay signed in
const KEY_PREFIX = COMPANY_ID === "rp" ? "rp_admin" : `adm_${COMPANY_ID}`;
const TOKEN_KEY = `${KEY_PREFIX}_token`;
const USER_KEY = `${KEY_PREFIX}_user`;
const VIEW_KEY = `${KEY_PREFIX}_view`;
const EXPO_KEY = `${KEY_PREFIX}_expo`;

const $ = (s) => document.querySelector(s);
const state = {
  rows: [], blocked: [], statuses: ["New", "Confirmed", "Completed", "Cancelled"], day: "", q: "", status: "", sort: "meeting",
  schedDay: "", schedQ: "", schedStatus: "", // Scheduled view: day tab, search and status (New / Confirmed)
  view: "requests", blocking: "", busy: "", // blocking: slot whose reason box is open; busy: slot being saved
  expos: [], expoId: "", catalogue: [],      // every expo's settings (from the server) and the one picked
  company: null, template: null,             // the company (branding, seats, products) and a new expo's starting settings
};

// RP Industries as before companies existed (an Apps Script from before this update sends no company)
const RP_COMPANY = { id: "rp", name: "RP Industries", status: "Active", seats: 99, seatsUsed: 0,
  brand: { logo: "/assets/rp-logo.png", primary: "#003279", accent: "#009138", highlight: "#4cd383", font: "Plus Jakarta Sans" },
  profile: { shortName: "RP Industries", tagline: "Quality Matters First", headline: "World's No. 1 Prazole Intermediate Manufacturer",
    highlight: "Prazole Intermediate", products: [], signature: { team: "Team RP Industries", tagline: "Quality Matters First", phone: "", email: "", website: "" } } };
const isRP = () => COMPANY_ID === "rp";
// an expo's booking page: RP's are /<expo> (its default also /invite), other companies' /<company>/<expo>
function bookingLink(expoId) {
  return isRP() ? `${location.origin}/${expoId}` : `${location.origin}/${COMPANY_ID}/${expoId}`;
}

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

// kept on the device (not just this tab), so a tablet that loses its connection stays signed in; logins last 12 hours
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch {} },
};

// every call goes through js/offline.js, which keeps changes on the device while there's no connection
function api(action, data = {}) {
  return window.Offline ? window.Offline.api(action, data) : apiRaw(action, data);
}

async function apiRaw(action, data = {}) {
  if (!API) throw new Error("not_configured_url");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, tenant: COMPANY_ID, ...data }),
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
  company_not_live: "This dashboard isn't switched on yet.",
  company_paused: "This dashboard is paused at the moment. Please contact us.",
  no_company: "This dashboard link isn't valid. Please check it.",
};

// the company's branding on the page; before login from the public "company" answer
function brandPage(c) {
  if (!c || !c.brand) return;
  state.company = Object.assign({}, state.company || {}, c);
  window.Brand.apply(c);
  const who = (c.profile && c.profile.shortName) || c.name;
  document.title = `Meeting requests · ${who}`;
  $("#homeLink").href = isRP() ? "index.html" : `/${COMPANY_ID}`;
  // for the next visit: the page looks like the company from its first moment (admin.html reads it)
  if (!isRP()) store.set(`${KEY_PREFIX}_look`, JSON.stringify(Object.assign(window.Brand.look(c, document.title),
    { company: { id: c.id, name: c.name, brand: c.brand, profile: { shortName: c.profile.shortName, tagline: c.profile.tagline } } })));
}
// the company's look from the last visit, straight away (the server's follows)
if (!isRP()) {
  try { const l = JSON.parse(store.get(`${KEY_PREFIX}_look`) || "null"); if (l && l.company) brandPage(l.company); } catch {}
}
(async () => {
  if (isRP() || !API) return;
  try {
    const r = await api("company");
    if (r.ok) brandPage(r.company);
    else { $("#loginErr").textContent = LOGIN_ERRORS[r.error] || LOGIN_ERRORS.no_company; $("#loginErr").hidden = false; }
  } catch {}
})();

// opened from the owners' dashboard: #auth=<token>
(() => {
  const m = /^#auth=([\w.=-]+)/.exec(location.hash);
  if (!m) return;
  store.set(TOKEN_KEY, m[1]);
  store.set(USER_KEY, "Owner");
  history.replaceState(null, "", `${location.pathname}${location.search}#requests`);
})();

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
$("#logoutBtn").addEventListener("click", async () => {
  const n = window.Offline ? await window.Offline.waiting() : 0;
  if (n && !confirm(`${n} change${n === 1 ? " hasn't" : "s haven't"} been uploaded yet. They stay on this device and upload after the next sign-in. Sign out anyway?`)) return;
  if (window.Offline) await window.Offline.forget(); // the meetings kept on this device for offline use
  signOut();
});

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
    state.expos = r.expos || (isRP() ? [OLD_SCRIPT_EXPO] : []);
    state.oldScript = !r.expos;
    state.catalogue = r.catalogue || OLD_SCRIPT_EXPO.products;
    state.company = r.company || RP_COMPANY;
    state.template = r.template || null;
    brandPage(state.company);
    state.rows.forEach((x) => { x.expo = x.expo || "cphi-india-2026"; x.extra = x.extra || []; x.history = x.history || []; });
    state.blocked.forEach((x) => { x.expo = x.expo || "cphi-india-2026"; });
    if (!curExpo()) {
      const pick = store.get(EXPO_KEY);
      state.expoId = (state.expos.find((e) => e.id === pick) || state.expos.find((e) => e.isDefault && e.status === "Active") || state.expos[0] || {}).id || "";
    }
    renderExpoSelect();
    renderFilters();
    if (!state.expos.length && state.view !== "settings") showView("settings"); // a new company: set up its first expo
    else render();
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
  $("#expoSelect").closest(".expo-pick").hidden = !state.expos.length || state.view === "mailer";
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

// meetings the team added outside the booking page ("team:<minutes>:<who>" in page)
const addedByTeam = (r) => /^team:/.test(r.page || "");
const meetingMinutes = (r) => Number((/^team:(\d+)/.exec(r.page || "") || [])[1] || 0);
// the expo's slots a request takes: its own, or every slot a team-added meeting's time overlaps (as Code.gs)
function rowSlots(r, expo = curExpo()) {
  const len = meetingMinutes(r);
  if (!len || !expo) return [r.slot];
  const min = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
  const start = min(r.slot);
  const out = expo.slots.filter((s) => min(s) < start + len && min(s) + expo.slotMinutes > start);
  return out.length ? out : [r.slot];
}

function fmtDay(d) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// ---------- views ----------
function showView(view) {
  state.view = ["scheduled", "slots", "settings", "mailer"].includes(view) ? view : "requests";
  store.set(VIEW_KEY, state.view);
  try { history.replaceState(null, "", `#${state.view}`); } catch {} // admin.html#scheduled opens this view
  $("#viewTabs").querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === state.view)));
  $("#requestsView").hidden = state.view !== "requests";
  $("#scheduledView").hidden = state.view !== "scheduled";
  $("#slotsView").hidden = state.view !== "slots";
  $("#settingsView").hidden = state.view !== "settings";
  $("#mailerView").hidden = state.view !== "mailer";
  // the mailer isn't about one expo
  $("#countLine").hidden = state.view === "mailer";
  $(".expo-pick").hidden = state.view === "mailer" || !(state.expos || []).length;
  $("#csvBtn").hidden = !["requests", "scheduled"].includes(state.view);
  $("#addMeetingBtn").hidden = ["settings", "mailer"].includes(state.view);
  $("#refreshBtn").hidden = ["settings", "mailer"].includes(state.view);
  if (!$("#appView").hidden) state.view === "mailer" ? openMailer() : render();
}
$("#viewTabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (!b) return;
  if (state.view === "settings" && b.dataset.view !== "settings" && typeof settingsDirty === "function" && settingsDirty() &&
      !confirm("You have unsaved changes to this expo. Leave anyway?")) return;
  showView(b.dataset.view);
});

function render() {
  if (state.view === "mailer") return; // js/mailer.js keeps its own page
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
        <small>${esc(ageLine(r))} · ${esc(receivedLine(r))} · ${esc(r.id)}</small>
        ${clash ? `<div class="clash">${taken[`${r.date} ${r.slot}`]} requests for this slot</div>` : ""}
      </td>
      <td data-label="Visitor"><strong>${esc(r.name)}</strong><small>${esc(r.company)}</small><small>${esc(r.country)}</small></td>
      <td data-label="Contact"><a href="mailto:${esc(r.email)}">${esc(r.email)}</a><small><a href="tel:${esc(tel)}">${esc(r.phone)}</a></small></td>
      <td data-label="Products">${esc(r.products)}</td>
      <td class="c-msg" data-label="Message"><p>${esc(r.message) || "—"}</p>${(r.extra || []).map((x) =>
        `<p class="extra"><span>${esc(x.label)}</span> ${esc(x.value)}</p>`).join("")}</td>
      <td data-label="Status">
        <select class="status" data-id="${esc(r.id)}" data-v="${esc(r.status)}" aria-label="Status for ${esc(r.name)}"${state.busy === r.id ? " disabled" : ""}>
          ${state.statuses.filter((s) => s !== "Completed" || r.status === "Completed").map((s) => `<option${s === r.status ? " selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
        ${lastChange(r) ? `<small>${esc(lastChange(r))}</small>` : ""}
        ${rowActions(r)}
      </td>
    </tr>`;
  }).join("");
  $("#empty").hidden = rows.length > 0 || !total;
  $("#table").hidden = rows.length === 0;
}

// Requests contains decisions only. Meeting notes and completion live in Scheduled.
function rowActions(r) {
  const id = esc(r.id);
  const scheduled = `<button class="act" type="button" data-act="view-scheduled" data-id="${id}">View in Scheduled</button>`;
  if (r.status === "Cancelled") return emailRetryButton(r);
  if (r.status === "Completed") return `<div class="row-actions">${scheduled}</div>`;
  const actions = r.status === "New" ? answerButtons(r) :
    `<button class="act act--primary" type="button" data-act="reschedule" data-id="${id}">Reschedule</button>` +
    `<button class="act act--quiet act--danger" type="button" data-act="cancel-meeting" data-id="${id}">Cancel meeting</button>` + scheduled;
  return `<div class="row-actions">${actions}${emailRetryButton(r)}</div>`;
}

// Minutes, notes and follow-ups remain accessible under Scheduled → Completed.
function completedMeetingButtons(r) {
  const id = esc(r.id);
  // kind: "primary" (the next thing to do), "" (plain button) or "quiet" / "quiet danger" (text only)
  const btn = (act, label, kind = "") => `<button class="act${kind ? kind.split(" ").map((k) => ` act--${k}`).join("") : ""}" type="button" data-act="${act}" data-id="${id}">${label}</button>`;
  const m = r.minutes || "None";
  if (m === "Ready") {
    const f = followupLabel(r); // js/followup.js
    const kind = r.followup === "Sent" ? "quiet" : r.followup === "Failed" ? "danger" : "primary";
    return `${btn("minutes", "View minutes")}${btn("followup", esc(f), kind)}`;
  }
  if (m === "Processing" || m === "Pending") return btn("minutes", "Writing minutes…", "quiet");
  if (m === "Failed") return btn("retry-minutes", "Minutes failed · Retry", "danger");
  return btn("add-notes", "Add notes", "primary");
}

// Answer a new request, in Requests and Scheduled (js/decide.js).
function answerButtons(r) {
  const id = esc(r.id);
  return `<button class="act act--primary" type="button" data-act="accept" data-id="${id}">Accept</button>` +
    `<button class="act" type="button" data-act="reschedule" data-id="${id}">Reschedule</button>` +
    `<button class="act act--quiet act--danger" type="button" data-act="reject" data-id="${id}">Reject</button>`;
}

function emailRetryButton(r) {
  const last = (r.history || []).slice(-1)[0];
  return last && last.mailError && last.emailed !== true
    ? `<button class="act act--danger" type="button" data-act="retry-status-email" data-id="${esc(r.id)}">Email failed · Retry</button>` : "";
}

// Scheduled: answer new requests (accept, reschedule, reject) and run confirmed meetings, right on the card.
// The decisions open js/decide.js's pop-up, which can email the visitor.
function scheduledButtons(r) {
  const id = esc(r.id);
  if (r.status === "New") return answerButtons(r) + emailRetryButton(r);
  if (r.status === "Completed") return completedMeetingButtons(r);
  return `<button class="act act--primary" type="button" data-act="complete" data-id="${id}">Mark complete</button>` +
    `<button class="act" type="button" data-act="take-notes" data-id="${id}">${r.minutes === "Draft" ? "Open notes" : "Take notes"}</button>` +
    `<button class="act" type="button" data-act="reschedule" data-id="${id}">Reschedule</button>` +
    `<button class="act act--quiet act--danger" type="button" data-act="reject" data-id="${id}">Cancel meeting</button>` + emailRetryButton(r);
}

// ---------- scheduled: every meeting still to happen (new requests and confirmed meetings) ----------
const scheduledRows = () => expoRows().filter((r) => r.status === "New" || r.status === "Confirmed")
  .sort((a, b) => `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`));
const completedRows = () => expoRows().filter((r) => r.status === "Completed")
  .sort((a, b) => `${b.date} ${b.slot}`.localeCompare(`${a.date} ${a.slot}`));

// "24 Oct" (with the year when it isn't this year's)
function shortDate(d) {
  const [y, m, day] = d.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, day));
  const opts = { day: "numeric", month: "short", timeZone: "UTC" };
  if (y !== new Date().getFullYear()) opts.year = "numeric";
  return x.toLocaleDateString("en-GB", opts);
}

// Received timestamps are stored in IST, regardless of the expo or the device's time zone.
function leadAge(r) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(r.received || "");
  if (!m) return null;
  const today = (expoNow("Asia/Kolkata") || {}).date;
  const days = today ? Math.round((Date.parse(today) - Date.parse(m[1])) / 86400000) : NaN;
  return Number.isFinite(days) && days >= 0 ? days : null;
}

function ageLine(r) {
  const days = leadAge(r);
  return days === null ? "Lead age unavailable" : days === 0 ? "New lead today" : `Lead · ${days} day${days === 1 ? "" : "s"} old`;
}

function receivedLine(r) {
  const who = addedByTeam(r) ? "Added by team" : "Received";
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(r.received || "");
  if (!m) return addedByTeam(r) ? "Added on this device · awaiting upload" : "Received date unavailable";
  const [y, month, day] = m[1].split("-").map(Number);
  const date = new Date(Date.UTC(y, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  return `${who} ${date} at ${m[2]} IST`;
}

// the last status change: "Accepted 26 Oct by admin · visitor emailed"
function lastChange(r) {
  const h = (r.history || []).slice(-1)[0];
  if (!h) return "";
  const what = h.action === "status" ? `Set to ${h.to}`
    : h.action === "reject" ? (h.from === "Confirmed" ? "Cancelled" : "Rejected")
    : { accept: "Accepted", reschedule: "Rescheduled" }[h.action] || "Changed";
  const at = /^\d{4}-\d{2}-\d{2}/.test(h.at || "") ? ` ${shortDate(h.at.slice(0, 10))}` : "";
  const by = h.by ? ` by ${h.by}` : " on this device";
  const from = h.action === "reschedule" && /^\d{4}-\d{2}-\d{2} /.test(h.from || "") ? ` from ${fmtDay(h.from.slice(0, 10))}, ${h.from.slice(11)}` : "";
  const mail = h.action === "status" ? ""
    : h.emailed === true ? " · visitor emailed"
    : h.emailed === "when online" ? " · visitor emailed once it uploads"
    : h.mailError ? " · the email couldn't be sent" : " · visitor not emailed";
  return `${what}${at}${by}${from}${mail}`;
}

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
  const completed = state.schedStatus === "Completed";
  const all = completed ? completedRows() : scheduledRows();
  const byStatus = all.filter((r) => !state.schedStatus || r.status === state.schedStatus);
  const count = (d) => byStatus.filter((r) => !d || r.date === d).length;
  $("#schedDays").innerHTML = [{ id: "", label: "All days" }, ...expoDays()]
    .map((d) => `<button class="tab" role="tab" type="button" data-sday="${d.id}" aria-selected="${state.schedDay === d.id}">${d.label}<span>${count(d.id)}</span></button>`)
    .join("");

  // on now, next up, or over but not marked complete yet
  const now = expoNow(expo.timezone);
  const len = expo.slotMinutes || 30;
  const flags = {};
  let next = false;
  if (now && !completed) all.forEach((r) => {
    const [h, m] = r.slot.split(":").map(Number);
    const start = h * 60 + m;
    const mlen = meetingMinutes(r) || len;
    if (r.date < now.date || (r.date === now.date && start + mlen <= now.min)) flags[r.id] = "past";
    else if (r.date === now.date && start <= now.min) flags[r.id] = "now";
    else if (!next) { flags[r.id] = "next"; next = true; }
  });
  const FLAG = { now: "On now", next: "Next", past: "Over · mark it complete" };
  const flagText = (r, f) => (f === "past" && r.status === "New" ? "Time passed · not answered" : FLAG[f]);

  const rows = visibleScheduledRows();
  const upcoming = all.filter((r) => flags[r.id] !== "past");
  const past = all.length - upcoming.length;
  const today = now ? upcoming.filter((r) => r.date === now.date).length : 0;
  const waiting = upcoming.filter((r) => r.status === "New").length;
  const confirmed = upcoming.filter((r) => r.status === "Confirmed").length;
  $("#countLine").textContent = completed ? `${all.length} completed meeting${all.length === 1 ? "" : "s"}${rows.length !== all.length ? ` · showing ${rows.length}` : ""}` : all.length
    ? `${upcoming.length} upcoming meeting${upcoming.length === 1 ? "" : "s"} · ${confirmed} confirmed · ${waiting} awaiting your reply${today ? ` · ${today} today` : ""}${past ? ` · ${past} past meeting${past === 1 ? " needs" : "s need"} attention` : ""}${rows.length !== all.length ? ` · showing ${rows.length}` : ""}`
    : "No upcoming meetings yet.";

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
    const isNew = r.status === "New";
    const last = lastChange(r);
    return `<article class="meet${isNew ? " is-new" : ""}${f ? ` is-${f}` : ""}">
      <div class="meet__when"><strong>${esc(slotTime(r))}</strong>
        <span class="meet__status">${r.status === "Completed" ? "Completed" : isNew ? "Awaiting your reply" : (r.history || []).slice(-1)[0]?.action === "reschedule" ? "Rescheduled · confirmed" : "Confirmed"}</span>${f ? `<span class="meet__flag">${flagText(r, f)}</span>` : ""}</div>
      <div class="meet__main">
        <h3>${esc(r.name)}</h3>
        <p class="meet__co">${[r.company, r.country].filter(Boolean).map(esc).join(" · ")}</p>
        <div class="meet__lead"><span class="lead-age">${esc(ageLine(r))}</span><span>${esc(receivedLine(r))}</span></div>
        ${info.length ? `<dl class="meet__info">${info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
        <small class="muted meet__age">Meeting ID: ${esc(r.id)}</small>
        ${last ? `<small class="muted meet__age">${esc(last)}</small>` : ""}
      </div>
      <div class="meet__actions">${scheduledButtons(r)}</div>
    </article>`;
  };
  const days = [...new Set(rows.map((r) => r.date))];
  $("#sched").innerHTML = rows.length
    ? days.map((d) => {
      const list = rows.filter((r) => r.date === d);
      return `<section class="sched__day"><h2>${esc(fmtDay(d))} <span>${list.length} meeting${list.length === 1 ? "" : "s"}</span></h2>${list.map(card).join("")}</section>`;
    }).join("")
    : `<p class="empty sched__empty">${all.length ? "No meetings match." : completed ? "No completed meetings yet."
      : "No upcoming meetings yet. New requests and confirmed meetings show here."}</p>`;
}

function visibleScheduledRows() {
  const q = state.schedQ;
  return (state.schedStatus === "Completed" ? completedRows() : scheduledRows()).filter((r) => (!state.schedStatus || r.status === state.schedStatus) &&
    (!state.schedDay || r.date === state.schedDay) &&
    (!q || [r.name, r.company, r.email, r.phone, r.country, r.products, r.message, r.id, ...(r.extra || []).map((x) => x.value)]
      .join(" ").toLowerCase().includes(q)));
}

$("#schedDays").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (!b) return;
  state.schedDay = b.dataset.sday;
  render();
});
$("#schedSearch").addEventListener("input", (e) => { state.schedQ = e.target.value.trim().toLowerCase(); render(); });
$("#schedStatus").addEventListener("change", (e) => { state.schedStatus = e.target.value; render(); });
$("#sched").addEventListener("click", (e) => {
  const b = e.target.closest('button[data-act="review-request"]');
  if (!b) return;
  state.day = "";
  state.status = "";
  state.q = b.dataset.id.toLowerCase();
  $("#search").value = b.dataset.id;
  $("#statusFilter").value = "";
  renderFilters();
  showView("requests");
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

// asks first (the Reject pop-up in js/decide.js, which can also email the visitor), then cancels:
// the time becomes free for visitors again
function cancelMeeting(id) {
  if (state.rows.some((x) => x.id === id)) openDecide(id, "reject");
}

$("#rows").addEventListener("change", (e) => {
  const sel = e.target.closest(".status");
  if (!sel) return;
  const row = state.rows.find((r) => r.id === sel.dataset.id);
  // Confirmation and cancellation use the same email preview as Scheduled.
  if (row && sel.value !== row.status &&
      ((sel.value === "Confirmed" && row.status === "New") ||
       (sel.value === "Cancelled" && ["New", "Confirmed"].includes(row.status)))) {
    const decision = sel.value === "Confirmed" ? "accept" : "reject";
    sel.value = row.status;
    openDecide(row.id, decision);
    return;
  }
  // Completion is only available in Scheduled, including for an older cached status menu.
  if (sel.value === "Completed" && row && row.status !== "Completed") {
    sel.value = row.status;
    viewScheduled(row.id);
    return;
  }
  saveStatus(sel.dataset.id, sel.value);
});
$("#rows").addEventListener("click", (e) => {
  const b = e.target.closest('button[data-act="cancel-meeting"], button[data-act="view-scheduled"]');
  if (!b) return;
  if (b.dataset.act === "cancel-meeting") cancelMeeting(b.dataset.id);
  else viewScheduled(b.dataset.id);
});

function viewScheduled(id) {
  const row = state.rows.find((r) => r.id === id);
  if (!row) return;
  state.schedDay = "";
  state.schedStatus = row.status === "Completed" ? "Completed" : "";
  state.schedQ = id.toLowerCase();
  $("#schedSearch").value = id;
  $("#schedStatus").value = state.schedStatus;
  showView("scheduled");
}

// ---------- availability ----------
function renderAvail() {
  const expo = curExpo();
  if (!expo) { $("#avail").innerHTML = ""; return; }
  const booked = {};
  expoRows().forEach((r) => {
    if (r.status !== "Cancelled") rowSlots(r).forEach((s) => { (booked[`${r.date} ${s}`] = booked[`${r.date} ${s}`] || []).push(r); });
  });
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
            <span class="avail__acts"><button class="link" type="button" data-act="unblock" ${at}${busy ? " disabled" : ""}>${busy ? "Saving…" : "Unblock"}</button>
            <button class="link" type="button" data-act="add-meeting" data-replace="1" ${at}>Add meeting</button></span></div>`;
        }
        n.free++;
        if (state.blocking === k) {
          return `<form class="avail__row avail__form" ${at}>${time}
            <input name="reason" maxlength="80" placeholder="Reason (optional)" aria-label="Reason for blocking ${fmtRange(t)}">
            <button class="link" type="submit">Block</button>
            <button class="link link--muted" type="button" data-act="cancel">Cancel</button></form>`;
        }
        return `<div class="avail__row is-free">${time}<span class="avail__state">Free</span>
          <span class="avail__acts"><button class="link" type="button" data-act="block" ${at}${busy ? " disabled" : ""}>${busy ? "Saving…" : "Block"}</button>
          <button class="link" type="button" data-act="add-meeting" ${at}>Add meeting</button></span></div>`;
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
  if (b.dataset.act === "add-meeting") openAddMeeting({ date: b.dataset.day, slot: b.dataset.slot, replaceBlock: !!b.dataset.replace }); // js/meeting.js
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
  const list = state.view === "scheduled" ? visibleScheduledRows() : visibleRows();
  if (state.view === "scheduled") cols.splice(2, 0, ["Lead age (days)", "leadAge"]);
  const extraLabels = [];
  list.forEach((r) => (r.extra || []).forEach((x) => { if (!extraLabels.includes(x.label)) extraLabels.push(x.label); }));
  extraLabels.forEach((l) => cols.splice(cols.length - 4, 0, [l, `extra:${l}`]));
  // quote every cell, and stop spreadsheet apps from running cells that start like a formula
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const value = (r, k) => (k === "leadAge" ? leadAge(r) : k === "time" ? slotTime(r)
    : k.startsWith("extra:") ? ((r.extra || []).find((x) => x.label === k.slice(6)) || {}).value || "" : r[k]);
  const csv = [cols.map((c) => cell(c[0])), ...list.map((r) => cols.map((c) => cell(value(r, c[1]))))].map((l) => l.join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${isRP() ? "rp" : COMPANY_ID}-${state.expoId || "expo"}-${state.view === "scheduled" ? "scheduled" : "requests"}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- start ----------
showView(location.hash.slice(1) || store.get(VIEW_KEY));
if (store.get(TOKEN_KEY)) showApp();
else $("#loginId").focus();
