// Expo meetings · owners' dashboard: the mailer. A client's email goes to their list from the Gmail that runs the
// Apps Script, at most 50 a day; the rest go out on the next days by themselves. Loaded after super.js; uses $, esc,
// api(), token() and show().

const MAIL_ERRORS = {
  empty: "Add a subject and a message.",
  no_recipients: "Add at least one email address.",
  too_many: "That's more than 2,000 people. Split the list.",
  invalid_reply_to: "The reply-to address doesn't look right.",
  busy: "The sheet is busy. Try again in a moment.",
};

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
  $("#mCount").textContent = n ? `${n} ${n === 1 ? "person" : "people"}${n > 50 ? ` · about ${Math.ceil(n / 50)} days at 50 a day` : ""}` : "";
}

function renderMail(r) {
  $("#mailToday").textContent = `${r.sentToday} of ${r.perDay} sent today. What's left goes out by itself on the next days.`;
  $("#mailRows").innerHTML = r.campaigns.length ? r.campaigns.map((c) => `<tr>
      <td data-label="Subject">${esc(c.subject)}${c.errors.length ? `<br><small class="muted">${c.errors.map(esc).join("<br>")}</small>` : ""}</td>
      <td data-label="From">${esc(c.fromName || "")}${c.replyTo ? `<br><small class="muted">${esc(c.replyTo)}</small>` : ""}</td>
      <td data-label="Created">${esc(c.created)}</td>
      <td data-label="Sent">${c.sent}</td>
      <td data-label="Waiting">${c.waiting}${c.stopped ? ` <small class="muted">(${c.stopped} stopped)</small>` : ""}</td>
      <td data-label="Failed">${c.failed}</td>
      <td>${c.waiting ? `<button class="link" type="button" data-stop="${esc(c.id)}">Stop</button>` : ""}</td>
    </tr>`).join("") : `<tr><td colspan="7" class="muted">Nothing sent yet.</td></tr>`;
}

async function loadMail() {
  $("#mailToday").textContent = "Loading…";
  try {
    const r = await api("superMailList", { token: token() });
    if (r.ok) renderMail(r);
  } catch (ex) {
    if (ex.message !== "auth") $("#mailToday").textContent = "Couldn't load. Try again.";
  }
}

$("#mailerBtn").addEventListener("click", () => { show("mail"); loadMail(); });
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
  err.hidden = true;
  const recipients = parseList($("#mList").value);
  const data = { token: token(), fromName: $("#mFrom").value.trim(), replyTo: $("#mReply").value.trim(),
    subject: $("#mSubject").value.trim(), message: $("#mMessage").value, recipients };
  if (!data.subject || !data.message.trim()) { err.textContent = MAIL_ERRORS.empty; err.hidden = false; return; }
  if (!recipients.length) { err.textContent = MAIL_ERRORS.no_recipients; err.hidden = false; return; }
  if (!confirm(`Send "${data.subject}" to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}? Up to 50 go out today from your Gmail.`)) return;
  const btn = $("#mailSend");
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const r = await api("superQueueMail", data);
    if (!r.ok) throw new Error(r.error);
    renderMail(r);
    $("#mailForm").reset();
    countLine();
  } catch (ex) {
    if (ex.message !== "auth") { err.textContent = MAIL_ERRORS[ex.message] || "Couldn't send. Check your connection and try again."; err.hidden = false; }
  } finally {
    btn.disabled = false;
    btn.textContent = "Send";
  }
});

$("#mailRows").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-stop]");
  if (!b || !confirm("Stop this mail? Nobody who hasn't got it yet will get it.")) return;
  b.disabled = true;
  try {
    const r = await api("superStopMail", { token: token(), id: b.dataset.stop });
    if (r.ok) renderMail(r);
  } catch (ex) { b.disabled = false; }
});
