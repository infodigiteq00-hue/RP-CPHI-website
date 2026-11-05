// Expo Manager · owners' dashboard: the Leads and Outreach tabs.
// Leads: the demo requests sent from the website (Supabase table `leads`), each with what to do next and when.
// Outreach: the n8n outreach system's expos, exhibitors, people, sends and replies (the outreach_* tables).
// Loaded after super.js and uses its api(), token(), esc(), $ and show().

const panels = { leads: [], statuses: [], outreach: null, filter: { leadStatus: "", expo: "", contactStatus: "" } };
const IMPORT_FORM = "https://n8n-production-e061b.up.railway.app/form/import-exhibitors";
const DAY = 864e5;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const fmtWhen = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const daysTo = (d) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / DAY) : null);
const ago = (d) => {
  const h = Math.round((Date.now() - new Date(d).getTime()) / 36e5);
  return h < 1 ? "just now" : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const count = (arr, f) => arr.reduce((o, x) => { const k = f(x) || "none"; o[k] = (o[k] || 0) + 1; return o; }, {});
const rows = (x) => (Array.isArray(x) ? x : []);

// ---------- tabs ----------
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));
function openTab(tab) {
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  if (tab === "companies") return show("list");
  show(tab);
  if (tab === "leads") loadLeads();
  if (tab === "outreach") loadOutreach();
}

// ---------- leads ----------
async function loadLeads() {
  $("#leadsErr").hidden = true;
  $("#leadsCount").textContent = "Loading…";
  try {
    const [l, o] = await Promise.all([api("superLeads", { token: token() }), panels.outreach ? null : api("superOutreach", { token: token() }).catch(() => null)]);
    if (!l.ok) throw new Error(l.error);
    panels.leads = l.leads || [];
    panels.statuses = l.statuses || [];
    if (o && o.ok) panels.outreach = o.outreach;
    renderLeads();
  } catch (ex) {
    if (ex.message === "auth") return;
    $("#leadsCount").textContent = "";
    $("#leadsErr").textContent = ex.message === "bad_request"
      ? "The Apps Script is an older version. Paste the latest Code.gs and deploy a new version."
      : /relation|does not exist|leads/i.test(ex.message) ? "The leads table isn't in Supabase yet. Run the latest supabase.sql." : "Couldn't load the leads. Try Refresh.";
    $("#leadsErr").hidden = false;
  }
}
$("#leadsRefresh").addEventListener("click", loadLeads);
$("#leadsFilter").addEventListener("change", (e) => { panels.filter.leadStatus = e.target.value; renderLeads(); });

// the expo a lead named, if it's one we track, for how many days are left
function leadExpo(l) {
  const text = String(l.expo || "").toLowerCase();
  const expos = panels.outreach ? rows(panels.outreach.expos) : [];
  return expos.find((e) => text && text.includes(String(e.name).toLowerCase().replace(/\s+\d{4}$/, ""))) || null;
}

// how hot a lead is, and the next step, from its status, interest score and how close their expo is
function strategy(l) {
  const ex = leadExpo(l);
  const days = ex ? daysTo(ex.start_date) : null;
  const interest = Number(l.interest) || 0;
  const hot = interest >= 8 || (days !== null && days >= 0 && days <= 21);
  const warm = !hot && interest >= 5;
  const heat = hot ? "hot" : warm ? "warm" : "cool";
  const soon = days !== null && days >= 0 ? ` Their expo (${ex.name}) starts in ${days} day${days === 1 ? "" : "s"}.` : "";
  const steps = {
    New: hot ? `Call or WhatsApp within 2 hours and offer a demo today or tomorrow.${soon} Invites need about 2 weeks to work, so move fast.`
      : warm ? `Email within 24 hours with two demo times and the booking-page link.${soon}`
        : `Send the demo link and a 2-minute walkthrough. Check back in 5 days.${soon}`,
    Contacted: "No reply after 2 days: one short follow-up with a screenshot of the booking page. After 5 more days: a last note, then move on.",
    "Demo booked": "Before the demo: set them up as a draft company (Companies → Add company → their website) so they see their own branded booking page live.",
    "Demo done": "Within 24 hours: send pricing and the setup steps, and offer a pilot for their next expo.",
    Pilot: "Onboard now: their expo, booth and client list. Invites out 3-4 weeks before the show; check in weekly.",
    Won: "Ask for a short quote or case study after their show, and an intro to one exhibitor they know.",
    Lost: "Note why. Re-approach 6 weeks before their next expo.",
  };
  return { heat, step: steps[l.status] || steps.New, expo: ex, days };
}

function renderLeads() {
  const all = panels.leads;
  const by = count(all, (l) => l.status);
  const today = new Date().toISOString().slice(0, 10);
  const due = all.filter((l) => l.next_at && l.next_at <= today && !["Won", "Lost"].includes(l.status)).length;
  $("#leadsCount").textContent = `${all.length} lead${all.length === 1 ? "" : "s"} · ${by.New || 0} new · ${due} due today`;
  $("#leadsSummary").innerHTML = panels.statuses.map((s) => `<div class="kpi"><b>${by[s] || 0}</b><span>${esc(s)}</span></div>`).join("");
  $("#leadsFilter").innerHTML = `<option value="">All statuses</option>` + panels.statuses.map((s) => `<option${s === panels.filter.leadStatus ? " selected" : ""}>${esc(s)}</option>`).join("");
  const list = all.filter((l) => !panels.filter.leadStatus || l.status === panels.filter.leadStatus);
  $("#leadRows").innerHTML = list.length ? list.map((l) => {
    const st = strategy(l);
    const overdue = l.next_at && l.next_at <= today && !["Won", "Lost"].includes(l.status);
    return `<tr data-lead="${esc(l.id)}">
      <td data-label="Received"><strong>${esc(fmtDate(l.created_at))}</strong><small>${esc(ago(l.created_at))}${l.source ? ` · ${esc(l.source)}` : ""}</small></td>
      <td data-label="Lead"><strong>${esc(l.name || "(no name)")}</strong><small>${esc(l.company)}</small><small><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></small></td>
      <td data-label="Expo">${esc(l.expo || "")}${st.days !== null ? `<small>${st.days >= 0 ? `starts in ${st.days} d` : "already started"}</small>` : ""}</td>
      <td data-label="Interest">${l.interest ? `<span class="score"><i style="width:${l.interest * 10}%"></i></span><small>${l.interest} of 10</small>` : `<small>not given</small>`}</td>
      <td data-label="Next step"><span class="heat heat--${st.heat}">${st.heat}</span><p class="step">${esc(st.step)}</p></td>
      <td data-label="Status"><select class="lead-status" aria-label="Status">${panels.statuses.map((s) => `<option${s === l.status ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
        <label class="lead-next${overdue ? " is-due" : ""}">Follow up on<input type="date" class="lead-date" value="${esc(l.next_at || "")}"></label></td>
      <td data-label="Notes"><textarea class="lead-notes" rows="3" placeholder="What they said, what you promised">${esc(l.notes || "")}</textarea>
        <small class="lead-saved" hidden>Saved</small></td>
    </tr>`;
  }).join("") : `<tr><td colspan="7" class="muted">No leads yet. They appear here as soon as someone sends the demo form on the website.</td></tr>`;
}

// saving a lead's status, date or notes as they're changed
$("#leadRows").addEventListener("change", (e) => {
  const tr = e.target.closest("[data-lead]");
  if (!tr) return;
  const patch = { token: token(), id: tr.dataset.lead };
  if (e.target.matches(".lead-status")) patch.status = e.target.value;
  else if (e.target.matches(".lead-date")) patch.next_at = e.target.value || "";
  else if (e.target.matches(".lead-notes")) patch.notes = e.target.value;
  else return;
  saveLead(tr, patch);
});
async function saveLead(tr, patch) {
  const tag = tr.querySelector(".lead-saved");
  tag.hidden = false;
  tag.textContent = "Saving…";
  try {
    const r = await api("superSaveLead", patch);
    if (!r.ok) throw new Error(r.error);
    const i = panels.leads.findIndex((l) => l.id === r.lead.id);
    if (i >= 0) panels.leads[i] = r.lead;
    if (patch.status !== undefined) renderLeads();
    else { tag.textContent = "Saved"; setTimeout(() => { tag.hidden = true; }, 1500); }
  } catch (ex) {
    if (ex.message !== "auth") tag.textContent = "Couldn't save. Try again.";
  }
}

// ---------- outreach ----------
async function loadOutreach() {
  $("#outErr").hidden = true;
  $("#outCount").textContent = "Loading…";
  try {
    const r = await api("superOutreach", { token: token() });
    if (!r.ok) { const er = new Error(r.error === "no_outreach_tables" ? "no_tables" : r.error); er.detail = r.detail; throw er; }
    panels.outreach = r.outreach;
    renderOutreach();
  } catch (ex) {
    if (ex.message === "auth") return;
    $("#outCount").textContent = "";
    $("#outErr").textContent = ex.message === "no_tables" ? "The outreach tables aren't in Supabase yet. Run the latest supabase.sql."
      : ex.message === "bad_request" ? "The Apps Script is an older version. Paste the latest Code.gs and deploy a new version." : "Couldn't load the outreach. Try Refresh.";
    if (ex.detail) $("#outErr").textContent += " Supabase said: " + String(ex.detail).slice(0, 300);
    $("#outErr").hidden = false;
  }
}
$("#outRefresh").addEventListener("click", loadOutreach);

function renderOutreach() {
  const o = panels.outreach;
  const s = rows(o.settings)[0] || {};
  const expos = rows(o.expos), companies = rows(o.companies), contacts = rows(o.contacts), log = rows(o.log), replies = rows(o.replies);
  const sent = log.filter((x) => x.result === "sent");
  const realReplies = replies.filter((x) => x.reply_type && x.reply_type !== "not_a_contact");
  const upcoming = expos.filter((e) => daysTo(e.end_date || e.start_date) >= 0);
  $("#outCount").textContent = `${upcoming.length} upcoming expo${upcoming.length === 1 ? "" : "s"} · ${companies.length} exhibitors · ${contacts.length} people`;

  // what's blocking sending
  const warn = [];
  if (!s.landing_url) warn.push("The website link is empty (Sending settings below). The emails link to it, so none can go out.");
  if (!s.sender_address) warn.push("The postal address is empty (Sending settings below). Cold emails must include one, so the Ready to send list is paused.");
  const needList = upcoming.filter((e) => ["needs_list", "blocked_robots"].includes(e.status));
  if (needList.length) warn.push(`${needList.length} expo${needList.length === 1 ? " needs" : "s need"} an exhibitor list pasted in: ${needList.map((e) => e.name).join(", ")}.`);
  $("#outWarn").innerHTML = warn.length ? `<b>Needs you</b><ul>${warn.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>${needList.length ? `<a class="btn btn--sm" href="${IMPORT_FORM}" target="_blank" rel="noopener">Open the exhibitor import form</a>` : ""}` : "";
  $("#outWarn").hidden = !warn.length;

  // the funnel
  const cs = count(contacts, (c) => c.status);
  const kpis = [
    ["Expos tracked", upcoming.length], ["Exhibitors found", companies.length],
    ["With people", companies.filter((c) => Number(c.contacts_found) > 0).length], ["People (verified email)", contacts.length],
    ["Emailed (14 days)", sent.length], ["Replies (14 days)", realReplies.length],
    ["Interested", realReplies.filter((r) => ["interested", "question"].includes(r.reply_type)).length],
    ["LinkedIn queued", contacts.filter((c) => c.linkedin_status === "queued").length],
  ];
  $("#outKpis").innerHTML = kpis.map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${esc(k)}</span></div>`).join("");

  // expos
  const byExpo = (list, f) => list.reduce((m, x) => { m[x.expo_name] = (m[x.expo_name] || 0) + (f ? f(x) : 1); return m; }, {});
  const coN = byExpo(companies), peopleN = byExpo(contacts), sentN = byExpo(sent);
  $("#expoRows").innerHTML = expos.map((e) => {
    const d = daysTo(e.start_date);
    const phase = d === null ? "" : d < 0 ? (daysTo(e.end_date) >= 0 ? "on now" : "over") : d < 14 ? "too close to start" : d <= 100 ? "in the outreach window" : "later";
    return `<tr data-expo="${esc(e.id)}">
      <td data-label="Expo"><strong>${e.website ? `<a href="${esc(e.website)}" target="_blank" rel="noopener">${esc(e.name)}</a>` : esc(e.name)}</strong><small>${esc([e.industry, e.city, e.country].filter(Boolean).join(" · "))}</small></td>
      <td data-label="Dates"><strong>${esc(fmtDate(e.start_date))}</strong><small>${d === null ? "" : d >= 0 ? `in ${d} days` : ""}${phase ? ` · ${phase}` : ""}</small></td>
      <td data-label="Checked"><label class="chk"><input type="checkbox" class="expo-verified"${e.dates_verified ? " checked" : ""}> dates checked</label></td>
      <td data-label="Exhibitor list"><input class="expo-url" placeholder="Public list page URL" value="${esc(e.exhibitor_list_url || "")}"><small>${esc(EXPO_STATUS[e.status] || e.status || "")}${e.notes ? ` · ${esc(e.notes)}` : ""}</small></td>
      <td data-label="Pipeline"><strong>${coN[e.name] || 0} exhibitors</strong><small>${peopleN[e.name] || 0} people · ${sentN[e.name] || 0} emailed (14 d)</small></td>
      <td data-label=""><button class="act" type="button" data-save-expo>Save</button><small class="expo-saved" hidden>Saved</small></td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="muted">No expos yet.</td></tr>`;

  // settings
  const f = $("#outSettings");
  ["sender_name", "sender_title", "sender_company", "sender_phone", "sender_address", "proof_line", "landing_url", "demo_url", "owner_email", "daily_email_cap", "linkedin_daily"]
    .forEach((k) => { if (f.elements[k]) f.elements[k].value = s[k] ?? ""; });
  f.elements.sending_enabled.checked = !!s.sending_enabled;

  // people
  const expoNames = [...new Set(contacts.map((c) => c.expo_name))];
  $("#contactExpo").innerHTML = `<option value="">All expos</option>` + expoNames.map((n) => `<option${n === panels.filter.expo ? " selected" : ""}>${esc(n)}</option>`).join("");
  $("#contactStatus").innerHTML = `<option value="">All statuses</option>` + Object.keys(cs).map((k) => `<option value="${esc(k)}"${k === panels.filter.contactStatus ? " selected" : ""}>${esc(k)} (${cs[k]})</option>`).join("");
  renderContacts();
  renderQueue();
}

// ---------- ready to send (by hand, from your own Gmail) ----------
// Until the separate sending domain is set up, n8n's "Send emails" workflow stays off. Each email due today is written
// here (the same three emails it would send), opens in Gmail with one click, and "Mark as sent" moves the person on:
// the follow-up comes due 3 days later, the last note 4 days after that. Same rules as the workflow: never to the
// do-not-contact list, one first email per company per day, nothing once the expo is too close or over.
const TZ = { india: 5.5, "united arab emirates": 4, uae: 4, "saudi arabia": 3, qatar: 3, oman: 4, kuwait: 3, bahrain: 3, egypt: 2, turkey: 3,
  "united kingdom": 0, uk: 0, ireland: 0, portugal: 0, germany: 1, france: 1, italy: 1, spain: 1, netherlands: 1, belgium: 1, switzerland: 1,
  austria: 1, poland: 1, sweden: 1, denmark: 1, norway: 1, czechia: 1, "czech republic": 1, hungary: 1, greece: 2, finland: 2, romania: 2,
  israel: 2, "south africa": 2, nigeria: 1, kenya: 3, "united states": -5, usa: -5, canada: -5, mexico: -6, brazil: -3, argentina: -3,
  chile: -3, colombia: -5, china: 8, "hong kong": 8, taiwan: 8, singapore: 8, malaysia: 8, philippines: 8, indonesia: 7, thailand: 7,
  vietnam: 7, japan: 9, "south korea": 9, korea: 9, australia: 10, "new zealand": 12, bangladesh: 6, pakistan: 5, "sri lanka": 5.5, nepal: 5.75 };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STEP_NAME = ["First email", "Follow-up (day 3)", "Last note (day 7)"];
const SUBJECT = (expo) => `A thought ahead of ${expo}`;
const shortCo = (n) => String(n || "").replace(/\b(pvt\.?|private|ltd\.?|limited|llp|llc|inc\.?|gmbh|co\.?|corp\.?|corporation|plc|s\.?a\.?|s\.?r\.?l\.?|b\.?v\.?|ag)\b/gi, "")
  .replace(/[\s,.]+$/, "").replace(/\s+/g, " ").trim() || n;
const gmailAcct = () => { try { return localStorage.getItem("em-gmail-acct") || "0"; } catch (e) { return "0"; } };

function theirTime(country) {
  const off = TZ[String(country || "").toLowerCase()] ?? 5.5;
  const d = new Date(Date.now() + off * 36e5);
  const day = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
  const label = d.toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit" });
  return { label, ok: day >= 1 && day <= 5 && h >= 9.5 && h < 17 };
}

// The email for this person's next step, as plain text (the same words as n8n's Send emails workflow)
function draftFor(c, s) {
  const step = Number(c.step || 0);
  const co = shortCo(c.company);
  const first = String(c.first_name || "").trim() || "there";
  const start = c.expo_start ? new Date(c.expo_start) : null;
  const month = start ? ` this ${MONTHS[start.getUTCMonth()]}` : "";
  const landing = String(s.landing_url || "").trim();
  const link = landing + (landing.includes("?") ? "&" : "?") + "expo=" + encodeURIComponent(c.expo_name || "") + "&company=" + encodeURIComponent(co)
    + (c.expo_city ? "&city=" + encodeURIComponent(c.expo_city) : "") + "&utm_source=email&utm_content=step" + (step + 1) + "#try";
  const sender = String(s.sender_name || "").trim();
  const foot = `--\nIf you'd rather not hear from me again, just reply and let me know.\n${[s.sender_company, s.sender_address].filter(Boolean).join(", ")}`;
  let body;
  if (step === 0) {
    const opener = c.opener || `I noticed ${c.company} will be at ${c.expo_name}${c.expo_city ? " in " + c.expo_city : ""}${month}.`;
    body = [`Hi ${first},`,
      `${opener} A stand there is a real commitment of time and budget, and those few days go by quickly.`,
      "I've been speaking with exhibitors for a while, and the same thing keeps coming up. The show itself usually goes well, but a lot of its value slips away around it. Meetings get arranged over WhatsApp in the final week. Conversations at the booth start to run into each other. And by the time everyone is back at their desks, the follow-ups take longer than anyone would like.",
      "We built Expo Manager to take some of that weight off. Visitors book a time with your team from a personal invitation. A short voice note after each conversation turns into a clear summary. And a thoughtful follow-up is ready for you to review when you're back.",
      s.proof_line || "",
      `If it's useful, here is how it would look for ${co} at ${c.expo_name}:\n${link}`,
      "And if the timing isn't right, no problem at all. I'd be glad to share it whenever it suits you.",
      `Warm regards,\n${sender}\n${[s.sender_company, s.sender_phone].filter(Boolean).join(" · ")}`,
      foot].filter(Boolean).join("\n\n");
  } else if (step === 1) {
    body = [`Hi ${first},`, "I know the weeks before a show are full, so just a gentle follow-up on my note.",
      `The part exhibitors tell me they value most is the week after: writing to every visitor while the conversation is still fresh. If it would help, I can set up a short preview with ${co}${/s$/i.test(co) ? "'" : "'s"} own details, so your team can see it with real names and dates. Here is a quick look in the meantime:\n${link}`,
      "Either way, I hope the preparations are going well.", sender.split(/\s+/)[0], foot].join("\n\n");
  } else {
    body = [`Hi ${first},`, `I'll leave this with you, so I'm not filling your inbox before ${c.expo_name}.`,
      "If it's ever useful, even after the show, I'm happy to walk you through it whenever suits you.",
      `Wishing you and the team a very good ${c.expo_name}.`, sender.split(/\s+/)[0], foot].join("\n\n");
  }
  const subject = step === 0 ? SUBJECT(c.expo_name) : "Re: " + SUBJECT(c.expo_name);
  return { step, subject, body };
}

function queueList() {
  const o = panels.outreach;
  const contacts = rows(o.contacts), log = rows(o.log), supp = rows(o.suppression);
  const noEmail = new Set(supp.map((x) => String(x.email || "").toLowerCase()).filter(Boolean));
  const noDomain = new Set(supp.map((x) => String(x.domain || "").toLowerCase()).filter(Boolean));
  const today = new Date().toDateString();
  const firstToday = new Set(log.filter((x) => x.result === "sent" && Number(x.step) === 1 && new Date(x.sent_at).toDateString() === today)
    .map((x) => String(x.company || "").toLowerCase()));
  const now = Date.now();
  const due = contacts.filter((c) => {
    const step = Number(c.step || 0);
    if (!["ready", "in_sequence"].includes(c.status) || step >= 3 || !c.email) return false;
    if (noEmail.has(String(c.email).toLowerCase()) || noDomain.has(String(c.domain || "").toLowerCase())) return false;
    if (c.next_send_at && new Date(c.next_send_at).getTime() > now) return false;
    const start = c.expo_start ? new Date(c.expo_start).getTime() : null;
    if (step === 0 && start && start - now < 3 * DAY) return false;
    if (step > 0 && start && now > start + 4 * DAY) return false;
    return true;
  });
  due.sort((a, b) => (Number(b.step) > 0) - (Number(a.step) > 0) || String(a.expo_start || "").localeCompare(String(b.expo_start || "")));
  const firstPicked = new Set(firstToday);
  return due.filter((c) => {
    if (Number(c.step || 0) > 0) return true;
    const co = String(c.company || "").toLowerCase();
    if (firstPicked.has(co)) return false; // one first email per company per day
    firstPicked.add(co);
    return true;
  });
}

function renderQueue() {
  const o = panels.outreach;
  const s = rows(o.settings)[0] || {};
  const sentToday = rows(o.log).filter((x) => x.result === "sent" && new Date(x.sent_at).toDateString() === new Date().toDateString()).length;
  const cap = Number(s.daily_email_cap || 20);
  const list = queueList();
  const blocked = !s.landing_url || !s.sender_address;
  $("#queueCount").textContent = `${list.length} due · ${sentToday} of ${cap} sent today`;
  $("#queueAcct").value = gmailAcct();
  const shown = list.slice(0, 50);
  $("#queueRows").innerHTML = blocked
    ? `<p class="muted">Add the website link and your postal address in Sending settings below, then the emails appear here.</p>`
    : shown.map((c) => {
      const d = draftFor(c, s);
      const t = theirTime(c.country);
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
      return `<article class="qcard" data-qid="${esc(c.id)}" data-qstep="${esc(d.step)}">
        <div class="qcard__head">
          <div><strong>${esc(name)}</strong> <span class="muted">${esc(c.title || "")}</span>
            <small>${esc(c.company)} · ${esc(c.expo_name)} · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></small></div>
          <div class="qcard__meta"><span class="qstep">${esc(STEP_NAME[d.step])}</span>
            <small class="${t.ok ? "ok" : "late"}">${esc(t.label)} their time${t.ok ? "" : " · outside working hours"}</small></div>
        </div>
        <details class="qcard__mail"><summary>${esc(d.subject)}</summary><pre>${esc(d.body)}</pre></details>
        <div class="qcard__acts">
          ${d.step === 0
            ? `<button class="btn btn--sm" type="button" data-q="open">Open in Gmail</button>`
            : `<button class="btn btn--sm" type="button" data-q="reply" title="Copies the follow-up and opens your earlier email to them: click Reply there and paste">Copy &amp; open the thread</button>
               <button class="act" type="button" data-q="open">New email instead</button>`}
          <button class="btn btn--outline btn--sm" type="button" data-q="sent">Mark as sent</button>
          <span class="qcard__more">They replied:
            <button class="act" type="button" data-q="replied">Interested</button>
            <button class="act" type="button" data-q="not_interested">Not interested</button>
            <button class="act" type="button" data-q="bounced">Bounced</button></span>
          <small class="qcard__msg" aria-live="polite"></small>
        </div>
      </article>`;
    }).join("") || `<p class="muted">Nothing due right now. New people become ready after the weekday 07:00 personalising run, and follow-ups come due 3 and 7 days after you send.</p>`;
  $("#queueMore").textContent = !blocked && list.length > shown.length ? `Showing the first ${shown.length} of ${list.length}.` : "";
}

$("#queueAcct").addEventListener("change", (e) => { try { localStorage.setItem("em-gmail-acct", e.target.value); } catch (err) { /* private window */ } });

$("#queueRows").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-q]");
  if (!b) return;
  const card = b.closest("[data-qid]");
  const c = rows(panels.outreach.contacts).find((x) => String(x.id) === card.dataset.qid);
  if (!c) return;
  const s = rows(panels.outreach.settings)[0] || {};
  const d = draftFor(c, s);
  const msg = card.querySelector(".qcard__msg");
  const acct = gmailAcct();
  const what = b.dataset.q;
  if (what === "open") {
    const url = `https://mail.google.com/mail/u/${encodeURIComponent(acct)}/?view=cm&fs=1&to=${encodeURIComponent(c.email)}&su=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
    window.open(url, "_blank", "noopener");
    msg.textContent = "After you press Send in Gmail, click Mark as sent.";
    return;
  }
  if (what === "reply") {
    try { await navigator.clipboard.writeText(d.body); msg.textContent = "Copied. In Gmail, open your email to them, click Reply, paste, send. Then Mark as sent."; }
    catch (err) { msg.textContent = "Couldn't copy: open the email text above and copy it by hand."; }
    window.open(`https://mail.google.com/mail/u/${encodeURIComponent(acct)}/#search/${encodeURIComponent("to:" + c.email)}`, "_blank", "noopener");
    return;
  }
  if (what !== "sent" && !confirm({ replied: "Mark as interested? Their emails stop, and so do their colleagues'. Answer them yourself.",
    not_interested: "Mark as not interested? They go on the do-not-contact list.", bounced: "Mark as bounced? The address goes on the do-not-contact list." }[what])) return;
  card.querySelectorAll("button").forEach((x) => { x.disabled = true; });
  msg.textContent = "Saving…";
  try {
    const r = await api("superSaveOutreach", { token: token(), contact: { id: c.id, action: what, step: d.step, subject: d.subject } });
    if (!r.ok) throw new Error(r.error);
    if (r.contactSaved === undefined) throw new Error("old_script");
    if (!r.contactSaved) throw new Error("not_saved");
    panels.outreach = r.outreach;
    renderOutreach();
  } catch (ex) {
    if (ex.message === "auth") return;
    card.querySelectorAll("button").forEach((x) => { x.disabled = false; });
    msg.textContent = ex.message === "old_script" ? "The Apps Script is an older version: paste the latest Code.gs and deploy a new version, then try again."
      : "Couldn't save. Try again.";
  }
});

const EXPO_STATUS = {
  new: "waiting for its window", needs_list: "needs an exhibitor list", blocked_robots: "its site blocks fetching: paste the list",
  imported: "list imported", post_show: "post-show pitch",
};
const CONTACT_STATUS = {
  new: "found, waiting for personal lines", ready: "ready, first email next", in_sequence: "in the email sequence", done: "sequence finished",
  replied: "replied: yours to answer", colleague_replied: "a colleague replied", unsubscribed: "asked not to be contacted", bounced: "email bounced",
  hold_consent: "LinkedIn only (consent rules)", expired: "expo too close", send_error: "sending failed",
};
function renderContacts() {
  const all = rows(panels.outreach.contacts);
  const list = all.filter((c) => (!panels.filter.expo || c.expo_name === panels.filter.expo) && (!panels.filter.contactStatus || c.status === panels.filter.contactStatus));
  const shown = list.slice(0, 300);
  $("#contactRows").innerHTML = shown.map((c) => `<tr>
      <td data-label="Person"><strong>${esc([c.first_name, c.last_name].filter(Boolean).join(" ") || c.email)}</strong><small>${esc(c.title)}</small><small><a href="mailto:${esc(c.email)}">${esc(c.email)}</a>${c.linkedin_url ? ` · <a href="${esc(c.linkedin_url)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}</small></td>
      <td data-label="Company"><strong>${esc(c.company)}</strong><small>${esc(c.country)}</small></td>
      <td data-label="Expo">${esc(c.expo_name)}<small>${esc(fmtDate(c.expo_start))}</small></td>
      <td data-label="Email">${esc(CONTACT_STATUS[c.status] || c.status)}<small>${c.step ? `email ${c.step} of 3 sent ${esc(fmtWhen(c.last_sent_at))}` : ""}${c.next_send_at ? ` · next ${esc(fmtWhen(c.next_send_at))}` : ""}</small>${c.reply_type ? `<small><b>Reply: ${esc(c.reply_type)}</b>${c.notes ? ` · ${esc(c.notes)}` : ""}</small>` : ""}</td>
      <td data-label="LinkedIn">${esc(c.linkedin_status || "")}</td>
    </tr>`).join("") || `<tr><td colspan="5" class="muted">No people yet. They appear once Apollo finds them for an imported expo.</td></tr>`;
  $("#contactMore").textContent = list.length > shown.length ? `Showing ${shown.length} of ${list.length}. Filter by expo or status to see the rest.` : "";
}
$("#contactExpo").addEventListener("change", (e) => { panels.filter.expo = e.target.value; renderContacts(); });
$("#contactStatus").addEventListener("change", (e) => { panels.filter.contactStatus = e.target.value; renderContacts(); });

// saving an expo row
$("#expoRows").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-save-expo]");
  if (!b) return;
  const tr = b.closest("[data-expo]");
  b.disabled = true;
  try {
    const r = await api("superSaveOutreach", { token: token(), expo: { id: tr.dataset.expo,
      dates_verified: tr.querySelector(".expo-verified").checked, exhibitor_list_url: tr.querySelector(".expo-url").value.trim() } });
    if (!r.ok) throw new Error(r.error);
    panels.outreach = r.outreach;
    renderOutreach();
  } catch (ex) {
    if (ex.message !== "auth") alert("Couldn't save the expo. Try again.");
    b.disabled = false;
  }
});

// adding an expo
$("#addExpo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const expo = { create: true };
  ["name", "industry", "city", "country", "start_date", "end_date", "website", "exhibitor_list_url"].forEach((k) => { expo[k] = f.elements[k].value.trim(); });
  expo.dates_verified = f.elements.dates_verified.checked;
  if (!expo.name || !expo.start_date) return alert("Give the expo's name and start date.");
  f.querySelector("button").disabled = true;
  try {
    const r = await api("superSaveOutreach", { token: token(), expo });
    if (!r.ok) throw new Error(r.error);
    panels.outreach = r.outreach;
    f.reset();
    f.closest("details").open = false;
    renderOutreach();
  } catch (ex) {
    if (ex.message !== "auth") alert("Couldn't add the expo. Is the name already there?");
  } finally {
    f.querySelector("button").disabled = false;
  }
});

// settings
$("#outSettings").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const settings = {};
  ["sender_name", "sender_title", "sender_company", "sender_phone", "sender_address", "proof_line", "landing_url", "demo_url", "owner_email", "daily_email_cap", "linkedin_daily"]
    .forEach((k) => { settings[k] = f.elements[k].value.trim(); });
  settings.sending_enabled = f.elements.sending_enabled.checked;
  if (settings.sending_enabled && (!settings.landing_url || !settings.sender_address)) {
    return alert("Add the website link and postal address before switching sending on.");
  }
  const btn = f.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const r = await api("superSaveOutreach", { token: token(), settings });
    if (!r.ok) throw new Error(r.error);
    panels.outreach = r.outreach;
    renderOutreach();
    btn.textContent = "Saved";
  } catch (ex) {
    btn.textContent = ex.message === "auth" ? "Save settings" : "Couldn't save. Try again";
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = "Save settings"; }, 2000);
  }
});
