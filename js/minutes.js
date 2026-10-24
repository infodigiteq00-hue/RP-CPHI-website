// RP Industries · CPHI admin: mark meetings complete, record a voice note, show the minutes.
// Loaded after admin.js and uses its api(), esc(), state, store, fmtDay() and slotTime().

const MAX_REC_SECONDS = 10 * 60;
const MAX_AUDIO_MB = 20;
const COMPLETE_ERRORS = {
  busy: "The sheet is busy. Try again in a moment.",
  cancelled: "This meeting was cancelled, so it can't be marked complete.",
  not_found: "This meeting no longer exists. Refresh the list.",
  audio_too_large: `The recording is over ${MAX_AUDIO_MB} MB. Record a shorter note.`,
  invalid_audio: "That file isn't an audio recording.",
};
const OUTCOMES = { "Very positive": "very-positive", Positive: "positive", Neutral: "neutral", Negative: "negative", Unclear: "unclear" };

const voice = { recorder: null, stream: null, chunks: [], blob: null, url: "", timer: 0, started: 0 };
let current = null; // the meeting the dialogs are about
let currentRecord = null;

const meetingLine = (r) => `${fmtDay(r.date)} · ${slotTime(r)} · ${r.name}${r.company ? `, ${r.company}` : ""}`;
const findRow = (id) => state.rows.find((r) => r.id === id);

// ---------- open ----------
async function openComplete(id) {
  current = findRow(id);
  if (!current) return;
  resetVoice();
  $("#completeWho").textContent = meetingLine(current);
  $("#notesInput").value = "";
  $("#voiceNote").hidden = true; // left over from the last meeting otherwise
  $("#completeErr").hidden = true;
  showProgress(false);
  $("#skipNotesBtn").hidden = current.status === "Completed"; // already complete: this is "edit notes"
  $("#completeTitle").textContent = current.status === "Completed" ? "Meeting notes" : "Mark meeting complete";
  $("#completeDialog").showModal();
  if (current.minutes && current.minutes !== "None") {
    // editing: start from what was saved
    try {
      const r = await api("record", { token: store.get(TOKEN_KEY), id });
      if (r.ok && r.record) {
        $("#notesInput").value = r.record.notes || "";
        if (r.record.hasAudio) {
          $("#voiceNote").textContent = "A voice note is already saved. Record a new one only to replace it.";
          $("#voiceNote").hidden = false;
        }
      }
    } catch {}
  }
}

async function openMinutes(id) {
  current = findRow(id);
  if (!current) return;
  $("#minutesWho").textContent = meetingLine(current);
  $("#minutesBody").innerHTML = `<p class="muted">Loading…</p>`;
  $("#minutesDialog").showModal();
  try {
    const r = await api("record", { token: store.get(TOKEN_KEY), id });
    if (!r.ok) throw new Error(r.error);
    currentRecord = r.record;
    renderMinutes();
  } catch (ex) {
    if (ex.message !== "auth") $("#minutesBody").innerHTML = `<p class="err">Couldn't load the minutes. Try again.</p>`;
  }
}

document.querySelectorAll(".modal [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
document.querySelectorAll(".modal").forEach((d) => {
  // a click on the dimmed backdrop closes, unless something is being saved
  d.addEventListener("click", (e) => { if (e.target === d && !d.classList.contains("is-busy")) d.close(); });
  d.addEventListener("cancel", (e) => { if (d.classList.contains("is-busy")) e.preventDefault(); });
});
$("#completeDialog").addEventListener("close", () => { stopRecording(true); resetVoice(); });

// ---------- voice note ----------
function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return window.MediaRecorder ? types.find((t) => MediaRecorder.isTypeSupported(t)) || "" : "";
}

$("#recBtn").addEventListener("click", startRecording);
$("#reRecBtn").addEventListener("click", startRecording);
$("#stopBtn").addEventListener("click", () => stopRecording(false));
$("#removeVoiceBtn").addEventListener("click", resetVoice);

async function startRecording() {
  $("#completeErr").hidden = true;
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    return voiceMessage("This browser can't record audio. Upload a recording or type your notes.");
  }
  try {
    voice.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return voiceMessage("Microphone access was blocked. Allow it in the browser, or upload a recording or type your notes.");
  }
  resetVoice(true);
  const mime = pickMime();
  voice.recorder = new MediaRecorder(voice.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
  voice.chunks = [];
  voice.recorder.ondataavailable = (e) => { if (e.data.size) voice.chunks.push(e.data); };
  voice.recorder.onstop = () => {
    if (voice.discard) { voice.discard = false; return; }
    setVoiceBlob(new Blob(voice.chunks, { type: voice.recorder.mimeType || mime || "audio/webm" }));
  };
  voice.recorder.start(1000);
  voice.started = Date.now();
  showVoice("rec");
  tick();
  voice.timer = setInterval(tick, 500);
}

function tick() {
  const s = Math.floor((Date.now() - voice.started) / 1000);
  $("#recTime").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  if (s >= MAX_REC_SECONDS) stopRecording(false);
}

function stopRecording(discard) {
  clearInterval(voice.timer);
  if (voice.recorder && voice.recorder.state !== "inactive") {
    voice.discard = discard;
    voice.recorder.stop();
  }
  if (voice.stream) voice.stream.getTracks().forEach((tr) => tr.stop());
  voice.stream = null;
}

$("#audioFile").addEventListener("change", (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (!f.type.startsWith("audio/") && !/^video\/(webm|mp4)$/.test(f.type)) return voiceMessage("That file isn't an audio recording.");
  if (f.size > MAX_AUDIO_MB * 1024 * 1024) return voiceMessage(`That recording is over ${MAX_AUDIO_MB} MB. Use a shorter one.`);
  setVoiceBlob(f);
});

function setVoiceBlob(blob) {
  if (voice.url) URL.revokeObjectURL(voice.url);
  voice.blob = blob;
  voice.url = URL.createObjectURL(blob);
  $("#voicePlayer").src = voice.url;
  $("#voiceNote").hidden = true;
  showVoice("done");
}

function resetVoice(keepStream) {
  if (!keepStream) stopRecording(true);
  if (voice.url) URL.revokeObjectURL(voice.url);
  voice.blob = null;
  voice.url = "";
  $("#voicePlayer").removeAttribute("src");
  showVoice("idle");
}

function showVoice(which) {
  $("#voiceIdle").hidden = which !== "idle";
  $("#voiceRec").hidden = which !== "rec";
  $("#voiceDone").hidden = which !== "done";
}

function voiceMessage(text) {
  $("#voiceNote").textContent = text;
  $("#voiceNote").hidden = false;
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

// ---------- save ----------
$("#completeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  saveCompletion(true);
});
$("#skipNotesBtn").addEventListener("click", () => saveCompletion(false));

async function saveCompletion(withNotes) {
  if (voice.recorder && voice.recorder.state === "recording") {
    return showCompleteError("Stop the recording first.");
  }
  const notes = withNotes ? $("#notesInput").value.trim() : "";
  const hasOld = current.minutes && current.minutes !== "None";
  if (withNotes && !notes && !voice.blob && !hasOld) {
    return showCompleteError("Record a voice note or type some notes, or choose “Mark complete without notes”.");
  }
  const dlg = $("#completeDialog");
  dlg.classList.add("is-busy");
  showProgress(true, voice.blob ? "Uploading the voice note…" : "Saving…");
  try {
    const payload = { token: store.get(TOKEN_KEY), id: current.id, notes };
    if (voice.blob) payload.audio = { data: await toBase64(voice.blob), mime: voice.blob.type || "audio/webm" };
    const r = await api("complete", payload);
    if (!r.ok) throw new Error(r.error);
    current.status = "Completed";
    current.minutes = r.minutes;
    renderFilters();
    render();
    if (r.minutes === "None") { dlg.classList.remove("is-busy"); dlg.close(); return; }
    showProgress(true, voice.blob ? "Transcribing and writing the minutes. This can take up to a minute…" : "Writing the minutes…");
    const done = await generate(current.id);
    if (done.ok) ensureFollowupDraft(current.id); // js/followup.js: the email draft is written in the background
    dlg.classList.remove("is-busy");
    dlg.close();
    openMinutes(current.id);
  } catch (ex) {
    dlg.classList.remove("is-busy");
    showProgress(false);
    if (ex.message === "auth") return dlg.close();
    showCompleteError(COMPLETE_ERRORS[ex.message] || "Couldn't save. Check your connection and try again.");
  }
}

// Asks the server to write the minutes. A failure here is shown on the minutes, not thrown:
// the notes are already saved, so the team can retry later.
async function generate(id) {
  const row = findRow(id);
  if (row) { row.minutes = "Processing"; render(); }
  let r;
  try {
    r = await api("minutes", { token: store.get(TOKEN_KEY), id });
  } catch (ex) {
    if (ex.message === "auth") throw ex;
    r = { ok: false, error: "network" };
  }
  if (row) row.minutes = r.ok ? "Ready" : r.error === "in_progress" ? "Processing" : "Failed";
  render();
  return r;
}

function showProgress(on, text) {
  $("#completeBody").hidden = on;
  $("#completeFoot").hidden = on;
  $("#completeProgress").hidden = !on;
  if (text) $("#progressText").textContent = text;
}

function showCompleteError(text) {
  $("#completeErr").textContent = text;
  $("#completeErr").hidden = false;
}

// ---------- minutes ----------
function renderMinutes() {
  const rec = currentRecord;
  const body = $("#minutesBody");
  if (!rec || rec.status === "None") {
    body.innerHTML = `<p class="muted">No notes were recorded for this meeting.</p>`;
    return;
  }
  const m = rec.minutes;
  const parts = [];
  if (rec.status === "Processing" || rec.status === "Pending") {
    parts.push(`<p class="minutes__state">The minutes haven't been written yet.</p>`);
  } else if (rec.status === "Failed") {
    parts.push(`<p class="err minutes__state">The minutes couldn't be written: ${esc(rec.error || "unknown error")}</p>`);
  }
  if (m) {
    const list = (title, items) => (items && items.length
      ? `<section><h3>${title}</h3><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></section>` : "");
    parts.push(`<section><h3>Summary</h3><p>${esc(m.summary)}</p></section>`);
    if (m.outcome) {
      parts.push(`<section><h3>Outcome</h3><p><span class="outcome outcome--${OUTCOMES[m.outcome] || "unclear"}">${esc(m.outcome)}</span>${m.outcome_reason ? ` ${esc(m.outcome_reason)}` : ""}</p></section>`);
    }
    parts.push(list("Client's key points", m.client_points));
    parts.push(list("Discussed", m.discussed));
    parts.push(list("Requirements", m.requirements));
    parts.push(list("Decisions", m.decisions));
    if (m.action_items && m.action_items.length) {
      parts.push(`<section><h3>Action items</h3><table class="minutes__actions"><thead><tr><th>Task</th><th>Owner</th><th>Due</th></tr></thead><tbody>${
        m.action_items.map((a) => `<tr><td>${esc(a.task)}</td><td>${esc(a.owner) || "—"}</td><td>${esc(a.due) || "—"}</td></tr>`).join("")
      }</tbody></table></section>`);
    }
    if (m.follow_up) parts.push(`<section><h3>Follow-up</h3><p>${esc(m.follow_up)}</p></section>`);
  }
  // what the team recorded, for checking the minutes against
  const src = [];
  if (rec.hasAudio) src.push(`<button class="link" type="button" id="playVoiceBtn">Play voice note</button><audio controls id="minutesAudio" hidden></audio>`);
  if (rec.notes) src.push(`<details><summary>Typed notes</summary><p class="minutes__raw">${esc(rec.notes)}</p></details>`);
  if (rec.transcript) src.push(`<details><summary>Voice note transcript</summary><p class="minutes__raw">${esc(rec.transcript)}</p></details>`);
  if (src.length) parts.push(`<section class="minutes__source"><h3>Recorded by ${esc(rec.by || "the team")}${rec.updated ? ` · ${esc(rec.updated)} IST` : ""}</h3>${src.join("")}</section>`);
  body.innerHTML = `<div class="minutes">${parts.join("")}</div>`;

  $("#copyMinutesBtn").disabled = !m;
  $("#printMinutesBtn").disabled = !m;
  $("#regenBtn").textContent = m ? "Write again" : "Write minutes";
  const play = $("#playVoiceBtn");
  if (play) play.addEventListener("click", playVoice);
  updateFollowupButton();
}

async function playVoice() {
  const btn = $("#playVoiceBtn");
  btn.disabled = true;
  btn.textContent = "Loading…";
  try {
    const r = await api("audio", { token: store.get(TOKEN_KEY), id: current.id });
    if (!r.ok) throw new Error(r.error);
    const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
    const el = $("#minutesAudio");
    el.src = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
    el.hidden = false;
    btn.hidden = true;
    el.play().catch(() => {});
  } catch (ex) {
    btn.disabled = false;
    btn.textContent = "Couldn't load the voice note. Try again";
  }
}

$("#regenBtn").addEventListener("click", async () => {
  const dlg = $("#minutesDialog");
  const btn = $("#regenBtn");
  btn.disabled = true;
  dlg.classList.add("is-busy");
  $("#minutesBody").innerHTML = `<div class="modal__progress"><span class="spinner" aria-hidden="true"></span><p>Writing the minutes…</p></div>`;
  try {
    const r = await generate(current.id);
    const rec = await api("record", { token: store.get(TOKEN_KEY), id: current.id });
    currentRecord = rec.ok ? rec.record : currentRecord;
    if (!r.ok && r.error === "in_progress") currentRecord = { ...currentRecord, status: "Processing" };
    renderMinutes();
  } catch (ex) {
    if (ex.message !== "auth") $("#minutesBody").innerHTML = `<p class="err">Couldn't reach the server. Try again.</p>`;
  } finally {
    btn.disabled = false;
    dlg.classList.remove("is-busy");
  }
});

$("#editNotesBtn").addEventListener("click", () => {
  const id = current.id;
  $("#minutesDialog").close();
  openComplete(id);
});

function minutesText() {
  const m = currentRecord.minutes;
  const r = current;
  const lines = [`Minutes of meeting`, `${r.name}, ${r.company} (${r.country})`, `${fmtDay(r.date)}, ${slotTime(r)} IST · CPHI India 2026, Booth 2B59, Hall 2`, ""];
  const list = (title, items) => { if (items && items.length) lines.push(title, ...items.map((i) => `- ${i}`), ""); };
  lines.push("Summary", m.summary, "");
  if (m.outcome) lines.push("Outcome", `${m.outcome}${m.outcome_reason ? `. ${m.outcome_reason}` : ""}`, "");
  list("Client's key points", m.client_points);
  list("Discussed", m.discussed);
  list("Requirements", m.requirements);
  list("Decisions", m.decisions);
  list("Action items", (m.action_items || []).map((a) => [a.task, a.owner && `owner: ${a.owner}`, a.due && `due: ${a.due}`].filter(Boolean).join(" · ")));
  if (m.follow_up) lines.push("Follow-up", m.follow_up);
  return lines.join("\n").trim();
}

$("#copyMinutesBtn").addEventListener("click", async () => {
  const btn = $("#copyMinutesBtn");
  try {
    await navigator.clipboard.writeText(minutesText());
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Couldn't copy";
  }
  setTimeout(() => { btn.textContent = "Copy"; }, 1600);
});

$("#printMinutesBtn").addEventListener("click", () => {
  const r = current;
  const w = window.open("", "_blank");
  if (!w) return alert("Allow pop-ups for this page to print the minutes.");
  const doc = $(".minutes").cloneNode(true);
  doc.querySelectorAll(".minutes__source, .minutes__state").forEach((n) => n.remove());
  w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>Minutes of meeting · ${esc(r.company || r.name)} · ${esc(fmtDay(r.date))}</title>
    <style>
      body { font-family: "Plus Jakarta Sans", Arial, Helvetica, sans-serif; color: #1a2233; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.55; font-size: 14px; }
      header { border-bottom: 2px solid #003279; padding-bottom: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; }
      header img { height: 56px; }
      h1 { margin: 0; font-size: 22px; color: #003279; }
      header p { margin: 4px 0 0; color: #667085; }
      h3 { margin: 22px 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #003279; }
      p { margin: 0; } ul { margin: 0; padding-left: 18px; } li + li { margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #d9dee7; vertical-align: top; }
      th { font-size: 12px; color: #667085; }
      .outcome { font-weight: 700; }
      footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #d9dee7; color: #667085; font-size: 12px; }
    </style></head><body>
    <header><div><h1>Minutes of meeting</h1>
      <p>${esc(r.name)}, ${esc(r.company)} (${esc(r.country)})</p>
      <p>${esc(fmtDay(r.date))}, ${esc(slotTime(r))} IST · CPHI India 2026, Booth 2B59, Hall 2</p></div>
      <img src="${new URL("assets/rp-logo.png", location.href)}" alt="RP Industries"></header>
    ${doc.innerHTML}
    <footer>RP Industries · Quality Matters First</footer>
    </body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
});

// ---------- row actions (buttons rendered by admin.js) ----------
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b || !b.dataset.id) return;
  const act = b.dataset.act;
  if (act === "complete" || act === "add-notes") openComplete(b.dataset.id);
  if (act === "minutes") openMinutes(b.dataset.id);
  if (act === "retry-minutes") {
    const id = b.dataset.id;
    generate(id).then((r) => { if (r.ok) ensureFollowupDraft(id); openMinutes(id); }).catch(() => {});
  }
});
