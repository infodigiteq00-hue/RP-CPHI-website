// RP Industries · CPHI admin: the follow-up email for a completed meeting.
// The server writes a draft from the minutes. The team reviews it here, opens it in their own email
// (Gmail or their email app, with the client's address, subject and message filled in), sends it
// from there, and marks it as sent. This page never sends email itself.
// Loaded after admin.js and minutes.js; uses api(), esc(), state, store, render() and findRow().

const FOLLOWUP_ERRORS = {
  no_minutes: "Write the minutes first. The follow-up is based on them.",
  already_sent: "This follow-up is already marked as sent.",
  empty: "Add a subject and a message first.",
  cancelled: "This meeting was cancelled.",
  busy: "The sheet is busy. Try again in a moment.",
};
const drafting = new Set(); // meetings whose draft is being written right now
let fu = null;              // { id, followup, catalogue, products }

// Writes a draft in the background (right after the minutes), unless one exists already.
async function ensureFollowupDraft(id) {
  const row = findRow(id);
  if (!row || row.followup === "Draft" || row.followup === "Sent" || drafting.has(id)) return;
  drafting.add(id);
  render();
  try {
    const r = await api("draftFollowup", { token: store.get(TOKEN_KEY), id });
    row.followup = r.ok ? "Draft" : row.followup || "Failed";
  } catch (ex) {
    row.followup = row.followup || "Failed";
  } finally {
    drafting.delete(id);
    render();
    updateFollowupButton();
  }
}

function followupLabel(r) {
  if (drafting.has(r.id)) return "Writing follow-up…";
  if (r.followup === "Sent") return `Follow-up sent${r.followupSentAt ? ` · ${r.followupSentAt.slice(5, 10).split("-").reverse().join("/")}` : ""}`;
  if (r.followup === "Draft") return "Review follow-up";
  if (r.followup === "Failed") return "Follow-up failed · Retry";
  return "Write follow-up";
}

// the "Follow-up email" button in the minutes pop-up
function updateFollowupButton() {
  const btn = $("#followupBtn");
  if (!btn || !current) return;
  const row = findRow(current.id);
  btn.hidden = !currentRecord || !currentRecord.minutes;
  btn.textContent = row ? followupLabel(row).replace(" · Retry", "") : "Follow-up email";
  btn.disabled = row ? drafting.has(row.id) : false;
}

async function openFollowup(id) {
  const row = findRow(id);
  if (!row) return;
  fu = { id, followup: null, catalogue: [], products: [] };
  $("#followupTo").textContent = `To ${row.name}${row.email ? ` <${row.email}>` : ""}`;
  $("#followupErr").hidden = true;
  $("#fuSentCheck").hidden = true;
  $("#followupDialog").showModal();
  if (drafting.has(id)) {
    fuBusy(true, "Writing the follow-up email…");
    while (drafting.has(id)) await new Promise((res) => setTimeout(res, 500));
  }
  fuBusy(true, "Loading…");
  try {
    let r = await api("followup", { token: store.get(TOKEN_KEY), id });
    if (!r.ok) throw new Error(r.error);
    fu.catalogue = r.catalogue || [];
    if (!r.followup || !r.followup.subject) {
      fuBusy(true, "Writing the follow-up email…");
      const d = await api("draftFollowup", { token: store.get(TOKEN_KEY), id });
      if (!d.ok) throw Object.assign(new Error(d.error), { detail: d.detail });
      row.followup = "Draft";
      render();
      r = { followup: d.followup };
    }
    showFollowup(r.followup);
  } catch (ex) {
    fuBusy(false);
    showFollowupView("edit");
    if (ex.message === "auth") return $("#followupDialog").close();
    fuError(FOLLOWUP_ERRORS[ex.message] || (ex.detail ? `Couldn't write the email: ${ex.detail}` : "Couldn't load the follow-up. Try again."));
    $("#followupEdit").hidden = true;
  }
}

function showFollowup(f) {
  fu.followup = f;
  fu.products = (f.products || []).slice();
  fuBusy(false);
  const sent = f.status === "Sent";
  $("#fuSubject").value = f.subject || "";
  $("#fuMessage").value = f.message || "";
  renderProducts();
  $("#fuState").textContent = sent
    ? `Sent ${f.sentAt} IST${f.sentBy ? `, marked by ${f.sentBy}` : ""}`
    : f.updated ? `Draft saved ${f.updated.slice(11)}` : "";
  // once sent it's a record: show the text, don't offer to change or resend it
  $("#followupTabs").hidden = sent;
  for (const b of ["#fuRedraftBtn", "#fuSaveBtn", "#fuMailAppBtn", "#fuGmailBtn"]) $(b).hidden = sent;
  if (f.error && !sent) fuError(`Last attempt: ${f.error}`);
  showFollowupView(sent ? "preview" : "edit");
}

// ---------- the email as the client will get it ----------
function emailParts() {
  const row = findRow(fu.id);
  const lines = [`Dear ${row.name},`, "", $("#fuMessage").value.trim()];
  const ints = fu.products.filter((p) => p.endsWith(" intermediates")).map((p) => p.replace(/ intermediates$/, ""));
  const apis = fu.products.filter((p) => p.endsWith(" API")).map((p) => p.replace(/ API$/, ""));
  if (ints.length || apis.length) lines.push("");
  if (ints.length) lines.push(`Intermediates we can supply: ${ints.join(", ")}`);
  if (apis.length) lines.push(`APIs we can supply: ${apis.join(", ")}`);
  lines.push("", "Warm regards,", ...((fu.followup && fu.followup.signature) || ["Team RP Industries"]));
  return { to: row.email, subject: $("#fuSubject").value.trim(), body: lines.join("\n") };
}

function renderPreview() {
  const m = emailParts();
  $("#fuPrevTo").textContent = m.to;
  $("#fuPrevSubject").textContent = m.subject;
  $("#fuPrevBody").textContent = m.body;
}

function renderProducts() {
  $("#fuProducts").innerHTML = fu.products.length
    ? fu.products.map((p) => `<span class="fu-product">${esc(p)}<button type="button" data-remove="${esc(p)}" aria-label="Remove ${esc(p)}">&times;</button></span>`).join("")
    : `<span class="muted">No products listed.</span>`;
  const rest = fu.catalogue.filter((p) => !fu.products.includes(p));
  $("#fuAddProduct").innerHTML = `<option value="">Add a product…</option>` + rest.map((p) => `<option>${esc(p)}</option>`).join("");
  renderPreview();
}

$("#fuProducts").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-remove]");
  if (!b) return;
  fu.products = fu.products.filter((p) => p !== b.dataset.remove);
  renderProducts();
});
$("#fuAddProduct").addEventListener("change", (e) => {
  if (e.target.value) fu.products.push(e.target.value);
  renderProducts();
});

$("#followupTabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (b) showFollowupView(b.dataset.fview);
});

function showFollowupView(view) {
  if (view === "preview") renderPreview();
  $("#followupTabs").querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.fview === view)));
  $("#followupEdit").hidden = view !== "edit";
  $("#followupPreview").hidden = view !== "preview";
}

const edits = () => ({ token: store.get(TOKEN_KEY), id: fu.id, subject: $("#fuSubject").value, message: $("#fuMessage").value, products: fu.products });

async function saveFollowupDraft(quiet) {
  if (!quiet) { $("#followupErr").hidden = true; fuBusy(true, "Saving…"); }
  try {
    const r = await api("saveFollowup", edits());
    if (!r.ok) throw new Error(r.error);
    if (!quiet) {
      const view = $("#followupPreview").hidden ? "edit" : "preview";
      showFollowup(r.followup);
      showFollowupView(view);
    } else {
      fu.followup = { ...fu.followup, ...r.followup };
      $("#fuState").textContent = `Draft saved ${r.followup.updated.slice(11)}`;
    }
    return true;
  } catch (ex) {
    if (!quiet) fuBusy(false);
    if (ex.message !== "auth") fuError(FOLLOWUP_ERRORS[ex.message] || "Couldn't save. Try again.");
    return false;
  }
}

$("#fuSaveBtn").addEventListener("click", () => saveFollowupDraft(false));

$("#fuRedraftBtn").addEventListener("click", async () => {
  if (!confirm("Write the email again from the minutes? Your edits to this draft will be replaced.")) return;
  $("#followupErr").hidden = true;
  fuBusy(true, "Writing the follow-up email…");
  drafting.add(fu.id);
  render();
  try {
    const d = await api("draftFollowup", { token: store.get(TOKEN_KEY), id: fu.id });
    if (!d.ok) throw Object.assign(new Error(d.error), { detail: d.detail });
    showFollowup(d.followup);
  } catch (ex) {
    fuBusy(false);
    if (ex.message !== "auth") fuError(FOLLOWUP_ERRORS[ex.message] || (ex.detail ? `Couldn't write the email: ${ex.detail}` : "Couldn't reach the server. Try again."));
  } finally {
    drafting.delete(fu.id);
    render();
  }
});

// ---------- open in the team member's own email ----------
// The link opens straight away (inside the click, so pop-up blockers allow it); the draft is saved
// in the background, and the team marks it as sent once they've pressed Send in their mail.
function openMail(kind) {
  const m = emailParts();
  $("#followupErr").hidden = true;
  if (!m.subject || !$("#fuMessage").value.trim()) return fuError(FOLLOWUP_ERRORS.empty);
  if (!m.to) return fuError("This visitor has no email address.");
  const q = encodeURIComponent;
  if (kind === "gmail") {
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${q(m.to)}&su=${q(m.subject)}&body=${q(m.body)}`, "_blank", "noopener");
  } else {
    window.location.href = `mailto:${q(m.to)}?subject=${q(m.subject)}&body=${q(m.body)}`;
  }
  saveFollowupDraft(true);
  $("#fuSentCheck").hidden = false;
}
$("#fuGmailBtn").addEventListener("click", () => openMail("gmail"));
$("#fuMailAppBtn").addEventListener("click", () => openMail("app"));
$("#fuNotSentBtn").addEventListener("click", () => { $("#fuSentCheck").hidden = true; });

$("#fuMarkSentBtn").addEventListener("click", async () => {
  const row = findRow(fu.id);
  const dlg = $("#followupDialog");
  dlg.classList.add("is-busy");
  $("#fuSentCheck").hidden = true;
  fuBusy(true, "Saving…");
  try {
    const r = await api("markFollowupSent", edits());
    if (!r.ok) throw new Error(r.error);
    row.followup = "Sent";
    row.followupSentAt = r.followup.sentAt;
    render();
    showFollowup(r.followup);
  } catch (ex) {
    fuBusy(false);
    if (ex.message === "already_sent") { row.followup = "Sent"; render(); }
    if (ex.message !== "auth") fuError(FOLLOWUP_ERRORS[ex.message] || "Couldn't save. Check your connection and try again.");
  } finally {
    dlg.classList.remove("is-busy");
  }
});

$("#fuSubject").addEventListener("input", renderPreview);
$("#fuMessage").addEventListener("input", renderPreview);

function fuBusy(on, text) {
  $("#followupProgress").hidden = !on;
  $("#followupFoot").hidden = on;
  if (on) {
    $("#followupEdit").hidden = true;
    $("#followupPreview").hidden = true;
    $("#followupTabs").hidden = true;
  } else if (!fu || !fu.followup || fu.followup.status !== "Sent") {
    $("#followupTabs").hidden = false;
  }
  if (text) $("#followupProgressText").textContent = text;
}

function fuError(text) {
  $("#followupErr").textContent = text;
  $("#followupErr").hidden = false;
}

// entry points: the row link, and the button in the minutes pop-up
document.addEventListener("click", (e) => {
  const b = e.target.closest('button[data-act="followup"]');
  if (b && b.dataset.id) openFollowup(b.dataset.id);
});
$("#followupBtn").addEventListener("click", () => {
  const id = current.id;
  $("#minutesDialog").close();
  openFollowup(id);
});
