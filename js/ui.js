// ui.js
// Shared redesign pieces: the icon set and the liquid-glass "jelly" spring for .lg buttons.
// Loaded before app.js; exposes window.FT_ICONS.
(() => {
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const I = {
  flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="6" height="6" rx="3"/><rect x="15" y="3" width="6" height="5" rx="2.5"/><rect x="15" y="16" width="6" height="5" rx="2.5"/><path d="M9 12h3M12 5.5V18.5M12 5.5h3M12 18.5h3"/></svg>',
  all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  done: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="currentColor"/><path d="m7 12.4 3.4 3.4 6.6-7.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  doneOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.25 12.3 2.55 2.55 4.95-5.7" stroke-width="2.5"/></svg>',
  // The tick inside every filled circle (steps, swatches): same geometry as `done`, drawn edge to edge of its circle
  circleTick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m7 12.4 3.4 3.4 6.6-7.6" pathLength="1"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.75" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10" pathLength="1"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  side: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18 9 12l6-6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18 9 12l6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="5" rx="2.5"/><rect x="2" y="16" width="8" height="5" rx="2.5"/><rect x="14" y="16" width="8" height="5" rx="2.5"/><path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  collapseAll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="6" rx="3"/><rect x="4" y="14" width="16" height="6" rx="3"/></svg>',
  expandAll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="2.5" width="16" height="5" rx="2.5"/><rect x="4" y="9.5" width="16" height="5" rx="2.5"/><rect x="4" y="16.5" width="16" height="5" rx="2.5"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>',
  addPhase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  plusCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 8v8M8 12h8"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  cardIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7.5" y="3" width="9" height="5.5" rx="2.75" fill="currentColor" stroke="none"/><rect x="2.5" y="15.5" width="8" height="5.5" rx="2.75" fill="currentColor" stroke="none"/><rect x="13.5" y="15.5" width="8" height="5.5" rx="2.75" fill="currentColor" stroke="none"/><path d="M12 8.5V12M6.5 15.5V14.2A2.2 2.2 0 0 1 8.7 12h6.6a2.2 2.2 0 0 1 2.2 2.2v1.3"/></svg>',
  addSub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="11" height="6" rx="3"/><path d="M6 9v6.5a2.5 2.5 0 0 0 2.5 2.5H11"/><path d="M18 13v8M14 17h8"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  chevrons: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 9 4-4 4 4M8 15l4 4 4-4"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};
window.FT_ICONS = I;

/* Liquid glass: the glint and rim light follow the cursor; the jelly motion is an underdamped spring
   per element, so it wobbles once and stays interruptible. STIFF 380 / DAMP 22 (user-approved). */
const STIFF = 380, DAMP = 22; // damping ratio ~0.56: one soft overshoot, then it settles
const KEYS = ['x', 'y', 'sx', 'sy'];
const jellies = new WeakMap();
// Round glass buttons and groups scale evenly (stretch 0) so they never go oval; the text capsule may stretch a little.
const cfg = el => el.matches('.btn-primary, .btn-secondary, .btn-danger') ? { shift: 2, stretch: .03, hover: 1.04, press: .94 }
  : el.classList.contains('glass-group') ? { shift: 1, stretch: 0, hover: 1.03, press: .96 }
  : { shift: 1, stretch: 0, hover: 1.05, press: .92 };

function jelly(el) {
  let j = jellies.get(el);
  if (!j) {
    j = { el, s: { x: 0, y: 0, sx: 1, sy: 1 }, v: { x: 0, y: 0, sx: 0, sy: 0 }, t: { x: 0, y: 0, sx: 1, sy: 1 }, run: false, last: 0, pressed: false };
    jellies.set(el, j);
  }
  return j;
}
function paint(j) {
  const { x, y, sx, sy } = j.s;
  j.el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}
function drive(j, target) {
  Object.assign(j.t, target);
  if (reduceMotion.matches) { Object.assign(j.s, j.t); paint(j); return; }
  if (j.run) return;
  j.run = true; j.last = performance.now();
  requestAnimationFrame(function step(now) {
    const dt = Math.min(.032, (now - j.last) / 1000); j.last = now;
    let live = false;
    for (const k of KEYS) {
      const a = -STIFF * (j.s[k] - j.t[k]) - DAMP * j.v[k];
      j.v[k] += a * dt; j.s[k] += j.v[k] * dt;
      if (Math.abs(j.v[k]) > 1e-3 || Math.abs(j.s[k] - j.t[k]) > 1e-4) live = true;
    }
    if (!live) { Object.assign(j.s, j.t); KEYS.forEach(k => j.v[k] = 0); }
    paint(j);
    if (live && j.el.isConnected) requestAnimationFrame(step); else j.run = false;
  });
}
function follow(el, e) {
  const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  el.style.setProperty('--mx', px + 'px'); el.style.setProperty('--my', py + 'px');
  const c = cfg(el), j = jelly(el);
  const dx = Math.max(-1, Math.min(1, px / r.width * 2 - 1)), dy = Math.max(-1, Math.min(1, py / r.height * 2 - 1));
  const base = j.pressed ? c.press : c.hover;
  drive(j, {
    x: dx * c.shift, y: dy * c.shift,
    sx: base * (1 + Math.abs(dx) * c.stretch - Math.abs(dy) * c.stretch * .5),
    sy: base * (1 + Math.abs(dy) * c.stretch - Math.abs(dx) * c.stretch * .5),
  });
}
const lgOf = e => { const el = e.target.closest && e.target.closest(':is(#app, .scrim) .lg'); return el && !el.disabled ? el : null; };
document.addEventListener('pointermove', e => {
  const el = lgOf(e); if (el) follow(el, e);
});
document.addEventListener('pointerout', e => {
  const el = lgOf(e);
  if (el && !el.contains(e.relatedTarget)) { const j = jelly(el); j.pressed = false; drive(j, { x: 0, y: 0, sx: 1, sy: 1 }); }
});
document.addEventListener('pointerdown', e => {
  const el = lgOf(e); if (!el) return;
  const j = jelly(el); j.pressed = true; follow(el, e);
});
document.addEventListener('pointerup', e => {
  const el = lgOf(e); if (!el) return;
  const j = jelly(el), c = cfg(el);
  j.pressed = false;
  // release kick: the jelly wobble (an even pop for round buttons so they never go oval)
  const kick = (1 - c.press) * 5;
  j.v.sx += kick; j.v.sy += c.stretch ? -kick : kick;
  follow(el, e);
});
})();
