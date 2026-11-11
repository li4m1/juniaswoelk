/* =====================================================================
   Junias Wölk — behaviour

   No libraries. One requestAnimationFrame loop drives everything that
   moves continuously (the table, the reticle, the cursor); one-off
   transitions use the Web Animations API.

   0  Data & helpers        5  Series & context title
   1  The loop              6  Viewer
   2  The table             7  Info sheet
   3  Reticle               8  Routing
   4  Cursor                9  Intro & boot

   URL switches for testing:  ?nointro  skips the intro,
                              ?debug    exposes internals on window.__jw
   ===================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     0  Data & helpers
     ------------------------------------------------------------------ */

  const SITE = window.JW_SITE || {};
  const SERIES = (window.JW_SERIES || []).map((s, index) => ({ ...s, index, photos: [] }));
  const seriesById = new Map(SERIES.map((s) => [s.id, s]));

  (window.JW_PHOTOS || []).forEach((raw) => {
    const s = seriesById.get(raw.series);
    if (s && raw.w && raw.h) s.photos.push({ ...raw, ar: raw.w / raw.h, s, n: s.photos.length });
  });

  /* Viewing order: series by series, in the photographer's sequence. */
  const PHOTOS = SERIES.flatMap((s) => s.photos);
  PHOTOS.forEach((p, i) => { p.i = i; });
  const photoById = new Map(PHOTOS.map((p) => [p.id, p]));

  const file = (p, size) => `images/${p.id}-${size}.jpg`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const mod = (n, m) => ((n % m) + m) % m;
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Frame-rate independent approach to a target: tau is the time constant in seconds. */
  const damp = (current, target, tau, dt) => target + (current - target) * Math.exp(-dt / tau);

  const EASE_OUT = 'cubic-bezier(0.19, 1, 0.22, 1)';
  const EASE_IO = 'cubic-bezier(0.65, 0, 0.35, 1)';
  const EASE_DEAL = 'cubic-bezier(0.87, 0, 0.13, 1)';

  const html = document.documentElement;
  const params = new URLSearchParams(location.search);
  const mqStill = matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
  const still = () => mqStill.matches;

  const state = { booting: true, series: null };
  const pointer = { x: -1, y: -1, inside: false };

  /* Is this a reload, a Back, or an arrival from one of the site's own pages?
     Read from the navigation itself — so nothing has to be stored on the
     visitor's device (no cookies, no storage, no consent banner). */
  function isReturning() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.type !== 'navigate') return true;
      return location.protocol !== 'file:' && !!document.referrer && new URL(document.referrer).origin === location.origin;
    } catch (e) { return false; }
  }

  /* Text never fades in place: the old line leaves upward as the new one rises. */
  function rollTo(roll, markup) {
    const previous = Array.from(roll.children);
    const next = document.createElement('span');
    next.className = 'roll-in';
    next.innerHTML = markup;
    roll.appendChild(next);

    const old = previous.pop();
    previous.forEach((el) => el.remove());
    if (!old) return;
    if (still()) { old.remove(); return; }

    old.getAnimations().forEach((a) => a.cancel());
    old.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-112%)' }],
      { duration: 700, easing: EASE_IO, fill: 'forwards' })
      .finished.then(() => old.remove(), () => old.remove());
    next.animate([{ transform: 'translateY(112%)' }, { transform: 'translateY(0)' }],
      { duration: 820, easing: EASE_IO, fill: 'backwards' });
  }

  /* Keep Tab inside an open dialog. */
  function trapTab(event, container) {
    const items = $$('a[href], button:not([disabled])', container)
      .filter((el) => el.tabIndex !== -1 && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    /* The dialog itself holds focus when it opens; Tab enters from either end. */
    if (at === container || !container.contains(at)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (event.shiftKey && at === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && at === last) { event.preventDefault(); first.focus(); }
  }

  /* While a dialog is open, the table and its interface are out of reach. */
  const background = () => [$('.hud-top'), $('#stage'), $('.hud-bottom')];
  function setInert(on) { background().forEach((el) => { if (el) el.inert = on; }); }


  /* ------------------------------------------------------------------
     1  The loop
     ------------------------------------------------------------------ */

  const tickers = [];
  let lastTime = 0;

  function loop(time) {
    const dt = lastTime ? clamp((time - lastTime) / 1000, 0.001, 0.05) : 0.016;
    lastTime = time;
    for (let i = 0; i < tickers.length; i++) tickers[i](dt, time);
    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => { lastTime = 0; });


  /* ------------------------------------------------------------------
     2  The table

     Columns of unequal width, so prints come in sizes. The set of columns
     wraps horizontally; every column wraps vertically on its own period.
     Both periods are kept larger than the viewport plus the largest print,
     so a photograph can never be on screen twice.
     ------------------------------------------------------------------ */

  /* Column widths and gap as fractions of the viewport width; `lag` scales
     how slowly each column follows vertically (they separate in motion and
     re-align exactly at rest). */
  const LAYOUTS = [
    { upTo: 599, cols: [0.44, 0.6, 0.36, 0.52, 0.4], gap: 0.072, lag: [1, 1.22, 0.86, 1.12, 0.94] },
    { upTo: 899, cols: [0.27, 0.37, 0.22, 0.33, 0.42, 0.24], gap: 0.04, lag: [1, 1.22, 0.86, 1.14, 0.92, 1.28] },
    { upTo: Infinity, cols: [0.17, 0.24, 0.14, 0.21, 0.28, 0.155, 0.225], gap: 0.03, lag: [1, 1.24, 0.84, 1.14, 0.92, 1.3, 1.06] }
  ];
  /* Where each column starts, as a fraction of the viewport height — so rows never line up. */
  const PHASE = [0.08, 0.47, 0.21, 0.66, 0.02, 0.38, 0.58, 0.27, 0.74];

  const plane = {
    el: $('#plane'),
    stage: $('#stage'),
    cols: [],
    slots: [],
    primary: new Map(),
    period: 0,
    padLeft: 0,
    vw: 0,
    vh: 0,
    tx: 0, ty: 0,          /* where the table is asked to be */
    x: 0, y: 0,            /* where it is */
    vx: 0, vy: 0, speed: 0,
    press: 0, pressTo: 0, pressShown: -1,
    zoom: 0,
    dragging: false,
    moved: false,
    everDragged: false,
    quietUntil: 0,
    dirty: true,
    paused: false,
    still: 0,              /* seconds since it last moved */
    calm: 0,               /* seconds since it last moved fast */
    gap: 0,
    lastInput: 0,
    drifting: false
  };

  /* Round-robin through the series, so neighbours on the table differ. */
  function dealOrder() {
    const out = [];
    for (let k = 0, more = true; more; k++) {
      more = false;
      SERIES.forEach((s) => { if (s.photos[k]) { out.push(s.photos[k]); more = true; } });
    }
    return out;
  }

  /* Lay the photographs out for one set of column proportions. Returns the
     columns, the horizontal period, and how many silent copies it needed. */
  function arrange(cfg, vw, vh) {
    const gap = Math.round(vw * cfg.gap);
    let copies = 0;
    let cols = cfg.cols.map((f, j) => ({ j, w: Math.round(f * vw), h: 0, y: plane.ty, items: [], lag: cfg.lag[j] }));

    /* Masonry: each print goes to the currently shortest column. Portraits
       are set narrower than their column and alternate left / right / centre. */
    dealOrder().forEach((p) => {
      let c = cols[0];
      for (const k of cols) if (k.h < c.h) c = k;
      const f = p.ar < 0.85 ? 0.74 : p.ar < 1.2 ? 0.86 : 1;
      const w = Math.round(c.w * f);
      const h = Math.round(w / p.ar);
      const side = f === 1 ? 0 : [0, 1, 0.5][(c.items.length + c.j) % 3];
      c.items.push({ p, w, h, y: c.h, dx: Math.round((c.w - w) * side), clone: false });
      c.h += h + gap;
    });
    cols = cols.filter((c) => c.items.length);

    /* Too few photographs to cover the screen? Repeat — as silent copies. */
    cols.forEach((c) => {
      c.padTop = Math.max(...c.items.map((s) => s.h)) + gap;
      c.off = Math.round(PHASE[c.j % PHASE.length] * vh);
      const need = vh + c.padTop;
      const base = c.items.slice();
      const period = c.h;
      for (let r = 1; c.h < need && r < 16; r++) {
        base.forEach((s) => c.items.push({ ...s, y: s.y + period * r, clone: true }));
        c.h += period;
        copies += base.length;
      }
    });

    let period = 0;
    cols.forEach((c) => { c.x = period; period += c.w + gap; });
    const widest = Math.max(...cols.map((c) => c.w));
    const base = cols.slice();
    const basePeriod = period;
    for (let r = 1; period < vw + widest + gap && r < 16; r++) {
      base.forEach((c) => {
        cols.push({ ...c, x: c.x + basePeriod * r, items: c.items.map((s) => ({ ...s, clone: true })) });
        copies += c.items.length;
      });
      period += basePeriod;
    }
    return { cols, period, gap, padLeft: widest + gap, copies };
  }

  function buildPlane() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    /* Start from the proportions for this width. If the window is so tall
       that they would need copies, step to larger prints until they don't. */
    let layout = null;
    for (let k = LAYOUTS.findIndex((l) => vw <= l.upTo); k >= 0; k--) {
      const attempt = arrange(LAYOUTS[k], vw, vh);
      if (!layout || attempt.copies < layout.copies) layout = attempt;
      if (!layout.copies) break;
    }
    const { cols, period } = layout;

    /* DOM */
    const fragment = document.createDocumentFragment();
    const slots = [];
    const primary = new Map();
    /* Real frames first and in viewing order, so Tab follows the series. */
    const ordered = [];
    cols.forEach((c) => c.items.forEach((s) => { s.col = c; ordered.push(s); }));
    ordered.sort((a, b) => (a.clone - b.clone) || (a.p.i - b.p.i));

    ordered.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'frame' + (s.p.series === state.series ? ' is-on' : '');
      li.style.width = s.w + 'px';
      li.style.height = s.h + 'px';
      if (s.p.tone) li.style.setProperty('--tone', s.p.tone);

      const a = document.createElement('a');
      a.className = 'frame-link';
      a.href = '#/frame/' + s.p.id;
      a.draggable = false;

      const clip = document.createElement('span');
      clip.className = 'frame-clip';

      const img = document.createElement('img');
      img.className = 'frame-img';
      img.decoding = 'async';
      img.draggable = false;
      img.alt = s.clone ? '' : (s.p.alt || `Photograph ${s.p.i + 1}, ${s.p.s.title}`);

      if (s.clone) { li.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; }
      else primary.set(s.p.id, s);

      clip.appendChild(img);
      a.appendChild(clip);
      li.appendChild(a);
      fragment.appendChild(li);

      s.el = li; s.link = a; s.clip = clip; s.img = img;
      s.size = s.w * dpr > 880 ? 'l' : 'm';
      s.X = 0; s.Y = 0; s.vis = false; s.asked = false; s.loaded = false; s.zoomed = false;
      li._slot = s;
      slots.push(s);
    });

    plane.el.textContent = '';
    plane.el.appendChild(fragment);

    Object.assign(plane, { cols, slots, primary, period, gap: layout.gap, padLeft: layout.padLeft, vw, vh, dirty: true });
    reticle.centre = null;
    hover = null;
    focused = null;
  }

  function requestImage(s) {
    s.asked = true;
    const done = () => { s.loaded = true; s.el.classList.add('is-in'); };
    s.img.addEventListener('load', done, { once: true });
    s.img.addEventListener('error', () => { s.loaded = true; }, { once: true });
    s.img.src = file(s.p, s.size);
  }

  function touchPlane() {
    plane.lastInput = performance.now();
    plane.drifting = false;
  }

  /* Shift the table by a fixed amount with no animation (used when the
     viewer hands a photograph back to a frame that was off screen). */
  function jumpPlane(dx, dy) {
    plane.tx += dx; plane.x += dx;
    plane.ty += dy; plane.y += dy;
    plane.cols.forEach((c) => { c.y += dy; });
    plane.dirty = true;
    tickPlane(0.0001);
  }

  function tickPlane(dt) {
    if (plane.paused || !plane.slots.length) return;
    const now = performance.now();

    /* Left alone, the table drifts — it reads as something that can be moved. */
    const idle = !still() && !plane.dragging && !state.booting && now - plane.lastInput > 6000 && !focused;
    plane.drifting = idle;
    if (idle) { plane.tx -= 9 * dt; plane.ty -= 15 * dt; }
    /* Always aim at whole pixels, so the glide ends sharp instead of snapping. */
    else if (!plane.dragging) { plane.tx = Math.round(plane.tx); plane.ty = Math.round(plane.ty); }

    const tau = still() ? 0.001 : plane.dragging ? 0.05 : 0.115;
    const px = plane.x;
    const py = plane.y;
    plane.x = damp(plane.x, plane.tx, tau, dt);
    plane.y = damp(plane.y, plane.ty, tau, dt);
    let moving = Math.abs(plane.x - px) + Math.abs(plane.y - py) > 0.01;
    for (const c of plane.cols) {
      const cy = damp(c.y, plane.ty, still() ? 0.001 : tau * c.lag, dt);
      if (Math.abs(cy - c.y) > 0.01) moving = true;
      c.y = cy;
    }

    /* Come to rest on whole pixels: photographs are never left half-blurred. */
    if (!moving && !plane.dragging && !idle && (plane.x !== Math.round(plane.tx) || plane.cols.some((c) => c.y !== Math.round(plane.ty)))) {
      plane.tx = plane.x = Math.round(plane.tx);
      plane.ty = plane.y = Math.round(plane.ty);
      plane.cols.forEach((c) => { c.y = plane.ty; });
      plane.dirty = true;
    }

    plane.vx = damp(plane.vx, (plane.x - px) / dt, 0.08, dt);
    plane.vy = damp(plane.vy, (plane.y - py) / dt, 0.08, dt);
    plane.speed = Math.hypot(plane.vx, plane.vy);
    plane.still = moving || plane.dragging ? 0 : plane.still + dt;
    /* "Calm" = slow enough to focus on something (the idle drift counts as calm). */
    plane.calm = plane.speed > 55 || plane.dragging ? 0 : plane.calm + dt;

    /* Grabbing lifts the prints; speed opens them up a touch. */
    plane.press = damp(plane.press, plane.pressTo, 0.15, dt);
    const press = Math.round(plane.press * 1000) / 1000;
    if (press !== plane.pressShown) {
      plane.pressShown = press;
      plane.el.style.setProperty('--press', press);
    }
    const zoomTo = still() ? 0 : clamp((plane.speed - 120) / 15000, 0, 0.045);
    plane.zoom = damp(plane.zoom, zoomTo, 0.16, dt);
    const zooming = plane.zoom > 0.0015;

    if (!moving && !plane.dirty && !zooming && !plane.wasZooming) return;
    plane.dirty = false;
    plane.wasZooming = zooming;

    const { vw, vh, period, padLeft } = plane;
    /* During the intro only what is on screen is fetched; afterwards a ring
       around the viewport, so prints are there before they slide in. */
    const nearX = state.booting ? 0 : vw * 0.35;
    const nearY = state.booting ? 0 : vh * 0.45;

    for (const c of plane.cols) {
      const X = mod(c.x + plane.x + padLeft, period) - padLeft;
      for (const s of c.items) {
        const Y = mod(s.y + c.y + c.off + c.padTop, c.h) - c.padTop;
        const x = X + s.dx;
        s.X = x;
        s.Y = Y;
        s.vis = x < vw && x + s.w > 0 && Y < vh && Y + s.h > 0;
        if (!s.asked && x < vw + nearX && x + s.w > -nearX && Y < vh + nearY && Y + s.h > -nearY) requestImage(s);
        s.el.style.transform = `translate3d(${x.toFixed(2)}px,${Y.toFixed(2)}px,0)`;

        if (s.vis && zooming) {
          const mx = clamp(-plane.vx * 0.012, -plane.zoom * 0.5 * s.w, plane.zoom * 0.5 * s.w);
          const my = clamp(-plane.vy * 0.012, -plane.zoom * 0.5 * s.h, plane.zoom * 0.5 * s.h);
          s.img.style.transform = `translate3d(${mx.toFixed(2)}px,${my.toFixed(2)}px,0) scale(${(1 + plane.zoom).toFixed(4)})`;
          s.zoomed = true;
        } else if (s.zoomed) {
          s.img.style.transform = '';
          s.zoomed = false;
        }
      }
    }

    /* The table moved under a resting mouse: what is it over now? */
    if (mqFine.matches && pointer.inside && !plane.dragging && !state.booting && !focused) {
      const under = document.elementFromPoint(pointer.x, pointer.y);
      const frame = under && under.closest ? under.closest('.frame') : null;
      hover = frame ? frame._slot : null;
    }

    readout.pos.textContent = `X ${pad(Math.round(mod(-plane.x, period)), 4)} · Y ${pad(Math.round(mod(-plane.y, plane.cols[0].h)), 4)}`;
  }

  /* --- input ------------------------------------------------------- */

  let hover = null;      /* slot under the pointer */
  let focused = null;    /* slot holding keyboard focus */
  let clickedSlot = null;
  const drag = { id: null, sx: 0, sy: 0, tx: 0, ty: 0, trail: [] };

  function bindPlane() {
    const el = plane.el;

    el.addEventListener('pointerdown', (e) => {
      if (state.booting || (e.pointerType === 'mouse' && e.button !== 0) || drag.id !== null) return;
      drag.id = e.pointerId;
      drag.sx = e.clientX; drag.sy = e.clientY;
      drag.tx = plane.tx; drag.ty = plane.ty;
      drag.trail = [[e.timeStamp, e.clientX, e.clientY]];
      plane.dragging = true;
      plane.moved = false;
      plane.pressTo = still() ? 0 : 1;
      touchPlane();
    });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!plane.moved && Math.hypot(dx, dy) > (e.pointerType === 'mouse' ? 4 : 9)) {
        plane.moved = true;
        plane.everDragged = true;
        hover = null;
        el.classList.add('is-dragging');
        /* Capture only once it is a drag — capturing earlier would swallow the click. */
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      }
      if (!plane.moved) return;
      plane.tx = drag.tx + dx;
      plane.ty = drag.ty + dy;
      drag.trail.push([e.timeStamp, e.clientX, e.clientY]);
      while (drag.trail.length > 2 && e.timeStamp - drag.trail[0][0] > 110) drag.trail.shift();
      touchPlane();
    });

    const release = (e) => {
      if (e.pointerId !== drag.id) return;
      drag.id = null;
      plane.dragging = false;
      plane.pressTo = 0;
      el.classList.remove('is-dragging');
      if (!plane.moved) return;
      plane.quietUntil = performance.now() + 350;
      /* Momentum: project the release velocity a third of a second ahead. */
      const a = drag.trail[0];
      const b = drag.trail[drag.trail.length - 1];
      const span = (b[0] - a[0]) / 1000;
      if (!still() && span > 0.012 && e.timeStamp - b[0] < 90) {
        plane.tx += clamp(((b[1] - a[1]) / span) * 0.32, -1700, 1700);
        plane.ty += clamp(((b[2] - a[2]) / span) * 0.32, -1700, 1700);
      }
      touchPlane();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);

    /* A drag that ends on a frame is not a click on it. */
    el.addEventListener('click', (e) => {
      if (performance.now() < plane.quietUntil || state.booting) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const frame = e.target.closest('.frame');
      clickedSlot = frame ? frame._slot : null;
    }, true);

    el.addEventListener('dragstart', (e) => e.preventDefault());

    plane.stage.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;                 /* pinch-zoom stays the browser's */
      e.preventDefault();
      if (state.booting) return;
      const unit = e.deltaMode === 1 ? 34 : e.deltaMode === 2 ? plane.vh : 1;
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      plane.tx -= clamp(dx, -280, 280);
      plane.ty -= clamp(dy, -280, 280);
      touchPlane();
    }, { passive: false });

    /* Tab walks the frames; the table travels to whichever holds focus. */
    el.addEventListener('focusin', (e) => {
      const frame = e.target.closest('.frame');
      if (!frame || !e.target.matches(':focus-visible')) return;
      focused = frame._slot;
      hover = null;                          /* the keyboard has the reticle now */
      reveal(focused);
    });
    el.addEventListener('focusout', () => { focused = null; });

    /* Focus can scroll even a clipped box. It must not. */
    plane.stage.addEventListener('scroll', () => { plane.stage.scrollTop = 0; plane.stage.scrollLeft = 0; });
    window.addEventListener('scroll', () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); });
  }

  /* Where a frame will be once the table has come to rest — not where it
     is mid-glide. Travel is always planned from this. */
  function restingPlace(s) {
    const c = s.col;
    return {
      x: mod(c.x + plane.tx + plane.padLeft, plane.period) - plane.padLeft + s.dx,
      y: mod(s.y + plane.ty + c.off + c.padTop, c.h) - c.padTop
    };
  }

  /* The band of the screen that is free of interface. */
  function clearBand() {
    const top = parseFloat(html.style.getPropertyValue('--hud-t')) || 70;
    const bottom = plane.vh - (parseFloat(html.style.getPropertyValue('--hud-b')) || 170);
    return { top: top + 24, bottom: bottom - 24, middle: (top + bottom) / 2 };
  }

  /* Bring a frame to the middle of the clear band. */
  function reveal(s, always) {
    const at = restingPlace(s);
    const band = clearBand();
    const inside = at.x > 32 && at.x + s.w < plane.vw - 32 && at.y > band.top && at.y + s.h < band.bottom;
    if (inside && !always) return;
    plane.tx += Math.round(plane.vw / 2 - (at.x + s.w / 2));
    plane.ty += Math.round(band.middle - (at.y + s.h / 2));
    touchPlane();
  }

  /* Skip the glide: the table is where it was asked to be, now. */
  function settlePlane() {
    plane.x = plane.tx;
    plane.y = plane.ty;
    plane.cols.forEach((c) => { c.y = plane.ty; });
    plane.dirty = true;
    tickPlane(0.0001);
  }

  function nearestToCentre(filter) {
    const cx = plane.vw / 2;
    const cy = clearBand().middle;
    let best = null;
    let bestD = Infinity;
    for (const s of plane.slots) {
      if (filter && !filter(s)) continue;
      const at = restingPlace(s);
      const d = Math.hypot(at.x + s.w / 2 - cx, at.y + s.h / 2 - cy);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  const readout = { pos: $('#ro-pos'), time: $('#ro-time') };

  function tickClock() {
    try {
      readout.time.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date());
    } catch (e) { readout.time.textContent = ''; }
  }


  /* ------------------------------------------------------------------
     3  Reticle

     One element shared by every frame. It hunts while the table moves and
     locks when it stops: on the hovered frame (mouse), the focused frame
     (keyboard), or the frame nearest the centre (touch).
     ------------------------------------------------------------------ */

  const reticle = {
    el: $('#reticle'),
    corners: $$('.reticle-c', $('#reticle')),
    label: $('.reticle-label', $('#reticle')),
    text: $('#reticle-text'),
    x: 0, y: 0, w: 0, h: 0,
    vx: 0, vy: 0, vw: 0, vh: 0,
    target: null,
    ghost: null,
    fade: 0,
    held: 0,
    locked: false,
    centre: null,
    lookedAt: 0
  };
  const RETICLE_GAP = 7;

  function reticleTarget() {
    if (state.booting || viewer.open || sheet.open || (plane.dragging && plane.moved)) return null;
    if (hover) return hover;
    if (focused) return focused;
    if (!mqFine.matches) {
      /* Touch has no hover: once the table is calm, focus goes to the print
         nearest the centre — and only moves on when another is clearly nearer. */
      if (plane.calm < 0.2) { reticle.centre = null; return null; }
      const now = performance.now();
      if (!reticle.centre || now - reticle.lookedAt > 240) {
        reticle.lookedAt = now;
        const candidate = nearestToCentre((s) => s.vis);
        const keep = reticle.centre;
        if (!keep || !keep.vis || !candidate || centreDistance(candidate) + 40 < centreDistance(keep)) reticle.centre = candidate;
      }
      return reticle.centre;
    }
    return null;
  }

  function centreDistance(s) {
    return Math.hypot(s.X + s.w / 2 - plane.vw / 2, s.Y + s.h / 2 - clearBand().middle);
  }

  function tickReticle(dt) {
    const r = reticle;
    const target = reticleTarget();

    if (target !== r.target) {
      const acquiring = !r.target && !(r.fade > 0);
      /* Letting go: stay on the frame while fading, instead of hanging in mid-air. */
      if (!target) { r.ghost = r.target; r.fade = 0.32; }
      r.target = target;
      r.held = 0;
      r.locked = false;
      r.el.classList.remove('is-locked');
      r.el.classList.toggle('is-on', !!target);
      if (target) {
        r.fade = 0;
        r.text.textContent = `${pad(target.p.i + 1)} / ${pad(PHOTOS.length)} — ${target.p.s.title}`;
        if (acquiring) {
          /* Start wide and close in, like autofocus finding its subject. */
          r.x = target.X - 30; r.y = target.Y - 30; r.w = target.w + 60; r.h = target.h + 60;
          r.vx = r.vy = r.vw = r.vh = 0;
        }
      }
    }

    if (!target) {
      if (!(r.fade > 0)) return;
      r.fade -= dt;
    }
    const t = target || r.ghost;
    if (!t || !t.el.isConnected) { r.fade = 0; return; }

    const scale = 1 - plane.press * 0.035;
    const gx = t.X + (t.w * (1 - scale)) / 2 - RETICLE_GAP;
    const gy = t.Y + (t.h * (1 - scale)) / 2 - RETICLE_GAP;
    const gw = t.w * scale + RETICLE_GAP * 2;
    const gh = t.h * scale + RETICLE_GAP * 2;

    if (still()) {
      r.x = gx; r.y = gy; r.w = gw; r.h = gh;
    } else {
      /* A spring, slightly under-damped: it arrives with one small settle. */
      const k = 250;
      const d = 25;
      r.vx += ((gx - r.x) * k - r.vx * d) * dt; r.x += r.vx * dt;
      r.vy += ((gy - r.y) * k - r.vy * d) * dt; r.y += r.vy * dt;
      r.vw += ((gw - r.w) * k - r.vw * d) * dt; r.w += r.vw * dt;
      r.vh += ((gh - r.h) * k - r.vh * d) * dt; r.h += r.vh * dt;
    }

    const x2 = r.x + r.w;
    const y2 = r.y + r.h;
    r.corners[0].style.transform = `translate3d(${r.x.toFixed(2)}px,${r.y.toFixed(2)}px,0)`;
    r.corners[1].style.transform = `translate3d(${x2.toFixed(2)}px,${r.y.toFixed(2)}px,0)`;
    r.corners[2].style.transform = `translate3d(${r.x.toFixed(2)}px,${y2.toFixed(2)}px,0)`;
    r.corners[3].style.transform = `translate3d(${x2.toFixed(2)}px,${y2.toFixed(2)}px,0)`;

    /* Label under the frame — or above it when the frame runs into the interface. */
    const air = plane.gap >= 40 ? 8 : 2;
    const below = y2 + air + 18 < clearBand().bottom + 24;
    r.label.style.transform = `translate3d(${r.x.toFixed(2)}px,${(below ? y2 + air : r.y - air - 17).toFixed(2)}px,0)`;

    if (!target) return;
    const error = Math.abs(gx - r.x) + Math.abs(gy - r.y) + Math.abs(gw - r.w) + Math.abs(gh - r.h);
    r.held = error < 1.6 && plane.speed < 40 ? r.held + dt : 0;
    if (!r.locked && r.held > 0.1) { r.locked = true; r.el.classList.add('is-locked'); }
    else if (r.locked && r.held === 0 && plane.speed > 90) { r.locked = false; r.el.classList.remove('is-locked'); }
  }


  /* ------------------------------------------------------------------
     4  Cursor — replaces the arrow only where it can say something:
     "Drag" until the first drag, "View" on a frame, "Prev" / "Next".
     ------------------------------------------------------------------ */

  const cursor = { el: $('#cursor'), label: $('#cursor-label'), x: 0, y: 0, on: false, text: null, view: false };

  /* What the cursor should say here: a word, '' for the bare dot,
     'view' for the opened-up dot over a frame, or null for the system arrow. */
  function cursorContext(target) {
    if (!target || !target.closest || state.booting) return null;
    const zone = target.closest('[data-cursor]');
    if (zone) return zone.dataset.cursor;
    if (target.closest('.plane')) {
      if (plane.dragging && plane.moved) return '';
      if (target.closest('.frame')) return 'view';
      return plane.everDragged ? '' : 'Drag';
    }
    return null;
  }

  function setCursor(context) {
    const on = context !== null;
    const view = context === 'view';
    const text = on && !view ? context : '';
    if (on !== cursor.on) {
      cursor.on = on;
      cursor.el.classList.toggle('is-on', on);
      if (on) { cursor.x = pointer.x; cursor.y = pointer.y; }
    }
    if (view !== cursor.view) {
      cursor.view = view;
      cursor.el.classList.toggle('is-view', view);
    }
    if (text !== cursor.text) {
      cursor.text = text;
      cursor.el.classList.toggle('has-label', !!text);
      if (text) cursor.label.textContent = text;
    }
  }

  function bindCursor() {
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.inside = true;
      if (!mqFine.matches) return;
      if (!plane.dragging) {
        const frame = e.target.closest ? e.target.closest('.frame') : null;
        hover = frame ? frame._slot : null;
      }
      setCursor(cursorContext(e.target));
      touchPlane();
    }, { passive: true });

    document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') cursor.el.classList.add('is-down'); }, { passive: true });
    document.addEventListener('pointerup', () => cursor.el.classList.remove('is-down'), { passive: true });
    html.addEventListener('mouseleave', () => { pointer.inside = false; hover = null; setCursor(null); });

    if (mqFine.matches) html.classList.add('has-cursor');
    mqFine.addEventListener('change', () => html.classList.toggle('has-cursor', mqFine.matches));
  }

  function tickCursor(dt) {
    if (!cursor.on) return;
    cursor.x = damp(cursor.x, pointer.x, 0.045, dt);
    cursor.y = damp(cursor.y, pointer.y, 0.045, dt);
    cursor.el.style.transform = `translate3d(${cursor.x.toFixed(2)}px,${cursor.y.toFixed(2)}px,0)`;
  }


  /* ------------------------------------------------------------------
     5  Series & context title
     ------------------------------------------------------------------ */

  const context = { el: $('#context'), roll: $('#context .roll'), nav: $('#series') };

  function contextMarkup() {
    const s = state.series ? seriesById.get(state.series) : null;
    return s
      ? `${esc(s.title)}<sup>${pad(s.photos.length)}</sup>`
      : `Selected Work<sup>${pad(PHOTOS.length)}</sup>`;
  }

  /* The veils that dissolve the table into paper are sized from the real
     height of the two interface bars. */
  function measureHud() {
    html.style.setProperty('--hud-t', $('.hud-top').offsetHeight + 'px');
    html.style.setProperty('--hud-b', $('.hud-bottom').offsetHeight + 'px');
  }

  /* A long series name must never push past the screen: shrink to fit. */
  function fitContext() {
    context.el.style.fontSize = '';
    const line = context.roll.lastElementChild;
    if (!line) return;
    const room = window.innerWidth - parseFloat(getComputedStyle(context.el.parentElement.parentElement).paddingLeft) * 2;
    const width = line.scrollWidth;
    if (width > room) context.el.style.fontSize = (parseFloat(getComputedStyle(context.el).fontSize) * room / width).toFixed(1) + 'px';
  }

  function buildSeriesNav() {
    const link = (id, label) => `<a href="${id ? '#/series/' + id : '#/'}" data-series="${id}" aria-current="${id === (state.series || '')}">${esc(label)}</a>`;
    context.nav.innerHTML = link('', 'All') + SERIES.filter((s) => s.photos.length).map((s) => link(s.id, s.title)).join('');
  }

  function setSeries(id, options = {}) {
    id = id && seriesById.has(id) ? id : null;
    if (id === state.series) return;
    state.series = id;

    plane.el.classList.toggle('has-series', !!id);
    plane.slots.forEach((s) => s.el.classList.toggle('is-on', s.p.series === id));

    $$('a', context.nav).forEach((a) => {
      const current = a.dataset.series === (id || '');
      a.setAttribute('aria-current', String(current));
      if (current && context.nav.scrollWidth > context.nav.clientWidth) {
        context.nav.scrollTo({ left: a.offsetLeft - context.nav.clientWidth / 2 + a.offsetWidth / 2, behavior: still() ? 'auto' : 'smooth' });
      }
    });

    if (options.instant) context.roll.innerHTML = `<span class="roll-in">${contextMarkup()}</span>`;
    else rollTo(context.roll, contextMarkup());
    fitContext();

    /* Travel to the nearest frame of the series. */
    if (id && options.travel) {
      const s = nearestToCentre((slot) => slot.p.series === id);
      if (s) reveal(s, true);
    }
  }


  /* ------------------------------------------------------------------
     6  Viewer — one photograph, in the dark.
     ------------------------------------------------------------------ */

  const viewer = {
    el: $('#viewer'),
    stage: $('#viewer-stage'),
    figs: $$('.viewer-fig', $('#viewer')),
    top: $('.viewer-top', $('#viewer')),
    bottom: $('.viewer-bottom', $('#viewer')),
    count: $('#v-count'),
    titleRoll: $('#v-title .roll'),
    cap: $('#v-cap'),
    spec: $('#v-spec'),
    live: $('#v-live'),
    rail: $('#rail'),
    strip: $('#rail-strip'),
    gate: $('#rail-gate'),
    items: [],
    open: false,
    closing: false,
    front: 0,
    index: -1,
    titleFor: null,
    returnFocus: null,
    token: 0
  };

  /* The largest rectangle with the photograph's proportions that fits
     between the top bar and the film strip. */
  function fitRect(p) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = viewer.top.offsetHeight + (vw < 600 ? 4 : 10);
    const bottom = viewer.bottom.offsetHeight + (vw < 600 ? 8 : 14);
    const side = vw < 600 ? 14 : Math.max(64, vw * 0.07);
    const scale = Math.min((vw - side * 2) / p.w, (vh - top - bottom) / p.h);
    const w = Math.round(p.w * scale);
    const h = Math.round(p.h * scale);
    return { x: Math.round((vw - w) / 2), y: Math.round(top + (vh - top - bottom - h) / 2), w, h };
  }

  function placeFigure(fig, p) {
    const r = fitRect(p);
    fig.style.left = r.x + 'px';
    fig.style.top = r.y + 'px';
    fig.style.width = r.w + 'px';
    fig.style.height = r.h + 'px';
    fig.style.setProperty('--tone', p.tone || '#222');
    fig._rect = r;

    if (fig._photo !== p) {
      fig._photo = p;
      const lo = $('.lo', fig);
      const hi = $('.hi', fig);
      const token = ++viewer.token;
      lo.src = file(p, 'm');
      hi.classList.remove('is-in');
      hi.removeAttribute('src');
      hi.onload = () => { if (fig._photo === p && token <= viewer.token) hi.classList.add('is-in'); };
      hi.src = file(p, 'l');
    }
    return r;
  }

  function buildRail() {
    if (viewer.items.length) return;
    const fragment = document.createDocumentFragment();
    PHOTOS.forEach((p) => {
      const li = document.createElement('li');
      if (p.n === 0 && p.i > 0) li.className = 'is-gap';
      li.style.width = Math.round(40 * p.ar) + 'px';
      const button = document.createElement('button');
      button.type = 'button';
      button.tabIndex = -1;
      button.style.setProperty('--tone', p.tone || '#222');
      button.dataset.i = p.i;
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.src = file(p, 's');
      button.appendChild(img);
      li.appendChild(button);
      fragment.appendChild(li);
      viewer.items.push(li);
    });
    viewer.strip.appendChild(fragment);
    viewer.strip.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button) showPhoto(PHOTOS[Number(button.dataset.i)]);
    });
  }

  function railTo(p, instant) {
    const li = viewer.items[p.i];
    if (!li) return;
    viewer.items.forEach((item, i) => item.classList.toggle('is-current', i === p.i));
    if (instant) { viewer.strip.style.transition = 'none'; viewer.gate.style.transition = 'none'; }
    viewer.strip.style.transform = `translate3d(${-(li.offsetLeft + li.offsetWidth / 2)}px,0,0)`;
    viewer.gate.style.width = li.offsetWidth + 10 + 'px';
    if (instant) {
      void viewer.strip.offsetWidth;
      viewer.strip.style.transition = '';
      viewer.gate.style.transition = '';
    }
  }

  function setMeta(p, instant) {
    viewer.count.textContent = `${pad(p.n + 1)} / ${pad(p.s.photos.length)}`;
    if (viewer.titleFor !== p.s.id) {
      viewer.titleFor = p.s.id;
      if (instant) viewer.titleRoll.innerHTML = `<span class="roll-in">${esc(p.s.title)}</span>`;
      else rollTo(viewer.titleRoll, esc(p.s.title));
    }
    const own = [p.title, [p.place, p.year].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
    viewer.cap.textContent = own || [p.s.kicker, p.s.year].filter(Boolean).join(' — ');
    viewer.spec.textContent = p.spec || '';
    viewer.live.textContent = `Photograph ${p.n + 1} of ${p.s.photos.length} in ${p.s.title}. ${p.alt || ''}`;
  }

  function preloadAround(p) {
    [1, -1].forEach((d) => { new Image().src = file(PHOTOS[mod(p.i + d, PHOTOS.length)], 'l'); });
  }

  function openViewer(p, from) {
    if (viewer.open) { showPhoto(p); return; }
    viewer.open = true;
    viewer.closing = false;
    viewer.index = p.i;
    viewer.returnFocus = document.activeElement;
    viewer.el.hidden = false;
    html.classList.add('is-viewing');
    setCursor(null);
    buildRail();
    setMeta(p, true);
    railTo(p, true);

    const fig = viewer.figs[viewer.front];
    const other = viewer.figs[1 - viewer.front];
    other.classList.remove('is-shown');
    fig.getAnimations().forEach((a) => a.cancel());
    const r1 = placeFigure(fig, p);
    fig.classList.add('is-shown');

    let flight;
    if (from && from.vis && !still()) {
      /* Shared element: the print leaves its place on the table and becomes the photograph. */
      const r0 = from.clip.getBoundingClientRect();
      from.el.style.visibility = 'hidden';
      flight = fig.animate([
        { transform: `translate(${r0.left - r1.x}px, ${r0.top - r1.y}px) scale(${r0.width / r1.w}, ${r0.height / r1.h})` },
        { transform: 'none' }
      ], { duration: 1000, easing: EASE_IO });
      flight.finished.then(() => { from.el.style.visibility = ''; }, () => { from.el.style.visibility = ''; });
    } else if (!still()) {
      flight = fig.animate([{ opacity: 0, transform: 'scale(0.965)' }, { opacity: 1, transform: 'none' }], { duration: 800, easing: EASE_OUT });
    }

    requestAnimationFrame(() => viewer.el.classList.add('is-open'));
    setInert(true);
    viewer.el.focus({ preventScroll: true });
    Promise.resolve(flight && flight.finished).catch(() => {}).then(() => {
      if (viewer.open && !viewer.closing) plane.paused = true;
      preloadAround(p);
    });
  }

  /* Step to another photograph: the new one wipes in from the side it comes
     from while its image counter-moves; the old one drifts off and fades. */
  function showPhoto(p, direction) {
    if (!viewer.open || viewer.closing || p.i === viewer.index) return;
    const count = PHOTOS.length;
    const dir = direction || (mod(p.i - viewer.index, count) <= count / 2 ? 1 : -1);
    const a = viewer.figs[viewer.front];
    const b = viewer.figs[1 - viewer.front];

    [a, b, $('.viewer-fig-in', a), $('.viewer-fig-in', b)].forEach((el) => el.getAnimations().forEach((x) => x.cancel()));
    placeFigure(b, p);
    b.classList.add('is-shown');
    b.style.zIndex = 2;
    a.style.zIndex = 1;

    if (still()) {
      a.classList.remove('is-shown');
    } else {
      b.animate([{ clipPath: dir > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        { duration: 950, easing: EASE_IO });
      $('.viewer-fig-in', b).animate([{ transform: `translateX(${dir * 14}%) scale(1.08)` }, { transform: 'none' }],
        { duration: 950, easing: EASE_IO });
      a.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 4}vw)`, opacity: 0 }],
        { duration: 700, easing: EASE_IO, fill: 'forwards' })
        .finished.then((anim) => { a.classList.remove('is-shown'); anim.cancel(); }, () => {});
    }

    viewer.front = 1 - viewer.front;
    viewer.index = p.i;
    setMeta(p);
    railTo(p);
    history.replaceState(null, '', '#/frame/' + p.id);
    clearTimeout(viewer.preloadTimer);
    viewer.preloadTimer = setTimeout(() => preloadAround(p), 350);
  }

  const step = (d) => showPhoto(PHOTOS[mod(viewer.index + d, PHOTOS.length)], d);

  function closeViewer(options = {}) {
    if (!viewer.open || viewer.closing) return;
    viewer.closing = true;
    plane.paused = false;
    plane.dirty = true;

    const p = PHOTOS[viewer.index];
    const fig = viewer.figs[viewer.front];
    const slot = plane.primary.get(p.id);
    const finish = () => {
      viewer.el.hidden = true;
      viewer.open = false;
      viewer.closing = false;
      viewer.figs.forEach((f) => { f.getAnimations().forEach((a) => a.cancel()); f.classList.remove('is-shown'); });
      if (slot) slot.el.style.visibility = '';
      html.classList.remove('is-viewing');
      setInert(sheet.open);
      touchPlane();
      const back = slot && !sheet.open ? slot.link : viewer.returnFocus;
      if (back && back.focus && !sheet.open) back.focus({ preventScroll: true });
    };

    viewer.el.classList.remove('is-open');
    if (options.instant || still() || !slot) { finish(); return; }

    /* Put the table where this photograph lives, then fly back into its frame. */
    settlePlane();
    const band = clearBand();
    const comfortable = slot.X > 24 && slot.X + slot.w < plane.vw - 24 && slot.Y > band.top - 16 && slot.Y + slot.h < band.bottom + 16;
    if (!comfortable) jumpPlane(Math.round(plane.vw / 2 - (slot.X + slot.w / 2)), Math.round(band.middle - (slot.Y + slot.h / 2)));

    const r1 = fig._rect;
    slot.el.style.visibility = 'hidden';
    fig.getAnimations().forEach((a) => a.cancel());
    fig.animate([
      { transform: 'none' },
      { transform: `translate(${slot.X - r1.x}px, ${slot.Y - r1.y}px) scale(${slot.w / r1.w}, ${slot.h / r1.h})` }
    ], { duration: 900, easing: EASE_IO, fill: 'forwards' }).finished.then(finish, finish);
  }

  function bindViewer() {
    $('#viewer-close').addEventListener('click', () => go(parentHash()));
    $('.viewer-zone.prev', viewer.el).addEventListener('click', () => { if (performance.now() > viewer.swipedAt + 400) step(-1); });
    $('.viewer-zone.next', viewer.el).addEventListener('click', () => { if (performance.now() > viewer.swipedAt + 400) step(1); });
    viewer.swipedAt = -1000;

    /* Wheel and trackpad: one step per gesture, not one per event. */
    let wheelSum = 0;
    let wheelAt = 0;
    let steppedAt = 0;
    viewer.el.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const now = performance.now();
      if (now - wheelAt > 180) wheelSum = 0;
      wheelAt = now;
      wheelSum += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(wheelSum) > 60 && now - steppedAt > 560) {
        steppedAt = now;
        step(wheelSum > 0 ? 1 : -1);
        wheelSum = 0;
      }
    }, { passive: false });

    /* Touch: swipe sideways to step, swipe down to put the photograph back. */
    let swipe = null;
    viewer.stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    viewer.stage.addEventListener('pointerup', (e) => {
      if (!swipe || e.pointerId !== swipe.id) return;
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.2) { viewer.swipedAt = performance.now(); step(dx < 0 ? 1 : -1); }
      else if (dy > 80 && dy > Math.abs(dx) * 1.2) { viewer.swipedAt = performance.now(); go(parentHash()); }
    });
    viewer.stage.addEventListener('pointercancel', () => { swipe = null; });
  }


  /* ------------------------------------------------------------------
     7  Info sheet
     ------------------------------------------------------------------ */

  const sheet = { el: $('#info'), open: false, returnFocus: null, lead: $('#info-title') };
  const peek = { el: $('#peek'), img: $('#peek img'), x: 0, y: 0, on: false };

  /* Break the statement into the lines it actually wraps to, so each can
     rise through its own mask. Re-run whenever the width changes. */
  function splitLead() {
    const el = sheet.lead;
    const text = el.dataset.text || el.textContent.replace(/[ \t\r\n]+/g, ' ').trim();   /* keeps non-breaking spaces */
    el.dataset.text = text;
    el.setAttribute('aria-label', text);
    el.innerHTML = text.split(' ').map((w) => `<span class="word">${esc(w)}</span>`).join(' ');
    const lines = [];
    let top = null;
    $$('.word', el).forEach((w) => {
      if (w.offsetTop !== top) { top = w.offsetTop; lines.push([]); }
      lines[lines.length - 1].push(w.textContent);
    });
    el.innerHTML = lines.map((l) => `<span class="line" aria-hidden="true"><span>${esc(l.join(' '))}</span></span>`).join('');
  }

  function buildIndex() {
    $('#index').innerHTML = SERIES.filter((s) => s.photos.length).map((s, i) => `
      <li><a href="#/frame/${s.photos[0].id}" data-series="${s.id}">
        <span class="n mono">${pad(i + 1)}</span>
        <span class="t">${esc(s.title)}</span>
        <span class="k mono">${esc([s.kicker, s.year].filter(Boolean).join(' — '))}</span>
        <span class="c mono">${pad(s.photos.length)}</span>
      </a></li>`).join('');
  }

  function openSheet() {
    if (sheet.open) return;
    sheet.open = true;
    sheet.returnFocus = document.activeElement;
    sheet.el.hidden = false;
    sheet.el.scrollTop = 0;
    splitLead();
    setInert(true);
    setCursor(null);

    if (!still()) {
      sheet.el.getAnimations().forEach((a) => a.cancel());
      sheet.el.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 1000, easing: EASE_IO });
      $('.sheet-in', sheet.el).animate([{ transform: 'translateY(12vh)' }, { transform: 'none' }], { duration: 1150, easing: EASE_IO });
      $$('.line > span', sheet.lead).forEach((line, i) => {
        line.animate([{ transform: 'translateY(112%)' }, { transform: 'none' }], { duration: 1100, delay: 380 + i * 75, easing: EASE_OUT, fill: 'backwards' });
      });
      $$('.sheet-eyebrow, .sheet-cols > *, .sheet-foot', sheet.el).forEach((el, i) => {
        el.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 520 + i * 70, easing: EASE_OUT, fill: 'backwards' });
      });
      plane.stage.animate([{ transform: 'none' }, { transform: 'translateY(-6vh)' }], { duration: 1000, easing: EASE_IO });
    }
    sheet.el.focus({ preventScroll: true });
    wait(1000).then(() => { if (sheet.open) plane.paused = true; });
  }

  function closeSheet() {
    if (!sheet.open) return;
    sheet.open = false;
    plane.paused = viewer.open;
    plane.dirty = true;
    peek.on = false;
    peek.el.classList.remove('is-on');
    const done = () => {
      if (sheet.open) return;
      sheet.el.hidden = true;
      setInert(viewer.open);
      if (!viewer.open && sheet.returnFocus && sheet.returnFocus.focus) sheet.returnFocus.focus({ preventScroll: true });
    };
    if (still()) { done(); return; }
    sheet.el.getAnimations().forEach((a) => a.cancel());
    sheet.el.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(100% 0 0 0)' }], { duration: 850, easing: EASE_IO, fill: 'forwards' })
      .finished.then((a) => { done(); a.cancel(); }, done);
    plane.stage.animate([{ transform: 'translateY(-6vh)' }, { transform: 'none' }], { duration: 850, easing: EASE_IO });
  }

  function bindSheet() {
    $('#info-close').addEventListener('click', () => go(parentHash()));

    const index = $('#index');
    /* Choosing a series here selects it on the table too. */
    index.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a) setSeries(a.dataset.series, { instant: true });
    });

    index.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !mqFine.matches) return;
      const a = e.target.closest('a');
      const s = a ? seriesById.get(a.dataset.series) : null;
      if (!s) { peek.on = false; peek.el.classList.remove('is-on'); return; }
      if (peek.series !== s) {
        peek.series = s;
        const cover = s.photos[0];
        peek.img.src = file(cover, 'm');
        peek.el.style.aspectRatio = `${cover.w} / ${cover.h}`;
      }
      if (!peek.on) {
        peek.on = true;
        peek.x = e.clientX + 30;
        peek.y = e.clientY - 22 - peek.el.offsetHeight;
        peek.el.classList.add('is-on');
      }
    });
    index.addEventListener('pointerleave', () => { peek.on = false; peek.el.classList.remove('is-on'); });
  }

  function tickPeek(dt) {
    if (!peek.on) return;
    /* Above and to the right of the pointer: the row being read stays readable. */
    const w = peek.el.offsetWidth;
    const h = peek.el.offsetHeight;
    const tx = clamp(pointer.x + 30, 8, window.innerWidth - w - 8);
    const ty = clamp(pointer.y - 22 - h, 8, window.innerHeight - h - 8);
    peek.x = damp(peek.x, tx, 0.11, dt);
    peek.y = damp(peek.y, ty, 0.11, dt);
    peek.el.style.transform = `translate3d(${peek.x.toFixed(1)}px,${peek.y.toFixed(1)}px,0)`;
  }


  /* ------------------------------------------------------------------
     8  Routing — the address bar is the state.
        #/                 the table
        #/series/<id>      the table, one series lit
        #/frame/<id>       the viewer
        #/info             the info sheet
     ------------------------------------------------------------------ */

  function readRoute() {
    const m = location.hash.match(/^#\/?([a-z]*)\/?(.*)$/i) || [];
    let arg = m[2] || '';
    try { arg = decodeURIComponent(arg); } catch (e) { /* leave as typed */ }
    return { view: (m[1] || '').toLowerCase(), arg };
  }

  const parentHash = () => (state.series ? '#/series/' + state.series : '#/');

  function go(hash) {
    if (location.hash === hash || (hash === '#/' && !location.hash)) applyRoute();
    else location.hash = hash;
  }

  function applyRoute() {
    if (state.booting) return;
    const route = readRoute();
    const photo = route.view === 'frame' ? photoById.get(route.arg) : null;
    const info = route.view === 'info';
    const sheetWasOpen = sheet.open;

    if (info) { closeViewer({ instant: true }); openSheet(); }
    else closeSheet();

    if (photo) {
      const from = clickedSlot && clickedSlot.p === photo ? clickedSlot : plane.primary.get(photo.id);
      openViewer(photo, sheetWasOpen ? null : from);
    } else if (!info) {
      closeViewer();
    }
    clickedSlot = null;

    if (route.view === 'series') setSeries(route.arg, { travel: true });
    else if (route.view === '') setSeries(null);

    $$('[data-nav]').forEach((a) => {
      if ((a.dataset.nav === 'info') === info) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (state.booting || e.metaKey || e.ctrlKey || e.altKey) return;

      if (sheet.open) {
        if (e.key === 'Escape') { e.preventDefault(); go(parentHash()); }
        else if (e.key === 'Tab') trapTab(e, sheet.el);
        return;
      }

      if (viewer.open) {
        if (e.key === 'Escape') { e.preventDefault(); go(parentHash()); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
        else if (e.key === 'Home') { e.preventDefault(); showPhoto(PHOTOS[0], -1); }
        else if (e.key === 'End') { e.preventDefault(); showPhoto(PHOTOS[PHOTOS.length - 1], 1); }
        else if (e.key === 'Tab') trapTab(e, viewer.el);
        return;
      }

      const reach = e.shiftKey ? 520 : 190;
      if (e.key === 'ArrowLeft') plane.tx += reach;
      else if (e.key === 'ArrowRight') plane.tx -= reach;
      else if (e.key === 'ArrowUp') plane.ty += reach;
      else if (e.key === 'ArrowDown') plane.ty -= reach;
      else if (e.key === 'Escape' && state.series) { go('#/'); return; }
      else return;
      e.preventDefault();
      touchPlane();
    });
  }


  /* ------------------------------------------------------------------
     9  Intro & boot
     ------------------------------------------------------------------ */

  function fillSite() {
    const ig = $('#c-instagram');
    if (SITE.instagram) { ig.href = `https://www.instagram.com/${SITE.instagram}/`; ig.textContent = '@' + SITE.instagram; }
    if (SITE.email) {
      const mail = $('#c-email');
      mail.href = 'mailto:' + SITE.email;
      mail.textContent = SITE.email;
      $('#c-email-row').hidden = false;
    }
    if (SITE.placeholder) { $('#fpo').hidden = false; $('#info-note').hidden = false; }
    $('#year').textContent = new Date().getFullYear();
  }

  /* The counter follows the real decoding of the first screen of photographs,
     but never runs faster than `least` milliseconds. */
  function countUp(slots, el, least) {
    return new Promise((resolve) => {
      const started = performance.now();
      const total = slots.length || 1;
      let shown = 0;
      (function tick() {
        const elapsed = performance.now() - started;
        const loaded = slots.filter((s) => s.loaded).length / total;
        const target = elapsed > 6000 ? 1 : Math.min(loaded, elapsed / least);
        shown += (target - shown) * 0.14;
        if (target >= 1 && shown > 0.99) shown = 1;
        el.textContent = pad(Math.round(shown * 100), 3);
        if (shown >= 1) resolve();
        else requestAnimationFrame(tick);
      })();
    });
  }

  /* The prints are dealt from the centre of the table to their places. */
  function deal(slots) {
    const cx = plane.vw / 2;
    const cy = plane.vh / 2;
    slots
      .map((s) => ({ s, d: Math.hypot(s.X + s.w / 2 - cx, s.Y + s.h / 2 - cy) }))
      .sort((a, b) => a.d - b.d)
      .forEach(({ s }, i) => {
        s.link.animate([
          { transform: `translate(${cx - (s.X + s.w / 2)}px, ${cy - (s.Y + s.h / 2)}px) scale(0.3)`, opacity: 0 },
          { opacity: 1, offset: 0.28 },
          { transform: 'none', opacity: 1 }
        ], { duration: 1500, delay: i * 30, easing: EASE_DEAL, fill: 'backwards' });
      });
  }

  async function intro() {
    const el = $('#intro');
    const word = $('#intro-word');
    const brand = $('#brand');
    const first = plane.slots.filter((s) => s.vis);

    if (params.has('nointro') || still()) {
      el.remove();
      html.classList.remove('is-booting');
      return;
    }

    try {
      /* Word by word, so letter-pair kerning survives. */
      word.innerHTML = word.textContent.trim().split(/\s+/).map((w) => `<span class="w"><span>${esc(w)}</span></span>`).join(' ');
      brand.style.opacity = '0';
      $$('.frame-link', plane.el).forEach((a) => { a.style.opacity = '0'; });

      await Promise.race([
        Promise.all([document.fonts.load('620 80px Inter'), document.fonts.load('400 11px "Geist Mono"')]),
        wait(1400)
      ]);

      const seen = isReturning();
      el.classList.add('is-live');
      $$('.w > span', word).forEach((span, i) => {
        span.animate([{ transform: 'translateY(112%)' }, { transform: 'none' }],
          { duration: 1100, delay: 60 + i * 110, easing: EASE_OUT, fill: 'forwards' });
      });

      await countUp(first, $('#intro-count'), seen ? 450 : 1500);
      await wait(seen ? 40 : 140);

      /* The wordmark is the header's wordmark: it shrinks into its place. */
      const from = word.getBoundingClientRect();
      const to = brand.getBoundingClientRect();
      const scale = to.height / from.height;
      el.classList.remove('is-live');
      word.animate([{ transform: 'none' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})` }],
        { duration: 1250, easing: EASE_IO, fill: 'forwards' });
      $('.intro-bg', el).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, delay: 120, easing: 'ease-in-out', fill: 'forwards' });

      $$('.frame-link', plane.el).forEach((a) => { a.style.opacity = ''; });
      deal(first);
      plane.lastInput = -1e9;                       /* start drifting straight away */
      setTimeout(() => html.classList.remove('is-booting'), 700);

      await wait(1260);
    } catch (error) {
      /* Whatever happens, the site must appear. */
      $$('.frame-link', plane.el).forEach((a) => { a.style.opacity = ''; });
    }
    brand.style.opacity = '';
    html.classList.remove('is-booting');
    el.remove();
  }

  function boot() {
    fillSite();

    if (!PHOTOS.length) {
      $('#intro').remove();
      html.classList.remove('is-booting');
      state.booting = false;
      buildIndex(); bindSheet(); bindKeys();
      window.addEventListener('hashchange', applyRoute);
      openSheet();
      return;
    }

    context.roll.innerHTML = `<span class="roll-in">${contextMarkup()}</span>`;
    buildSeriesNav();
    buildIndex();
    measureHud();
    document.fonts.ready.then(() => { measureHud(); fitContext(); });

    /* Opening position: the first column stands on the same margin as the
       wordmark and the title. After that the table is the visitor's. */
    plane.tx = plane.x = Math.round(parseFloat(getComputedStyle($('.hud-top')).paddingLeft) || 24);
    buildPlane();
    tickPlane(0.0001);

    bindPlane();
    bindCursor();
    bindViewer();
    bindSheet();
    bindKeys();

    tickClock();
    setInterval(tickClock, 15000);

    tickers.push(tickPlane, tickReticle, tickCursor, tickPeek);
    requestAnimationFrame(loop);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        measureHud();
        buildPlane();
        plane.paused = false;
        tickPlane(0.0001);
        plane.paused = viewer.open || sheet.open;
        fitContext();
        if (sheet.open) splitLead();
        if (viewer.open) {
          const p = PHOTOS[viewer.index];
          placeFigure(viewer.figs[viewer.front], p);
          railTo(p, true);
        }
      }, 160);
    });

    window.addEventListener('hashchange', applyRoute);

    if (params.has('debug')) {
      window.__jw = {
        plane, reticle, viewer, sheet, state, PHOTOS, SERIES, cursor,
        jump(dx, dy) { plane.tx += dx; plane.ty += dy; settlePlane(); }
      };
    }

    intro().then(() => {
      state.booting = false;
      fitContext();
      touchPlane();
      plane.lastInput = performance.now() - 3500;   /* a short pause, then the drift */
      applyRoute();
    });
  }

  boot();
})();
