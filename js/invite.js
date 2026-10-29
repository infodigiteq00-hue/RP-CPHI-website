// Expo meetings · admin: the invite email for an expo (in the "Expo settings" tab), ready to paste into a mailing
// tool. The email itself is built by js/invite-mail.js. Loaded after admin.js and expos.js; uses $, esc(), state,
// draft, isRP(), makeBanner() and window.Brand.

function renderInvite(e) {
  const box = $("#inviteSet");
  if (!box) return;
  const p = inviteParts(e, state.company);
  box.innerHTML = `<h2>Invite email</h2>
    <p class="hint">A ready-made invitation to send to your clients, with your branding, this expo's details and a Book a meeting button.
      Copy it into your mailing tool, or download it. It shows the settings as they are here: save your changes first.</p>
    <div class="invite">
      <div class="invite__preview"><iframe id="invitePreview" title="Invite email preview" loading="lazy"></iframe></div>
      <div class="invite__side">
        <div class="field">
          <label for="inviteSubject">Subject</label>
          <div class="copy-row"><input id="inviteSubject" readonly value="${esc(p.subject)}"><button class="btn btn--outline btn--sm" type="button" data-inv="subject">Copy</button></div>
        </div>
        <div class="invite__actions">
          <button class="btn btn--sm" type="button" data-inv="html">Copy HTML</button>
          <button class="btn btn--outline btn--sm" type="button" data-inv="download">Download .html</button>
          <button class="btn btn--outline btn--sm" type="button" data-inv="text">Copy plain text</button>
          <button class="btn btn--outline btn--sm" type="button" data-inv="open">Open preview</button>
        </div>
        <div class="field">
          <span class="label">Email banner</span>
          ${e.emailBanner ? `<img class="invite__banner" src="${esc(e.emailBanner)}" alt="Email banner">`
            : `<p class="hint">${e.banner ? "Uses the booking page's banner." : isRP() ? "Uses the India Gate photo." : "No banner: the email starts with your logo."}</p>`}
          <div class="banner-edit__actions">
            <button class="btn btn--outline btn--sm" type="button" data-do="make-banner" data-kind="email">Create with Nano Banana</button>
            ${e.emailBanner ? `<button class="link" type="button" data-inv="banner-clear">Use the booking page's banner</button>` : ""}
          </div>
          <p class="muted banner-busy" id="emailBannerBusy" hidden><span class="spinner" aria-hidden="true"></span> Creating the email banner. This takes up to a minute…</p>
          <p class="err" id="emailBannerErr" hidden></p>
        </div>
        <p class="hint">Images in the email load from the web, so they show in your clients' inboxes. Send yourself a test first.</p>
      </div>
    </div>`;
  $("#invitePreview").srcdoc = inviteHtml(e, state.company);
}

$("#settingsView").addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-inv]");
  if (!b || !draft) return;
  const flash = (t) => { const old = b.textContent; b.textContent = t; setTimeout(() => { b.textContent = old; }, 1500); };
  const copyText = async (t) => { try { await navigator.clipboard.writeText(t); flash("Copied"); } catch { flash("Couldn't copy"); } };
  switch (b.dataset.inv) {
    case "subject": return copyText(inviteParts(draft, state.company).subject);
    case "html": return copyText(inviteHtml(draft, state.company));
    case "text": return copyText(inviteText(draft, state.company));
    case "download": {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([inviteHtml(draft, state.company)], { type: "text/html" }));
      a.download = `${isRP() ? "rp" : COMPANY_ID}-${draft.id}-invite.html`;
      a.click();
      return setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    case "open": {
      const w = window.open("", "_blank");
      if (!w) return flash("Allow pop-ups");
      w.document.write(inviteHtml(draft, state.company));
      return w.document.close();
    }
    case "banner-clear":
      draft.emailBanner = "";
      return renderSettings();
  }
});
