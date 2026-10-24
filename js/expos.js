// RP Industries · admin: expo settings (the "Expo settings" tab).
// Edits a copy of the picked expo's settings (`draft`) and saves it with the "saveExpo" action.
// Loaded after admin.js; uses api(), esc(), state, store, curExpo(), expoRows(), renderExpoSelect(),
// renderFilters(), fmtRange() and pickExpo().

const TIME_ZONES = [
  ["Asia/Kolkata", "India"], ["Asia/Dubai", "Dubai"], ["Asia/Riyadh", "Riyadh"], ["Europe/London", "London"],
  ["Europe/Paris", "Paris"], ["Europe/Berlin", "Frankfurt / Berlin"], ["Europe/Madrid", "Madrid / Barcelona"],
  ["Europe/Rome", "Milan"], ["Europe/Istanbul", "Istanbul"], ["Africa/Cairo", "Cairo"], ["Africa/Johannesburg", "Johannesburg"],
  ["Asia/Shanghai", "Shanghai"], ["Asia/Singapore", "Singapore"], ["Asia/Bangkok", "Bangkok"], ["Asia/Jakarta", "Jakarta"],
  ["Asia/Tokyo", "Tokyo"], ["Asia/Seoul", "Seoul"], ["America/New_York", "New York / Philadelphia"],
  ["America/Chicago", "Chicago"], ["America/Los_Angeles", "Los Angeles / San Diego"], ["America/Sao_Paulo", "São Paulo"],
  ["Australia/Sydney", "Sydney"],
];
const FIELD_TYPES = { text: "Short text", longtext: "Long text", select: "Dropdown", email: "Email", country: "Country list",
  phone: "Phone number", products: "Product list" };

let draft = null;    // the settings being edited
let original = "";   // what they were, to tell whether anything changed
let isNew = false;   // a new expo, not saved yet
let savedNote = "";

const settingsDirty = () => !!draft && (isNew || JSON.stringify(draft) !== original);
const copy = (x) => JSON.parse(JSON.stringify(x));

function startDraft(from, asNew) {
  draft = copy(from);
  delete draft.slots;
  isNew = asNew;
  original = JSON.stringify(draft);
}

function renderSettings() {
  const box = $("#settingsView");
  if (!draft || (!isNew && draft.id !== state.expoId)) {
    const e = curExpo();
    if (!e) { box.innerHTML = `<p class="muted">No expo yet.</p>`; return; }
    startDraft(e, false);
  }
  const d = draft;
  const link = d.id ? `${location.origin}/${d.id}` : "";
  const slots = previewSlots(d);
  $("#countLine").textContent = isNew ? "New expo, not saved yet" : `Settings for ${d.name}`;

  box.innerHTML = `<div class="settings">
    ${state.oldScript ? `<p class="err settings__old">The Apps Script is an older version, so expo settings can't be saved yet. Paste the latest Code.gs, run setup and redeploy (see SETUP.md).</p>` : ""}
    <div class="settings__bar">
      <p>${link && !isNew ? `Booking link: <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>
        <button class="link" type="button" data-do="copy-link">Copy</button>` : `<span class="muted">The booking link is made from the link name below.</span>`}</p>
      <div class="settings__bar-actions">
        ${isNew ? "" : `<button class="btn btn--outline btn--sm" type="button" data-do="duplicate">Duplicate</button>`}
        <button class="btn btn--outline btn--sm" type="button" data-do="new">New expo</button>
      </div>
    </div>

    <section class="set">
      <h2>Expo</h2>
      <div class="set__grid">
        ${input("Name", "name", d.name, "e.g. CPHI Worldwide 2027")}
        <div class="field">
          <label for="set_id">Link name</label>
          <div class="prefixed"><span>${esc(location.host)}/</span><input id="set_id" data-bind="id" value="${esc(d.id)}" ${isNew ? "" : "readonly"} placeholder="cphi-worldwide-2027"></div>
          <p class="hint">${isNew ? "Lowercase letters, numbers and dashes. Can't be changed later." : "Can't be changed once saved."}</p>
        </div>
        <div class="field">
          <label for="set_status">Status</label>
          <select id="set_status" data-bind="status">
            <option${d.status === "Active" ? " selected" : ""}>Active</option>
            <option value="Archived"${d.status === "Archived" ? " selected" : ""}>Archived (booking page closed)</option>
          </select>
        </div>
        <label class="check check--field"><input type="checkbox" data-bind="isDefault"${d.isDefault ? " checked" : ""}>
          <span>Show this expo at <b>${esc(location.host)}/invite</b></span></label>
      </div>
    </section>

    <section class="set">
      <h2>Booking page</h2>
      <div class="banner-edit">
        <img src="${esc(d.banner || "assets/india-gate-sm.webp")}" alt="Banner" id="bannerPreview">
        <div>
          <p class="hint">${d.banner ? "Your banner." : "The standard India Gate photo."} A wide photo works best (at least 1600 × 700 px).</p>
          <label class="btn btn--outline btn--sm">Upload a banner<input type="file" accept="image/jpeg,image/png,image/webp" id="bannerFile" hidden></label>
          ${d.banner ? `<button class="link" type="button" data-do="banner-default">Use the standard photo</button>` : ""}
          <p class="err" id="bannerErr" hidden></p>
        </div>
      </div>
      <div class="set__grid">
        ${input("Headline", "headline", d.headline, "World's No. 1 Prazole Intermediate Manufacturer", true)}
        ${input("Words to show in green", "highlight", d.highlight, "Prazole Intermediate", false, "Must appear in the headline.")}
        ${input("Line under the headline", "subline", d.subline, "Meet us in Frankfurt, 27–29 October. Book a 30-minute slot.", true)}
        ${input("Booth", "booth", d.booth, "e.g. 9.1F20")}
        ${input("Hall", "hall", d.hall, "e.g. Hall 9.1")}
        ${input("Venue", "venue", d.venue, "e.g. Messe Frankfurt, Germany", true)}
      </div>
    </section>

    <section class="set">
      <h2>Dates and times</h2>
      <div class="field">
        <span class="label">Dates</span>
        <div class="date-list">${d.days.map((day, i) => `<span class="chip-date">${esc(fmtDay(day))} ${day.slice(0, 4)}
          <button type="button" data-do="del-day" data-i="${i}" aria-label="Remove ${esc(day)}">&times;</button></span>`).join("") || `<span class="muted">No dates yet.</span>`}</div>
        <div class="inline-add"><input type="date" id="newDay" aria-label="Date to add"><button class="btn btn--outline btn--sm" type="button" data-do="add-day">Add date</button></div>
      </div>
      <div class="set__grid set__grid--4">
        <div class="field">
          <label for="set_tz">Time zone</label>
          <select id="set_tz" data-bind="timezone">${tzOptions(d.timezone)}</select>
        </div>
        ${input("Time zone label", "tzLabel", d.tzLabel, "IST", false, "Shown after every time.")}
        <div class="field"><label for="set_start">Day starts</label><input type="time" id="set_start" data-bind="start" value="${esc(d.start)}"></div>
        <div class="field"><label for="set_end">Day ends</label><input type="time" id="set_end" data-bind="end" value="${esc(d.end)}"></div>
        <div class="field">
          <label for="set_len">Meeting length</label>
          <select id="set_len" data-bind="slotMinutes" data-num>${[15, 20, 30, 45, 60].map((m) => `<option value="${m}"${m === d.slotMinutes ? " selected" : ""}>${m} minutes</option>`).join("")}</select>
        </div>
      </div>
      <div class="field">
        <span class="label">Breaks <span class="opt">(no meetings during these)</span></span>
        ${d.breaks.map((b, i) => `<div class="break-row">
          <input type="time" value="${esc(b.start)}" data-list="breaks" data-i="${i}" data-k="start" aria-label="Break starts">
          <span>to</span>
          <input type="time" value="${esc(b.end)}" data-list="breaks" data-i="${i}" data-k="end" aria-label="Break ends">
          <input value="${esc(b.label)}" data-list="breaks" data-i="${i}" data-k="label" placeholder="e.g. Lunch" aria-label="Break name">
          <button class="act act--quiet act--danger" type="button" data-do="del-break" data-i="${i}">Remove</button></div>`).join("")}
        <button class="link" type="button" data-do="add-break">Add a break</button>
      </div>
      <p class="slot-preview" id="slotPreview">${slotPreviewText(slots)}</p>
    </section>

    <section class="set">
      <h2>Booking form</h2>
      <p class="hint">Name and email are always asked, since they're needed for the follow-up. Hidden fields aren't shown to visitors.</p>
      <div class="frows">${d.fields.map(fieldRow).join("")}</div>
      <div class="inline-add">
        <span class="label">Add a field:</span>
        <button class="btn btn--outline btn--sm" type="button" data-do="add-field" data-type="text">Short text</button>
        <button class="btn btn--outline btn--sm" type="button" data-do="add-field" data-type="longtext">Long text</button>
        <button class="btn btn--outline btn--sm" type="button" data-do="add-field" data-type="select">Dropdown</button>
      </div>
    </section>

    <section class="set">
      <h2>Products of interest</h2>
      <p class="hint">The products visitors can pick from on this expo's booking form. <button class="link" type="button" data-do="products-all">Select all</button> · <button class="link" type="button" data-do="products-none">Clear</button></p>
      ${productGroup("Intermediates", " intermediates")}
      ${productGroup("APIs", " API")}
    </section>

    <div class="settings__save">
      <p class="err" id="settingsErr" hidden></p>
      <p class="saved" id="settingsSaved"${savedNote ? "" : " hidden"}>${esc(savedNote)}</p>
      <div class="settings__save-actions">
        <button class="btn btn--outline btn--sm" type="button" data-do="discard">${isNew ? "Cancel" : "Discard changes"}</button>
        <button class="btn btn--sm" type="button" data-do="save">${isNew ? "Create expo" : "Save changes"}</button>
      </div>
    </div>
  </div>`;
  savedNote = "";
}

// ---------- pieces ----------
function input(label, key, value, placeholder = "", full = false, hint = "") {
  return `<div class="field${full ? " field--full" : ""}"><label for="set_${key}">${esc(label)}</label>
    <input id="set_${key}" data-bind="${key}" value="${esc(value || "")}" placeholder="${esc(placeholder)}">${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
}

function tzOptions(current) {
  const list = TIME_ZONES.some((z) => z[0] === current) ? TIME_ZONES : [[current, current], ...TIME_ZONES];
  return list.map(([id, name]) => `<option value="${esc(id)}"${id === current ? " selected" : ""}>${esc(name)} (${esc(id)})</option>`).join("");
}

function fieldRow(f, i) {
  const n = draft.fields.length;
  const custom = /^c\d+$/.test(f.key);
  const type = custom
    ? `<select data-list="fields" data-i="${i}" data-k="type" aria-label="Field type">${["text", "longtext", "select"].map((t) =>
      `<option value="${t}"${t === f.type ? " selected" : ""}>${FIELD_TYPES[t]}</option>`).join("")}</select>`
    : `<span class="frow__type">${esc(FIELD_TYPES[f.type] || "Short text")}</span>`;
  return `<div class="frow${f.show ? "" : " is-hidden"}">
    <div class="frow__move">
      <button type="button" data-do="move" data-i="${i}" data-dir="-1"${i === 0 ? " disabled" : ""} aria-label="Move up">&uarr;</button>
      <button type="button" data-do="move" data-i="${i}" data-dir="1"${i === n - 1 ? " disabled" : ""} aria-label="Move down">&darr;</button>
    </div>
    <input class="frow__label" value="${esc(f.label)}" data-list="fields" data-i="${i}" data-k="label" aria-label="Field label">
    ${type}
    <label class="check"><input type="checkbox" data-list="fields" data-i="${i}" data-k="show"${f.show ? " checked" : ""}${f.core ? " disabled" : ""}> Show</label>
    <label class="check"><input type="checkbox" data-list="fields" data-i="${i}" data-k="required"${f.required ? " checked" : ""}${f.core || !f.show ? " disabled" : ""}> Required</label>
    ${custom ? `<button class="act act--quiet act--danger" type="button" data-do="del-field" data-i="${i}">Remove</button>` : `<span></span>`}
    ${f.type === "select" ? `<textarea class="frow__options" rows="3" data-list="fields" data-i="${i}" data-k="options" placeholder="One choice per line">${esc((f.options || []).join("\n"))}</textarea>` : ""}
  </div>`;
}

function productGroup(title, suffix) {
  const items = state.catalogue.filter((p) => p.endsWith(suffix));
  return `<div class="prod-group"><h3>${title}</h3><div class="prod-grid">${items.map((p) =>
    `<label class="check"><input type="checkbox" data-product="${esc(p)}"${draft.products.includes(p) ? " checked" : ""}> ${esc(p.slice(0, -suffix.length))}</label>`).join("")}</div></div>`;
}

// same rule as slotsFor_ in Code.gs
function previewSlots(d) {
  const min = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + m; };
  const out = [];
  if (!d.start || !d.end || !d.slotMinutes) return out;
  for (let t = min(d.start); t + d.slotMinutes <= min(d.end); t += d.slotMinutes) {
    if (!d.breaks.some((b) => b.start && b.end && t < min(b.end) && t + d.slotMinutes > min(b.start))) {
      out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
    }
  }
  return out;
}
function slotPreviewText(slots) {
  if (!slots.length) return "No meetings fit these times.";
  return `<b>${slots.length} meeting${slots.length === 1 ? "" : "s"} a day:</b> ${slots.map((s) => esc(fmtRange(s, draft.slotMinutes))).join(", ")}`;
}

function tzShortName(tz, day) {
  if (tz === "Asia/Kolkata") return "IST";
  try {
    const at = day ? new Date(`${day}T12:00:00Z`) : new Date();
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName").value;
  } catch { return ""; }
}

// ---------- editing ----------
$("#settingsView").addEventListener("input", onEdit);
$("#settingsView").addEventListener("change", onEdit);

function onEdit(e) {
  const t = e.target;
  if (t.dataset.bind) {
    const k = t.dataset.bind;
    draft[k] = t.type === "checkbox" ? t.checked : "num" in t.dataset ? Number(t.value) : t.value;
    if (k === "id") draft.id = t.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (k === "timezone" && e.type === "change") {
      draft.tzLabel = tzShortName(draft.timezone, draft.days[0]) || draft.tzLabel;
      $("#set_tzLabel").value = draft.tzLabel;
    }
    if (["start", "end", "slotMinutes"].includes(k)) $("#slotPreview").innerHTML = slotPreviewText(previewSlots(draft));
  } else if (t.dataset.list) {
    const item = draft[t.dataset.list][Number(t.dataset.i)];
    const k = t.dataset.k;
    if (k === "options") item.options = t.value.split("\n").map((o) => o.trim()).filter(Boolean);
    else item[k] = t.type === "checkbox" ? t.checked : t.value;
    if (t.dataset.list === "breaks") $("#slotPreview").innerHTML = slotPreviewText(previewSlots(draft));
    // structure changed: redraw the form rows
    if (e.type === "change" && t.dataset.list === "fields" && (k === "show" || k === "type")) {
      if (k === "show" && !item.show) item.required = false;
      if (k === "type" && item.type === "select" && !item.options) item.options = [];
      renderSettings();
    }
  } else if (t.dataset.product && e.type === "change") {
    const p = t.dataset.product;
    draft.products = t.checked ? state.catalogue.filter((x) => x === p || draft.products.includes(x)) : draft.products.filter((x) => x !== p);
  } else if (t.id === "bannerFile" && e.type === "change") {
    uploadBanner(t.files[0]);
  }
}

$("#settingsView").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-do]");
  if (!b) return;
  const i = Number(b.dataset.i);
  switch (b.dataset.do) {
    case "add-day": {
      const v = $("#newDay").value;
      if (!v) return;
      if (!draft.days.includes(v)) draft.days = [...draft.days, v].sort();
      return renderSettings();
    }
    case "del-day": draft.days.splice(i, 1); return renderSettings();
    case "add-break": draft.breaks.push({ start: "13:00", end: "14:00", label: "Lunch" }); return renderSettings();
    case "del-break": draft.breaks.splice(i, 1); return renderSettings();
    case "move": {
      const j = i + Number(b.dataset.dir);
      [draft.fields[i], draft.fields[j]] = [draft.fields[j], draft.fields[i]];
      return renderSettings();
    }
    case "add-field": {
      // the server gives it a key (c1, c2, …); until then a temporary one keeps it apart
      const n = draft.fields.filter((f) => /^c\d+$/.test(f.key)).map((f) => Number(f.key.slice(1)));
      const key = `c${(n.length ? Math.max(...n) : 0) + 1}`;
      draft.fields.push({ key, label: "", type: b.dataset.type, show: true, required: false, ...(b.dataset.type === "select" ? { options: [] } : {}) });
      renderSettings();
      const inputs = document.querySelectorAll(".frow__label");
      inputs[inputs.length - 1].focus();
      return;
    }
    case "del-field": draft.fields.splice(i, 1); return renderSettings();
    case "products-all": draft.products = state.catalogue.slice(); return renderSettings();
    case "products-none": draft.products = []; return renderSettings();
    case "banner-default": draft.banner = ""; return renderSettings();
    case "copy-link":
      try { await navigator.clipboard.writeText(`${location.origin}/${draft.id}`); b.textContent = "Copied"; } catch { b.textContent = "Couldn't copy"; }
      return setTimeout(() => { b.textContent = "Copy"; }, 1500);
    case "new":
      if (settingsDirty() && !confirm("Discard your unsaved changes?")) return;
      startDraft({ ...copy(curExpo() || {}), id: "", name: "", days: [], isDefault: false, status: "Active", banner: "",
        headline: (curExpo() || {}).headline || "", booth: "", hall: "", venue: "", subline: "" }, true);
      return renderSettings();
    case "duplicate":
      if (settingsDirty() && !confirm("Discard your unsaved changes?")) return;
      startDraft({ ...copy(curExpo()), id: `${curExpo().id}-copy`, name: `${curExpo().name} (copy)`, isDefault: false }, true);
      return renderSettings();
    case "discard":
      draft = null;
      isNew = false;
      return renderSettings();
    case "save": return saveSettings();
  }
});

async function uploadBanner(file) {
  const err = $("#bannerErr");
  err.hidden = true;
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { err.textContent = "Use a JPG, PNG or WebP image."; err.hidden = false; return; }
  try {
    const img = await shrinkImage(file, 2000);
    $("#bannerPreview").style.opacity = ".4";
    const r = await api("uploadBanner", { token: store.get(TOKEN_KEY), expo: draft.id, mime: "image/jpeg", data: img });
    if (!r.ok) throw new Error(r.error);
    draft.banner = r.url;
    renderSettings();
  } catch (ex) {
    $("#bannerPreview").style.opacity = "";
    if (ex.message === "auth") return;
    err.textContent = { image_too_large: "That image is too large (5 MB max).", invalid_image: "That file isn't a usable image.",
      invalid_slot: "The Apps Script is an older version. Update Code.gs to upload banners." }[ex.message] || "Couldn't upload the banner. Try again.";
    err.hidden = false;
  }
}

// a JPEG at most `maxW` wide, as base64: keeps uploads small and the booking page fast
function shrinkImage(file, maxW) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.86).split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("invalid_image")); };
    img.src = url;
  });
}

async function saveSettings() {
  const err = $("#settingsErr");
  err.hidden = true;
  const showErr = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: "nearest" }); };
  if (!draft.name.trim()) return showErr("Give the expo a name.");
  if (isNew && !/^[a-z0-9][a-z0-9-]{1,59}$/.test(draft.id)) return showErr("The link name must be 2–60 lowercase letters, numbers or dashes, e.g. cphi-worldwide-2027.");
  if (!draft.days.length) return showErr("Add at least one date.");
  if (draft.fields.some((f) => /^c\d+$/.test(f.key) && !f.label.trim())) return showErr("Every added field needs a label.");
  if (draft.fields.some((f) => f.type === "select" && !(f.options || []).length)) return showErr("Every dropdown needs at least one choice.");
  if (draft.highlight && !(draft.headline || "").toLowerCase().includes(draft.highlight.toLowerCase())) return showErr("The green words must appear in the headline.");
  if (!previewSlots(draft).length) return showErr("No meetings fit these times. Check the day's start, end, meeting length and breaks.");

  // bookings this change would leave outside the schedule: they stay listed, but say so first
  if (!isNew) {
    const slots = previewSlots(draft);
    const out = expoRows().filter((r) => r.status !== "Cancelled" && (!draft.days.includes(r.date) || !slots.includes(r.slot)));
    if (out.length && !confirm(`${out.length} booked meeting${out.length === 1 ? " falls" : "s fall"} outside the new dates or times. ` +
      "They stay in the list, but you may want to contact those visitors. Save anyway?")) return;
  }
  const btn = document.querySelector('[data-do="save"]');
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const r = await api("saveExpo", { token: store.get(TOKEN_KEY), create: isNew, expo: draft });
    if (!r.ok) throw Object.assign(new Error(r.error), { detail: r.detail });
    state.expos = r.expos;
    savedNote = isNew ? `Created. Its booking link is ${location.origin}/${r.expo.id}` : "Saved. The booking page shows the changes on its next visit.";
    draft = null;
    isNew = false;
    pickExpo(r.expo.id);
  } catch (ex) {
    btn.disabled = false;
    btn.textContent = isNew ? "Create expo" : "Save changes";
    if (ex.message === "auth") return;
    showErr({ id_taken: "That link name is already used by another expo.", busy: "The sheet is busy. Try again in a moment.",
      invalid_slot: "The Apps Script is an older version. Paste the latest Code.gs, run setup and redeploy, then save again." }[ex.message]
      || ex.detail || "Couldn't save. Try again.");
  }
}
