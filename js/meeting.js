// Expo meetings · admin: add a meeting arranged outside the booking page (by phone, email, at the booth).
// It's saved as Confirmed (or New) with the expo's slot, or any time and length; a blocked time can be turned
// into the meeting. Loaded after admin.js; uses $, api(), esc(), state, store, curExpo(), expoRows(), rowSlots(),
// fmtDay(), fmtRange(), load() and TOKEN_KEY.

let mt = null; // { replaceBlock } for the pop-up that's open

// what each of the expo's slots on `day` is: "" (free), "booked" or "blocked"
function slotStates(day) {
  const out = {};
  expoRows().forEach((r) => { if (r.date === day && r.status !== "Cancelled") rowSlots(r).forEach((s) => { out[s] = "booked"; }); });
  state.blocked.filter((b) => b.expo === state.expoId && b.date === day).forEach((b) => { if (!out[b.slot]) out[b.slot] = "blocked"; });
  return out;
}

function renderTimes(pick) {
  const expo = curExpo();
  const states = slotStates($("#mtDay").value);
  $("#mtTime").innerHTML = expo.slots.map((s) => {
    const st = states[s];
    return `<option value="${s}"${st === "booked" ? " disabled" : ""}${s === pick ? " selected" : ""}>${esc(fmtRange(s))}${st ? ` (${st})` : ""}</option>`;
  }).join("") + `<option value="other"${pick === "other" ? " selected" : ""}>Another time…</option>`;
  // the first free slot, if the one asked for isn't
  if ($("#mtTime").selectedOptions[0] && $("#mtTime").selectedOptions[0].disabled) {
    const free = [...$("#mtTime").options].find((o) => !o.disabled);
    if (free) free.selected = true;
  }
  timeChanged();
}

function timeChanged() {
  const other = $("#mtTime").value === "other";
  $("#mtOtherTime").hidden = !other;
  $("#mtOtherLen").hidden = !other;
  const states = slotStates($("#mtDay").value);
  $("#mtBlockNote").hidden = other || states[$("#mtTime").value] !== "blocked";
}

function openAddMeeting(at = {}) {
  const expo = curExpo();
  if (!expo) return alert("Create an expo first, in Expo settings.");
  mt = { replaceBlock: !!at.replaceBlock };
  $("#meetingExpo").textContent = [expo.name, [expo.booth && `Booth ${expo.booth}`, expo.hall].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  $("#mtDay").innerHTML = expo.days.map((d) => `<option value="${d}"${d === at.date ? " selected" : ""}>${esc(fmtDay(d))}</option>`).join("");
  ["mtName", "mtCompany", "mtEmail", "mtPhone", "mtCountry", "mtProducts", "mtMessage", "mtStart"].forEach((id) => { $(`#${id}`).value = ""; });
  $("#mtLen").value = String(expo.slotMinutes || 30);
  $("#mtStatus").value = "Confirmed";
  $("#mtProductList").innerHTML = (state.catalogue || []).map((p) => `<option value="${esc(p)}">`).join("");
  $("#meetingErr").hidden = true;
  $("#mtSave").disabled = false;
  renderTimes(at.slot || "");
  $("#meetingDialog").showModal();
  $("#mtName").focus();
}

$("#addMeetingBtn").addEventListener("click", () => openAddMeeting({ date: state.day || state.schedDay || "" }));
$("#mtDay").addEventListener("change", () => renderTimes($("#mtTime").value));
$("#mtTime").addEventListener("change", timeChanged);

$("#meetingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#meetingErr");
  const showErr = (m) => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  const other = $("#mtTime").value === "other";
  const time = other ? $("#mtStart").value : $("#mtTime").value;
  const name = $("#mtName").value.trim();
  const email = $("#mtEmail").value.trim();
  if (!time) return showErr("Choose the time of the meeting.");
  if (!name) return showErr("Enter the client's name.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showErr("That email address doesn't look right.");
  const blocked = !other && slotStates($("#mtDay").value)[time] === "blocked";
  const btn = $("#mtSave");
  btn.disabled = true;
  btn.textContent = "Adding…";
  try {
    const r = await api("addMeeting", {
      token: store.get(TOKEN_KEY), expo: state.expoId, date: $("#mtDay").value, time,
      minutes: other ? Number($("#mtLen").value) : 0, replaceBlock: blocked || (other && mt.replaceBlock),
      name, email, company: $("#mtCompany").value.trim(), phone: $("#mtPhone").value.trim(), country: $("#mtCountry").value.trim(),
      products: $("#mtProducts").value.trim(), message: $("#mtMessage").value.trim(), status: $("#mtStatus").value,
    });
    if (!r.ok) throw Object.assign(new Error(r.error), { slots: r.slots });
    $("#meetingDialog").close();
    load();
  } catch (ex) {
    if (ex.message === "auth") return $("#meetingDialog").close();
    showErr({
      slot_taken: other ? `That time overlaps ${ex.slots && ex.slots.length ? `the ${ex.slots.map((s) => fmtRange(s)).join(", ")} slot${ex.slots.length === 1 ? "" : "s"}, which ${ex.slots.length === 1 ? "is" : "are"}` : "a slot that is"} already booked or blocked. Choose another time, or unblock it first.`
        : "This time has just been booked. Choose another.",
      invalid_slot: "That day or time isn't part of this expo.",
      invalid_length: "Choose how long the meeting is.",
      invalid_email: "That email address doesn't look right.",
      busy: "The sheet is busy. Try again in a moment.",
    }[ex.message] || "Couldn't add the meeting. Try again.");
    if (ex.message === "slot_taken") load();
  } finally {
    btn.disabled = false;
    btn.textContent = "Add meeting";
  }
});
