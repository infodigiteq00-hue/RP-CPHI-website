// Expo meetings · admin: the mailer. The company connects its own Gmail once (Connect with Google: Google's pop-up
// gives a one-time code that the server swaps for lasting permission to send), then sends an email to a list from it,
// at most the daily limit the platform owners set; the rest go out on the next days by themselves.
// Loaded after admin.js and invite-mail.js; uses $, esc(), api(), store, TOKEN_KEY, state and inviteHtml().

const MAIL_ERRORS = {
  empty: "Add a subject and a message.",
  no_recipients: "Add at least one email address.",
  too_many: "That's more than 2,000 people. Split the list.",
  invalid_reply_to: "The reply-to address doesn't look right.",
  not_connected: "Connect your Gmail first.",
  not_set_up: "Email sending isn't switched on for this platform yet. Ask the platform owners.",
  no_send_permission: "Google wasn't given permission to send email. Connect again and leave “Send email on your behalf” ticked.",
  no_refresh: "Google didn't give lasting permission. Remove this app at myaccount.google.com/permissions, then connect again.",
  busy: "The sheet is busy. Try again in a moment.",
};
const mail = { status: null, perDay: 50 };
const mailToken = () => store.get(TOKEN_KEY);

// "email, name" lines (or a CSV with any columns): the cell with an @ is the email, the next one the name
function parseList(text) {
  return text.split(/\r?\n/).map((line) => {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const i = cells.findIndex((c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c));
    return i < 0 ? null : { email: cells[i], name: cells.find((c, j) => j !== i && c && !/@/.test(c)) || "" };
  }).filter(Boolean);
}

function countLine() {
  const n = parseList($("#mList").value).length;
  const d = mail.perDay;
  $("#mCount").textContent = n ? `${n} ${n === 1 ? "person" : "people"}${n > d ? ` · about ${Math.ceil(n / d)} days at ${d} a day` : ""}` : "";
}

function renderConn(r) {
  const a = r.account;
  const shared = "Mails go out from the platform's Gmail, under your company name, with replies coming to you if you fill in Replies go to.";
  $("#mConn").innerHTML = !a ? `<p class="muted">${shared}${r.clientId ? " To send from your own Gmail address instead, connect it." : ""}</p>
        ${r.clientId ? `<button class="btn btn--outline" type="button" id="mConnect">Connect with Google</button>` : ""}`
    : a.error ? `<p class="err">Google stopped the permission for ${esc(a.email)}. Waiting emails will go out once you connect again.</p>
        <button class="btn" type="button" id="mConnect">Connect with Google</button>`
    : `<p>Sending as <b>${esc(a.name ? `${a.name} <${a.email}>` : a.email)}</b></p>
        <button class="link" type="button" id="mDisconnect">Disconnect</button>`;
  $("#mailSend").disabled = !!(a && a.error);
}

function renderMail(r) {
  mail.status = r;
  mail.perDay = r.perDay;
  renderConn(r);
  $("#mailToday").textContent = `${r.sentToday} of ${r.perDay} sent today. What's left goes out by itself on the next days.` +
    (r.scriptLeft != null && r.scriptLeft < r.perDay - r.sentToday ? ` The platform's Gmail can send ${r.scriptLeft} more today.` : "");
  $("#mailRows").innerHTML = r.campaigns.length ? r.campaigns.map((c) => `<tr>
      <td data-label="Subject">${esc(c.subject)}${c.errors.length ? `<br><small class="muted">${c.errors.map(esc).join("<br>")}</small>` : ""}</td>
      <td data-label="Created">${esc(c.created)}${c.by ? `<br><small class="muted">${esc(c.by)}</small>` : ""}</td>
      <td data-label="Sent">${c.sent}</td>
      <td data-label="Waiting">${c.waiting}${c.stopped ? ` <small class="muted">(${c.stopped} stopped)</small>` : ""}</td>
      <td data-label="Failed">${c.failed}</td>
      <td>${c.waiting ? `<button class="link" type="button" data-stop="${esc(c.id)}">Stop</button>` : ""}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="muted">Nothing sent yet.</td></tr>`;
  countLine();
}

// the expos' invite emails, and the company name as the sender
function fillStart() {
  const expos = (state.expos || []).filter((e) => e.status === "Active");
  const keep = $("#mStart").value;
  // the plain one lands in the inbox more often: no images, one link
  $("#mStart").innerHTML = `<option value="">Your own email</option>${expos.map((e) => `<option value="text|${esc(e.id)}">Invite, plain text: ${esc(e.name)}</option>
    <option value="html|${esc(e.id)}">Invite, designed: ${esc(e.name)}</option>`).join("")}`;
  $("#mStart").value = keep;
  const c = state.company;
  if (c && !$("#mFrom").value) $("#mFrom").value = c.profile.shortName || c.name;
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
    scope: "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose",
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
  if (e.target.id !== "mDisconnect" || !confirm("Disconnect this Gmail? Waiting emails stay waiting until you connect one again.")) return;
  e.target.disabled = true;
  try {
    const r = await api("mailDisconnect", { token: mailToken() });
    if (r.ok) renderMail(r);
  } catch (ex) { e.target.disabled = false; }
});

$("#mStart").addEventListener("change", () => {
  const [kind, id] = $("#mStart").value.split("|");
  const e = (state.expos || []).find((x) => x.id === id);
  if (!e) return;
  $("#mSubject").value = inviteParts(e, state.company).subject;
  // the plain-text invite starts with its own "Subject:" line
  const body = kind === "html" ? inviteHtml(e, state.company) : inviteText(e, state.company).split("\n").slice(2).join("\n");
  $("#mMessage").value = body.replace("Dear Business Associate,", "Dear {name},"); // a personal greeting reads less like bulk mail
});
$("#mList").addEventListener("input", countLine);
$("#mFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $("#mList").value = (await f.text()).trim();
  e.target.value = "";
  countLine();
});

$("#mailForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#mailErr");
  const showErr = (m) => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  const recipients = parseList($("#mList").value);
  const data = { token: mailToken(), fromName: $("#mFrom").value.trim(), replyTo: $("#mReply").value.trim(),
    subject: $("#mSubject").value.trim(), message: $("#mMessage").value, recipients };
  if (!data.subject || !data.message.trim()) return showErr(MAIL_ERRORS.empty);
  if (!recipients.length) return showErr(MAIL_ERRORS.no_recipients);
  const n = recipients.length;
  if (!confirm(`Send "${data.subject}" to ${n} ${n === 1 ? "person" : "people"} from ${mail.status.account ? mail.status.account.email : "the platform's Gmail"}? Up to ${mail.perDay} go out a day.`)) return;
  const btn = $("#mailSend");
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const r = await api("queueMail", data);
    if (!r.ok) throw new Error(r.error);
    ["mStart", "mSubject", "mMessage", "mList"].forEach((id) => { $(`#${id}`).value = ""; });
    renderMail(r);
  } catch (ex) {
    if (ex.message !== "auth") showErr(MAIL_ERRORS[ex.message] || "Couldn't send. Check your connection and try again.");
  } finally {
    btn.textContent = "Send";
    if (mail.status) renderConn(mail.status);
  }
});

// ---------- one by one from Gmail: each person's mail is made a draft in their Gmail and opened there in one tab;
// they press Send, and once the draft is gone (sent) the next one opens in the same tab. Nothing is sent for them.
// Without a connected Gmail (links): Gmail's compose window per person in whatever Gmail the browser is signed into;
// plain text arrives filled in, a designed mail is copied for them to paste (Ctrl+V). They click Open in Gmail each time.
let hand = null; // { list, i, mail, win, draft, url, timer, busy, sent, links }
const isHtml = (t) => /<\/?(html|body|p|div|table|br|a|img)\b/i.test(t);

function linkState() {
  const p = hand.list[hand.i];
  if (!p) return handEnd(`Done: all ${hand.list.length} opened in Gmail.`);
  handMsg(`${hand.i + 1} of ${hand.list.length}: ${p.name ? `${p.name} <${p.email}>` : p.email}. Click Open in Gmail, ` +
    (isHtml(hand.mail.message) ? "click into the message, press Ctrl+V (Cmd+V on a Mac), then Send." : "then press Send there."));
  $("#bhOpen").textContent = "Open in Gmail";
  $("#bhOpen").hidden = false;
}

function linkOpen() {
  const p = hand.list[hand.i];
  const fill = (t) => t.replace(/\{name\}/gi, p.name || "Sir/Madam");
  const q = encodeURIComponent;
  const m = hand.mail.message;
  let body = `&body=${q(fill(m))}`;
  if (isHtml(m)) {
    // the mail's body with its design, for pasting into Gmail (it keeps inline styles and linked images)
    const html = fill((/<body[^>]*>([\s\S]*)<\/body>/i.exec(m) || [, m])[1]);
    const text = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })])
      .catch(() => alert("Couldn't copy the mail. Allow clipboard access for this page and try again."));
    body = "";
  }
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${q(p.email)}&su=${q(fill(hand.mail.subject))}${body}`, "_blank", "noopener");
  hand.i++;
  linkState();
}

const handMsg = (t) => { $("#bhLine").textContent = t; };
const handErr = (t) => { $("#bhErr").textContent = t || ""; $("#bhErr").hidden = !t; };

async function handNext() {
  const p = hand.list[hand.i];
  hand.draft = null;
  if (!p) return handEnd(`Done: ${hand.sent} sent from your Gmail.`);
  handMsg(`Getting the mail for ${p.name || p.email} ready… (${hand.i + 1} of ${hand.list.length})`);
  let r;
  try {
    r = await api("makeDraft", { token: mailToken(), to: p.email, name: p.name, ...hand.mail });
  } catch (ex) {
    r = { ok: false, error: ex.message };
  }
  if (!hand) return; // stopped meanwhile
  if (!r.ok) {
    handErr({ no_draft_permission: "Gmail hasn't allowed drafts yet. Click Connect with Google again and allow it.",
      reconnect: "Google stopped the permission. Connect with Google again.", invalid_email: `${p.email} isn't a valid address. Skip it.`,
      invalid_slot: "The Apps Script is an older version. Paste the latest Code.gs and deploy a New version, then try again." }[r.error]
      || `Couldn't make the mail for ${p.email}${r.detail ? `: ${r.detail}` : ""}. Skip it or try again later.`);
    return;
  }
  handErr("");
  hand.draft = r.draftId;
  hand.url = `https://mail.google.com/mail/?authuser=${encodeURIComponent(mail.status.account.email)}#drafts?compose=${r.messageId}`;
  if (hand.win && !hand.win.closed) hand.win.location.href = hand.url;
  handMsg(`${hand.i + 1} of ${hand.list.length}: ${p.name ? `${p.name} <${p.email}>` : p.email}. Press Send in the Gmail tab; the next one opens by itself.`);
  handTabState();
}

function handTabState() {
  if (hand && hand.links) return;
  $("#bhOpen").textContent = "Open the Gmail tab again";
  $("#bhOpen").hidden = !hand || !hand.draft || (hand.win && !hand.win.closed);
}

// every few seconds: has the draft been sent?
async function handCheck() {
  if (!hand || !hand.draft || hand.busy) return handTabState();
  hand.busy = true;
  try {
    const r = await api("draftSent", { token: mailToken(), draftId: hand.draft });
    if (hand && r.ok && r.sent) {
      hand.sent++;
      hand.i++;
      await handNext();
    }
  } catch (ex) { /* try again next time */ }
  if (hand) { hand.busy = false; handTabState(); }
}

function handEnd(text) {
  if (hand.timer) clearInterval(hand.timer);
  if (hand.win && !hand.win.closed) hand.win.close();
  hand = null;
  handMsg(text);
  handErr("");
  $("#bhOpen").hidden = $("#bhSkip").hidden = true;
  $("#bhClose").textContent = "Close";
}

$("#byHandBtn").addEventListener("click", () => {
  const err = $("#mailErr");
  err.hidden = true;
  const list = parseList($("#mList").value).filter((p, i, a) => a.findIndex((x) => x.email.toLowerCase() === p.email.toLowerCase()) === i);
  const subject = $("#mSubject").value.trim();
  const message = $("#mMessage").value.trim();
  const acc = mail.status && mail.status.account;
  const fail = (m) => { err.textContent = m; err.hidden = false; };
  if (!subject || !message) return fail(MAIL_ERRORS.empty);
  if (!list.length) return fail(MAIL_ERRORS.no_recipients);
  if (hand) return;
  const mailParts = { subject, message, fromName: $("#mFrom").value.trim(), replyTo: $("#mReply").value.trim() };
  const show = () => {
    $("#byHand").hidden = false;
    $("#bhSkip").hidden = false;
    $("#bhClose").textContent = "Stop";
    handErr("");
    $("#byHand").scrollIntoView({ block: "nearest" });
  };
  // no Gmail connected (or no drafts allowed): Gmail's compose window, one by one
  if (!acc || acc.error || acc.drafts === false) {
    hand = { list, i: 0, sent: 0, links: true, mail: mailParts };
    show();
    return linkState();
  }
  // the Gmail tab is opened now, while it's a click (browsers block it later); the drafts go into it one by one
  const win = window.open("about:blank", "expo_gmail");
  if (!win) return fail("Your browser blocked the Gmail tab. Allow pop-ups for this site and try again.");
  try { win.opener = null; } catch {}
  hand = { list, i: 0, sent: 0, win, draft: null, busy: false, mail: mailParts };
  hand.timer = setInterval(handCheck, 4000);
  show();
  handNext();
});

$("#bhOpen").addEventListener("click", () => {
  if (hand && hand.links) return linkOpen();
  if (!hand || !hand.url) return;
  hand.win = window.open(hand.url, "expo_gmail");
  handTabState();
});
$("#bhSkip").addEventListener("click", async () => {
  if (!hand || hand.busy) return;
  if (hand.links) { hand.i++; return linkState(); }
  hand.busy = true;
  if (hand.draft) api("dropDraft", { token: mailToken(), draftId: hand.draft }).catch(() => {});
  hand.i++;
  await handNext();
  if (hand) hand.busy = false;
});
$("#bhClose").addEventListener("click", () => {
  if (!hand) { $("#byHand").hidden = true; return; }
  if (hand.draft) api("dropDraft", { token: mailToken(), draftId: hand.draft }).catch(() => {});
  handEnd(hand.links ? `Stopped after ${hand.i} of ${hand.list.length}.` : `Stopped. ${hand.sent} sent from your Gmail.`);
});

$("#mailRows").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-stop]");
  if (!b || !confirm("Stop this mail? Nobody who hasn't got it yet will get it.")) return;
  b.disabled = true;
  try {
    const r = await api("stopMail", { token: mailToken(), id: b.dataset.stop });
    if (r.ok) renderMail(r);
  } catch (ex) { b.disabled = false; }
});
