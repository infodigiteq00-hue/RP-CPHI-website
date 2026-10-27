// Expo meetings · admin: accept, reschedule or reject a meeting, and tell the visitor.
// One pop-up for all three, opened from Requests (and from Cancel meeting, which is a reject).
// With "Email the visitor" ticked, Code.gs emails them the new status (decideMeeting); an accepted or moved
// meeting comes with a calendar file. The preview here is the same text the visitor gets.
// Loaded after admin.js and meeting.js; uses $, api(), esc(), state, store, expoRows(), rowSlots(), fmtDay(),
// fmtRange(), slotTime(), meetingMinutes(), render(), renderFilters(), load() and TOKEN_KEY.

let dc = null; // the decision, operation ID, and the original meeting shown in the pop-up

const dcRow = () => (dc ? state.rows.find((r) => r.id === dc.id) : null);
const dcExpo = (r) => state.expos.find((e) => e.id === r.expo) || null;
const dcMinutes = (r) => meetingMinutes(r) || (dcExpo(r) || {}).slotMinutes || 30;
const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || "");

// "Monday, 23 November 2026", as in the email (Code.gs, longDate_)
function longDate(d) {
  const [y, m, day] = String(d).split("-").map(Number);
  if (!y) return d;
  const x = new Date(Date.UTC(y, m - 1, day));
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[x.getUTCDay()]}, ${x.getUTCDate()} ${months[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}

// what each choice says and does
function dcText(decision, r) {
  if (decision === "accept") return { title: "Accept meeting", button: "Accept", note: "Personal note",
    lead: "The meeting is confirmed at the time the visitor asked for." };
  if (decision === "reschedule") return { title: "Reschedule meeting", button: "Move meeting", note: "Note",
    lead: "Pick a new time. The meeting is confirmed at that time, and its old time becomes free for visitors." };
  const confirmed = r.status === "Confirmed";
  return { title: confirmed ? "Cancel meeting" : "Reject request", button: confirmed ? "Cancel meeting" : "Reject", note: "Reason",
    lead: `The ${confirmed ? "meeting is cancelled" : "request is rejected"} and its time becomes free for visitors to book again.` };
}

// the time the meeting will have: its own, or the one picked for a reschedule
function dcWhen(r) {
  if (dc.decision !== "reschedule" || !$("#dcTime").value) return { date: r.date, slot: r.slot, time: slotTime(r) };
  const expo = dcExpo(r) || {};
  const slot = $("#dcTime").value;
  return { date: $("#dcDay").value, slot, time: `${fmtRange(slot, dcMinutes(r))} ${expo.tzLabel || ""}`.trim() };
}

// The email, as Code.gs (statusEmail_) writes it: subject and plain text
function dcEmail(r) {
  const c = state.company || {};
  const who = (c.profile && c.profile.shortName) || c.name || "";
  const expo = dcExpo(r) || {};
  const stand = [expo.booth ? "Booth" : "Hall", [expo.booth, expo.hall].filter(Boolean).join(", ")]; // "Booth: 2B59, Hall 2"
  const w = dcWhen(r);
  const note = $("#dcNote").value.trim();
  const sig = c.signatureLines || (() => {
    const s = (c.profile && c.profile.signature) || {};
    return [s.team, s.tagline, [s.phone, s.email].filter(Boolean).join(" · "), (s.website || "").replace(/^https?:\/\//, "")].filter(Boolean);
  })();
  let subject, intro, details, after;
  if (dc.decision === "accept") {
    subject = `Your meeting with ${who} at ${expo.name} is confirmed`;
    intro = `Your meeting with ${who} at ${expo.name} is confirmed. We look forward to meeting you.`;
    details = [["Date", longDate(w.date)], ["Time", w.time], stand, ["Venue", expo.venue]];
    after = "A calendar file is attached. If you need to change the time, just reply to this email.";
  } else if (dc.decision === "reschedule") {
    subject = `New time for your meeting with ${who} at ${expo.name}`;
    intro = `We have moved your meeting with ${who} at ${expo.name} to a new time.`;
    details = [["Date", longDate(w.date)], ["Time", w.time], ["Was", `${longDate(r.date)}, ${slotTime(r)}`], stand, ["Venue", expo.venue]];
    after = "A calendar file with the new time is attached. If the new time doesn't suit you, just reply to this email.";
  } else {
    subject = `Your meeting request with ${who} at ${expo.name}`;
    intro = `Thank you for wanting to meet ${who} at ${expo.name}. Unfortunately our team can't meet you on ${longDate(w.date)}, ${w.time}.`;
    details = [];
    after = "If you'd like to meet at another time, just reply to this email and we'll do our best to find one.";
  }
  details = details.filter((d) => d[1]);
  const text = [`Dear ${r.name || "Sir or Madam"},`, "", intro, "",
    ...(details.length ? [...details.map((d) => `${d[0]}: ${d[1]}`), ""] : []),
    ...(note ? [`${dc.decision === "reject" ? "Reason" : "A note from our team"}:`, note, ""] : []),
    after, "", "Warm regards,", ...sig].join("\n");
  return { subject, text };
}

// the expo's times on a day, for a reschedule: taken ones (by another meeting, or blocked) can't be picked.
// A meeting the team added keeps its length, so every slot it would cover must be free.
function dcTimes(r, day) {
  const expo = dcExpo(r);
  if (!expo) return [];
  const min = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const taken = {};
  expoRows().forEach((x) => { if (x.id !== r.id && x.date === day && x.status !== "Cancelled") rowSlots(x, expo).forEach((s) => { taken[s] = "booked"; }); });
  state.blocked.filter((b) => b.expo === r.expo && b.date === day).forEach((b) => { if (!taken[b.slot]) taken[b.slot] = "blocked"; });
  return expo.slots.map((s) => {
    const start = min(s), end = start + dcMinutes(r);
    const outside = start < min(expo.start) || end > min(expo.end) ||
      (expo.breaks || []).some((br) => start < min(br.end) && end > min(br.start));
    const st = day === r.date && s === r.slot ? "its time now" : outside ? "meeting won't fit" :
      rowSlots({ slot: s, page: r.page }, expo).map((x) => taken[x]).find(Boolean) || "";
    return { slot: s, st };
  });
}

function renderDcTimes(pick) {
  const r = dcRow();
  const times = dcTimes(r, $("#dcDay").value);
  const free = times.filter((t) => !t.st);
  const sel = free.some((t) => t.slot === pick) ? pick : (free[0] || {}).slot;
  $("#dcTime").innerHTML = times.map((t) => `<option value="${esc(t.slot)}"${t.st ? " disabled" : ""}${t.slot === sel ? " selected" : ""}>` +
    `${esc(fmtRange(t.slot, dcMinutes(r)))}${t.st ? ` (${esc(t.st)})` : ""}</option>`).join("");
  if (!free.length) $("#dcTime").value = "";
  dcPreview();
}

// the preview, the checkbox note and the button follow what's picked
function dcPreview() {
  const r = dcRow();
  if (!r) return;
  const canMail = validEmail(r.email);
  const mail = canMail && $("#dcEmail").checked;
  $("#dcEmailNote").textContent = !canMail ? "This meeting has no email address, so the visitor can't be emailed from here. Let them know yourself."
    : mail ? `Sent to ${r.email} by the booking system, under the name ${(state.company.profile || {}).shortName || state.company.name}` +
      `${((state.company.profile || {}).signature || {}).email ? `; replies go to ${state.company.profile.signature.email}` : ""}.`
    : "The visitor won't be told. Let them know yourself.";
  $("#dcPreview").hidden = !mail;
  if (mail) {
    const m = dcEmail(r);
    $("#dcTo").textContent = r.email;
    $("#dcSubject").textContent = m.subject;
    $("#dcText").textContent = m.text;
    $("#dcAttach").textContent = dc.decision === "reject" ? "" : "With a calendar file (.ics) for the meeting.";
  }
  const noTime = dc.decision === "reschedule" && !$("#dcTime").value;
  $("#dcSave").disabled = noTime;
  if (noTime) showDcErr("No free time on this day. Choose another day.");
  else if ($("#decideErr").dataset.kind === "time") $("#decideErr").hidden = true;
}

function showDcErr(text, kind = "time") {
  $("#decideErr").textContent = text;
  $("#decideErr").dataset.kind = kind;
  $("#decideErr").hidden = false;
}

function openDecide(id, decision) {
  const r = state.rows.find((x) => x.id === id);
  const expo = r && dcExpo(r);
  if (!r || !expo) return;
  if (!["New", "Confirmed"].includes(r.status) || (decision === "accept" && r.status !== "New")) return;
  dc = { id, decision, cid: crypto.randomUUID().replace(/-/g, ""), expected: { status: r.status, date: r.date, slot: r.slot } };
  const t = dcText(decision, r);
  $("#decideTitle").textContent = t.title;
  $("#decideWho").textContent = `${r.company ? `${r.name}, ${r.company}` : r.name} · ${fmtDay(r.date)}, ${slotTime(r)}`;
  $("#decideLead").textContent = t.lead;
  $("#dcNoteLabel").textContent = t.note;
  $("#dcNote").value = "";
  $("#dcSave").textContent = t.button;
  $("#dcSave").classList.toggle("btn--danger", decision === "reject");
  $("#decideErr").hidden = true;
  $("#dcEmail").disabled = !validEmail(r.email);
  $("#dcEmail").checked = validEmail(r.email);
  $("#dcWhen").hidden = decision !== "reschedule";
  if (decision === "reschedule") {
    // the meeting's own day first, if it still has a free time
    const days = expo.days.length ? expo.days : [r.date];
    const first = (days.includes(r.date) && dcTimes(r, r.date).some((x) => !x.st) ? r.date :
      days.find((d) => dcTimes(r, d).some((x) => !x.st))) || days[0];
    $("#dcDay").innerHTML = days.map((d) => `<option value="${esc(d)}"${d === first ? " selected" : ""}>${esc(fmtDay(d))}</option>`).join("");
    renderDcTimes("");
  } else {
    dcPreview();
  }
  $("#decideDialog").showModal();
  (decision === "reschedule" ? $("#dcDay") : $("#dcNote")).focus();
}

$("#dcDay").addEventListener("change", () => renderDcTimes($("#dcTime").value));
$("#dcTime").addEventListener("change", dcPreview);
$("#dcNote").addEventListener("input", dcPreview);
$("#dcEmail").addEventListener("change", dcPreview);

// Decision buttons in Requests and Scheduled (Cancel meeting in Requests goes through admin.js's cancelMeeting).
document.addEventListener("click", (e) => {
  const b = e.target.closest('button[data-act="accept"], button[data-act="reschedule"], button[data-act="reject"]');
  if (b && b.dataset.id) openDecide(b.dataset.id, b.dataset.act);
});

const DC_ERRORS = {
  slot_taken: "That time has just been booked or blocked. Choose another.",
  not_open: "This meeting has already been completed or cancelled. The list will refresh.",
  not_found: "This meeting no longer exists. The list will refresh.",
  invalid_slot: "That day or time isn't part of this expo.",
  same_time: "That's the time it already has. Choose another.",
  meeting_changed: "This meeting was changed on another device. Review its latest details before trying again.",
  meeting_outside_hours: "The full meeting must fit within the expo's opening hours and outside breaks. Choose another time.",
  no_expo: "This meeting's expo no longer exists.",
  busy: "The sheet is busy. Try again in a moment.",
  missing_fields: "The booking backend needs the latest Code.gs deployment before these actions can work.",
};

$("#decideForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = dcRow();
  if (!r || $("#dcSave").disabled || $("#decideDialog").classList.contains("is-busy")) return;
  const decision = dc.decision;
  const w = dcWhen(r);
  const notify = validEmail(r.email) && $("#dcEmail").checked;
  const wasConfirmed = r.status === "Confirmed";
  const data = { token: store.get(TOKEN_KEY), id: r.id, decision, note: $("#dcNote").value.trim(), notify,
    cid: dc.cid, expected: dc.expected };
  if (decision === "reschedule") { data.date = w.date; data.time = w.slot; }
  const dialog = $("#decideDialog");
  const btn = $("#dcSave");
  const label = btn.textContent;
  $("#decideErr").hidden = true;
  btn.disabled = true;
  btn.textContent = "Saving…";
  dialog.classList.add("is-busy");
  try {
    const res = await api("decideMeeting", data);
    if (!res.ok) throw new Error(res.error);
    // js/offline.js has already changed the row when it was kept on the device
    if (!res.queued && res.row) Object.assign(r, { status: res.row.status, date: res.row.date, slot: res.row.slot, time: res.row.time, history: res.row.history });
    dialog.classList.remove("is-busy");
    dialog.close();
    const done = decision === "accept" ? "Accepted"
      : decision === "reschedule" ? `Moved to ${fmtDay(w.date)}, ${w.time}`
      : wasConfirmed ? "Meeting cancelled" : "Rejected";
    const name = r.name || "The visitor";
    if (res.queued) actionMsg(`${done}, on this device.${notify ? ` ${name} is emailed once it uploads.` : ""}`);
    else if (res.mailError) actionMsg(`Saved, but the email couldn't be sent: ${res.mailError}`, true);
    else actionMsg(`${done}.${res.emailed ? ` ${name} was emailed at ${r.email}.` : " The visitor wasn't emailed."}`);
    renderFilters();
    render();
  } catch (ex) {
    dialog.classList.remove("is-busy");
    if (ex.message === "auth") return dialog.close();
    showDcErr(DC_ERRORS[ex.message] || "Couldn't save. Try again.", "server");
    if (["meeting_changed", "not_open", "not_found"].includes(ex.message)) {
      dialog.close();
      actionMsg(DC_ERRORS[ex.message], true);
      await load();
    } else if (ex.message === "slot_taken") {
      await load();
      if (dialog.open && dc.decision === "reschedule" && dcRow()) renderDcTimes($("#dcTime").value);
    }
  } finally {
    btn.disabled = dc.decision === "reschedule" && !$("#dcTime").value;
    btn.textContent = label;
  }
});

// a line under the heading saying what happened; errors stay until dismissed
let actionTimer = null;
function actionMsg(text, isErr = false) {
  const p = $("#actionMsg");
  p.innerHTML = `${esc(text)} <button class="link" type="button" data-msg="close">Dismiss</button>`;
  p.classList.toggle("is-err", isErr);
  p.hidden = false;
  clearTimeout(actionTimer);
  if (!isErr) actionTimer = setTimeout(() => { p.hidden = true; }, 12000);
}
$("#actionMsg").addEventListener("click", (e) => { if (e.target.closest('[data-msg="close"]')) $("#actionMsg").hidden = true; });

document.addEventListener("click", async (e) => {
  const button = e.target.closest('button[data-act="retry-status-email"]');
  if (!button || button.disabled) return;
  const row = state.rows.find((r) => r.id === button.dataset.id);
  const last = (row?.history || []).slice(-1)[0];
  if (!last?.mailError) return;
  button.disabled = true;
  button.textContent = "Sending…";
  try {
    const res = await api("retryStatusEmail", { token: store.get(TOKEN_KEY), id: row.id, receipt: JSON.stringify(last) });
    if (!res.ok) throw new Error(res.error);
    row.history = res.history;
    actionMsg(res.mailError ? `The email couldn't be sent: ${res.mailError}` : `${row.name} was emailed at ${row.email}.`, !!res.mailError);
  } catch (ex) {
    if (ex.message === "auth") return;
    actionMsg(DC_ERRORS[ex.message] || "Couldn't send the status email. Check your connection and try again.", true);
    if (ex.message === "meeting_changed") await load();
  } finally {
    render();
  }
});
