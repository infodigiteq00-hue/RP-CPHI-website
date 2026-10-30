// Expo meetings · admin: the mailer. Write a mail once (an expo's invite keeps its layout), upload a list, and every
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
  invalid_slot: "The Apps Script is an older version. Paste the latest Code.gs and deploy a New version, then try again.",
};
const mail = { status: null, list: null, people: [], asking: null };
const mailToken = () => store.get(TOKEN_KEY);
const isHtml = (t) => /<\/?(html|body|p|div|table|br|a|img)\b/i.test(t);
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  const col = hasHead ? { first: find(/first|^name$|full/), last: find(/last|sur/), email: find(/mail/), company: find(/company|firm|organi[sz]ation/) } : { first: 0, last: 1, email: 2, company: 3 };
  const seen = new Set();
  let skipped = 0;
  const people = [];
  (hasHead ? rows.slice(1) : rows).forEach((r) => {
    const email = (r[col.email] || r.find((c) => c.includes("@")) || "").toLowerCase();
    if (!EMAIL_OK.test(email) || seen.has(email)) { skipped++; return; }
    seen.add(email);
    people.push({ email, firstName: r[col.first] || "", lastName: r[col.last] || "", company: r[col.company] || "" });
  });
  return { people, skipped };
}

function countLine() {
  const { people, skipped } = parseList($("#mList").value);
  const noFirst = people.filter((p) => !p.firstName).length;
  const noCompany = people.filter((p) => !p.company).length;
  $("#mCount").textContent = !people.length && !skipped ? "" : [
    `${people.length} ${people.length === 1 ? "person" : "people"}`,
    skipped && `${skipped} left out (bad or repeated email)`,
    noFirst && `${noFirst} without a first name will see "Business Associate"`,
    noCompany && `${noCompany} without a company will see "your firm"`,
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
      <td data-label="Subject">${esc(l.subject)}</td>
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
  a.href = URL.createObjectURL(new Blob(["First name,Last name,Email ID,Company name\nAsha,Rao,asha@example.com,Acme Pharma\n"], { type: "text/csv" }));
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
  if (!subject || !message.trim()) return showErr(MAIL_ERRORS.empty);
  if (!people.length) return showErr(MAIL_ERRORS.no_recipients);
  const btn = $("#mailReady");
  btn.disabled = true;
  btn.textContent = "Getting them ready…";
  try {
    const r = await api("mailSave", { token: mailToken(), subject, message, people });
    if (!r.ok) throw new Error(r.error);
    ["mStart", "mSubject", "mMessage", "mList"].forEach((id) => { $(`#${id}`).value = ""; });
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

function renderReady() {
  const sent = mail.people.filter((p) => p.sentAt).length;
  const total = mail.people.length;
  $("#mReadyTitle").textContent = sent === total ? "All your emails are sent" : `Your emails are ready: ${total - sent} to send`;
  $("#mReadyLine").textContent = `${mail.list.subject} · ${sent} of ${total} sent`;
  $("#mBoxWrap").hidden = draftMode();
  $("#mPeople").innerHTML = mail.people.map((p) => {
    const a = mail.asking && mail.asking.email === p.email ? mail.asking : null;
    const action = p.sentAt ? `<span class="mail-sent">✓ Sent ${esc(when(p.sentAt))}</span><button class="link mail-undo" type="button" data-unmark="${esc(p.email)}">Undo</button>`
      : a ? `<div class="mail-ask"><p>${a.note ? `${esc(a.note)} ` : ""}<b>Have you sent the mail?</b></p>
          <button class="btn btn--sm" type="button" data-yes="${esc(p.email)}">Yes, sent</button><button class="link" type="button" data-no="${esc(p.email)}">Not yet</button></div>`
      : `<button class="btn btn--sm" type="button" data-send="${esc(p.email)}"${mail.asking ? " disabled" : ""}>Send email</button>`;
    return `<tr>
      <td data-label="Person">${esc([p.firstName, p.lastName].filter(Boolean).join(" ") || "—")}</td>
      <td data-label="Company">${esc(p.company || "—")}</td>
      <td data-label="Email">${esc(p.email)}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");
}

// the mailbox's compose address; body only if it fits in a link
function composeUrl(box, to, subject, body) {
  const q = encodeURIComponent;
  if (box === "outlook") return `https://outlook.office.com/mail/deeplink/compose?to=${q(to)}&subject=${q(subject)}&body=${q(body)}`;
  if (box === "outlook-live") return `https://outlook.live.com/mail/0/deeplink/compose?to=${q(to)}&subject=${q(subject)}&body=${q(body)}`;
  if (box === "mailto") return `mailto:${q(to)}?subject=${q(subject)}&body=${q(body)}`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${q(to)}&su=${q(subject)}&body=${q(body)}`;
}

function copyMail(html, text) {
  const items = html
    ? { "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }
    : { "text/plain": new Blob([text], { type: "text/plain" }) };
  navigator.clipboard.write([new ClipboardItem(items)]).catch(() => alert("Couldn't copy the mail. Allow clipboard access for this page and try again."));
}

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
      r = await api("makeDraft", { token: mailToken(), to: p.email, subject, message });
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
    if (win) win.location.href = composeUrl("gmail", p.email, subject, fits ? text : "");
    return;
  }
  mail.asking = { email: p.email, note: fits ? "Press Send in your mailbox." : PASTE };
  renderReady();
  const url = composeUrl(box, p.email, subject, fits ? text : "");
  if (box === "mailto") window.location.href = url; else window.open(url, "_blank", "noopener");
}

$("#mPeople").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const email = b.dataset.send || b.dataset.yes || b.dataset.no || b.dataset.unmark;
  const p = mail.people.find((x) => x.email === email);
  if (!p) return;
  if (b.dataset.send) return sendOne(p);
  if (b.dataset.no) {
    const draft = mail.asking && mail.asking.draft;
    mail.asking = null;
    renderReady();
    if (draft) api("dropDraft", { token: mailToken(), draftId: draft }).catch(() => {}); // a new one is made if they send again
    return;
  }
  // Yes (ticks them, with the date) or Undo
  b.disabled = true;
  try {
    const r = await api("mailMark", { token: mailToken(), id: mail.list.id, email, sent: !b.dataset.unmark });
    if (!r.ok) throw new Error(r.error);
    p.sentAt = r.sentAt;
    p.sentBy = r.sentBy;
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
  const b = e.target.closest("[data-open]");
  if (!b) return;
  b.disabled = true;
  try {
    const r = await api("mailOpen", { token: mailToken(), id: b.dataset.open });
    if (r.ok) showReady(r);
  } catch (ex) { /* signed out or offline: stays on the list */ }
  b.disabled = false;
});
