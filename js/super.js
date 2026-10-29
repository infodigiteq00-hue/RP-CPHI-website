// Expo meetings · the owners' dashboard (super.html): companies, their expo seats and their branding.
// Add a company from its website: the server reads it (logo, colours, font, wording, products, contact) and
// the owners review and adjust everything here, with a live preview, before switching the company on.

const API = (window.RP_CONFIG && window.RP_CONFIG.API_URL) || "";
const TOKEN_KEY = "expo_super_token";
const USER_KEY = "expo_super_user";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); } catch {} },
};
const state = { companies: [], draft: null, isNew: false, candidates: null, original: "", savedNote: "" };
const copy = (x) => JSON.parse(JSON.stringify(x));

async function api(action, data = {}) {
  if (!API) throw new Error("not_configured_url");
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...data }) });
  const json = await res.json();
  if (!json.ok && json.error === "auth") { signOut(); throw new Error("auth"); }
  return json;
}
const token = () => store.get(TOKEN_KEY);

// ---------- login ----------
const LOGIN_ERRORS = {
  invalid: "Wrong ID or password.",
  locked: "Too many wrong attempts. Try again in 15 minutes.",
  not_configured: "The owners' login isn't set up yet. Add SUPER_ID and SUPER_PASSWORD in the Apps Script properties.",
  not_configured_url: "The Apps Script URL is missing in js/config.js.",
  invalid_slot: "The Apps Script is an older version. Paste the latest Code.gs, run setup and deploy a new version.",
};
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#loginErr");
  err.hidden = true;
  const id = $("#loginId").value.trim();
  const password = $("#loginPw").value;
  if (!id || !password) { err.textContent = "Enter your ID and password."; err.hidden = false; return; }
  const btn = $("#loginBtn");
  btn.disabled = true;
  btn.textContent = "Signing in…";
  try {
    const r = await api("superLogin", { id, password });
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
  $("#appView").hidden = true;
  $("#loginView").hidden = false;
}
$("#logoutBtn").addEventListener("click", signOut);
function showApp() {
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#userName").textContent = store.get(USER_KEY) || "";
  show("list");
  load();
}

// ---------- views ----------
function show(view) {
  $("#listView").hidden = view !== "list";
  $("#readView").hidden = view !== "read";
  $("#editView").hidden = view !== "edit";
  $("#mailView").hidden = view !== "mail";
  window.scrollTo(0, 0);
}
const dirty = () => !!state.draft && JSON.stringify(state.draft) !== state.original;
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-back]")) return;
  if ($("#editView").hidden === false && dirty() && !confirm("Discard your unsaved changes?")) return;
  state.draft = null;
  show("list");
});

// ---------- the companies ----------
async function load() {
  const btn = $("#refreshBtn");
  btn.disabled = true;
  $("#loadErr").hidden = true;
  try {
    const r = await api("superList", { token: token() });
    if (!r.ok) throw new Error(r.error);
    state.companies = r.companies;
    renderList();
  } catch (ex) {
    if (ex.message === "auth") return;
    $("#loadErr").textContent = ex.message === "invalid_slot" ? LOGIN_ERRORS.invalid_slot : "Couldn't load the companies. Try Refresh.";
    $("#loadErr").hidden = false;
  } finally {
    btn.disabled = false;
  }
}
$("#refreshBtn").addEventListener("click", load);

const site = () => location.origin;
const bookingUrl = (c) => (c.id === "rp" ? `${site()}/invite` : `${site()}/${c.id}`);
const adminUrl = (c) => (c.id === "rp" ? `${site()}/admin` : `${site()}/${c.id}/admin`);

function renderList() {
  const list = state.companies;
  const live = list.filter((c) => c.status === "Active").length;
  $("#countLine").textContent = `${list.length} compan${list.length === 1 ? "y" : "ies"} · ${live} live`;
  $("#rows").innerHTML = list.map((c) => {
    const s = c.stats || {};
    const logo = window.Brand.logoUrl(c);
    return `<tr>
      <td data-label="Company"><div class="co">
        ${logo ? `<img src="${esc(logo)}" alt="" class="co__logo">` : `<span class="co__logo co__logo--none" style="background:${esc(c.brand.primary)}"></span>`}
        <div><strong>${esc(c.name)}</strong>${c.website ? `<small><a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\//, ""))}</a></small>` : ""}</div>
      </div></td>
      <td data-label="Status"><span class="co-status co-status--${esc(c.status.toLowerCase())}">${esc(c.status === "Active" ? "Live" : c.status)}</span></td>
      <td data-label="Expo seats">${s.activeExpos || 0} of ${c.seats} in use<small>${s.expos || 0} expo${s.expos === 1 ? "" : "s"} in all</small></td>
      <td data-label="Requests">${s.requests || 0}${s.error ? `<small class="err">${esc(s.error)}</small>` : ""}</td>
      <td data-label="Links"><a href="${esc(bookingUrl(c))}" target="_blank" rel="noopener">Booking page</a><small><a href="${esc(adminUrl(c))}" target="_blank" rel="noopener">Dashboard</a>${c.sheetUrl ? ` · <a href="${esc(c.sheetUrl)}" target="_blank" rel="noopener">Sheet</a>` : ""}</small></td>
      <td data-label=""><div class="row-actions">
        <button class="act act--primary" type="button" data-edit="${esc(c.id)}">Edit</button>
        <button class="act" type="button" data-open="${esc(c.id)}">Open dashboard</button>
      </div></td>
    </tr>`;
  }).join("");
}

$("#rows").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]");
  if (ed) {
    const c = state.companies.find((x) => x.id === ed.dataset.edit);
    return startEdit(c, false, null);
  }
  const op = e.target.closest("[data-open]");
  if (op) openDashboard(op.dataset.open, op);
});

// the company's dashboard, signed in as its admin (works before it's live, so it can be set up)
async function openDashboard(id, btn) {
  const w = window.open("", "_blank");
  try {
    const r = await api("superOpenAdmin", { token: token(), company: id });
    if (!r.ok) throw new Error(r.error);
    const url = `${site()}/admin${id === "rp" ? "" : `?c=${encodeURIComponent(id)}`}#auth=${r.token}`;
    if (w) w.location = url; else location.href = url;
  } catch (ex) {
    if (w) w.close();
    if (ex.message === "auth") return;
    alert(ex.message === "needs_login" ? "Set the company's admin ID and password first." : "Couldn't open the dashboard. Try again.");
  }
}

// ---------- add: read the website ----------
$("#addBtn").addEventListener("click", () => {
  $("#readErr").hidden = true;
  $("#siteUrl").value = "";
  show("read");
  $("#siteUrl").focus();
});
$("#readForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = $("#siteUrl").value.trim();
  const err = $("#readErr");
  err.hidden = true;
  if (!url) { err.textContent = "Enter the company's website."; err.hidden = false; return; }
  $("#readBtn").disabled = true;
  $("#readBusy").hidden = false;
  try {
    const r = await api("superAnalyze", { token: token(), url });
    if (!r.ok) throw Object.assign(new Error(r.error), { detail: r.detail });
    startEdit(r.company, true, r.candidates);
  } catch (ex) {
    if (ex.message === "auth") return;
    err.textContent = { bad_url: "That doesn't look like a public website address.", site_unreachable: "That website couldn't be read. Check the address, or set it up by hand.",
      analyze_failed: `The website was read, but the branding couldn't be worked out: ${ex.detail || "try again"}.` }[ex.message] || "Couldn't read the website. Try again.";
    err.hidden = false;
  } finally {
    $("#readBtn").disabled = false;
    $("#readBusy").hidden = true;
  }
});
$("#manualBtn").addEventListener("click", () => {
  startEdit({ id: "", name: "", website: "", status: "Draft", seats: 1,
    brand: { logo: "", primary: "#1f3a5f", accent: "#2e7d32", highlight: "", font: window.Brand.DEFAULT_FONT, heroIdea: "" },
    profile: { shortName: "", tagline: "", headline: "", highlight: "", about: "", industry: "", products: [],
      signature: { team: "", tagline: "", phone: "", email: "", website: "" } },
    notifyEmail: "", brochure: "", admin: { id: "" } }, true, null);
});

// ---------- review and edit ----------
function startEdit(c, isNew, candidates) {
  const d = copy(c);
  delete d.stats; delete d.sheetUrl; delete d.defaultExpo; delete d.sheetId; delete d.created;
  d.admin = { id: (c.admin && c.admin.id) || "", password: "" };
  d.productsText = (d.profile.products || []).join("\n");
  state.draft = d;
  state.hasPassword = !!(c.admin && c.admin.hasPassword);
  state.isNew = isNew;
  state.candidates = candidates;
  state.original = JSON.stringify(d);
  state.savedNote = "";
  renderEdit();
  show("edit");
}

const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
function set(o, path, v) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((x, k) => (x[k] = x[k] || {}), o)[last] = v;
}
const fld = (label, path, opts = {}) => {
  const v = get(state.draft, path) ?? "";
  const id = `f_${path.replace(/\./g, "_")}`;
  const input = opts.area
    ? `<textarea id="${id}" data-k="${path}" rows="${opts.rows || 3}" placeholder="${esc(opts.ph || "")}">${esc(v)}</textarea>`
    : `<input id="${id}" data-k="${path}" value="${esc(v)}" placeholder="${esc(opts.ph || "")}"${opts.type ? ` type="${opts.type}"` : ""}${opts.attrs || ""}>`;
  return `<div class="field${opts.full ? " field--full" : ""}"><label for="${id}">${esc(label)}</label>${opts.prefix ? `<div class="prefixed"><span>${esc(opts.prefix)}</span>${input}</div>` : input}${opts.hint ? `<p class="hint">${opts.hint}</p>` : ""}</div>`;
};
const colorFld = (label, path, optional) => {
  const v = get(state.draft, path) || "";
  const swatches = ((state.candidates && state.candidates.colors) || []).map((c) =>
    `<button type="button" class="sw" style="--c:${esc(c.hex)}" data-color="${esc(path)}" data-hex="${esc(c.hex)}" title="${esc(c.hex)}" aria-label="Use ${esc(c.hex)}"${c.hex === v ? ' aria-pressed="true"' : ""}></button>`).join("");
  return `<div class="field"><label for="c_${path}">${esc(label)}</label>
    <div class="color-row"><input type="color" id="c_${path}" data-k="${path}" value="${esc(v || "#ffffff")}" aria-label="${esc(label)}">
      <input class="hex" data-k="${path}" value="${esc(v)}" placeholder="${optional ? "optional" : "#1f3a5f"}" aria-label="${esc(label)} code">
      ${optional && v ? `<button class="link" type="button" data-clear="${esc(path)}">Clear</button>` : ""}</div>
    ${swatches ? `<div class="sw-row" aria-label="Colours from the website">${swatches}</div>` : ""}</div>`;
};

function renderEdit() {
  const d = state.draft;
  const c = state.candidates || {};
  const logos = c.logos || [];
  const chosen = d.brand.certs || [];
  const certs = [...chosen, ...(c.certs || []).filter((u) => !chosen.includes(u))];
  const fonts = [window.Brand.DEFAULT_FONT, ...(c.fonts || []).filter((f) => f.google).map((f) => f.name), d.brand.font]
    .filter((f, i, a) => f && a.indexOf(f) === i);
  $("#editView").innerHTML = `
    <button class="link back" type="button" data-back>&larr; Companies</button>
    <div class="results__head">
      <div><h1>${state.isNew ? "New company" : esc(d.name)}</h1>
        <p class="muted">${state.isNew ? "Read from its website. Check everything, then save it as a draft or switch it on." : `Status: ${esc(d.status === "Active" ? "Live" : d.status)}`}</p></div>
    </div>
    <div class="editor">
      <div class="editor__form settings">
        <section class="set">
          <h2>Company</h2>
          <div class="set__grid">
            ${fld("Company name", "name", { ph: "XYZ Pharma Private Limited" })}
            ${fld("Short name", "profile.shortName", { ph: "XYZ Pharma", hint: "How the company refers to itself in sentences." })}
            ${fld("Link name", "id", { prefix: `${location.host}/`, ph: "xyz-pharma", attrs: state.isNew ? "" : " readonly",
              hint: state.isNew ? "Lowercase letters, numbers and dashes. Can't be changed later." : "Can't be changed." })}
            ${fld("Website", "website", { ph: "https://xyzpharma.com" })}
            <div class="field"><label for="f_status">Status</label>
              <select id="f_status" data-k="status">${[["Draft", "Draft: being set up (a preview only)"], ["Active", "Live: bookings and login open"], ["Paused", "Paused: page closed, login off"]]
                .map(([v, l]) => `<option value="${v}"${d.status === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
            ${fld("Expo seats", "seats", { type: "number", attrs: ' min="0" max="100" step="1"', hint: "How many expos it can run at once. Archived expos don't use a seat." })}
          </div>
        </section>

        <section class="set">
          <h2>Logo</h2>
          ${logos.length ? `<div class="logo-pick">${logos.map((l) => `<button type="button" class="logo-opt" data-logo="${esc(l.url)}" aria-pressed="${l.url === d.brand.logo}" title="${esc(l.why)}">
            <img src="${esc(l.url)}" alt="" loading="lazy"><small>${esc(l.why)}</small></button>`).join("")}</div>` : ""}
          ${fld("Logo link", "brand.logo", { full: true, ph: "https://…/logo.png", hint: "A PNG or JPG works best in emails. It's copied to the company's Drive folder when you save." })}
        </section>

        <section class="set">
          <h2>Certificates</h2>
          <p class="muted">Shown beside the logo in the invite email. Click one to add or remove it.</p>
          ${certs.length ? `<div class="logo-pick">${certs.map((u) => `<button type="button" class="logo-opt" data-cert="${esc(u)}" aria-pressed="${chosen.includes(u)}">
            <img src="${esc(u)}" alt="" loading="lazy"></button>`).join("")}</div>` : `<p class="muted">None found on the website.</p>`}
        </section>

        <section class="set">
          <h2>Colours and font</h2>
          <div class="set__grid">
            ${colorFld("Main colour", "brand.primary")}
            ${colorFld("Accent colour", "brand.accent")}
            ${colorFld("Highlight on the banner", "brand.highlight", true)}
            <div class="field"><label for="f_font">Font</label>
              <select id="f_font" data-k="brand.font">${fonts.map((f) => `<option${f === d.brand.font ? " selected" : ""}>${esc(f)}</option>`).join("")}</select>
              <p class="hint">From the website, if it uses a Google font.</p></div>
          </div>
          <p class="hint">Colours that would make text hard to read are darkened or lightened on the pages: the preview shows the result.</p>
        </section>

        <section class="set">
          <h2>Wording</h2>
          <div class="set__grid">
            ${fld("Headline", "profile.headline", { full: true, ph: "World's No. 1 Prazole Intermediate Manufacturer", hint: "The booking page's big line. A new expo starts with it." })}
            ${fld("Words to highlight", "profile.highlight", { ph: "Prazole Intermediate", hint: `<span id="hlHint">${highlightHint(d.profile.headline, d.profile.highlight)}</span>` })}
            ${fld("Tagline", "profile.tagline", { ph: "Quality Matters First" })}
            ${fld("What the company does", "profile.about", { full: true, ph: "a manufacturer of Prazole intermediates", hint: "Completes \"[short name] is …\". Used in the minutes and follow-up emails." })}
            ${fld("Industry", "profile.industry", { ph: "Pharmaceutical APIs" })}
          </div>
        </section>

        <section class="set">
          <h2>Company profile</h2>
          <p class="hint">From the website, so the AI knows the company it writes for: what it makes, markets, facilities, quality.
            Check it: only facts that are true belong here.${state.isNew || !d.website ? "" : ` <button class="link" type="button" id="reread">Read the website again</button>`}</p>
          <p class="muted read__busy" id="rereadBusy" hidden><span class="spinner" aria-hidden="true"></span> Reading the website…</p>
          ${fld("Profile", "profile.brief", { area: true, rows: 7, full: true, ph: "- Makes Prazole intermediates and APIs\n- Four plants in Gujarat\n- …",
            hint: "Background for the minutes and follow-ups. The visitor never sees it as such." })}
          ${fld("Line for follow-up emails", "profile.pitch", { area: true, rows: 2, full: true, ph: "As a manufacturer of Prazole intermediates, we would be glad to support your requirements.",
            hint: "Used when the AI's own line about the company can't be checked against the profile. Each draft shows the line separately, so the team can edit or remove it." })}
        </section>

        <section class="set">
          <h2>Products</h2>
          ${fld("One per line", "productsText", { area: true, rows: 8, full: true, ph: "Metformin HCl\nAtorvastatin Calcium",
            hint: "Visitors pick from these when booking. Follow-up emails only ever name these." })}
        </section>

        <section class="set">
          <h2>Email signature and contact</h2>
          <div class="set__grid">
            ${fld("Team name", "profile.signature.team", { ph: "Team XYZ Pharma" })}
            ${fld("Line under it", "profile.signature.tagline", { ph: "Chemistry you can trust" })}
            ${fld("Phone", "profile.signature.phone", { ph: "+91 22 1234 5678" })}
            ${fld("Email", "profile.signature.email", { ph: "sales@xyzpharma.com" })}
            ${fld("Website in the signature", "profile.signature.website", { ph: "https://xyzpharma.com" })}
            ${fld("Brochure link", "brochure", { ph: "https://…/brochure.pdf", hint: "Optional. Added to follow-up emails." })}
            ${fld("New request emails to", "notifyEmail", { full: true, ph: "sales@xyzpharma.com, owner@xyzpharma.com", hint: "Optional. Each new booking is emailed here." })}
          </div>
        </section>

        <section class="set">
          <h2>Nano Banana banners</h2>
          ${fld("Scene for the banners", "brand.heroIdea", { area: true, rows: 2, full: true, ph: "a bright modern pharmaceutical laboratory with glassware",
            hint: "What the expo banners should show. The company can make banners for each expo from its dashboard." })}
        </section>

        <section class="set">
          <h2>Dashboard login</h2>
          <div class="set__grid">
            ${fld("Admin ID", "admin.id", { ph: "xyz-admin" })}
            <div class="field"><label for="f_admin_password">${state.hasPassword ? "New password" : "Password"}</label>
              <div class="copy-row"><input id="f_admin_password" data-k="admin.password" value="${esc(d.admin.password)}" autocomplete="new-password" placeholder="${state.hasPassword ? "Leave empty to keep the current one" : "At least 8 characters"}">
                <button class="btn btn--outline btn--sm" type="button" id="genPw">Generate</button></div></div>
          </div>
          <p class="hint">${d.id === "rp" && !state.hasPassword ? "" : "Give these to the company. The password is stored only in a protected form, so note it now."}
            Their dashboard: <b>${esc(d.id ? adminUrl(d) : "")}</b></p>
        </section>

        <div class="settings__save">
          <p class="err" id="saveErr" hidden></p>
          <p class="saved" id="saveNote"${state.savedNote ? "" : " hidden"}>${esc(state.savedNote)}</p>
          <div class="settings__save-actions">
            <button class="btn btn--outline btn--sm" type="button" data-back>Cancel</button>
            ${state.isNew ? `<button class="btn btn--outline btn--sm" type="button" data-save="Draft">Save as draft</button>` : ""}
            <button class="btn btn--sm" type="button" data-save="">${state.isNew ? "Save and switch on" : "Save changes"}</button>
          </div>
        </div>
      </div>

      <aside class="editor__preview">
        <p class="label">Preview</p>
        <div class="pv" id="pv"></div>
        ${!state.isNew ? `<button class="btn btn--outline btn--sm" type="button" id="openDash">Open its dashboard</button>` : ""}
      </aside>
    </div>`;
  renderPreview();
}

// whether the words to highlight are in the headline (they're shown in the accent colour there)
function highlightHint(headline, words) {
  if (!words) return "Optional: words of the headline to show in the accent colour.";
  return (headline || "").toLowerCase().includes(words.toLowerCase())
    ? `<span class="hint-ok">Found in the headline.</span>`
    : `<span class="hint-warn">Not in the headline, so nothing will be highlighted. Copy the words exactly as the headline has them.</span>`;
}

// the company's booking page and dashboard header, in its branding
function renderPreview() {
  const d = state.draft;
  const box = $("#pv");
  if (!box) return;
  const p = d.profile;
  const h = p.headline || d.name || "Your headline";
  const i = p.highlight ? h.toLowerCase().indexOf(p.highlight.toLowerCase()) : -1;
  const head = i < 0 ? esc(h) : `${esc(h.slice(0, i))}<span class="hl">${esc(h.slice(i, i + p.highlight.length))}</span>${esc(h.slice(i + p.highlight.length))}`;
  box.innerHTML = `
    <div class="pv__page">
      <div class="pv__bar"><img data-brand-logo alt=""><span class="pv__btn">Book a meeting</span></div>
      <div class="pv__hero">
        <small>CPHI Worldwide 2027</small>
        <b>${head}</b>
        <span class="pv__light">Book a meeting</span>
      </div>
      <div class="pv__info"><div><small>Booth</small><b>9.1F20</b></div><div><small>Dates</small><b>26–28 October</b></div></div>
      <div class="pv__slots"><span class="on">10:30 – 11:00 AM</span><span>11:00 – 11:30 AM</span></div>
      <p class="pv__foot">© ${new Date().getFullYear()} ${esc(p.shortName || d.name)}${p.tagline ? ` · ${esc(p.tagline)}` : ""}</p>
    </div>
    <div class="pv__admin"><img data-brand-logo alt=""><span>Meeting requests</span><span class="pv__tab">Scheduled</span></div>
    <p class="pv__mail">Follow-up emails are signed: <b>${esc(p.signature.team || `Team ${p.shortName || d.name}`)}</b>${p.signature.phone || p.signature.email ? `, ${esc([p.signature.phone, p.signature.email].filter(Boolean).join(" · "))}` : ""}</p>`;
  window.Brand.apply({ brand: d.brand, name: d.name, profile: p }, box);
}

$("#editView").addEventListener("input", onEdit);
$("#editView").addEventListener("change", onEdit);
function onEdit(e) {
  const t = e.target;
  if (!t.dataset.k) return;
  let v = t.value;
  if (t.dataset.k === "id") v = v.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (t.dataset.k === "seats") v = v === "" ? "" : Number(v);
  if (t.classList.contains("hex") && v && !/^#[0-9a-f]{6}$/i.test(v)) return; // half-typed colour: wait
  set(state.draft, t.dataset.k, v);
  if (/^profile\.(headline|highlight)$/.test(t.dataset.k) && $("#hlHint")) $("#hlHint").innerHTML = highlightHint(state.draft.profile.headline, state.draft.profile.highlight);
  // keep the colour picker and its code in step
  if (/^brand\.(primary|accent|highlight)$/.test(t.dataset.k)) {
    document.querySelectorAll(`[data-k="${t.dataset.k}"]`).forEach((x) => { if (x !== t) x.value = v || (x.type === "color" ? "#ffffff" : ""); });
  }
  if (t.dataset.k === "profile.shortName" && state.isNew) {
    const team = state.draft.profile.signature;
    if (!team.team || /^Team /.test(team.team)) { team.team = v ? `Team ${v}` : ""; const f = $("#f_profile_signature_team"); if (f) f.value = team.team; }
  }
  renderPreview();
}

$("#editView").addEventListener("click", async (e) => {
  const sw = e.target.closest("[data-color]");
  if (sw) { set(state.draft, sw.dataset.color, sw.dataset.hex); return renderEdit(); }
  const cl = e.target.closest("[data-clear]");
  if (cl) { set(state.draft, cl.dataset.clear, ""); return renderEdit(); }
  const lg = e.target.closest("[data-logo]");
  if (lg) { state.draft.brand.logo = lg.dataset.logo; return renderEdit(); }
  const ct = e.target.closest("[data-cert]");
  if (ct) {
    const list = state.draft.brand.certs || [];
    state.draft.brand.certs = list.includes(ct.dataset.cert) ? list.filter((u) => u !== ct.dataset.cert) : [...list, ct.dataset.cert].slice(0, 8);
    return renderEdit();
  }
  if (e.target.id === "genPw") {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const rnd = crypto.getRandomValues(new Uint32Array(14));
    state.draft.admin.password = Array.from(rnd, (n) => chars[n % chars.length]).join("");
    $("#f_admin_password").value = state.draft.admin.password;
    return;
  }
  if (e.target.id === "openDash") return openDashboard(state.draft.id, e.target);
  if (e.target.id === "reread") return reread(e.target);
  const sv = e.target.closest("[data-save]");
  if (sv) save(sv.dataset.save);
});

// fresh profile and follow-up line (and logo, colour and font choices) from the company's website
async function reread(btn) {
  btn.disabled = true;
  $("#rereadBusy").hidden = false;
  try {
    const r = await api("superAnalyze", { token: token(), url: state.draft.website });
    if (!r.ok) throw Object.assign(new Error(r.error), { detail: r.detail });
    state.draft.profile.brief = r.company.profile.brief;
    state.draft.profile.pitch = r.company.profile.pitch;
    if (!(state.draft.brand.certs || []).length) state.draft.brand.certs = r.company.brand.certs;
    state.candidates = r.candidates;
    renderEdit();
    state.savedNote = "";
    $("#saveNote").textContent = "Profile read again. Check it, then save.";
    $("#saveNote").hidden = false;
  } catch (ex) {
    btn.disabled = false;
    $("#rereadBusy").hidden = true;
    if (ex.message !== "auth") alert(ex.detail || "Couldn't read the website. Try again.");
  }
}

async function save(status) {
  const d = state.draft;
  const err = $("#saveErr");
  err.hidden = true;
  const showErr = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: "nearest" }); };
  const company = copy(d);
  company.profile.products = d.productsText.split("\n").map((x) => x.trim()).filter(Boolean);
  delete company.productsText;
  if (state.isNew) company.status = status || "Active";
  if (company.profile.highlight && !company.profile.headline.toLowerCase().includes(company.profile.highlight.toLowerCase())) company.profile.highlight = "";
  if (!company.name.trim()) return showErr("Give the company a name.");
  if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(company.id)) return showErr("The link name must be 2–30 lowercase letters, numbers or dashes.");
  if (company.status === "Active" && !company.admin.id) return showErr("Set the admin ID and password before switching the company on.");
  if (company.status === "Active" && !company.admin.password && !state.hasPassword) return showErr("Set a password before switching the company on.");
  if (company.admin.password && company.admin.password.length < 8) return showErr("The password must be at least 8 characters.");
  const buttons = document.querySelectorAll("[data-save]");
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const r = await api("superSaveCompany", { token: token(), create: state.isNew, company });
    if (!r.ok) throw Object.assign(new Error(r.error), { detail: r.detail });
    const pw = company.admin.password;
    const i = state.companies.findIndex((c) => c.id === r.company.id);
    if (i >= 0) state.companies[i] = r.company; else state.companies.push(r.company);
    startEdit(r.company, false, state.candidates);
    state.savedNote = `Saved${r.company.status === "Active" ? ". It's live" : r.company.status === "Draft" ? " as a draft" : ""}.` +
      (pw ? ` Login for ${adminUrl(r.company)}: ID ${r.company.admin.id}, password ${pw}` : "");
    renderEdit();
    renderList();
  } catch (ex) {
    if (ex.message === "auth") return;
    showErr({ id_taken: "That link name is already used (by a company, or by one of RP Industries' expos).", busy: "The sheet is busy. Try again in a moment.",
      invalid_company: ex.detail || "Some settings aren't right." }[ex.message] || ex.detail || "Couldn't save. Try again.");
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

window.addEventListener("beforeunload", (e) => { if (!$("#editView").hidden && dirty()) { e.preventDefault(); e.returnValue = ""; } });

// ---------- start ----------
if (token()) showApp();
else $("#loginId").focus();
