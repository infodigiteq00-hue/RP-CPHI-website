// Expo meetings · the invite email for an expo, built from a company's branding and the expo's settings: an HTML
// email (tables and inline styles, so it looks right in Gmail and Outlook) and a plain-text version. Every fact in
// it comes from the settings; nothing is made up. Shared by the admin page (Expo settings) and the owners' mailer;
// uses esc() and window.Brand.

// "23–25 November 2026"
function inviteDates(days) {
  if (!days || !days.length) return "";
  const p = (d) => { const x = new Date(`${d}T12:00:00Z`); return { d: x.getUTCDate(), m: x.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }), y: x.getUTCFullYear() }; };
  const a = p(days[0]);
  const b = p(days[days.length - 1]);
  if (days.length === 1) return `${a.d} ${a.m} ${a.y}`;
  if (a.m === b.m && a.y === b.y) return `${a.d}–${b.d} ${b.m} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${a.m} – ${b.d} ${b.m} ${b.y}`;
  return `${a.d} ${a.m} ${a.y} – ${b.d} ${b.m} ${b.y}`;
}

// the invite's link: RP's default expo keeps its /invite address
function inviteLink(e, c) {
  if (c.id === "rp") return e.isDefault ? `${location.origin}/invite` : `${location.origin}/${e.id}`;
  return `${location.origin}/${c.id}/${e.id}`;
}

function inviteParts(e, c) {
  const isRP = () => c.id === "rp";
  const who = c.profile.shortName || c.name;
  const sig = c.profile.signature || {};
  const colors = window.Brand.colors(c.brand);
  const booth = [e.booth, e.hall].filter(Boolean).join(", ");
  const products = (e.products || []).length >= 1 && (e.products || []).length <= 8 ? e.products : [];
  return {
    who, sig, booth, products,
    navy: colors["--navy"], accent: colors["--green"],
    logo: window.Brand.logoUrl(c),
    banner: e.emailBanner || e.banner || (isRP() ? `${location.origin}/assets/email-banner.jpg` : ""),
    certs: isRP() ? [`${location.origin}/assets/email-certs.png`] : c.brand.certs || [], // certificate badges, beside the logo
    dates: inviteDates(e.days),
    link: inviteLink(e, c),
    subject: `Meet ${who} at ${e.name}${booth ? ` · Booth ${booth}` : ""}`,
    claim: c.profile.headline || c.profile.tagline || "",
    // "XYZ Pharma is a maker of specialty APIs." from the company profile
    about: c.profile.about ? `${who} is ${c.profile.about.replace(/[.\s]+$/, "")}.` : "",
  };
}

function inviteText(e, c) {
  const p = inviteParts(e, c);
  return [
    `Subject: ${p.subject}`, "",
    "Dear Business Associate,", "",
    `${p.who} invites you to meet our team at ${e.name}.${p.about ? ` ${p.about}` : ""}`, "",
    ...(p.booth ? [`Booth: ${p.booth}`] : []),
    ...(p.dates ? [`Dates: ${p.dates}`] : []),
    ...(e.venue ? [`Venue: ${e.venue}`] : []), "",
    ...(p.products.length ? ["Let's discuss your requirements for:", ...p.products.map((x) => `- ${x}`), ""] : []),
    `Book a ${e.slotMinutes}-minute slot in advance so the right people from our team are ready for you.`, "",
    `Book a meeting: ${p.link}`, "",
    "Looking forward to meeting you.", "",
    "Warm regards,",
    p.sig.team || `Team ${p.who}`,
    ...[p.sig.tagline, [p.sig.phone, p.sig.email].filter(Boolean).join(" · "), (p.sig.website || "").replace(/^https?:\/\//, "")].filter(Boolean),
  ].join("\n");
}

function inviteHtml(e, c) {
  const p = inviteParts(e, c);
  const f = "font-family:Arial, Helvetica, sans-serif;";
  const row = (label, value, last) => value ? `<tr>
      <td class="label" width="80" valign="top" style="padding:${last ? "6px 0 14px 0" : "6px 0"}; ${f} font-size:14px; line-height:20px; color:#667085;">${label}</td>
      <td valign="top" style="padding:${last ? "6px 0 14px 0" : "6px 0"}; ${f} font-size:16px; line-height:22px; font-weight:bold; color:${p.navy};">${esc(value)}</td></tr>` : "";
  const details = [["Booth", p.booth], ["Dates", p.dates], ["Venue", e.venue]].filter((x) => x[1]);
  const sigLines = [p.sig.tagline, [p.sig.phone, p.sig.email].filter(Boolean).join(" · "), (p.sig.website || "").replace(/^https?:\/\//, "")].filter(Boolean);
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${esc(p.subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    @media screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
      .h1 { font-size: 24px !important; line-height: 31px !important; }
      .btn { width: 100% !important; }
      .btn a { display: block !important; }
      .label { width: 64px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#ffffff; border:1px solid #d9dee7;">
          ${p.logo ? `<tr>
            <td class="px" style="padding:18px 40px 16px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle"><img src="${esc(p.logo)}" height="56" alt="${esc(p.who)}" style="display:block; height:56px; width:auto; max-width:220px; ${f} font-size:18px; font-weight:bold; color:${p.navy};"></td>
                ${p.certs.length ? `<td align="right" valign="middle" style="padding-left:16px;">${p.certs.map((u) =>
                  // one image is a strip of badges (RP's): it shrinks on phones; several are single badges
                  p.certs.length === 1 ? `<img src="${esc(u)}" width="360" alt="Certifications" style="display:block; width:100%; max-width:360px; height:auto;">`
                    : `<img src="${esc(u)}" height="40" alt="" style="display:inline-block; height:40px; width:auto; max-width:64px; margin:2px 0 2px 8px; vertical-align:middle;">`).join("")}</td>` : ""}
              </tr></table>
            </td>
          </tr>` : `<tr><td class="px" style="padding:20px 40px 16px 40px; ${f} font-size:20px; font-weight:bold; color:${p.navy};">${esc(p.who)}</td></tr>`}
          ${p.banner ? `<tr>
            <td style="padding:0;">
              <img src="${esc(p.banner)}" width="600" alt="${esc(e.name)}" style="display:block; width:100%; max-width:600px; height:auto; ${f} font-size:14px; color:#667085;">
            </td>
          </tr>` : ""}
          <tr>
            <td class="px" style="padding:36px 40px 8px 40px; ${f} color:#1a2233;">
              <h1 class="h1" style="margin:0 0 8px 0; font-size:28px; line-height:36px; font-weight:bold; color:${p.navy};">You're invited to <span style="color:${p.accent};">${esc(e.name)}</span></h1>
              ${p.claim ? `<p style="margin:0 0 24px 0; font-size:16px; line-height:24px; color:#667085;">${esc(p.claim)}</p>` : ""}
              <p style="margin:0 0 16px 0; font-size:16px; line-height:25px;">Dear Business Associate,</p>
              <p style="margin:0 0 12px 0; font-size:16px; line-height:25px;">${esc(p.who)} invites you to meet our team at ${esc(e.name)}.${p.about ? ` ${esc(p.about)}` : ""}${p.products.length ? " Let's discuss your requirements for:" : ""}</p>
              ${p.products.length ? `<ul style="margin:0 0 12px 0; padding-left:22px; font-size:16px; line-height:25px;">${p.products.map((x) => `<li><strong>${esc(x)}</strong></li>`).join("")}</ul>` : ""}
            </td>
          </tr>
          ${details.length ? `<tr>
            <td class="px" style="padding:20px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #d9dee7; border-bottom:1px solid #d9dee7;">
                ${details.map((d, i) => row(d[0], d[1], i === details.length - 1)).join("")}
              </table>
            </td>
          </tr>` : ""}
          <tr>
            <td class="px" style="padding:28px 40px 8px 40px; ${f} color:#1a2233;">
              <p style="margin:0 0 20px 0; font-size:16px; line-height:25px;">Book a ${e.slotMinutes}-minute slot in advance so the right people from our team are ready for you.</p>
              <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${p.navy}" style="border-radius:6px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(p.link)}" style="height:50px; v-text-anchor:middle; width:240px;" arcsize="12%" stroke="f" fillcolor="${p.navy}">
                      <center style="color:#ffffff; ${f} font-size:16px; font-weight:bold;">Book a meeting</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${esc(p.link)}" target="_blank" style="display:inline-block; padding:15px 40px; ${f} font-size:16px; line-height:20px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:6px; background-color:${p.navy}; text-align:center;">Book a meeting</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:28px 40px 36px 40px; ${f} color:#1a2233;">
              <p style="margin:0 0 16px 0; font-size:16px; line-height:25px;">Looking forward to meeting you.</p>
              <p style="margin:0; font-size:16px; line-height:25px;">
                Warm regards,<br>
                <strong style="color:${p.navy};">${esc(p.sig.team || `Team ${p.who}`)}</strong>${sigLines.map((l) => `<br>
                <span style="font-size:14px; color:#667085;">${esc(l)}</span>`).join("")}
              </p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:16px 40px; background-color:#f4f6f9; border-top:1px solid #d9dee7; ${f} font-size:12px; line-height:18px; color:#667085;">
              ${esc([p.who, e.name, p.booth && `Booth ${p.booth}`, e.venue].filter(Boolean).join(" · "))}
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}
