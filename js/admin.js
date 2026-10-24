// RP Industries · CPHI meeting requests admin

const API = (window.RP_CONFIG && window.RP_CONFIG.API_URL) || "";
const DAYS = [
  { id: "2026-11-23", label: "Mon 23" },
  { id: "2026-11-24", label: "Tue 24" },
  { id: "2026-11-25", label: "Wed 25" },
];
// 30-minute slots, IST (same as js/main.js and Code.gs)
const SLOTS = ["10:30", "11:00", "11:30", "12:00", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];
const TOKEN_KEY = "rp_admin_token";
const USER_KEY = "rp_admin_user";
const VIEW_KEY = "rp_admin_view";

const $ = (s) => document.querySelector(s);
const state = {
  rows: [], blocked: [], statuses: ["New", "Confirmed", "Completed", "Cancelled"], day: "", q: "", status: "", sort: "meeting",
  view: "requests", blocking: "", busy: "", // blocking: slot whose reason box is open; busy: slot being saved
};

// everything visitors typed goes through this before it reaches the page
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "10:30" -> "10:30 – 11:00 AM", "11:30" -> "11:30 AM – 12:00 PM" (same as the booking page)
function fmt12(hhmm) {
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
function fmtRange(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const end = h * 60 + m + 30;
  const [a, ap] = fmt12(hhmm).split(" ");
  const [b, bp] = fmt12(`${Math.floor(end / 60)}:${end % 60}`).split(" ");
  return ap === bp ? `${a} – ${b} ${bp}` : `${a} ${ap} – ${b} ${bp}`;
}
const slotTime = (r) => (SLOTS.includes(r.slot) ? fmtRange(r.slot) : r.time.replace(/ IST$/, ""));

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

// keep the list current: reload every minute and when the tab comes back into view,
// but not while someone is typing a block reason or changing a status
function autoRefresh() {
  if (document.hidden || $("#appView").hidden || !store.get(TOKEN_KEY)) return;
  if (document.querySelector("dialog[open]")) return; // don't redraw under an open pop-up
  const f = document.activeElement;
  if (f && f.matches("#rows select, #avail input, #avail select, #avail textarea")) return;
  load();
}
setInterval(autoRefresh, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) autoRefresh(); });

function renderFilters() {
  const active = state.rows.filter((r) => r.status !== "Cancelled");
  const count = (d) => active.filter((r) => !d || r.date === d).length;
  $("#dayTabs").innerHTML = [{ id: "", label: "All days" }, ...DAYS]
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
  const rows = state.rows.filter((r) =>
    (!state.day || r.date === state.day) &&
    (!state.status || r.status === state.status) &&
    (!q || [r.name, r.company, r.email, r.phone, r.country, r.products, r.message, r.id].join(" ").toLowerCase().includes(q))
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
  state.view = view === "slots" ? "slots" : "requests";
  store.set(VIEW_KEY, state.view);
  $("#viewTabs").querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === state.view)));
  $("#requestsView").hidden = state.view !== "requests";
  $("#slotsView").hidden = state.view !== "slots";
  $("#csvBtn").hidden = state.view !== "requests";
  if (!$("#appView").hidden) render();
}
$("#viewTabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (b) showView(b.dataset.view);
});

function render() {
  if (state.view === "slots") return renderAvail();
  const rows = visibleRows();
  // two or more live requests for the same slot
  const taken = {};
  state.rows.forEach((r) => { if (r.status !== "Cancelled") { const k = `${r.date} ${r.slot}`; taken[k] = (taken[k] || 0) + 1; } });

  const total = state.rows.length;
  const newCount = state.rows.filter((r) => r.status === "New").length;
  const doneCount = state.rows.filter((r) => r.status === "Completed").length;
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
      <td class="c-msg" data-label="Message"><p>${esc(r.message) || "—"}</p></td>
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
  const link = (act, label, cls = "") => `<button class="link${cls}" type="button" data-act="${act}" data-id="${id}">${label}</button>`;
  if (r.status === "Cancelled") return "";
  if (r.status !== "Completed") {
    return `<div class="row-actions">${link("complete", "Mark complete")}${link("cancel-meeting", "Cancel meeting", " link--danger")}</div>`;
  }
  const m = r.minutes || "None";
  if (m === "Ready") {
    const f = followupLabel(r); // js/followup.js
    const cls = r.followup === "Sent" ? " link--muted" : r.followup === "Failed" ? " link--danger" : "";
    return `<div class="row-actions">${link("minutes", "View minutes")}${link("followup", esc(f), cls)}</div>`;
  }
  if (m === "Processing" || m === "Pending") return `<div class="row-actions">${link("minutes", "Writing minutes…", " link--muted")}</div>`;
  if (m === "Failed") return `<div class="row-actions">${link("retry-minutes", "Minutes failed · Retry", " link--danger")}</div>`;
  return `<div class="row-actions">${link("add-notes", "Add notes")}</div>`;
}

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
  const booked = {};
  state.rows.forEach((r) => { if (r.status !== "Cancelled") (booked[`${r.date} ${r.slot}`] = booked[`${r.date} ${r.slot}`] || []).push(r); });
  const blocked = {};
  state.blocked.forEach((b) => { blocked[`${b.date} ${b.slot}`] = b; });
  const n = { free: 0, booked: 0, blocked: 0 };

  $("#avail").innerHTML = DAYS.map((d) => `<section class="avail__day">
      <h2>${esc(fmtDay(d.id))}</h2>
      ${SLOTS.map((t) => {
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
    const r = await api(action, { token: store.get(TOKEN_KEY), date, slot, reason });
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
  // quote every cell, and stop spreadsheet apps from running cells that start like a formula
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const value = (r, k) => (k === "time" ? `${slotTime(r)} IST` : r[k]);
  const csv = [cols.map((c) => cell(c[0])), ...visibleRows().map((r) => cols.map((c) => cell(value(r, c[1]))))].map((l) => l.join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `rp-cphi-requests-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- start ----------
showView(store.get(VIEW_KEY));
if (store.get(TOKEN_KEY)) showApp();
else $("#loginId").focus();
