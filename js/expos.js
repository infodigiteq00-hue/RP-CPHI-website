// Expo meetings · admin: expo settings (the "Expo settings" tab).
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

// a new expo's starting settings: the company's (from the server), or a copy of the expo picked
function blankExpo() {
  const base = state.template ? copy(state.template) : { ...copy(curExpo() || {}), fields: (curExpo() || {}).fields };
  return { ...base, id: "", name: "", days: [], isDefault: !state.expos.length, status: "Active", banner: "", emailBanner: "",
    headline: base.headline || state.company.profile.headline || "", highlight: base.highlight || state.company.profile.highlight || "",
    booth: "", hall: "", venue: "", subline: "", breaks: base.breaks || [], products: base.products || state.catalogue.slice() };
}
const seatsFree = () => (state.company.seats || 0) - state.expos.filter((e) => e.status === "Active").length;

function renderSettings() {
  const box = $("#settingsView");
  if (!draft || (!isNew && draft.id !== state.expoId)) {
    const e = curExpo();
    if (!e && seatsFree() <= 0) {
      box.innerHTML = `<p class="muted">You have no expo seats yet. Please contact us to add one.</p>`;
      $("#countLine").textContent = "No expo yet";
      return;
    }
    if (e) startDraft(e, false); else startDraft(blankExpo(), true);
  }
  const d = draft;
  const link = d.id ? bookingLink(d.id) : "";
  const slots = previewSlots(d);
  const co = state.company;
  const free = seatsFree();
  $("#countLine").textContent = isNew ? (state.expos.length ? "New expo, not saved yet" : "Set up your first expo") : `Settings for ${d.name}`;

  box.innerHTML = `<div class="settings">
    ${state.oldScript ? `<p class="err settings__old">The Apps Script is an older version, so expo settings can't be saved yet. Paste the latest Code.gs, run setup and redeploy (see SETUP.md).</p>` : ""}
    <div class="settings__bar">
      <p>${link && !isNew ? `Booking link: <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>
        <button class="link" type="button" data-do="copy-link">Copy</button>` : `<span class="muted">The booking link is made from the link name below.</span>`}</p>
      <div class="settings__bar-actions">
        <span class="muted seats" title="Active expos. Archived ones don't use a seat.">Expo seats: ${co.seats - free} of ${co.seats} in use</span>
        ${isNew || free <= 0 ? "" : `<button class="btn btn--outline btn--sm" type="button" data-do="duplicate">Duplicate</button>`}
        ${isNew || free <= 0 ? "" : `<button class="btn btn--outline btn--sm" type="button" data-do="new">New expo</button>`}
      </div>
    </div>
    ${!isNew && free <= 0 ? `<p class="muted seats-note">All your expo seats are in use. Archive an expo you've finished with to free its seat, or contact us for more seats.</p>` : ""}

    <section class="set">
      <h2>Expo</h2>
      <div class="set__grid">
        ${input("Name", "name", d.name, "e.g. CPHI Worldwide 2027")}
        <div class="field">
          <label for="set_id">Link name</label>
          <div class="prefixed"><span>${esc(location.host)}/${isRP() ? "" : `${esc(COMPANY_ID)}/`}</span><input id="set_id" data-bind="id" value="${esc(d.id)}" ${isNew ? "" : "readonly"} placeholder="cphi-worldwide-2027"></div>
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
          <span>Show this expo at <b>${esc(location.host)}/${isRP() ? "invite" : esc(COMPANY_ID)}</b></span></label>
      </div>
    </section>

    <section class="set">
      <h2>Booking page</h2>
      <div class="banner-edit">
        ${d.banner || isRP() ? `<img src="${esc(d.banner || "assets/india-gate-sm.webp")}" alt="Banner" id="bannerPreview">`
          : `<div class="banner-plain" id="bannerPreview"><span>No banner yet: your colours are used</span></div>`}
        <div>
          <p class="hint">${d.banner ? "Your banner." : isRP() ? "The standard India Gate photo." : "No banner yet."} A wide photo works best (at least 1600 × 700 px).</p>
          <div class="banner-edit__actions">
            <button class="btn btn--sm" type="button" data-do="make-banner" data-kind="page">Create with Nano Banana</button>
            <label class="btn btn--outline btn--sm">Upload a banner<input type="file" accept="image/jpeg,image/png,image/webp" id="bannerFile" hidden></label>
          </div>
          ${d.banner ? `<button class="link" type="button" data-do="banner-default">${isRP() ? "Use the standard photo" : "Remove the banner"}</button>` : ""}
          <p class="muted banner-busy" id="bannerBusy" hidden><span class="spinner" aria-hidden="true"></span> Creating your banner. This takes up to a minute…</p>
          <p class="err" id="bannerErr" hidden></p>
        </div>
      </div>
      <div class="set__grid">
        ${input("Headline", "headline", d.headline, co.profile.headline || "Your headline", true)}
        ${input("Words to highlight", "highlight", d.highlight, co.profile.highlight || "", false, "")}
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
      ${productGroups()}
    </section>

    ${isNew ? "" : `<section class="set" id="inviteSet"></section>`}

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
  showHighlightHint();
  if (!isNew && typeof renderInvite === "function") renderInvite(d); // js/invite.js
}

// under "Words to highlight": whether they're in the headline (only then are they shown in the accent colour)
function showHighlightHint() {
  const f = $("#set_highlight");
  if (!f) return;
  let hint = f.parentElement.querySelector(".hint");
  if (!hint) { hint = document.createElement("p"); hint.className = "hint"; f.after(hint); }
  const w = (draft.highlight || "").trim();
  hint.innerHTML = !w ? "Optional: words of the headline to show in your accent colour."
    : (draft.headline || "").toLowerCase().includes(w.toLowerCase()) ? `<span class="hint-ok">Found in the headline.</span>`
    : `<span class="hint-warn">Not in the headline, so nothing will be highlighted. Copy the words exactly as the headline has them.</span>`;
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

function productGroup(title, items, suffix = "") {
  if (!items.length) return "";
  return `<div class="prod-group">${title ? `<h3>${title}</h3>` : ""}<div class="prod-grid">${items.map((p) =>
    `<label class="check"><input type="checkbox" data-product="${esc(p)}"${draft.products.includes(p) ? " checked" : ""}> ${esc(suffix ? p.slice(0, -suffix.length) : p)}</label>`).join("")}</div></div>`;
}
// RP's list has intermediates and APIs; other companies' products are one list
function productGroups() {
  if (!state.catalogue.length) return `<p class="muted">No products are set up for your company yet. Please contact us to add them.</p>`;
  const ints = state.catalogue.filter((p) => p.endsWith(" intermediates"));
  const apis = state.catalogue.filter((p) => p.endsWith(" API"));
  const rest = state.catalogue.filter((p) => !ints.includes(p) && !apis.includes(p));
  return productGroup(ints.length || apis.length ? "Intermediates" : "", ints, " intermediates") + productGroup("APIs", apis, " API") +
    productGroup(ints.length || apis.length ? "Other products" : "", rest);
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
    if (k === "headline" || k === "highlight") showHighlightHint();
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
    case "make-banner": return makeBanner(b.dataset.kind || "page");
    case "copy-link":
      try { await navigator.clipboard.writeText(bookingLink(draft.id)); b.textContent = "Copied"; } catch { b.textContent = "Couldn't copy"; }
      return setTimeout(() => { b.textContent = "Copy"; }, 1500);
    case "new":
      if (settingsDirty() && !confirm("Discard your unsaved changes?")) return;
      startDraft(blankExpo(), true);
      return renderSettings();
    case "duplicate":
      if (settingsDirty() && !confirm("Discard your unsaved changes?")) return;
      startDraft({ ...copy(curExpo()), id: `${curExpo().id}-copy`, name: `${curExpo().name} (copy)`, isDefault: false }, true);
      return renderSettings();
    case "discard":
      draft = null;
      isNew = false;
      if (!state.expos.length) { savedNote = ""; return renderSettings(); }
      return renderSettings();
    case "save": return saveSettings();
  }
});

// Nano Banana makes a banner for this expo in the company's style (kind "page" or "email")
async function makeBanner(kind) {
  const busy = kind === "email" ? $("#emailBannerBusy") : $("#bannerBusy");
  const err = kind === "email" ? $("#emailBannerErr") : $("#bannerErr");
  err.hidden = true;
  busy.hidden = false;
  document.querySelectorAll('[data-do="make-banner"]').forEach((x) => { x.disabled = true; });
  try {
    const r = await api("makeBanner", { token: store.get(TOKEN_KEY), kind,
      expo: { id: draft.id, name: draft.name, venue: draft.venue, days: draft.days } });
    if (!r.ok) throw Object.assign(new Error(r.error), { detail: r.detail });
    if (kind === "email") draft.emailBanner = r.url; else draft.banner = r.url;
    savedNote = "New banner made. Save changes to keep it.";
    renderSettings();
  } catch (ex) {
    busy.hidden = true;
    document.querySelectorAll('[data-do="make-banner"]').forEach((x) => { x.disabled = false; });
    if (ex.message === "auth") return;
    err.textContent = ex.detail || { invalid_slot: "The Apps Script is an older version. Update Code.gs to make banners." }[ex.message] ||
      "Couldn't make the banner. Try again.";
    err.hidden = false;
  }
}

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
  if (draft.highlight && !(draft.headline || "").toLowerCase().includes(draft.highlight.toLowerCase())) draft.highlight = ""; // nothing to highlight
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
    if (!r.ok) throw Object.assign(new Error(r.error), { detail: r.detail, seats: r.seats });
    state.expos = r.expos;
    savedNote = isNew ? `Created. Its booking link is ${bookingLink(r.expo.id)}` : "Saved. The booking page shows the changes on its next visit.";
    if (state.company) state.company.seatsUsed = r.expos.filter((e) => e.status === "Active").length;
    draft = null;
    isNew = false;
    pickExpo(r.expo.id);
  } catch (ex) {
    btn.disabled = false;
    btn.textContent = isNew ? "Create expo" : "Save changes";
    if (ex.message === "auth") return;
    showErr({ id_taken: "That link name is already used by another expo.", busy: "The sheet is busy. Try again in a moment.",
      no_seats: `All your expo seats are in use (${ex.seats || state.company.seats}). Archive an expo you've finished with, or contact us for more seats.`,
      invalid_slot: "The Apps Script is an older version. Paste the latest Code.gs, run setup and redeploy, then save again." }[ex.message]
      || ex.detail || "Couldn't save. Try again.");
  }
}
