// Expo Manager · admin: the mailer. Write a mail once (an expo's invite keeps its layout), upload a list, and every
// person's mail is filled in. On the ready screen, Send email opens that person's mail in the sender's own mailbox; they
// press Send there, then confirm here, which ticks them with the date. Nothing is sent for them.
// With Gmail connected the mail opens as a ready draft. Otherwise a link can't carry a design, so it's copied for them
// to paste. Loaded after admin.js and invite-mail.js; uses $, esc(), api(), store, TOKEN_KEY, state, inviteParts(), inviteHtml().

const MAIL_ERRORS = {
  empty: "Add a subject and a message.",
  no_recipients: "Add at least one person with a valid email address.",
  too_many: "That's more than 2,000 people. Split the list.",
  not_set_up: "Connecting Google isn't switched on for this platform yet. Ask the platform owners.",
  no_draft_permission: "Google wasn't given permission for drafts. Connect again and leave “Manage drafts and send emails” ticked.",
  no_refresh: "Google didn't give lasting permission. Remove this app at myaccount.google.com/permissions, then connect again.",
  busy: "The sheet is busy. Try again in a moment.",
  invalid_cc: "One of the CC addresses doesn't look right (at most 20, separated with commas).",
  invalid_slot: "The Apps Script is an older version. Paste the latest Code.gs and deploy a New version, then try again.",
};
const mail = { status: null, list: null, people: [], asking: null };
const mailToken = () => store.get(TOKEN_KEY);
const isHtml = (t) => /<\/?(html|body|p|div|table|br|a|img)\b/i.test(t);
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// the CC field: distinct addresses, or null if one isn't an address
const ccList = (v) => {
  const out = [...new Set(String(v || "").split(/[\s,;]+/).filter(Boolean).map((e) => e.toLowerCase()))];
  return out.every((e) => EMAIL_OK.test(e)) && out.length <= 20 ? out : null;
};
const CC_KEY = () => `mailer_cc_${(state.company && state.company.id) || "rp"}`;

// ---------- each person's mail ----------
// {first_name} and the others; in an HTML mail the values are escaped
function fillMail(text, p, html) {
  const v = { first_name: p.firstName || "Business Associate", last_name: p.lastName || "", email: p.email || "", company_name: p.company || "your firm" };
  return text.replace(/\{(first_name|last_name|email|company_name)\}/gi, (_, k) => (html ? esc(v[k.toLowerCase()]) : v[k.toLowerCase()]));
}
// the part of an HTML mail that goes in a message: what's inside <body>
const mailBody = (t) => (/<body[^>]*>([\s\S]*)<\/body>/i.exec(t) || [, t])[1].trim();

// ---------- the list ----------
function parseCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { rows[rows.length - 1].push(cell.trim()); cell = ""; }
    else if (c === "\n") { rows[rows.length - 1].push(cell.trim()); cell = ""; rows.push([]); }
    else if (c !== "\r") cell += c;
  }
  rows[rows.length - 1].push(cell.trim());
  return rows.filter((r) => r.some(Boolean));
}

// First name, Last name, Email ID, Company name, by the header row; without one, in that order. Returns { people, skipped }.
function parseList(text) {
  const rows = parseCsv(text.trim());
  if (!rows.length) return { people: [], skipped: 0 };
  const head = rows[0].map((h) => h.toLowerCase());
  const hasHead = !rows[0].some((c) => c.includes("@"));
  const find = (re) => head.findIndex((h) => re.test(h));
  const isCc = (h) => /^cc\b|\bcc\b|copy|colleague/.test(h);
  const col = hasHead ? { first: find(/first|^name$|full/), last: find(/last|sur/), email: head.findIndex((h) => /mail/.test(h) && !isCc(h)),
    company: find(/company|firm|organi[sz]ation/), cc: head.findIndex(isCc) } : { first: 0, last: 1, email: 2, company: 3, cc: 4 };
  const seen = new Set();
  let skipped = 0;
  let badCc = 0;
  const people = [];
  (hasHead ? rows.slice(1) : rows).forEach((r) => {
    const email = (r[col.email] || r.find((c) => c.includes("@")) || "").toLowerCase();
    if (!EMAIL_OK.test(email) || seen.has(email)) { skipped++; return; }
    seen.add(email);
    // their own colleagues, copied on their mail: "a@x.com; b@x.com" in one cell
    const cc = String(r[col.cc] || "").split(/[\s,;]+/).filter(Boolean).map((e) => e.toLowerCase());
    if (cc.some((e) => !EMAIL_OK.test(e))) badCc++;
    people.push({ email, firstName: r[col.first] || "", lastName: r[col.last] || "", company: r[col.company] || "",
      cc: [...new Set(cc.filter((e) => EMAIL_OK.test(e) && e !== email))].join(", ") });
  });
  return { people, skipped, badCc };
}

function countLine() {
  const { people, skipped, badCc } = parseList($("#mList").value);
  const noFirst = people.filter((p) => !p.firstName).length;
  const noCompany = people.filter((p) => !p.company).length;
  $("#mCount").textContent = !people.length && !skipped ? "" : [
    `${people.length} ${people.length === 1 ? "person" : "people"}`,
    skipped && `${skipped} left out (bad or repeated email)`,
    noFirst && `${noFirst} without a first name will see "Business Associate"`,
    noCompany && `${noCompany} without a company will see "your firm"`,
    badCc && `${badCc} with a CC address that doesn't look right (left out)`,
  ].filter(Boolean).join(" · ");
  renderPreview();
}

function renderPreview() {
  const message = $("#mMessage").value.trim();
  $("#mPreviewWrap").hidden = !message;
  if (!message) return;
  const p = parseList($("#mList").value).people[0] || { email: "asha@example.com", firstName: "Asha", lastName: "Rao", company: "Acme Pharma" };
  $("#mPreviewSubject").textContent = fillMail($("#mSubject").value, p, false);
  $("#mPreview").srcdoc = isHtml(message) ? fillMail(message, p, true) : `<pre style="margin:16px;font:15px/1.5 Arial,sans-serif;white-space:pre-wrap">${esc(fillMail(message, p, false))}</pre>`;
}

// ---------- the connection and the lists ----------
const draftMode = () => { const a = mail.status && mail.status.account; return !!(a && !a.error && a.drafts !== false); };

function renderConn(r) {
  const a = r.account;
  const connect = r.clientId ? `<button class="btn btn--outline" type="button" id="mConnect">Connect with Google</button>` : "";
  $("#mConn").innerHTML = !a ? `<p class="muted">Not connected: a designed mail is copied for you, and you paste it (Ctrl+V) in your mailbox. Connect Google to skip pasting.</p>${connect}`
    : a.error ? `<p class="err">Google stopped the permission for ${esc(a.email)}. Connect again to skip pasting.</p>${connect}`
    : `<p>Connected: <b>${esc(a.name ? `${a.name} <${a.email}>` : a.email)}</b>. Each mail opens as a ready draft in this Gmail, with nothing to paste.</p>
        <button class="link" type="button" id="mDisconnect">Disconnect</button>`;
}

function renderLists(r) {
  const lists = r.lists || []; // an older Apps Script has none
  $("#mLists").innerHTML = lists.length ? lists.map((l) => `<tr>
      <td data-label="List">${l.name ? `<strong>${esc(l.name)}</strong><br><small class="muted">${esc(l.subject)}</small>` : esc(l.subject)}
        ${r.lists && "name" in l ? `<br><button class="link mail-rename" type="button" data-rename="${esc(l.id)}" data-name="${esc(l.name || "")}">${l.name ? "Rename" : "Name this list"}</button>` : ""}</td>
      <td data-label="Created">${esc(l.created)}${l.by ? `<br><small class="muted">${esc(l.by)}</small>` : ""}</td>
      <td data-label="Sent">${l.sent} of ${l.total}</td>
      <td><button class="link" type="button" data-open="${esc(l.id)}">Open</button></td>
    </tr>`).join("") : `<tr><td colspan="4" class="muted">No lists yet.</td></tr>`;
}

function renderMail(r) {
  mail.status = r;
  renderConn(r);
  renderLists(r);
  if (!$("#mReady").hidden) renderReady();
}

// the expos' invites, with {first_name} and {company_name} in them
function fillStart() {
  const expos = (state.expos || []).filter((e) => e.status === "Active");
  const keep = $("#mStart").value;
  $("#mStart").innerHTML = `<option value="">Your own mail</option>${expos.map((e) => `<option value="${esc(e.id)}">Invite: ${esc(e.name)}</option>`).join("")}`;
  $("#mStart").value = keep;
}

async function openMailer() {
  fillStart();
  try { if (!$("#mCc").value) $("#mCc").value = localStorage.getItem(CC_KEY()) || ""; } catch {}
  try {
    const r = await api("mailStatus", { token: mailToken() });
    if (r.ok) renderMail(r);
  } catch (ex) {
    if (ex.message !== "auth") $("#mConn").innerHTML = `<p class="err">Couldn't load. Check your connection and try again.</p>`;
  }
}

// Connect with Google: Google's own pop-up, then the one-time code goes to the server
function loadGoogle() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = ok;
    s.onerror = () => fail(new Error("google_unreachable"));
    document.head.appendChild(s);
  });
}
async function connectGoogle(btn) {
  btn.disabled = true;
  try {
    await loadGoogle();
  } catch {
    btn.disabled = false;
    return alert("Couldn't reach Google. Check your connection and try again.");
  }
  const client = google.accounts.oauth2.initCodeClient({
    client_id: mail.status.clientId,
    scope: "openid email profile https://www.googleapis.com/auth/gmail.compose",
    ux_mode: "popup",
    select_account: true,
    login_hint: mail.status.account ? mail.status.account.email : undefined,
    callback: async (resp) => {
      if (resp.error) { btn.disabled = false; return; }
      $("#mConn").innerHTML = `<p class="muted">Connecting…</p>`;
      try {
        const r = await api("mailConnect", { token: mailToken(), code: resp.code });
        if (!r.ok) throw Object.assign(new Error(r.error), { detail: r.detail });
        renderMail(r);
      } catch (ex) {
        if (ex.message === "auth") return;
        renderConn(mail.status);
        alert(MAIL_ERRORS[ex.message] || (ex.detail ? `Couldn't connect: ${ex.detail}` : "Couldn't connect. Try again."));
      }
    },
    error_callback: () => { btn.disabled = false; }, // pop-up closed or blocked
  });
  client.requestCode();
}

$("#mConn").addEventListener("click", async (e) => {
  if (e.target.id === "mConnect") return connectGoogle(e.target);
  if (e.target.id !== "mDisconnect" || !confirm("Disconnect this Gmail? You'll paste designed mails again until you connect one.")) return;
  e.target.disabled = true;
  try {
    const r = await api("mailDisconnect", { token: mailToken() });
    if (r.ok) renderMail(r);
  } catch (ex) { e.target.disabled = false; }
});

// ---------- writing the mail and the list ----------
$("#mStart").addEventListener("change", () => {
  const e = (state.expos || []).find((x) => x.id === $("#mStart").value);
  if (!e) return;
  $("#mSubject").value = inviteParts(e, state.company).subject;
  $("#mMessage").value = inviteHtml(e, state.company, true);
  renderPreview();
});
$("#mSubject").addEventListener("input", renderPreview);
$("#mMessage").addEventListener("input", renderPreview);
$("#mList").addEventListener("input", countLine);
$("#mTemplate").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["First name,Last name,Email ID,Company name,CC (their colleagues)\nAsha,Rao,asha@example.com,Acme Pharma,ravi@acmepharma.com; meena@acmepharma.com\n"], { type: "text/csv" }));
  a.download = "email-list-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});
$("#mFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (/\.xlsx?$/i.test(f.name)) { $("#mailErr").textContent = "In Excel, use Save As → CSV, then upload that file."; $("#mailErr").hidden = false; return; }
  $("#mailErr").hidden = true;
  $("#mList").value = (await f.text()).replace(/^\uFEFF/, "").trim();
  countLine();
});

$("#mailForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#mailErr");
  const showErr = (m) => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  const { people } = parseList($("#mList").value);
  const subject = $("#mSubject").value.trim();
  const message = $("#mMessage").value;
  const cc = ccList($("#mCc").value);
  if (!subject || !message.trim()) return showErr(MAIL_ERRORS.empty);
  if (!cc) return showErr(MAIL_ERRORS.invalid_cc);
  if (!people.length) return showErr(MAIL_ERRORS.no_recipients);
  try { localStorage.setItem(CC_KEY(), cc.join(", ")); } catch {}
  const btn = $("#mailReady");
  btn.disabled = true;
  btn.textContent = "Getting them ready…";
  try {
    const r = await api("mailSave", { token: mailToken(), name: $("#mName").value.trim(), subject, message, cc: cc.join(", "), people });
    if (!r.ok) throw new Error(r.error);
    ["mStart", "mName", "mSubject", "mMessage", "mList"].forEach((id) => { $(`#${id}`).value = ""; });
    countLine();
    showReady(r);
    openMailer();
  } catch (ex) {
    if (ex.message !== "auth") showErr(MAIL_ERRORS[ex.message] || "Couldn't save. Check your connection and try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Get the emails ready";
  }
});

// ---------- the ready screen ----------
function showReady(r) {
  mail.list = r.list;
  mail.people = r.people;
  mail.asking = null;
  $("#mCompose").hidden = true;
  $("#mReady").hidden = false;
  try { $("#mBox").value = localStorage.getItem("mailer_box") || "gmail"; } catch {}
  renderReady();
  window.scrollTo(0, 0);
}

const when = (t) => {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d)/.exec(t || "");
  if (!m) return t || "";
  return `${Number(m[3])} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1]} ${m[1]}, ${m[4]}`;
};

// ---------- one email per company ----------
// Colleagues at the same company get one email together: the first on the list in To, the others in CC, and the
// greeting names them all. Same company = the same work email domain (never Gmail, Yahoo and the like, where two
// people are just two people), or the same company name once capitals, punctuation and Pvt, Ltd and the like are
// set aside. Both count, so a colleague on a personal address joins their company's email by its name.
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "rediffmail.com", "rediff.com",
  "protonmail.com", "proton.me", "zoho.com", "zohomail.com", "zohomail.in", "gmx.com", "gmx.de", "gmx.net", "web.de", "mail.com",
  "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "sina.com", "naver.com", "hanmail.net", "fastmail.com", "tutanota.com",
  "hey.com", "sify.com", "vsnl.net", "vsnl.com", "bsnl.in", "inbox.com"]);
const freeMail = (d) => FREE_MAIL.has(d) || /^(yahoo|hotmail|outlook|live|msn)\.[a-z.]+$/.test(d);
const CO_ENDINGS = new Set(["pvt", "private", "ltd", "limited", "llp", "llc", "inc", "incorporated", "corp", "corporation", "plc", "gmbh", "co"]);
const coKey = (n) => String(n || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").split(" ")
  .filter((w) => w && !CO_ENDINGS.has(w)).join(" ");
const groupOn = () => { try { return localStorage.getItem("mailer_group") !== "0"; } catch { return true; } };

// the people in groups, each group in the order its first person is on the list
function mailGroups() {
  const ppl = mail.people;
  if (!groupOn()) return ppl.map((p) => [p]);
  const parent = ppl.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const join = (a, b) => { const x = root(a), y = root(b); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y); };
  const first = {};
  ppl.forEach((p, i) => {
    const domain = String(p.email.split("@")[1] || "").toLowerCase();
    const keys = [domain && !freeMail(domain) ? `d:${domain}` : "", coKey(p.company) ? `c:${coKey(p.company)}` : ""].filter(Boolean);
    keys.forEach((k) => { if (k in first) join(first[k], i); else first[k] = i; });
  });
  const groups = new Map();
  ppl.forEach((p, i) => { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
  return [...groups.keys()].sort((a, b) => a - b).map((r) => groups.get(r));
}

// "Hiren and Ashish", "Sachin, Babita and Vijaya", "Sachin and team" (four or more)
const greetNames = (list) => {
  const f = list.map((p) => String(p.firstName || "").trim()).filter(Boolean);
  return f.length >= 4 ? `${f[0]} and team` : f.length > 1 ? `${f.slice(0, -1).join(", ")} and ${f[f.length - 1]}` : f[0] || "";
};
const splitMails = (...v) => v.join(",").split(/[\s,;]+/).filter(Boolean).map((e) => e.toLowerCase());

// who a group's email goes to: the people not yet sent, the first in To and the others in CC with your team
function mailTarget(g) {
  const open = g.filter((p) => !p.sentAt);
  const goes = open.length ? open : g;
  const to = goes[0];
  const others = goes.slice(1);
  const own = [...new Set(splitMails(...others.map((p) => p.email), ...goes.map((p) => p.cc)))].filter((e) => e !== to.email);
  const cc = [...new Set(splitMails(mail.list.cc, own.join(",")))].filter((e) => e !== to.email);
  return { key: to.email, members: g, open, email: to.email, cc: cc.join(", "), ownCc: own.join(", "),
    firstName: others.length ? greetNames(goes) : to.firstName, lastName: others.length ? "" : to.lastName,
    company: (g.find((p) => p.company) || {}).company || "" };
}
const targetFor = (key) => mailGroups().map(mailTarget).find((t) => t.key === key);

function renderReady() {
  const sent = mail.people.filter((p) => p.sentAt).length;
  const total = mail.people.length;
  const groups = mailGroups();
  const toSend = groups.filter((g) => g.some((p) => !p.sentAt)).length;
  $("#mReadyTitle").textContent = sent === total ? "All your emails are sent" : `Your emails are ready: ${toSend} to send`;
  $("#mReadyLine").textContent = `${mail.list.name ? `${mail.list.name} · ` : ""}${mail.list.subject} · ${sent} of ${total} people sent`
    + (groups.length < total ? ` · ${total} people in ${groups.length} emails, colleagues together` : "") + (mail.list.cc ? ` · CC ${mail.list.cc}` : "");
  $("#mBoxWrap").hidden = draftMode();
  $("#mGroup").checked = groupOn();
  $("#mPeople").innerHTML = groups.map((g) => {
    const t = mailTarget(g);
    const many = g.length > 1;
    const a = mail.asking && mail.asking.email === t.key ? mail.asking : null;
    const lastSent = g.map((p) => p.sentAt).filter(Boolean).sort().pop();
    const action = !t.open.length ? `<span class="mail-sent">✓ Sent ${esc(when(lastSent))}</span><button class="link mail-undo" type="button" data-unmark="${esc(t.key)}">Undo</button>`
      : a ? `<div class="mail-ask"><p>${a.note ? `${esc(a.note)} ` : ""}<b>Have you sent the mail?</b></p>
          <button class="btn btn--sm" type="button" data-yes="${esc(t.key)}">Yes, sent</button><button class="link" type="button" data-no="${esc(t.key)}">Not yet</button></div>`
      : `<button class="btn btn--sm" type="button" data-send="${esc(t.key)}"${mail.asking ? " disabled" : ""}>Send email</button>`;
    const person = g.map((p) => esc([p.firstName, p.lastName].filter(Boolean).join(" ") || p.email.split("@")[0])
      + (many && p.sentAt && t.open.length ? ` <small class="muted">sent</small>` : "")).join("<br>");
    return `<tr${many ? ` class="mail-co"` : ""}>
      <td data-label="Person">${person}</td>
      <td data-label="Company">${esc(t.company || "—")}${many ? `<br><small class="muted">${g.length} people, one email</small>` : ""}</td>
      <td data-label="Email">${many ? `<small class="muted">To</small> ` : ""}${esc(t.email)}${t.ownCc ? `<br><small class="muted">CC ${esc(t.ownCc)}</small>` : ""}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");
}

// the mailbox's compose address; body only if it fits in a link
function composeUrl(box, to, subject, body, cc) {
  const q = encodeURIComponent;
  const c = cc ? `&cc=${q(cc)}` : "";
  if (box === "outlook") return `https://outlook.office.com/mail/deeplink/compose?to=${q(to)}${c}&subject=${q(subject)}&body=${q(body)}`;
  if (box === "outlook-live") return `https://outlook.live.com/mail/0/deeplink/compose?to=${q(to)}${c}&subject=${q(subject)}&body=${q(body)}`;
  if (box === "mailto") return `mailto:${q(to)}?${c.slice(1)}${c ? "&" : ""}subject=${q(subject)}&body=${q(body)}`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${q(to)}${c}&su=${q(subject)}&body=${q(body)}`;
}

function copyMail(html, text) {
  const items = html
    ? { "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }
    : { "text/plain": new Blob([text], { type: "text/plain" }) };
  navigator.clipboard.write([new ClipboardItem(items)]).catch(() => alert("Couldn't copy the mail. Allow clipboard access for this page and try again."));
}

// your team (on the list) and their colleagues (on their row), once each
const ccFor = (p) => [...new Set([mail.list.cc, p.cc].join(",").split(/[\s,;]+/).filter(Boolean))].join(", ");

async function sendOne(p) {
  const html = isHtml(mail.list.message);
  const subject = fillMail(mail.list.subject, p, false);
  const message = html ? mailBody(fillMail(mail.list.message, p, true)) : fillMail(mail.list.message, p, false);
  const text = html ? message.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : message;
  const box = draftMode() ? "gmail" : $("#mBox").value;
  // a link is limited in length (a mail app's more than a website's), and can't carry a design: then it's copied to paste
  const fits = !html && encodeURIComponent(text).length < (box === "mailto" ? 1800 : 6000);
  const PASTE = "In your mailbox, click into the message, press Ctrl+V (Cmd+V on a Mac), then Send.";
  if (!fits) copyMail(html ? message : "", text);
  if (draftMode()) {
    // opened now, while it's a click (browsers block it later); the draft goes into it
    const win = window.open("about:blank", "_blank");
    try { win.opener = null; } catch {}
    mail.asking = { email: p.email, note: "Press Send in the Gmail tab." };
    renderReady();
    let r;
    try {
      r = await api("makeDraft", { token: mailToken(), to: p.email, cc: ccFor(p), subject, message });
    } catch (ex) {
      r = { ok: false, error: ex.message };
    }
    if (r.ok) {
      mail.asking.draft = r.draftId;
      if (win) win.location.href = `https://mail.google.com/mail/?authuser=${encodeURIComponent(mail.status.account.email)}#drafts?compose=${r.messageId}`;
      return;
    }
    // no draft: the same mail the manual way, already copied
    if (r.error === "reconnect" || r.error === "no_draft_permission") openMailer();
    mail.asking.note = `Couldn't make the draft, so it opens the manual way. ${fits ? "Press Send." : PASTE}`;
    renderReady();
    if (win) win.location.href = composeUrl("gmail", p.email, subject, fits ? text : "", ccFor(p));
    return;
  }
  mail.asking = { email: p.email, note: fits ? "Press Send in your mailbox." : PASTE };
  renderReady();
  const url = composeUrl(box, p.email, subject, fits ? text : "", ccFor(p));
  if (box === "mailto") window.location.href = url; else window.open(url, "_blank", "noopener");
}

$("#mPeople").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const key = b.dataset.send || b.dataset.yes || b.dataset.no || b.dataset.unmark;
  const t = targetFor(key);
  if (!t) return;
  if (b.dataset.send) return sendOne(t);
  if (b.dataset.no) {
    const draft = mail.asking && mail.asking.draft;
    mail.asking = null;
    renderReady();
    if (draft) api("dropDraft", { token: mailToken(), draftId: draft }).catch(() => {}); // a new one is made if they send again
    return;
  }
  // Yes (ticks everyone the email went to, with the date) or Undo (the whole group)
  b.disabled = true;
  try {
    const marking = b.dataset.unmark ? t.members.filter((p) => p.sentAt) : t.open;
    for (const p of marking) {
      const r = await api("mailMark", { token: mailToken(), id: mail.list.id, email: p.email, sent: !b.dataset.unmark });
      if (!r.ok) throw new Error(r.error);
      p.sentAt = r.sentAt;
      p.sentBy = r.sentBy;
    }
    if (b.dataset.yes) mail.asking = null;
    renderReady();
    const next = $("#mPeople").querySelector("[data-send]");
    if (next && b.dataset.yes) next.focus();
  } catch (ex) {
    b.disabled = false;
    if (ex.message !== "auth") alert(MAIL_ERRORS[ex.message] || "Couldn't save that. Check your connection and try again.");
  }
});

$("#mBox").addEventListener("change", () => { try { localStorage.setItem("mailer_box", $("#mBox").value); } catch {} });
$("#mBack").addEventListener("click", () => {
  $("#mReady").hidden = true;
  $("#mCompose").hidden = false;
  mail.asking = null;
  openMailer();
});
$("#mLists").addEventListener("click", async (e) => {
  const rn = e.target.closest("[data-rename]");
  if (rn) {
    const name = prompt("Name this list (who it's for):", rn.dataset.name || "");
    if (name === null) return;
    rn.disabled = true;
    try {
      const r = await api("mailRename", { token: mailToken(), id: rn.dataset.rename, name: name.trim() });
      if (!r.ok) throw new Error(r.error);
      openMailer();
    } catch (ex) {
      rn.disabled = false;
      if (ex.message !== "auth") alert(ex.message === "bad_request" || ex.message === "invalid_slot" ? MAIL_ERRORS.invalid_slot : "Couldn't rename the list. Try again.");
    }
    return;
  }
  const b = e.target.closest("[data-open]");
  if (!b) return;
  b.disabled = true;
  try {
    const r = await api("mailOpen", { token: mailToken(), id: b.dataset.open });
    if (r.ok) showReady(r);
  } catch (ex) { /* signed out or offline: stays on the list */ }
  b.disabled = false;
});
$("#mGroup").addEventListener("change", (e) => {
  try { localStorage.setItem("mailer_group", e.target.checked ? "1" : "0"); } catch {}
  mail.asking = null;
  renderReady();
});
