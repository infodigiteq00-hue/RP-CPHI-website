// Expo meetings · a company's branding on any page: its colours, logo, font and name.
// Used by the booking page, the admin page and the owners' dashboard (for previews).
// Colours are adjusted where needed so text stays readable: white on the main colour, the accent on white,
// and the highlight on the dark banner.

window.Brand = (() => {
  const DEFAULT_FONT = "Plus Jakarta Sans";
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
  const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
  const lum = (h) => {
    const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const valid = (h) => /^#[0-9a-f]{6}$/i.test(h || "");
  // moves `color` towards `to` until it has at least `min` contrast with `on`
  function readable(color, on, min, to) {
    let c = color;
    for (let i = 0; i < 24 && contrast(c, on) < min; i++) c = mix(c, to, 0.08);
    return c;
  }

  // the CSS colour variables for a brand
  function colors(brand) {
    const b = brand || {};
    const primary = readable(valid(b.primary) ? b.primary.toLowerCase() : "#003279", "#ffffff", 4.5, "#000000");
    const accent = readable(valid(b.accent) ? b.accent.toLowerCase() : primary, "#ffffff", 3.2, "#000000");
    const heroBase = mix(primary, "#000000", 0.55);
    const highlight = readable(valid(b.highlight) ? b.highlight.toLowerCase() : mix(accent, "#ffffff", 0.35), heroBase, 4.5, "#ffffff");
    return {
      "--navy": primary,
      "--navy-dark": mix(primary, "#000000", 0.2),
      "--navy-tint": mix(primary, "#ffffff", 0.93),
      "--green": accent,
      "--green-light": highlight,
      "--hero-rgb": rgb(heroBase).join(", "),
      "--focus-ring": `rgba(${rgb(primary).join(", ")}, .12)`,
    };
  }

  function fontStack(font) {
    return `"${font}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  }

  // loads a Google font once (the default one is already in the page)
  function loadFont(font) {
    if (!font || font === DEFAULT_FONT || !/^[A-Za-z0-9 ]{2,40}$/.test(font)) return;
    const id = `font-${font.replace(/ /g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }

  // the logo as a full address (RP's lives on this site)
  function logoUrl(company) {
    const logo = company && company.brand && company.brand.logo;
    if (!logo) return "";
    return /^\//.test(logo) ? new URL(logo, location.origin).href : logo;
  }

  // Applies a company's branding to `el` (default: the whole page): colours, font, and every [data-brand-logo]
  // image and [data-brand-name] text inside it.
  function apply(company, el = document.documentElement) {
    if (!company || !company.brand) return;
    const vars = colors(company.brand);
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
    const font = company.brand.font || DEFAULT_FONT;
    loadFont(font);
    el.style.setProperty("--font", fontStack(font));
    const name = (company.profile && company.profile.shortName) || company.name || "";
    const logo = logoUrl(company);
    el.querySelectorAll("[data-brand-logo]").forEach((img) => {
      if (logo) { img.src = logo; img.hidden = false; } else img.hidden = true;
      img.alt = name;
      img.removeAttribute("width");
      img.removeAttribute("height");
    });
    el.querySelectorAll("[data-brand-name]").forEach((n) => { n.textContent = name; });
    if (el === document.documentElement) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = vars["--navy"];
      const icon = document.querySelector('link[rel="icon"]');
      if (icon && logo) icon.href = logo;
    }
  }

  return { apply, colors, contrast, readable, mix, logoUrl, loadFont, fontStack, DEFAULT_FONT };
})();
