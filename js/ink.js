// RP Industries · admin: handwriting pad for meeting notes. Write with a stylus, finger or mouse on an
// endless page, then convert the writing to text (Gemini reads it) and, after checking it, add it to the notes.
// Loaded after admin.js and minutes.js; uses $, api(), esc(), state, store, render(), findRow() and meetingLine().

const INK_PREFS_KEY = "rp_ink_prefs";
const inkKey = (id) => `rp_ink_${id}`;
const K_MIN = 0.05, K_MAX = 20;         // zoom limits: 5% to 2000%
const MAX_PAGES = 10;                   // images per conversion
const INK_ERRORS = {
  busy: "The sheet is busy. Try again in a moment.",
  too_long: "The notes would be over 10,000 characters. Shorten them first.",
  completed: "This meeting is already complete. Use Edit notes on it instead.",
  cancelled: "This meeting was cancelled.",
  not_found: "This meeting no longer exists. Refresh the list.",
  image_too_large: "There's too much writing to read at once. Convert a smaller part.",
  network: "Couldn't reach the server. Check your connection and try again.",
  // an Apps Script from before the pad treats these calls as bookings
  invalid_slot: "The live Apps Script is an older version without handwriting notes. Paste the new Code.gs into Apps Script and deploy it as a New version.",
  invalid_image: "That page couldn't be read as an image. Try again.",
  too_many_images: "There's too much writing to read at once. Convert a smaller part.",
  no_image: "Write something on the page first.",
  empty: "There's nothing to save.",
};

const PEN_COLORS = ["#1a2233", "#003279", "#1e6fd9", "#c4262e", "#009138", "#e07b00", "#7b3fb5"];
const HL_COLORS = ["#ffe14d", "#a8e57f", "#ff9ec4", "#8fd3ff", "#ffbf73"];
// size: on-screen width in px when drawn (the page keeps it whatever the zoom)
const TOOLS = {
  pen: { label: "Pen", size: 3, min: 1, max: 20, colors: PEN_COLORS },
  pencil: { label: "Pencil", size: 2, min: 1, max: 12, colors: PEN_COLORS, alpha: 0.75 },
  marker: { label: "Marker", size: 7, min: 2, max: 40, colors: PEN_COLORS },
  calligraphy: { label: "Calligraphy pen", size: 6, min: 2, max: 30, colors: PEN_COLORS },
  highlighter: { label: "Highlighter", size: 24, min: 8, max: 64, colors: HL_COLORS, alpha: 0.35 },
  eraser: { label: "Eraser", size: 24, min: 4, max: 80 },
  hand: { label: "Move the page" },
};
const ICONS = {
  pen: '<path d="M4 20l1.2-4.6L15.6 5a2.1 2.1 0 013 3L8.2 18.4z"/><path d="M13.8 6.8l3 3"/>',
  pencil: '<path d="M4 20l1.5-4.5L16 5l3 3L8.5 18.5z"/><path d="M14 7l3 3M5.5 15.5l3 3"/>',
  marker: '<path d="M7 17l-3 4h5l1.5-1.5"/><path d="M7 17l2.5 2.5 9.8-9.8a2 2 0 000-2.8l-.2-.2a2 2 0 00-2.8 0z"/>',
  calligraphy: '<path d="M12 3l5 7-5 11-5-11z"/><path d="M12 13v8M10.5 11.5h3"/>',
  highlighter: '<path d="M4 21h9"/><path d="M7 17l-1.5 1.5L8 21l1.5-1.5"/><path d="M7 17l3 3 10-10-3-3z"/><path d="M13 9l3 3"/>',
  eraser: '<path d="M9 20h11"/><path d="M4.6 15.6l9.2-9.2a2 2 0 012.8 0l2.4 2.4a2 2 0 010 2.8L11 19.6H8.6z"/><path d="M9 11l5 5"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 013 0V12m0-7.5a1.5 1.5 0 013 0V12m0-6a1.5 1.5 0 013 0V15c0 3.5-2.5 6-6 6-2.6 0-4.2-1.3-5.6-3.5L4.2 14a1.5 1.5 0 012.5-1.6L8 14"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

const ink = {
  row: null, source: null, mode: "",
  strokes: [], undo: [], redo: [],
  view: { x: 40, y: 40, k: 1 },
  prefs: Object.assign({ tool: "pen", finger: true, tools: {} }, ls.get(INK_PREFS_KEY) || {}),
  pointers: new Map(), live: null, erasing: null, pan: null, hover: null, space: false,
  pending: [], notesLoaded: "", saveTimer: 0, raf: 0, baseDirty: true, w: 0, h: 0, dpr: 1,
};
const canvas = $("#inkCanvas");
const ctx = canvas.getContext("2d");
const base = document.createElement("canvas"); // the page without the stroke being drawn
const bctx = base.getContext("2d");

const toolPrefs = (t = ink.prefs.tool) => {
  const def = TOOLS[t];
  ink.prefs.tools[t] = Object.assign({ size: def.size, color: def.colors ? def.colors[0] : "" }, ink.prefs.tools[t] || {});
  return ink.prefs.tools[t];
};
const savePrefs = () => ls.set(INK_PREFS_KEY, ink.prefs);

// ---------- toolbar ----------
function renderTools() {
  const t = ink.prefs.tool;
  const p = TOOLS[t].size ? toolPrefs(t) : null;
  $("#inkTools").innerHTML = Object.keys(TOOLS).map((k) =>
    `<button type="button" class="ink__btn" data-tool="${k}" aria-pressed="${k === t}" title="${TOOLS[k].label}" aria-label="${TOOLS[k].label}">${icon(k)}</button>`).join("");
  const colors = TOOLS[t].colors;
  $("#inkColors").hidden = !colors && t !== "eraser";
  if (t === "eraser") { // erase just where it passes (like a real eraser), or whole strokes at a touch
    const whole = p.mode === "stroke";
    $("#inkColors").innerHTML = `<div class="ink__modes" role="group" aria-label="Eraser">
      <button type="button" class="ink__mode" data-emode="area" aria-pressed="${!whole}">Erase part</button>
      <button type="button" class="ink__mode" data-emode="stroke" aria-pressed="${whole}">Whole stroke</button></div>`;
  } else if (colors) {
    const custom = !colors.includes(p.color);
    $("#inkColors").innerHTML = colors.map((c) =>
      `<button type="button" class="ink__swatch" data-color="${c}" style="--c:${c}" aria-pressed="${c === p.color}" aria-label="Colour ${c}"></button>`).join("") +
      `<label class="ink__swatch ink__swatch--custom" title="Other colour" aria-pressed="${custom}" style="--c:${custom ? p.color : "#fff"}">
        <input type="color" id="inkCustom" value="${custom ? p.color : "#5b6b85"}" aria-label="Other colour"></label>`;
  }
  $("#inkSizeWrap").hidden = !p;
  if (p) {
    const s = $("#inkSize");
    s.min = TOOLS[t].min; s.max = TOOLS[t].max; s.value = p.size;
    sizeDot();
  }
  $("#inkFinger").setAttribute("aria-pressed", String(ink.prefs.finger));
  canvas.dataset.tool = t;
}
function sizeDot() {
  const t = ink.prefs.tool, p = toolPrefs(t);
  const d = Math.min(28, Math.max(3, p.size));
  const dot = $("#inkSizeDot");
  dot.style.width = dot.style.height = `${d}px`;
  dot.style.background = t === "eraser" ? "transparent" : p.color;
  dot.style.opacity = TOOLS[t].alpha || 1;
  dot.classList.toggle("is-ring", t === "eraser");
  $("#inkSizeVal").textContent = p.size;
}
$("#inkTools").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tool]");
  if (!b) return;
  ink.prefs.tool = b.dataset.tool;
  savePrefs();
  renderTools();
  frame();
});
$("#inkColors").addEventListener("click", (e) => {
  const m = e.target.closest("[data-emode]");
  if (m) { toolPrefs("eraser").mode = m.dataset.emode; savePrefs(); return renderTools(); }
  const b = e.target.closest("[data-color]");
  if (!b) return;
  toolPrefs().color = b.dataset.color;
  savePrefs();
  renderTools();
});
$("#inkColors").addEventListener("input", (e) => {
  if (e.target.id !== "inkCustom") return;
  toolPrefs().color = e.target.value;
  e.target.parentElement.style.setProperty("--c", e.target.value);
  sizeDot();
});
$("#inkColors").addEventListener("change", (e) => { if (e.target.id === "inkCustom") { savePrefs(); renderTools(); } });
$("#inkSize").addEventListener("input", (e) => { toolPrefs().size = Number(e.target.value); sizeDot(); });
$("#inkSize").addEventListener("change", savePrefs);
$("#inkFinger").addEventListener("click", () => {
  ink.prefs.finger = !ink.prefs.finger;
  savePrefs();
  renderTools();
  inkStatus(ink.prefs.finger ? "One finger writes. Two fingers move and zoom." : "Fingers move and zoom the page. Write with the pen.");
});
$("#inkUndo").addEventListener("click", () => step(ink.undo, ink.redo));
$("#inkRedo").addEventListener("click", () => step(ink.redo, ink.undo));
$("#inkClear").addEventListener("click", () => {
  if (!ink.strokes.length || !confirm("Clear the whole page? You can undo this.")) return;
  ink.undo.push({ type: "swap", before: ink.strokes.slice(), after: [] });
  ink.redo = [];
  ink.strokes = [];
  changed();
});
$("#inkZoomIn").addEventListener("click", () => zoomAt(ink.w / 2, ink.h / 2, 1.25));
$("#inkZoomOut").addEventListener("click", () => zoomAt(ink.w / 2, ink.h / 2, 0.8));
$("#inkZoomReset").addEventListener("click", () => zoomAt(ink.w / 2, ink.h / 2, 1 / ink.view.k));
$("#inkFit").addEventListener("click", fit);

function updateButtons() {
  $("#inkUndo").disabled = !ink.undo.length;
  $("#inkRedo").disabled = !ink.redo.length;
  $("#inkClear").disabled = !ink.strokes.length;
  const fresh = ink.strokes.some((s) => !s.cv && s.t !== "highlighter");
  $("#inkConvert").textContent = fresh || !ink.strokes.length ? "Convert to text" : "Convert again";
}

// ---------- geometry ----------
const toWorld = (x, y) => [(x - ink.view.x) / ink.view.k, (y - ink.view.y) / ink.view.k];
function local(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
function bbox(s) {
  const p = s.p;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i] < x0) x0 = p[i];
    if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < y0) y0 = p[i + 1];
    if (p[i + 1] > y1) y1 = p[i + 1];
  }
  const m = s.w;
  s.b = [x0 - m, y0 - m, x1 + m, y1 + m];
  return s.b;
}
function zoomAt(sx, sy, f) {
  const v = ink.view;
  const k = Math.min(K_MAX, Math.max(K_MIN, v.k * f));
  const [wx, wy] = toWorld(sx, sy);
  v.k = k;
  v.x = sx - wx * k;
  v.y = sy - wy * k;
  moved();
}
function fit() {
  const v = ink.view;
  if (!ink.strokes.length) { Object.assign(v, { x: 40, y: 40, k: 1 }); return moved(); }
  const b = ink.strokes.reduce((a, s) => [Math.min(a[0], s.b[0]), Math.min(a[1], s.b[1]), Math.max(a[2], s.b[2]), Math.max(a[3], s.b[3])],
    [Infinity, Infinity, -Infinity, -Infinity]);
  const pad = 48;
  const k = Math.min(2, Math.max(K_MIN, Math.min((ink.w - pad * 2) / (b[2] - b[0] || 1), (ink.h - pad * 2) / (b[3] - b[1] || 1))));
  v.k = k;
  v.x = (ink.w - (b[2] - b[0]) * k) / 2 - b[0] * k;
  v.y = (ink.h - (b[3] - b[1]) * k) / 2 - b[1] * k;
  moved();
}
// distance from point p to segment ab
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ---------- drawing ----------
// pen: thicker with more pressure; calligraphy: thick across, thin along a 45° nib
function segWidth(s, i, x0, y0, x1, y1) {
  if (s.t === "calligraphy") {
    const a = Math.atan2(y1 - y0, x1 - x0);
    return s.w * (0.25 + 0.9 * Math.abs(Math.sin(a - Math.PI / 4)));
  }
  return s.w * (0.4 + 1.2 * s.p[i * 3 + 2]);
}
function drawStroke(c, s, minW = 0) {
  const p = s.p, n = p.length / 3;
  c.globalAlpha = TOOLS[s.t].alpha || 1;
  c.strokeStyle = c.fillStyle = s.c;
  c.lineJoin = "round";
  c.lineCap = s.t === "highlighter" ? "butt" : "round";
  if (n === 1) { // a dot
    c.beginPath();
    c.arc(p[0], p[1], Math.max(s.w, minW) / 2, 0, Math.PI * 2);
    c.fill();
  } else if (s.t === "pen" || s.t === "calligraphy") {
    // each piece gets its own width; smoothed through the midpoints
    let px = p[0], py = p[1];
    for (let i = 1; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1];
      const last = i === n - 1;
      const mx = last ? x : (x + p[i * 3 + 3]) / 2, my = last ? y : (y + p[i * 3 + 4]) / 2;
      c.beginPath();
      c.moveTo(px, py);
      c.quadraticCurveTo(x, y, mx, my);
      c.lineWidth = Math.max(minW, segWidth(s, i, p[i * 3 - 3], p[i * 3 - 2], x, y));
      c.stroke();
      px = mx; py = my;
    }
  } else {
    c.beginPath();
    c.moveTo(p[0], p[1]);
    for (let i = 1; i < n - 1; i++) c.quadraticCurveTo(p[i * 3], p[i * 3 + 1], (p[i * 3] + p[i * 3 + 3]) / 2, (p[i * 3 + 1] + p[i * 3 + 4]) / 2);
    c.lineTo(p[n * 3 - 3], p[n * 3 - 2]);
    c.lineWidth = Math.max(minW, s.w);
    c.stroke();
  }
  c.globalAlpha = 1;
}

function buildBase() {
  ink.baseDirty = false;
  const { dpr, w, h, view: v } = ink;
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bctx.fillStyle = "#fff";
  bctx.fillRect(0, 0, w, h);
  // dot grid that thins out as you zoom out
  let sp = 32 * v.k;
  while (sp < 16) sp *= 4;
  bctx.fillStyle = "#cfd6e2";
  const ox = ((v.x % sp) + sp) % sp, oy = ((v.y % sp) + sp) % sp;
  for (let x = ox; x < w; x += sp) for (let y = oy; y < h; y += sp) bctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
  // strokes on screen; highlights under the writing
  bctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
  const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(w, h);
  const seen = ink.strokes.filter((s) => s.b[2] >= x0 && s.b[0] <= x1 && s.b[3] >= y0 && s.b[1] <= y1);
  seen.forEach((s) => { if (s.t === "highlighter") drawStroke(bctx, s); });
  seen.forEach((s) => { if (s.t !== "highlighter") drawStroke(bctx, s); });
}

function frame() {
  if (ink.raf) return;
  ink.raf = requestAnimationFrame(() => {
    ink.raf = 0;
    if (!ink.w) return;
    if (ink.baseDirty) buildBase();
    const { dpr, view: v } = ink;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    if (ink.live) {
      ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
      drawStroke(ctx, ink.live);
    }
    if (ink.hover && ink.prefs.tool === "eraser") { // eraser outline
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(ink.hover[0], ink.hover[1], toolPrefs("eraser").size / 2, 0, Math.PI * 2);
      ctx.strokeStyle = "#667085";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    $("#inkZoomReset").textContent = `${Math.round(v.k * 100)}%`;
  });
}
const moved = () => { ink.baseDirty = true; frame(); saveSoon(); };
function changed() {
  ink.baseDirty = true;
  frame();
  updateButtons();
  saveSoon();
}

function resize() {
  const r = $("#inkStage").getBoundingClientRect();
  ink.dpr = Math.min(window.devicePixelRatio || 1, 3);
  ink.w = r.width;
  ink.h = r.height;
  canvas.width = base.width = Math.round(r.width * ink.dpr);
  canvas.height = base.height = Math.round(r.height * ink.dpr);
  ink.baseDirty = true;
  frame();
}
new ResizeObserver(() => { if ($("#inkDialog").open) resize(); }).observe($("#inkStage"));

// ---------- input ----------
// Pen and mouse write; fingers write too until a pen is used, then they only move and zoom (palm rejection).
canvas.addEventListener("pointerdown", (e) => {
  const [x, y] = local(e);
  if (e.pointerType === "touch" && ink.live && ink.live.ptype === "pen") return; // palm on the screen
  if (e.pointerType === "pen" && ink.prefs.finger && !ink.prefs.penSeen) {
    ink.prefs.finger = false;
    ink.prefs.penSeen = true;
    savePrefs();
    renderTools();
    inkStatus("Pen found: fingers now move and zoom the page. Tap the finger button to write with a finger.");
  }
  ink.pointers.set(e.pointerId, { x, y, type: e.pointerType });
  try { canvas.setPointerCapture(e.pointerId); } catch {} // keeps the stroke going when the pen leaves the page
  const touches = [...ink.pointers.entries()].filter(([, p]) => p.type === "touch");

  if (e.pointerType === "touch" && touches.length >= 2) { // two fingers: pinch to zoom, drag to move
    if (ink.live && ink.live.ptype === "touch") {
      // the first finger started a stroke a moment ago: that was the start of a pinch
      if (ink.live.p.length < 24 || performance.now() - ink.live.at < 250) ink.live = null;
      else commit();
    }
    if (ink.erasing) endErase();
    const [[a, pa], [b, pb]] = touches;
    const cx = (pa.x + pb.x) / 2, cy = (pa.y + pb.y) / 2;
    ink.pan = { ids: [a, b], dist: Math.hypot(pa.x - pb.x, pa.y - pb.y) || 1, k: ink.view.k, world: toWorld(cx, cy) };
    frame();
    return;
  }
  if (ink.live || ink.erasing || ink.pan) return; // one thing at a time

  const tool = ink.prefs.tool;
  if (tool === "hand" || ink.space || e.button === 1 || (e.pointerType === "touch" && !ink.prefs.finger)) {
    ink.pan = { id: e.pointerId, sx: x, sy: y, vx: ink.view.x, vy: ink.view.y };
    canvas.classList.add("is-panning");
    return;
  }
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (tool === "eraser" || e.button === 5 || (e.buttons & 32)) { // the eraser, or a pen's eraser end
    ink.erasing = { id: e.pointerId, last: [x, y], before: ink.strokes.slice(), changed: false };
    eraseTo(x, y);
    return;
  }
  const p = toolPrefs(tool);
  ink.live = { t: tool, c: p.color, w: p.size / ink.view.k, p: [], id: e.pointerId, ptype: e.pointerType, at: performance.now(), pr: 0.5 };
  addPoint(ink.live, x, y, e);
  frame();
});

canvas.addEventListener("pointermove", (e) => {
  const [x, y] = local(e);
  ink.hover = e.pointerType === "touch" ? null : [x, y];
  const ptr = ink.pointers.get(e.pointerId);
  if (!ptr) { if (ink.prefs.tool === "eraser") frame(); return; }
  ptr.x = x; ptr.y = y;
  const pan = ink.pan;
  if (pan && pan.ids && pan.ids.includes(e.pointerId)) {
    const a = ink.pointers.get(pan.ids[0]), b = ink.pointers.get(pan.ids[1]);
    if (!a || !b) return;
    const v = ink.view;
    v.k = Math.min(K_MAX, Math.max(K_MIN, pan.k * Math.hypot(a.x - b.x, a.y - b.y) / pan.dist));
    v.x = (a.x + b.x) / 2 - pan.world[0] * v.k;
    v.y = (a.y + b.y) / 2 - pan.world[1] * v.k;
    return moved();
  }
  if (pan && pan.id === e.pointerId) {
    ink.view.x = pan.vx + x - pan.sx;
    ink.view.y = pan.vy + y - pan.sy;
    return moved();
  }
  if (ink.live && ink.live.id === e.pointerId) {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    (evs.length ? evs : [e]).forEach((ev) => { const [cx, cy] = local(ev); addPoint(ink.live, cx, cy, ev); });
    return frame();
  }
  if (ink.erasing && ink.erasing.id === e.pointerId) eraseTo(x, y);
  frame();
});

function pointerEnd(e) {
  ink.pointers.delete(e.pointerId);
  const pan = ink.pan;
  if (pan && (pan.id === e.pointerId || (pan.ids && pan.ids.includes(e.pointerId)))) {
    ink.pan = null;
    canvas.classList.remove("is-panning");
  }
  if (ink.live && ink.live.id === e.pointerId) commit();
  if (ink.erasing && ink.erasing.id === e.pointerId) endErase();
  if (e.pointerType === "touch") ink.hover = null;
  frame();
}
canvas.addEventListener("pointerup", pointerEnd);
canvas.addEventListener("pointercancel", pointerEnd);
canvas.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch" && !ink.pointers.has(e.pointerId)) { ink.hover = null; frame(); } });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// trackpad pinch (sent as ctrl + wheel) or ctrl + wheel zooms; scrolling moves the page
$("#inkStage").addEventListener("wheel", (e) => {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? ink.h : 1;
  const [x, y] = local(e);
  if (e.ctrlKey || e.metaKey) return zoomAt(x, y, Math.exp(-e.deltaY * unit * 0.01));
  ink.view.x -= (e.shiftKey ? e.deltaY : e.deltaX) * unit;
  ink.view.y -= (e.shiftKey ? 0 : e.deltaY) * unit;
  moved();
}, { passive: false });
// Safari's own page pinch would fight the pad's
["gesturestart", "gesturechange"].forEach((n) => $("#inkDialog").addEventListener(n, (e) => e.preventDefault()));

function addPoint(s, x, y, e) {
  const [wx, wy] = toWorld(x, y);
  const p = s.p, n = p.length;
  // pen pressure, smoothed; mouse and fingers have none, so they draw at the chosen size
  const raw = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
  s.pr = n ? s.pr * 0.6 + raw * 0.4 : raw;
  if (n && Math.hypot(wx - p[n - 3], wy - p[n - 2]) * ink.view.k < 0.8) { p[n - 1] = s.pr; return; } // too close to the last point
  p.push(wx, wy, s.pr);
}

function commit() {
  const s = ink.live;
  ink.live = null;
  if (!s || !s.p.length) return;
  const stroke = { t: s.t, c: s.c, w: s.w, p: s.p, cv: 0 };
  bbox(stroke);
  ink.strokes.push(stroke);
  ink.undo.push({ type: "add", items: [stroke] });
  ink.redo = [];
  changed();
}

// The eraser's path from the last point to (x, y). "Erase part" cuts the ink it passes over, splitting
// strokes into the pieces left either side; "Whole stroke" removes every stroke it touches.
function eraseTo(x, y) {
  const er = ink.erasing;
  const [ax, ay] = toWorld(er.last[0], er.last[1]), [bx, by] = toWorld(x, y);
  er.last = [x, y];
  const ep = toolPrefs("eraser");
  const r = ep.size / 2 / ink.view.k;
  const out = [];
  let hit = false;
  ink.strokes.forEach((s) => {
    const m = r + s.w / 2;
    if (s.b[2] < Math.min(ax, bx) - m || s.b[0] > Math.max(ax, bx) + m || s.b[3] < Math.min(ay, by) - m || s.b[1] > Math.max(ay, by) + m) return out.push(s);
    if (ep.mode === "stroke") {
      const p = s.p;
      for (let j = 0; j < p.length; j += 3) {
        const cx = p[j], cy = p[j + 1];
        const nx = j + 3 < p.length ? p[j + 3] : cx, ny = j + 3 < p.length ? p[j + 4] : cy;
        // the eraser's path against this piece of the stroke
        if (segDist(cx, cy, ax, ay, bx, by) < m || segDist(ax, ay, cx, cy, nx, ny) < m || segDist(bx, by, cx, cy, nx, ny) < m) { hit = true; return; }
      }
      return out.push(s);
    }
    // points closer together than the eraser, so the cut lands where the eraser is
    const p = densify(s.p, Math.max(r / 3, 0.3 / ink.view.k));
    const cut = r + s.w / 4;
    const pieces = [];
    let run = [];
    for (let j = 0; j < p.length; j += 3) {
      if (segDist(p[j], p[j + 1], ax, ay, bx, by) < cut) { if (run.length) pieces.push(run); run = []; }
      else run.push(p[j], p[j + 1], p[j + 2]);
    }
    if (run.length) pieces.push(run);
    if (pieces.length === 1 && pieces[0].length === p.length) return out.push(s); // near it, but untouched
    hit = true;
    // what's left, in the stroke's place; specks of a single point are dropped
    pieces.filter((q) => q.length >= 6).forEach((q) => { const n = { t: s.t, c: s.c, w: s.w, p: q, cv: s.cv }; bbox(n); out.push(n); });
  });
  if (hit) {
    ink.strokes = out;
    er.changed = true;
    ink.baseDirty = true;
  }
}
// adds points along long gaps (fast strokes have few points), with the pressure in between
function densify(p, step) {
  const out = [p[0], p[1], p[2]];
  for (let j = 3; j < p.length; j += 3) {
    const n = Math.min(200, Math.floor(Math.hypot(p[j] - p[j - 3], p[j + 1] - p[j - 2]) / step));
    for (let i = 1; i < n; i++) {
      const f = i / n;
      out.push(p[j - 3] + (p[j] - p[j - 3]) * f, p[j - 2] + (p[j + 1] - p[j - 2]) * f, p[j - 1] + (p[j + 2] - p[j - 1]) * f);
    }
    out.push(p[j], p[j + 1], p[j + 2]);
  }
  return out;
}
function endErase() {
  const er = ink.erasing;
  ink.erasing = null;
  if (!er.changed) return;
  ink.undo.push({ type: "swap", before: er.before, after: ink.strokes.slice() });
  ink.redo = [];
  changed();
}

// undo (from undo to redo) and redo (the other way round). History is a straight line, so
// the page is exactly as each step left it: "swap" (eraser, clear) can restore whole lists.
function step(from, to) {
  const a = from.pop();
  if (!a) return;
  const undoing = from === ink.undo;
  if (a.type === "swap") ink.strokes = (undoing ? a.before : a.after).slice();
  else if (undoing) ink.strokes = ink.strokes.filter((s) => !a.items.includes(s));
  else ink.strokes.push(...a.items);
  to.push(a);
  changed();
}

// ---------- keyboard ----------
$("#inkDialog").addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); step(e.shiftKey ? ink.redo : ink.undo, e.shiftKey ? ink.undo : ink.redo); }
  else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); step(ink.redo, ink.undo); }
  else if (e.key === " " && !e.repeat) { e.preventDefault(); ink.space = true; canvas.classList.add("is-grab"); }
  else if (!mod && (e.key === "+" || e.key === "=")) zoomAt(ink.w / 2, ink.h / 2, 1.25);
  else if (!mod && e.key === "-") zoomAt(ink.w / 2, ink.h / 2, 0.8);
  else if (!mod && e.key === "0") fit();
});
$("#inkDialog").addEventListener("keyup", (e) => {
  if (e.key === " ") { ink.space = false; canvas.classList.remove("is-grab"); }
});

// ---------- saved on this device ----------
function saveSoon() {
  clearTimeout(ink.saveTimer);
  ink.saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  clearTimeout(ink.saveTimer);
  if (!ink.row) return;
  const r1 = (n) => Math.round(n * 10) / 10;
  const data = {
    v: 1, view: ink.view,
    strokes: ink.strokes.map((s) => ({ t: s.t, c: s.c, w: Math.round(s.w * 1000) / 1000, cv: s.cv, p: s.p.map((n, i) => (i % 3 === 2 ? Math.round(n * 100) / 100 : r1(n))) })),
  };
  if (!ink.strokes.length) { try { localStorage.removeItem(inkKey(ink.row.id)); } catch {} return; }
  if (!ls.set(inkKey(ink.row.id), data)) inkStatus("This device's storage is full, so the page can't be kept after you close it. Convert your writing to text.", true);
}
function loadInk(id) {
  const d = ls.get(inkKey(id));
  ink.strokes = d && Array.isArray(d.strokes)
    ? d.strokes.filter((s) => TOOLS[s.t] && Array.isArray(s.p) && s.p.length >= 3).map((s) => { const x = { t: s.t, c: s.c, w: s.w, p: s.p, cv: s.cv ? 1 : 0 }; bbox(x); return x; })
    : [];
  ink.view = d && d.view ? { x: d.view.x, y: d.view.y, k: d.view.k } : { x: 40, y: 40, k: 1 };
  ink.undo = [];
  ink.redo = [];
}

let statusTimer = 0;
function inkStatus(text, sticky) {
  const el = $("#inkStatus");
  el.textContent = text;
  el.hidden = !text;
  clearTimeout(statusTimer);
  if (text && !sticky) statusTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

// ---------- open and close ----------
// mode "meeting": notes for a meeting still going on, saved to the sheet.
// mode "dialog": opened from the Mark complete / Edit notes pop-up, text goes into its notes box.
function openInk(id, mode = "meeting") {
  const row = findRow(id);
  if (!row) return;
  ink.row = row;
  ink.mode = mode;
  ink.source = mode === "dialog" ? dialogSource() : meetingSource(row);
  ink.pending = [];
  ink.notesLoaded = null;
  loadInk(id);
  $("#inkWho").textContent = meetingLine(row);
  showPanel("");
  inkStatus(ink.strokes.length ? "" : ink.prefs.finger
    ? "Write with a pen, finger or mouse. Two fingers move and zoom."
    : "Write with the pen. Fingers move and zoom the page.");
  renderTools();
  updateButtons();
  $("#inkDialog").showModal();
  resize();
}

function closeInk() {
  if (!$("#inkReview").hidden && $("#inkText").value.trim() && !confirm("The converted text hasn't been added to the notes. Close anyway?")) return;
  if (notesDirty() && !confirm("Your changes to the notes aren't saved. Close anyway?")) return;
  saveNow();
  ink.live = ink.erasing = ink.pan = null;
  ink.pointers.clear();
  $("#inkDialog").close();
  if (ink.mode === "dialog") $("#notesInput").focus();
}
$("#inkClose").addEventListener("click", closeInk);
$("#inkDialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  if (!$("#inkPanel").hidden && !$("#inkDialog").classList.contains("is-busy")) return closePanel();
  closeInk();
});
window.addEventListener("pagehide", () => { if ($("#inkDialog").open) saveNow(); });

// where the notes live
function dialogSource() {
  const box = $("#notesInput");
  return {
    load: async () => box.value,
    save: async (text) => { if (text.length > 10000) throw new Error("too_long"); box.value = text; return text; },
    append: async (text) => {
      const v = (box.value.trim() ? box.value.trim() + "\n\n" : "") + text;
      if (v.length > 10000) throw new Error("too_long");
      box.value = v;
      return v;
    },
  };
}
function meetingSource(row) {
  const call = async (data) => {
    let r;
    try { r = await api("saveNotes", { token: store.get(TOKEN_KEY), id: row.id, ...data }); } catch (ex) { throw new Error(ex.message === "auth" ? "auth" : "network"); }
    if (!r.ok) throw new Error(r.error);
    row.minutes = r.minutes;
    render();
    return r.notes;
  };
  return {
    load: async () => {
      let r;
      try { r = await api("record", { token: store.get(TOKEN_KEY), id: row.id }); } catch (ex) { throw new Error(ex.message === "auth" ? "auth" : "network"); }
      if (!r.ok) throw new Error(r.error);
      return (r.record && r.record.notes) || "";
    },
    save: (notes) => call({ notes }),
    append: (append) => call({ append }),
  };
}
// known codes get their message; Gemini's own errors are shown as they are; anything else names its code
const inkError = (ex) => INK_ERRORS[ex.message] ||
  (ex.message && ex.message.length > 30 ? ex.message : `Something went wrong (${ex.message || "unknown error"}). Try again.`);

// ---------- side panel: converted text, and the notes ----------
function showPanel(which) {
  $("#inkPanel").hidden = !which;
  $("#inkReview").hidden = which !== "review";
  $("#inkNotes").hidden = which !== "notes";
  $("#inkPanelTitle").textContent = which === "review" ? "Converted text" : ink.mode === "dialog" ? "Notes" : "Meeting notes";
  $("#inkNotesBtn").setAttribute("aria-pressed", String(which === "notes"));
}
function closePanel() {
  if (!$("#inkReview").hidden && $("#inkText").value.trim() && !confirm("Discard the converted text?")) return;
  if (!$("#inkNotes").hidden && notesDirty() && !confirm("Your changes to the notes aren't saved. Close them anyway?")) return;
  ink.pending = [];
  showPanel("");
}
$("#inkPanelClose").addEventListener("click", closePanel);
$("#inkDiscard").addEventListener("click", () => { $("#inkText").value = ""; closePanel(); });

const notesDirty = () => !$("#inkNotes").hidden && ink.notesLoaded !== null && $("#inkNotesText").value !== ink.notesLoaded;

async function openNotes(note) {
  showPanel("notes");
  const box = $("#inkNotesText");
  $("#inkNotesErr").hidden = true;
  $("#inkNotesState").textContent = note || "";
  if (ink.notesLoaded === null) {
    box.value = "";
    box.disabled = true;
    box.placeholder = "Loading…";
    const row = ink.row;
    try {
      const notes = await ink.source.load();
      if (ink.row !== row || !$("#inkDialog").open) return; // the pad moved on meanwhile
      ink.notesLoaded = notes;
      box.value = notes;
    } catch (ex) {
      $("#inkNotesErr").textContent = inkError(ex);
      $("#inkNotesErr").hidden = false;
    }
    box.disabled = false;
    box.placeholder = "Type notes here, or write on the page and convert it.";
  }
  box.scrollTop = box.scrollHeight;
}
$("#inkNotesBtn").addEventListener("click", () => {
  if (!$("#inkNotes").hidden) return closePanel();
  if (!$("#inkReview").hidden && $("#inkText").value.trim() && !confirm("Discard the converted text?")) return;
  openNotes();
});
$("#inkNotesText").addEventListener("input", () => { $("#inkNotesState").textContent = notesDirty() ? "Not saved" : ""; });
$("#inkNotesSave").addEventListener("click", async () => {
  const btn = $("#inkNotesSave");
  btn.disabled = true;
  $("#inkNotesErr").hidden = true;
  try {
    ink.notesLoaded = await ink.source.save($("#inkNotesText").value.trim());
    $("#inkNotesText").value = ink.notesLoaded;
    $("#inkNotesState").textContent = ink.mode === "dialog" ? "Saved to the notes" : "Saved";
  } catch (ex) {
    if (ex.message === "auth") return $("#inkDialog").close();
    $("#inkNotesErr").textContent = inkError(ex);
    $("#inkNotesErr").hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// ---------- convert to text ----------
// Groups strokes into bands down the page so a big page becomes several readable images,
// without cutting through any stroke.
function bands(strokes) {
  const H = 1400; // tallest band, in page units
  const sorted = strokes.slice().sort((a, b) => a.b[1] - b.b[1]);
  const out = [];
  sorted.forEach((s) => {
    const cur = out[out.length - 1];
    if (cur && s.b[3] - cur.b[1] <= H) {
      cur.strokes.push(s);
      cur.b = [Math.min(cur.b[0], s.b[0]), cur.b[1], Math.max(cur.b[2], s.b[2]), Math.max(cur.b[3], s.b[3])];
    } else out.push({ strokes: [s], b: s.b.slice() });
  });
  return out;
}
function bandImage(band) {
  const pad = 24;
  const [x0, y0, x1, y1] = [band.b[0] - pad, band.b[1] - pad, band.b[2] + pad, band.b[3] + pad];
  const k = Math.min(2, 2400 / Math.max(x1 - x0, y1 - y0)); // page units to pixels: sharp, never huge
  const c = document.createElement("canvas");
  c.width = Math.max(32, Math.ceil((x1 - x0) * k));
  c.height = Math.max(32, Math.ceil((y1 - y0) * k));
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  band.strokes.forEach((s) => drawStroke(g, s, 1.6 / k)); // thin lines stay at least 1.6 px
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}

$("#inkConvert").addEventListener("click", convert);
$("#inkRetry").addEventListener("click", () => convert(true));
async function convert(retry) {
  const writing = ink.strokes.filter((s) => s.t !== "highlighter");
  let todo = retry === true && ink.pending.length ? ink.pending : writing.filter((s) => !s.cv);
  if (!writing.length) return inkStatus("Write something on the page first.");
  if (!todo.length) {
    if (!confirm("Everything on the page has been converted already. Convert all of it again?")) return;
    todo = writing;
  }
  if (notesDirty() && !confirm("Your changes to the notes aren't saved. Continue anyway?")) return;
  const all = bands(todo);
  const use = all.slice(0, MAX_PAGES);
  ink.pending = use.flatMap((b) => b.strokes);

  showPanel("review");
  const dlg = $("#inkDialog");
  dlg.classList.add("is-busy");
  $("#inkReading").hidden = false;
  $("#inkReviewBody").hidden = true;
  $("#inkErr").hidden = true;
  $("#inkConvert").disabled = true;
  try {
    const images = [];
    for (const b of use) images.push({ mime: "image/png", data: await toBase64(await bandImage(b)) }); // toBase64: js/minutes.js
    let r;
    try { r = await api("readHandwriting", { token: store.get(TOKEN_KEY), id: ink.row.id, images }); } catch (ex) { throw new Error(ex.message === "auth" ? "auth" : "network"); }
    if (!r.ok) throw new Error(r.error);
    $("#inkText").value = r.text;
    $("#inkReviewHint").textContent = r.text
      ? (all.length > use.length ? "This is the first part of the page. Convert again for the rest. " : "") +
        "Check the text and fix anything misread. Nothing is added until you press Add to notes."
      : "No handwriting was found. Write on the page and convert again.";
    $("#inkAdd").disabled = !r.text;
  } catch (ex) {
    if (ex.message === "auth") { dlg.classList.remove("is-busy"); return dlg.close(); }
    $("#inkText").value = "";
    $("#inkReviewHint").textContent = "";
    $("#inkErr").textContent = inkError(ex);
    $("#inkErr").hidden = false;
    $("#inkAdd").disabled = true;
  } finally {
    dlg.classList.remove("is-busy");
    $("#inkReading").hidden = true;
    $("#inkReviewBody").hidden = false;
    $("#inkConvert").disabled = false;
  }
  $("#inkText").focus();
}

$("#inkAdd").addEventListener("click", async () => {
  const text = $("#inkText").value.trim();
  if (!text) return;
  const btn = $("#inkAdd");
  btn.disabled = true;
  btn.textContent = "Adding…";
  $("#inkErr").hidden = true;
  try {
    const notes = await ink.source.append(text);
    ink.pending.forEach((s) => { s.cv = 1; });
    ink.pending = [];
    ink.notesLoaded = notes;
    $("#inkNotesText").value = notes;
    $("#inkText").value = "";
    updateButtons();
    saveNow();
    openNotes(ink.mode === "dialog" ? "Added to the notes" : "Added to the meeting notes");
  } catch (ex) {
    if (ex.message === "auth") return $("#inkDialog").close();
    $("#inkErr").textContent = inkError(ex);
    $("#inkErr").hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Add to notes";
  }
});

// ---------- entry points ----------
document.addEventListener("click", (e) => {
  const b = e.target.closest('button[data-act="take-notes"]');
  if (b) openInk(b.dataset.id, "meeting");
});
$("#handBtn").addEventListener("click", () => { if (current) openInk(current.id, "dialog"); }); // current: js/minutes.js
