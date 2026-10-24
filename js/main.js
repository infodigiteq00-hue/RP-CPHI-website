// RP Industries · CPHI India 2026 meeting booking

// Requests go to the Google Apps Script web app set in js/config.js.
// If it's empty, every slot shows as open and nothing is sent (handy for testing the page).
const SUBMIT_URL = (window.RP_CONFIG && window.RP_CONFIG.API_URL) || "";

const EVENT = {
  name: "CPHI India 2026",
  booth: "Booth 2B59, Hall 2",
  venue: "IICC Yashobhoomi, Sector 25, Dwarka, New Delhi, India",
  days: ["2026-11-23", "2026-11-24", "2026-11-25"],
  // 30-minute slots, IST. 12:30–1:00 is lunch.
  slots: {
    Morning: ["10:30", "11:00", "11:30", "12:00"],
    Afternoon: ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"],
  },
};

const COUNTRIES = `Afghanistan:93|Albania:355|Algeria:213|Andorra:376|Angola:244|Argentina:54|Armenia:374|Australia:61|Austria:43|Azerbaijan:994|Bahrain:973|Bangladesh:880|Belarus:375|Belgium:32|Belize:501|Benin:229|Bhutan:975|Bolivia:591|Bosnia and Herzegovina:387|Botswana:267|Brazil:55|Brunei:673|Bulgaria:359|Burkina Faso:226|Burundi:257|Cambodia:855|Cameroon:237|Canada:1|Chad:235|Chile:56|China:86|Colombia:57|Congo:242|Costa Rica:506|Côte d'Ivoire:225|Croatia:385|Cuba:53|Cyprus:357|Czech Republic:420|DR Congo:243|Denmark:45|Djibouti:253|Dominican Republic:1|Ecuador:593|Egypt:20|El Salvador:503|Eritrea:291|Estonia:372|Ethiopia:251|Fiji:679|Finland:358|France:33|Gabon:241|Gambia:220|Georgia:995|Germany:49|Ghana:233|Greece:30|Guatemala:502|Guinea:224|Haiti:509|Honduras:504|Hong Kong:852|Hungary:36|Iceland:354|India:91|Indonesia:62|Iran:98|Iraq:964|Ireland:353|Israel:972|Italy:39|Jamaica:1|Japan:81|Jordan:962|Kazakhstan:7|Kenya:254|Kuwait:965|Kyrgyzstan:996|Laos:856|Latvia:371|Lebanon:961|Liberia:231|Libya:218|Lithuania:370|Luxembourg:352|Madagascar:261|Malawi:265|Malaysia:60|Maldives:960|Mali:223|Malta:356|Mauritania:222|Mauritius:230|Mexico:52|Moldova:373|Mongolia:976|Montenegro:382|Morocco:212|Mozambique:258|Myanmar:95|Namibia:264|Nepal:977|Netherlands:31|New Zealand:64|Nicaragua:505|Niger:227|Nigeria:234|North Macedonia:389|Norway:47|Oman:968|Pakistan:92|Palestine:970|Panama:507|Papua New Guinea:675|Paraguay:595|Peru:51|Philippines:63|Poland:48|Portugal:351|Qatar:974|Romania:40|Russia:7|Rwanda:250|Saudi Arabia:966|Senegal:221|Serbia:381|Sierra Leone:232|Singapore:65|Slovakia:421|Slovenia:386|Somalia:252|South Africa:27|South Korea:82|South Sudan:211|Spain:34|Sri Lanka:94|Sudan:249|Sweden:46|Switzerland:41|Syria:963|Taiwan:886|Tajikistan:992|Tanzania:255|Thailand:66|Togo:228|Trinidad and Tobago:1|Tunisia:216|Turkey:90|Turkmenistan:993|Uganda:256|Ukraine:380|United Arab Emirates:971|United Kingdom:44|United States:1|Uruguay:598|Uzbekistan:998|Venezuela:58|Vietnam:84|Yemen:967|Zambia:260|Zimbabwe:263`
  .split("|").map((s) => { const [name, code] = s.split(":"); return { name, code }; });

const $ = (s) => document.querySelector(s);
const form = $("#bookForm");
// taken: { "2026-11-23": { "10:30": "booked" | "blocked" } } from the server
const state = { day: null, slot: null, taken: {} };

// ---------- time helpers (everything is IST, UTC+5:30) ----------
const IST_OFFSET = 330;
function istToDate(day, hhmm) {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi) - IST_OFFSET * 60000);
}
function fmt12(hhmm) {
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
// "10:30 – 11:00 AM", or "11:30 AM – 12:00 PM" when the two ends differ
function fmtRange(hhmm) {
  const [a, ap] = fmt12(hhmm).split(" ");
  const [b, bp] = fmt12(addMin(hhmm, 30)).split(" ");
  return ap === bp ? `${a} – ${b} ${bp}` : `${a} ${ap} – ${b} ${bp}`;
}
function addMin(hhmm, n) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + n;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function dayParts(day) {
  const d = istToDate(day, "12:00");
  const opt = (o) => d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", ...o });
  return { wd: opt({ weekday: "long" }), short: opt({ weekday: "short" }), dm: opt({ day: "numeric", month: "long" }) };
}
const isPast = (day, hhmm) => istToDate(day, hhmm) < new Date(Date.now() + 30 * 60000);
const isTaken = (day, hhmm) => !!(state.taken[day] && state.taken[day][hhmm]);
const ALL_SLOTS = Object.values(EVENT.slots).flat();

// ---------- availability ----------
// Asks the server which slots are booked or blocked, then redraws. Returns false if it couldn't.
async function loadTaken() {
  if (!SUBMIT_URL) return true;
  try {
    const res = await fetch(SUBMIT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "slots" }) });
    const r = await res.json();
    if (!r.ok) throw new Error(r.error);
    state.taken = r.unavailable || {};
  } catch (err) {
    console.error("Couldn't load booked slots", err);
    return false;
  }
  if (state.slot && isTaken(state.day, state.slot)) slotTaken();
  else { renderDays(); updateSummary(); }
  return true;
}

// The chosen slot has gone: say so, clear it and send them back to the slot picker.
// Everything typed in the form stays.
function slotTaken() {
  if (state.day && state.slot) (state.taken[state.day] = state.taken[state.day] || {})[state.slot] = "booked";
  state.slot = null;
  renderDays();
  updateSummary();
  $("#slotErr").hidden = true;
  $("#takenErr").hidden = false;
  $("#days").scrollIntoView({ block: "start" });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !form.hidden) loadTaken();
});

// ---------- days ----------
// Also redraws the slots. Keeps the chosen day unless it has nothing left.
function renderDays() {
  const box = $("#days");
  box.innerHTML = "";
  EVENT.days.forEach((day) => {
    const p = dayParts(day);
    const open = ALL_SLOTS.some((t) => !isPast(day, t) && !isTaken(day, t));
    const closed = ALL_SLOTS.every((t) => isPast(day, t));
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", "false");
    b.dataset.day = day;
    b.disabled = !open;
    b.innerHTML = `${p.short}, ${p.dm.split(" ")[0]} Nov<small>${open ? "2026" : closed ? "Closed" : "Fully booked"}</small>`;
    b.addEventListener("click", () => selectDay(day));
    box.appendChild(b);
  });
  const isOpen = (d) => !box.querySelector(`[data-day="${d}"]`).disabled;
  const day = state.day && isOpen(state.day) ? state.day : EVENT.days.find(isOpen);
  if (day) selectDay(day);
  else { state.day = null; state.slot = null; renderSlots(); updateSummary(); }
}

function selectDay(day) {
  state.day = day;
  document.querySelectorAll(".day").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.day === day)));
  if (state.slot && (isPast(day, state.slot) || isTaken(day, state.slot))) state.slot = null;
  renderSlots();
  updateSummary();
}

// ---------- slots ----------
function renderSlots() {
  const box = $("#slots");
  box.innerHTML = "";
  if (!state.day) { box.innerHTML = `<p class="slots-label">There are no times left to book.</p>`; return; }
  for (const [label, times] of Object.entries(EVENT.slots)) {
    const h = document.createElement("p");
    h.className = "slots-label";
    h.textContent = label;
    const grid = document.createElement("div");
    grid.className = "slots";
    times.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(t === state.slot));
      const taken = isTaken(state.day, t);
      b.setAttribute("aria-label", `${fmt12(t)} to ${fmt12(addMin(t, 30))}${taken ? ", booked" : ""}`);
      b.textContent = fmtRange(t);
      if (taken) b.insertAdjacentHTML("beforeend", "<small>Booked</small>");
      b.disabled = taken || isPast(state.day, t);
      b.addEventListener("click", () => {
        state.slot = t;
        grid.closest("#slots").querySelectorAll(".slot").forEach((s) => s.setAttribute("aria-checked", String(s === b)));
        $("#slotErr").hidden = true;
        $("#takenErr").hidden = true;
        updateSummary();
      });
      grid.appendChild(b);
    });
    box.append(h, grid);
  }
}

function localTimeNote() {
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = istToDate(state.day, state.slot);
  if (-start.getTimezoneOffset() === IST_OFFSET) return "";
  const t = start.toLocaleString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, weekday: "short" });
  return `${t} your time (${here.replace(/_/g, " ")})`;
}

function updateSummary() {
  const el = $("#summary");
  if (!state.day || !state.slot) { el.textContent = "No slot selected"; return; }
  const p = dayParts(state.day);
  const note = localTimeNote();
  el.innerHTML = `<strong>${p.wd}, ${p.dm} · ${fmtRange(state.slot)} IST</strong>${note ? `<small>${note}</small>` : ""}`;
}

// ---------- country / phone ----------
function renderCountries() {
  const sel = $("#country");
  sel.innerHTML = `<option value="">Select country</option>` +
    COUNTRIES.map((c) => `<option value="${c.name}" data-code="${c.code}">${c.name}</option>`).join("");
  sel.value = "India";
  sel.addEventListener("change", () => {
    const code = sel.selectedOptions[0]?.dataset.code;
    $("#dialCode").textContent = code ? `+${code}` : "+";
  });
}

// ---------- products of interest ----------
// What RP Industries makes, A to Z (same list as CATALOGUE in apps-script/Code.gs)
const PRODUCTS = {
  intermediates: ["Apremilast", "Bilastine", "Carvedilol", "Dapagliflozin", "Dexlansoprazole", "Diminazene", "Empagliflozin",
    "Grapiprant", "Ilaprazole", "Itopride", "Lansoprazole", "Maribavir", "Mebeverine", "Mesalamine", "Nimorazole", "Omeprazole",
    "Pantoprazole", "Paroxetine", "Quetiapine", "Rabeprazole", "Terbinafine", "Theobromine", "Topiramate", "Trazodone",
    "Triclabendazole"],
  apis: ["Dexlansoprazole", "Esomeprazole Magnesium (3H₂O)", "Ilaprazole", "Lansoprazole", "Omeprazole", "Omeprazole Magnesium",
    "Pantoprazole Sodium", "Paroxetine"],
};
const picked = []; // e.g. "Omeprazole intermediates", "Pantoprazole Sodium API"

function renderProductPick() {
  const opt = (value, label) => (picked.includes(value) ? "" : `<option value="${value}">${label}</option>`);
  $("#productPick").innerHTML = `<option value="">${picked.length ? "Add another product" : "Choose a product"}</option>` +
    `<optgroup label="Intermediates">${PRODUCTS.intermediates.map((n) => opt(`${n} intermediates`, n)).join("")}</optgroup>` +
    `<optgroup label="APIs">${PRODUCTS.apis.map((n) => opt(`${n} API`, n)).join("")}</optgroup>` +
    `<option value="other"${$("#productsOther").hidden ? "" : " disabled"}>Other (type it in)</option>`;
  $("#picked").innerHTML = picked.map((p) =>
    `<span class="picked__item">${p}<button type="button" data-remove="${p}" aria-label="Remove ${p}">&times;</button></span>`).join("");
  syncProducts();
}

// the hidden #products field holds the answer as one line, which is what gets sent
function syncProducts() {
  const other = $("#productsOther").hidden ? "" : $("#productsOther").value.trim();
  $("#products").value = picked.concat(other ? [other] : []).join(", ");
  if ($("#products").closest(".field").classList.contains("invalid")) check("products");
}

$("#productPick").addEventListener("change", (e) => {
  const v = e.target.value;
  if (v === "other") {
    $("#productsOther").hidden = false;
    $("#productsOther").focus();
  } else if (v && !picked.includes(v)) {
    picked.push(v);
  }
  renderProductPick();
});
$("#picked").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-remove]");
  if (!b) return;
  picked.splice(picked.indexOf(b.dataset.remove), 1);
  renderProductPick();
});
$("#productsOther").addEventListener("input", syncProducts);

function resetProducts() {
  picked.length = 0;
  $("#productsOther").value = "";
  $("#productsOther").hidden = true;
  renderProductPick();
}

// ---------- validation ----------
const rules = {
  name: (v) => v.trim().length > 1,
  company: (v) => v.trim().length > 1,
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
  country: (v) => v !== "",
  phone: (v) => v.replace(/\D/g, "").length >= 6,
  products: (v) => v.trim().length > 1,
};

function check(id) {
  const input = document.getElementById(id);
  const ok = rules[id](input.value);
  const field = input.closest(".field");
  field.classList.toggle("invalid", !ok);
  field.querySelector(".err").hidden = ok;
  input.setAttribute("aria-invalid", String(!ok));
  return ok;
}

Object.keys(rules).filter((id) => id !== "products").forEach((id) => { // products: see syncProducts()
  const input = document.getElementById(id);
  input.addEventListener("blur", () => { if (input.value) check(id); });
  input.addEventListener("input", () => { if (input.closest(".field").classList.contains("invalid")) check(id); });
});

// ---------- submit ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#sendErr").hidden = true;
  $("#takenErr").hidden = true;

  const slotOk = !!(state.day && state.slot);
  $("#slotErr").hidden = slotOk;
  const bad = Object.keys(rules).filter((id) => !check(id));

  if (!slotOk) { $("#slots").scrollIntoView({ block: "center" }); return; }
  if (bad.length) { document.getElementById(bad[0] === "products" ? "productPick" : bad[0]).focus(); return; }

  const v = (id) => document.getElementById(id).value.trim();
  const payload = {
    project: "RP Industries – CPHI India 2026",
    form: "Meeting request",
    date: state.day,
    slot: state.slot,
    time: `${fmtRange(state.slot)} IST`,
    name: v("name"),
    company: v("company"),
    email: v("email"),
    country: v("country"),
    phone: `${$("#dialCode").textContent} ${v("phone")}`,
    products: v("products"),
    message: v("message"),
    website: v("website"),
    page: location.href,
    submittedAt: new Date().toISOString(),
  };

  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    if (SUBMIT_URL) {
      // last look before sending; the server checks again under its lock
      await loadTaken();
      if (!state.slot) return;
      const res = await fetch(SUBMIT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
      const r = await res.json();
      if (r.error === "slot_taken") { slotTaken(); loadTaken(); return; }
      if (!r.ok) throw new Error(r.error || "send_failed");
      (state.taken[state.day] = state.taken[state.day] || {})[state.slot] = "booked";
    } else {
      console.info("SUBMIT_URL is not set. This request was not sent:", payload);
      await new Promise((r) => setTimeout(r, 500));
    }
    showDone(payload);
  } catch (err) {
    console.error(err);
    $("#sendErr").hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Request meeting";
  }
});

function showDone(p) {
  const d = dayParts(state.day);
  $("#doneText").textContent =
    `We've received your request for ${d.wd}, ${d.dm}, ${fmtRange(state.slot)} IST. ` +
    `We'll confirm by email at ${p.email}. See you at ${EVENT.booth}.`;
  form.hidden = true;
  $("#done").hidden = false;
  $("#done").focus();
  $("#book").scrollIntoView();
}

$("#againBtn").addEventListener("click", () => {
  form.reset();
  resetProducts();
  $("#country").value = "India";
  $("#dialCode").textContent = "+91";
  state.slot = null;
  renderDays();
  updateSummary();
  $("#done").hidden = true;
  form.hidden = false;
  $("#book").scrollIntoView();
  loadTaken();
});

// ---------- calendar file ----------
$("#icsBtn").addEventListener("click", () => {
  const start = istToDate(state.day, state.slot);
  const end = new Date(start.getTime() + 30 * 60000);
  const z = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RP Industries//CPHI India 2026//EN", "BEGIN:VEVENT",
    `UID:${z(start)}-${Math.random().toString(36).slice(2)}@rpindustries`,
    `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
    "SUMMARY:Meeting with RP Industries at CPHI India 2026",
    `LOCATION:${EVENT.booth}\\, ${EVENT.venue.replace(/,/g, "\\,")}`,
    "DESCRIPTION:Meeting request with RP Industries. Awaiting confirmation by email.",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = "rp-industries-cphi-2026.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

renderCountries();
renderProductPick();
renderDays();
loadTaken();
