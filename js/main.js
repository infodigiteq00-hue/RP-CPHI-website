// Expo meetings · the booking page (one page serves every company and every expo)
//
// The company and expo come from the address, and the server works out which is which:
//   /  /invite  /cphi-worldwide-2027          RP Industries (its default expo, or one of its expos)
//   /xyz-pharma  /xyz-pharma/invite           a company's default expo
//   /xyz-pharma/cphi-worldwide-2027           one of its expos
// ?c=…&expo=… also work (handy on a local server). The company's branding (logo, colours, font, wording)
// and the expo's settings (banner, text, dates, timings, form fields, products) come from the Apps Script in
// js/config.js. If that's empty, FALLBACK_EXPO is shown, every slot is open and nothing is sent.

const SUBMIT_URL = (window.RP_CONFIG && window.RP_CONFIG.API_URL) || "";

const PARAMS = new URLSearchParams(location.search);
const PATH = location.pathname.split("/").filter((s) => s && s !== "index.html").map((s) => decodeURIComponent(s).toLowerCase());
const PAGE_KEY = (PATH.join("/") || [PARAMS.get("c"), PARAMS.get("expo")].filter(Boolean).join("/") || "").replace(/^invite$/, "");
const CACHE_KEY = `bk_${PAGE_KEY || "default"}`;
// RP Industries' own pages, which show its built-in text before the settings arrive
const RP_PAGE = !PARAMS.get("c") && (PATH.length === 0 || (PATH.length === 1 && PATH[0] === "invite"));
// RP Industries as before companies existed: the booking page's branding until the server's arrives
const RP_COMPANY = { id: "rp", name: "RP Industries", status: "Active",
  brand: { logo: "/assets/rp-logo.png", primary: "#003279", accent: "#009138", highlight: "#4cd383", font: "Plus Jakarta Sans" },
  profile: { shortName: "RP Industries", tagline: "Quality Matters First" } };

// CPHI India 2026, as the server's DEFAULT_EXPO (for testing without the Apps Script)
const FALLBACK_EXPO = {
  id: "cphi-india-2026", name: "CPHI India 2026", headline: "World's No. 1 Prazole Intermediate Manufacturer",
  highlight: "Prazole Intermediate", subline: "Meet us in New Delhi, 23–25 November. Book a 30‑minute slot with our team.",
  booth: "2B59", hall: "Hall 2", venue: "IICC Yashobhoomi, Dwarka, New Delhi", banner: "", timezone: "Asia/Kolkata", tzLabel: "IST",
  days: ["2026-11-23", "2026-11-24", "2026-11-25"], slotMinutes: 30,
  slots: ["10:30", "11:00", "11:30", "12:00", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"],
  fields: [
    { key: "name", label: "Name", type: "text", show: true, required: true },
    { key: "company", label: "Company", type: "text", show: true, required: true },
    { key: "email", label: "Email", type: "email", show: true, required: true },
    { key: "country", label: "Country", type: "country", show: true, required: true },
    { key: "phone", label: "Phone", type: "phone", show: true, required: true },
    { key: "products", label: "Products of interest", type: "products", show: true, required: true },
    { key: "message", label: "Message", type: "longtext", show: true, required: false },
  ],
  products: ["Apremilast", "Bilastine", "Carvedilol", "Dapagliflozin", "Dexlansoprazole", "Diminazene", "Empagliflozin", "Grapiprant",
    "Ilaprazole", "Itopride", "Lansoprazole", "Maribavir", "Mebeverine", "Mesalamine", "Nimorazole", "Omeprazole", "Pantoprazole",
    "Paroxetine", "Quetiapine", "Rabeprazole", "Terbinafine", "Theobromine", "Topiramate", "Trazodone", "Triclabendazole"]
    .map((n) => `${n} intermediates`)
    .concat(["Dexlansoprazole", "Esomeprazole Magnesium (3H₂O)", "Ilaprazole", "Lansoprazole", "Omeprazole", "Omeprazole Magnesium",
      "Pantoprazole Sodium", "Paroxetine"].map((n) => `${n} API`)),
};

const COUNTRIES = `Afghanistan:93|Albania:355|Algeria:213|Andorra:376|Angola:244|Argentina:54|Armenia:374|Australia:61|Austria:43|Azerbaijan:994|Bahrain:973|Bangladesh:880|Belarus:375|Belgium:32|Belize:501|Benin:229|Bhutan:975|Bolivia:591|Bosnia and Herzegovina:387|Botswana:267|Brazil:55|Brunei:673|Bulgaria:359|Burkina Faso:226|Burundi:257|Cambodia:855|Cameroon:237|Canada:1|Chad:235|Chile:56|China:86|Colombia:57|Congo:242|Costa Rica:506|Côte d'Ivoire:225|Croatia:385|Cuba:53|Cyprus:357|Czech Republic:420|DR Congo:243|Denmark:45|Djibouti:253|Dominican Republic:1|Ecuador:593|Egypt:20|El Salvador:503|Eritrea:291|Estonia:372|Ethiopia:251|Fiji:679|Finland:358|France:33|Gabon:241|Gambia:220|Georgia:995|Germany:49|Ghana:233|Greece:30|Guatemala:502|Guinea:224|Haiti:509|Honduras:504|Hong Kong:852|Hungary:36|Iceland:354|India:91|Indonesia:62|Iran:98|Iraq:964|Ireland:353|Israel:972|Italy:39|Jamaica:1|Japan:81|Jordan:962|Kazakhstan:7|Kenya:254|Kuwait:965|Kyrgyzstan:996|Laos:856|Latvia:371|Lebanon:961|Liberia:231|Libya:218|Lithuania:370|Luxembourg:352|Madagascar:261|Malawi:265|Malaysia:60|Maldives:960|Mali:223|Malta:356|Mauritania:222|Mauritius:230|Mexico:52|Moldova:373|Mongolia:976|Montenegro:382|Morocco:212|Mozambique:258|Myanmar:95|Namibia:264|Nepal:977|Netherlands:31|New Zealand:64|Nicaragua:505|Niger:227|Nigeria:234|North Macedonia:389|Norway:47|Oman:968|Pakistan:92|Palestine:970|Panama:507|Papua New Guinea:675|Paraguay:595|Peru:51|Philippines:63|Poland:48|Portugal:351|Qatar:974|Romania:40|Russia:7|Rwanda:250|Saudi Arabia:966|Senegal:221|Serbia:381|Sierra Leone:232|Singapore:65|Slovakia:421|Slovenia:386|Somalia:252|South Africa:27|South Korea:82|South Sudan:211|Spain:34|Sri Lanka:94|Sudan:249|Sweden:46|Switzerland:41|Syria:963|Taiwan:886|Tajikistan:992|Tanzania:255|Thailand:66|Togo:228|Trinidad and Tobago:1|Tunisia:216|Turkey:90|Turkmenistan:993|Uganda:256|Ukraine:380|United Arab Emirates:971|United Kingdom:44|United States:1|Uruguay:598|Uzbekistan:998|Venezuela:58|Vietnam:84|Yemen:967|Zambia:260|Zimbabwe:263`
  .split("|").map((s) => { const [name, code] = s.split(":"); return { name, code }; });

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const form = $("#bookForm");
// taken: { "2026-11-23": { "10:30": "booked" | "blocked" } } from the server
const state = { expo: null, company: RP_COMPANY, preview: false, day: null, slot: null, taken: {} };

async function post(body) {
  const res = await fetch(SUBMIT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  return res.json();
}

// ---------- time helpers: everything is in the expo's own time zone ----------
// minutes the zone is ahead of UTC at a given moment (handles summer time)
function tzOffset(utcMs, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(utcMs / 60000) * 60000) / 60000;
}
// "2026-11-23" + "10:30" in the expo's zone → a real moment
function zoned(day, hhmm) {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const tz = state.expo.timezone;
  let t = guess - tzOffset(guess, tz) * 60000;
  t = guess - tzOffset(t, tz) * 60000;
  return new Date(t);
}
function addMin(hhmm, n) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + n;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
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
  const [b, bp] = fmt12(addMin(hhmm, state.expo.slotMinutes)).split(" ");
  return ap === bp ? `${a} – ${b} ${bp}` : `${a} ${ap} – ${b} ${bp}`;
}
function dayParts(day) {
  const d = new Date(`${day}T12:00:00Z`);
  const opt = (o) => d.toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
  return { wd: opt({ weekday: "long" }), short: opt({ weekday: "short" }), dm: opt({ day: "numeric", month: "long" }),
    d: opt({ day: "numeric" }), mon: opt({ month: "short" }), month: opt({ month: "long" }), y: opt({ year: "numeric" }) };
}
// "23–25 November 2026", "30 October – 1 November 2026", "23 November 2026"
function dateRange(days) {
  if (!days.length) return "";
  const a = dayParts(days[0]);
  const b = dayParts(days[days.length - 1]);
  if (days.length === 1) return `${a.d} ${a.month} ${a.y}`;
  if (a.month === b.month && a.y === b.y) return `${a.d}–${b.d} ${b.month} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${a.month} – ${b.d} ${b.month} ${b.y}`;
  return `${a.d} ${a.month} ${a.y} – ${b.d} ${b.month} ${b.y}`;
}
const isPast = (day, hhmm) => zoned(day, hhmm) < new Date(Date.now() + 30 * 60000);
const isTaken = (day, hhmm) => !!(state.taken[day] && state.taken[day][hhmm]);

// ---------- loading the expo ----------
async function loadExpo() {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch {}
  if (!SUBMIT_URL) { applyExpo(RP_PAGE || PAGE_KEY === FALLBACK_EXPO.id ? FALLBACK_EXPO : null, {}, RP_COMPANY); return; }
  if (cached && cached.expo) applyExpo(cached.expo, {}, cached.company); // last visit's settings straight away; fresh ones follow
  try {
    const r = await post({ action: "expo", path: PATH, tenant: PARAMS.get("c") || "", expo: PARAMS.get("expo") || "" });
    // an Apps Script from before expos doesn't know "expo": show CPHI India 2026 as before
    if (!r.ok && r.error === "invalid_slot" && (RP_PAGE || PAGE_KEY === FALLBACK_EXPO.id)) {
      applyExpo(FALLBACK_EXPO, {}, RP_COMPANY);
      loadTaken();
      return;
    }
    if (r.company) applyCompany(r.company);
    if (!r.ok) return showClosed(r.error, r.name);
    state.preview = !!r.preview;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ expo: r.expo, company: r.company })); } catch {}
    applyExpo(r.expo, r.unavailable || {}, r.company);
  } catch (err) {
    console.error("Couldn't load the expo", err);
    if (!cached) showClosed("network");
  }
}

// the company's logo, colours, font and name
function applyCompany(c) {
  if (!c || !c.brand) return;
  state.company = c;
  window.Brand.apply(c);
  const tag = c.profile && c.profile.tagline;
  $("#footTag").textContent = tag ? ` · ${tag}` : "";
  $("#footYear").textContent = new Date().getFullYear();
}

function showClosed(why, name) {
  document.body.classList.remove("expo-loading");
  const msg = {
    expo_closed: `Bookings for ${name || "this expo"} are closed.`,
    company_paused: `Bookings with ${name || "this company"} are closed right now.`,
    no_expo: "We couldn't find this booking page. Please check the link.",
    no_company: "We couldn't find this booking page. Please check the link.",
    network: "The booking page couldn't load. Please check your connection and refresh.",
  }[why] || "Bookings aren't open right now.";
  if (why !== "network" && !RP_PAGE && !state.expo) { // no expo to show: no RP text either
    $("#heroTitle").textContent = state.company.profile.shortName || "";
    $("#heroPre").textContent = "";
    $("#heroSub").hidden = true;
    document.querySelector(".info").hidden = true;
    document.querySelector(".hero").classList.toggle("hero--plain", state.company.id !== "rp");
  }
  form.hidden = true;
  $("#leadTz").hidden = true;
  $("#closedMsg").textContent = msg;
  $("#closedMsg").hidden = false;
}

function applyExpo(expo, taken, company) {
  if (!expo) return showClosed("no_expo");
  applyCompany(company);
  const first = !state.expo || state.expo.id !== expo.id;
  state.expo = expo;
  state.taken = taken;
  renderHero();
  $("#previewNote").hidden = !state.preview;
  $("#submitBtn").disabled = state.preview;
  if (first) renderFields(); // don't wipe what the visitor typed when fresh settings arrive
  renderDays();
  document.body.classList.remove("expo-loading");
}

// ---------- page text ----------
function renderHero() {
  const e = state.expo;
  const who = state.company.profile.shortName || state.company.name;
  const booth = [e.booth && `Booth ${e.booth}`, e.hall].filter(Boolean).join(", ");
  document.title = `${who} at ${e.name}${e.booth ? ` · Booth ${e.booth}` : ""}`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = `Book a meeting with ${who} at ${e.name}${booth ? `, ${booth}` : ""}${e.venue ? `, ${e.venue}` : ""}, ${dateRange(e.days)}.`;
  // no banner: RP keeps its India Gate photo, other companies get their own colour
  document.querySelector(".hero").classList.toggle("hero--plain", !e.banner && state.company.id !== "rp");
  document.querySelector(".info").hidden = false;
  if (e.banner) {
    const pic = $("#heroPicture");
    pic.querySelectorAll("source").forEach((s) => s.remove());
    const img = pic.querySelector("img");
    if (img.getAttribute("src") !== e.banner) { img.src = e.banner; img.alt = e.name; }
  }
  $("#heroPre").textContent = e.name;
  // the highlight words go green, wherever they are in the headline
  const h = e.headline || e.name;
  const i = e.highlight ? h.toLowerCase().indexOf(e.highlight.toLowerCase()) : -1;
  $("#heroTitle").innerHTML = i < 0 ? esc(h)
    : `${esc(h.slice(0, i))}<span class="hl">${esc(h.slice(i, i + e.highlight.length))}</span>${esc(h.slice(i + e.highlight.length))}`;
  $("#heroSub").textContent = e.subline || "";
  $("#heroSub").hidden = !e.subline;
  const info = (id, text) => { $(id).hidden = !text; $(`${id} strong`).textContent = text || ""; };
  info("#infoBooth", [e.booth, e.hall].filter(Boolean).join(", "));
  info("#infoDates", dateRange(e.days));
  info("#infoVenue", e.venue);
  $("#footerExpo").textContent = [e.name, booth].filter(Boolean).join(" · ");
  let zoneName = e.tzLabel;
  try {
    zoneName = new Intl.DateTimeFormat("en-GB", { timeZone: e.timezone, timeZoneName: "long" }).formatToParts(new Date())
      .find((p) => p.type === "timeZoneName").value;
  } catch {}
  $("#leadTz").textContent = `Choose a day and time. All times are ${zoneName}${e.tzLabel && !zoneName.includes(e.tzLabel) ? ` (${e.tzLabel})` : ""}.`;
}

// ---------- availability ----------
// Asks the server which slots are booked or blocked, then redraws. Returns false if it couldn't.
async function loadTaken() {
  if (!SUBMIT_URL || !state.expo) return true;
  try {
    const r = await post({ action: "slots", expo: state.expo.id, tenant: state.company.id });
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
  const e = state.expo;
  box.innerHTML = "";
  box.style.gridTemplateColumns = `repeat(${Math.min(e.days.length, 4)}, 1fr)`;
  e.days.forEach((day) => {
    const p = dayParts(day);
    const open = e.slots.some((t) => !isPast(day, t) && !isTaken(day, t));
    const closed = e.slots.every((t) => isPast(day, t));
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", "false");
    b.dataset.day = day;
    b.disabled = !open;
    b.innerHTML = `${p.short}, ${p.d} ${p.mon}<small>${open ? p.y : closed ? "Closed" : "Fully booked"}</small>`;
    b.addEventListener("click", () => selectDay(day));
    box.appendChild(b);
  });
  const isOpen = (d) => !box.querySelector(`[data-day="${d}"]`).disabled;
  const day = state.day && e.days.includes(state.day) && isOpen(state.day) ? state.day : e.days.find(isOpen);
  if (day) selectDay(day);
  else { state.day = null; state.slot = null; renderSlots(); updateSummary(); }
}

function selectDay(day) {
  state.day = day;
  document.querySelectorAll(".day").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.day === day)));
  if (state.slot && (!state.expo.slots.includes(state.slot) || isPast(day, state.slot) || isTaken(day, state.slot))) state.slot = null;
  renderSlots();
  updateSummary();
}

// ---------- slots ----------
function renderSlots() {
  const box = $("#slots");
  box.innerHTML = "";
  if (!state.day) { box.innerHTML = `<p class="slots-label">There are no times left to book.</p>`; return; }
  const groups = [["Morning", (t) => t < "12:00"], ["Afternoon", (t) => t >= "12:00" && t < "17:00"], ["Evening", (t) => t >= "17:00"]];
  for (const [label, inGroup] of groups) {
    const times = state.expo.slots.filter(inGroup);
    if (!times.length) continue;
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
      b.setAttribute("aria-label", `${fmt12(t)} to ${fmt12(addMin(t, state.expo.slotMinutes))}${taken ? ", booked" : ""}`);
      b.textContent = fmtRange(t);
      if (taken) b.insertAdjacentHTML("beforeend", "<small>Booked</small>");
      b.disabled = taken || isPast(state.day, t);
      b.addEventListener("click", () => {
        state.slot = t;
        box.querySelectorAll(".slot").forEach((s) => s.setAttribute("aria-checked", String(s === b)));
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
  const start = zoned(state.day, state.slot);
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tzOffset(start.getTime(), here) === tzOffset(start.getTime(), state.expo.timezone)) return "";
  const t = start.toLocaleString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, weekday: "short" });
  return `${t} your time (${here.replace(/_/g, " ")})`;
}

function updateSummary() {
  const el = $("#summary");
  if (!state.day || !state.slot) { el.textContent = "No slot selected"; return; }
  const p = dayParts(state.day);
  const note = localTimeNote();
  el.innerHTML = `<strong>${p.wd}, ${p.dm} · ${fmtRange(state.slot)} ${esc(state.expo.tzLabel)}</strong>${note ? `<small>${esc(note)}</small>` : ""}`;
}

// ---------- form fields, from the expo's settings ----------
const picked = []; // products of interest, e.g. "Omeprazole intermediates", "Pantoprazole Sodium API"

function renderFields() {
  const box = $("#fields");
  picked.length = 0;
  box.innerHTML = state.expo.fields.filter((f) => f.show).map((f) => {
    const id = fieldId(f);
    const opt = f.required ? "" : ` <span class="opt">(optional)</span>`;
    const req = f.required ? " required" : "";
    const err = `<p class="err" hidden>${esc(errorText(f))}</p>`;
    const label = (forId, extra = "") => `<label for="${forId}">${esc(f.label)}${extra}${opt}</label>`;
    switch (f.type) {
      case "email":
        return `<div class="field">${label(id)}<input id="${id}" type="email" autocomplete="email"${req}>${err}</div>`;
      case "country":
        return `<div class="field">${label(id)}<select id="${id}" autocomplete="country-name"${req}>${countryOptions()}</select>${err}</div>`;
      case "phone":
        return `<div class="field">${label(id)}<div class="phone"><span id="dialCode">+91</span><input id="${id}" type="tel" autocomplete="tel-national"${req}></div>${err}</div>`;
      case "products":
        return `<div class="field">${label("productPick", ` <span class="opt">(choose one or more)</span>`)}<select id="productPick"></select>
          <div class="picked" id="picked" aria-live="polite"></div>
          <input id="productsOther" maxlength="200" placeholder="Other product or CAS number" aria-label="Other product" hidden>
          <input type="hidden" id="${id}">${err}</div>`;
      case "longtext":
        return `<div class="field field--full">${label(id)}<textarea id="${id}" rows="4" maxlength="2000"${req}></textarea>${err}</div>`;
      case "select":
        return `<div class="field">${label(id)}<select id="${id}"${req}><option value="">Choose…</option>${
          (f.options || []).map((o) => `<option>${esc(o)}</option>`).join("")}</select>${err}</div>`;
      default: {
        const ac = { name: "name", company: "organization" }[f.key];
        return `<div class="field">${label(id)}<input id="${id}" maxlength="300"${ac ? ` autocomplete="${ac}"` : ""}${req}>${err}</div>`;
      }
    }
  }).join("");

  const country = $("#country");
  if (country) {
    country.value = "India";
    country.addEventListener("change", () => {
      const code = country.selectedOptions[0]?.dataset.code;
      const dial = $("#dialCode");
      if (dial) dial.textContent = code ? `+${code}` : "+";
    });
  }
  if ($("#productPick")) {
    $("#productPick").addEventListener("change", (e) => {
      const v = e.target.value;
      if (v === "other") { $("#productsOther").hidden = false; $("#productsOther").focus(); }
      else if (v && !picked.includes(v)) picked.push(v);
      renderProductPick();
    });
    $("#picked").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-remove]");
      if (!b) return;
      picked.splice(picked.indexOf(b.dataset.remove), 1);
      renderProductPick();
    });
    $("#productsOther").addEventListener("input", syncProducts);
    renderProductPick();
  }
  // check a field when leaving it, and again while fixing it
  state.expo.fields.filter((f) => f.show && f.type !== "products").forEach((f) => {
    const input = document.getElementById(fieldId(f));
    input.addEventListener("blur", () => { if (input.value) check(f); });
    input.addEventListener(input.tagName === "SELECT" ? "change" : "input", () => { if (input.closest(".field").classList.contains("invalid")) check(f); });
  });
}

const fieldId = (f) => (/^c\d+$/.test(f.key) ? `f_${f.key}` : f.key);
const countryOptions = () => `<option value="">Select country</option>` +
  COUNTRIES.map((c) => `<option value="${esc(c.name)}" data-code="${c.code}">${esc(c.name)}</option>`).join("");
function errorText(f) {
  if (f.type === "email") return "Please enter a valid email address.";
  if (f.type === "phone") return "Please enter a valid phone number.";
  if (f.type === "products") return "Please choose at least one product.";
  if (f.type === "country" || f.type === "select") return `Please choose ${f.label.toLowerCase()}.`;
  return `Please fill in ${f.label.toLowerCase()}.`;
}

function renderProductPick() {
  const list = state.expo.products || [];
  const opt = (value, label) => (picked.includes(value) ? "" : `<option value="${esc(value)}">${esc(label)}</option>`);
  // RP's list comes in intermediates and APIs; other companies' products are one plain list
  const ints = list.filter((p) => p.endsWith(" intermediates"));
  const apis = list.filter((p) => p.endsWith(" API"));
  const rest = list.filter((p) => !ints.includes(p) && !apis.includes(p));
  const grouped = ints.length || apis.length;
  $("#productPick").innerHTML = `<option value="">${picked.length ? "Add another product" : "Choose a product"}</option>` +
    (ints.length ? `<optgroup label="Intermediates">${ints.map((p) => opt(p, p.replace(/ intermediates$/, ""))).join("")}</optgroup>` : "") +
    (apis.length ? `<optgroup label="APIs">${apis.map((p) => opt(p, p.replace(/ API$/, ""))).join("")}</optgroup>` : "") +
    (rest.length ? (grouped ? `<optgroup label="Other products">${rest.map((p) => opt(p, p)).join("")}</optgroup>` : rest.map((p) => opt(p, p)).join("")) : "") +
    `<option value="other"${$("#productsOther").hidden ? "" : " disabled"}>Other (type it in)</option>`;
  $("#picked").innerHTML = picked.map((p) =>
    `<span class="picked__item">${esc(p)}<button type="button" data-remove="${esc(p)}" aria-label="Remove ${esc(p)}">&times;</button></span>`).join("");
  syncProducts();
}

// the hidden #products field holds the answer as one line, which is what gets sent
function syncProducts() {
  const other = $("#productsOther").hidden ? "" : $("#productsOther").value.trim();
  $("#products").value = picked.concat(other ? [other] : []).join(", ");
  const f = state.expo.fields.find((x) => x.key === "products");
  if (f && $("#products").closest(".field").classList.contains("invalid")) check(f);
}

// ---------- validation ----------
function valid(f, v) {
  v = v.trim();
  if (!v) return !f.required;
  if (f.type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  if (f.type === "phone") return v.replace(/\D/g, "").length >= 6;
  if (f.key === "name" || f.key === "company") return v.length > 1;
  return true;
}

function check(f) {
  const input = document.getElementById(fieldId(f));
  const ok = valid(f, input.value);
  const field = input.closest(".field");
  field.classList.toggle("invalid", !ok);
  field.querySelector(".err").hidden = ok;
  input.setAttribute("aria-invalid", String(!ok));
  return ok;
}

// ---------- submit ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.expo) return;
  $("#sendErr").hidden = true;
  $("#takenErr").hidden = true;

  const fields = state.expo.fields.filter((f) => f.show);
  const slotOk = !!(state.day && state.slot);
  $("#slotErr").hidden = slotOk;
  const bad = fields.filter((f) => !check(f));

  if (!slotOk) { $("#slots").scrollIntoView({ block: "center" }); return; }
  if (bad.length) { document.getElementById(bad[0].type === "products" ? "productPick" : fieldId(bad[0])).focus(); return; }

  const v = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");
  const payload = { tenant: state.company.id, expo: state.expo.id, date: state.day, slot: state.slot, website: v("website"), page: location.href, extra: {} };
  fields.forEach((f) => {
    if (/^c\d+$/.test(f.key)) payload.extra[f.key] = v(fieldId(f));
    else if (f.type === "phone") payload.phone = v("phone") ? `${$("#dialCode").textContent} ${v("phone")}` : "";
    else payload[f.key] = v(f.key);
  });

  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    if (SUBMIT_URL) {
      // last look before sending; the server checks again under its lock
      await loadTaken();
      if (!state.slot) return;
      const r = await post(payload);
      if (r.error === "slot_taken") { slotTaken(); loadTaken(); return; }
      if (r.error === "expo_closed") return showClosed("expo_closed", state.expo.name);
      if (r.error === "company_paused" || r.error === "company_not_live") return showClosed("company_paused", state.company.profile.shortName);
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
  const e = state.expo;
  const d = dayParts(state.day);
  const where = [e.booth && `Booth ${e.booth}`, e.hall].filter(Boolean).join(", ") || e.name;
  $("#doneText").textContent =
    `We've received your request for ${d.wd}, ${d.dm}, ${fmtRange(state.slot)} ${e.tzLabel}. ` +
    `We'll confirm by email at ${p.email}. See you at ${where}.`;
  form.hidden = true;
  $("#done").hidden = false;
  $("#done").focus();
  $("#book").scrollIntoView();
}

$("#againBtn").addEventListener("click", () => {
  form.reset();
  renderFields();
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
  const e = state.expo;
  const start = zoned(state.day, state.slot);
  const end = new Date(start.getTime() + e.slotMinutes * 60000);
  const z = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const icsText = (t) => String(t).replace(/[\\,;]/g, (c) => `\\${c}`);
  const where = [e.booth && `Booth ${e.booth}`, e.hall, e.venue].filter(Boolean).join(", ");
  const who = state.company.profile.shortName || state.company.name;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${icsText(who)}//${icsText(e.name)}//EN`, "BEGIN:VEVENT",
    `UID:${z(start)}-${Math.random().toString(36).slice(2)}@${state.company.id}.expo-meetings`,
    `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
    `SUMMARY:Meeting with ${icsText(who)} at ${icsText(e.name)}`,
    `LOCATION:${icsText(where)}`,
    `DESCRIPTION:Meeting request with ${icsText(who)}. Awaiting confirmation by email.`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${state.company.id === "rp" ? "rp-industries" : state.company.id}-${e.id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

loadExpo();
