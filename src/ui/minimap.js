/**
 * The walk-mode minimap (issue #7), GTA style.
 *
 * Heading-up: the map turns under a fixed arrow so what is ahead of you is at
 * the top, with ticks for true and grid north since the turning map no longer
 * tells you either. A circle in the bottom-left corner, on whenever you are
 * walking - M hides it, M brings it back - and never outside walk mode. What
 * it draws is decided in minimapPlan.js, which is pure and unit-tested, along
 * with the rotation maths; this module owns the canvas, the toggle and
 * click-to-teleport.
 *
 * ponytail: the plan is redrawn from primitives on each refresh - 10 Hz, only
 * while shown, culled to the view - rather than blitted from a cached layer
 * per level as the issue sketched, and the heading is applied as one canvas
 * rotation rather than per point. Measured at 0.1 ms a redraw on the street
 * and 0.02 ms in the PATH; add the cache if a denser plan ever makes it show
 * up in a profile. The circle is CSS `border-radius` on a square canvas, not
 * a 2D clip: same picture, one less path per frame.
 */
import * as THREE from 'three';
import { VIEWPOINTS } from '../data/references.js';
import { planFor, worldToMap, pickViewpoint, trueNorthOnMap, gridNorthOnMap, headingOf, VIEW_METRES } from './minimapPlan.js';
import { getTarget, getRoute } from './wayfinding.js';
import { isTyping } from './typing.js';

const SIZE = 220;                 // CSS px; matches .hud-minimap canvas in style.css
const RADIUS = SIZE / 2;          // the CSS circle the canvas is rounded to
const REFRESH = 0.1;              // seconds: ~10 Hz is plenty at walking pace
const BACKGROUND = '#0e131a';
const BLIP_R = 5;                 // the destination ring
const EDGE_PAD = 9;               // how far inside the rim an edge-pinned blip sits
const TICK_R = RADIUS - 12;       // where the north letters sit
const VIEWPOINT_R = 3;
const TURN_EPS = 0.002;           // radians of heading change worth a redraw
const STYLE = {
  street: { stroke: '#46505c' },
  streetDim: { stroke: '#262d36' },
  building: { fill: '#2b3542' },
  landmark: { fill: '#3a4c62' },
  buildingDim: { fill: '#19202a' },
  path: { stroke: '#7dd3fc' },
  room: { fill: 'rgba(125, 211, 252, 0.32)', stroke: '#7dd3fc' },
  deck: { fill: 'rgba(251, 191, 36, 0.28)', stroke: '#fbbf24' },
};

/**
 * @param {import('../core/context.js').Context} ctx
 * @param {{controls: ReturnType<typeof import('./controls.js').install>}} deps
 */
export function install(ctx, { controls }) {
  const { camera } = ctx;
  const root = document.createElement('div');
  root.className = 'hud-panel hud-minimap';
  root.hidden = true;
  const canvas = document.createElement('canvas');
  const label = document.createElement('div');
  label.className = 'minimap-level';
  root.append(canvas, label);
  (document.querySelector('.hud') ?? document.body).appendChild(root);
  const g = canvas.getContext('2d');

  let wanted = true;              // on while walking; M toggles it off
  let plan = [];
  let planLevel = null;
  let accum = REFRESH;
  const dir = new THREE.Vector3();
  // Centre and heading as last drawn - clicks are mapped back through these.
  const view = { x: 0, z: 0, heading: 0 };

  // The help panel lands on the same corner and is the thing you are reading,
  // so the disc steps aside while it is open (#29 checks for the overlap).
  const helpOpen = () => { const h = document.querySelector('.hud-help'); return !!h && !h.hidden; };
  const visible = () => wanted && controls.mode === 'walk' && !helpOpen();

  // The CSS circle is inscribed in the canvas square, so anything visible lies
  // within VIEW_METRES / 2 of the walker whichever way the map is turned.
  const outside = (x0, z0, x1, z1) => {
    const half = VIEW_METRES / 2;
    return x1 < view.x - half || x0 > view.x + half || z1 < view.z - half || z0 > view.z + half;
  };

  /** Distance from the map centre, for culling to the circle. */
  const fromCentre = (m) => Math.hypot(m.x - SIZE / 2, m.y - SIZE / 2);

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(SIZE * dpr);
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = BACKGROUND;
    g.fillRect(0, 0, SIZE, SIZE);

    const level = controls.level;
    if (level !== planLevel) {
      plan = planFor(level);
      planLevel = level;
      label.textContent = level;
      root.dataset.level = level;
    }
    view.x = camera.position.x;
    view.z = camera.position.z;
    camera.getWorldDirection(dir);
    view.heading = headingOf(dir.x, dir.z);
    const k = SIZE / VIEW_METRES;

    // Everything in grid metres is drawn through one rotation, so the walker's
    // heading is up; the arrow and the ticks go on afterwards, upright.
    g.save();
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(-view.heading);
    g.translate(-SIZE / 2, -SIZE / 2);

    for (const p of plan) {
      const st = STYLE[p.style];
      if (p.kind === 'rect') {
        if (outside(p.x0, p.z0, p.x1, p.z1)) continue;
        const a = worldToMap(p.x0, p.z0, view, SIZE);
        const w = (p.x1 - p.x0) * k;
        const h = (p.z1 - p.z0) * k;
        if (st.fill) { g.fillStyle = st.fill; g.fillRect(a.x, a.y, w, h); }
        if (st.stroke) { g.strokeStyle = st.stroke; g.lineWidth = 1; g.strokeRect(a.x, a.y, w, h); }
        continue;
      }
      const xs = p.points.map((q) => q.x);
      const zs = p.points.map((q) => q.z);
      const pad = p.width / 2;
      if (outside(Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad)) continue;
      g.strokeStyle = st.stroke;
      g.lineWidth = Math.max(1, p.width * k);
      g.beginPath();
      p.points.forEach((q, i) => {
        const m = worldToMap(q.x, q.z, view, SIZE);
        if (i) g.lineTo(m.x, m.y); else g.moveTo(m.x, m.y);
      });
      g.stroke();
    }

    // Viewpoints: the dots you can click to jump to.
    g.fillStyle = '#e8edf3';
    for (const v of VIEWPOINTS) {
      const m = worldToMap(v.position.x, v.position.z, view, SIZE);
      if (fromCentre(m) > RADIUS - VIEWPOINT_R) continue;
      g.beginPath();
      g.arc(m.x, m.y, VIEWPOINT_R, 0, Math.PI * 2);
      g.fill();
    }

    // The route to it (#11), corner by corner along the sidewalks.
    const path = getRoute();
    if (path?.length > 1) {
      g.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      g.lineWidth = 2;
      g.beginPath();
      path.forEach((q, i) => {
        const m = worldToMap(q.x, q.z, view, SIZE);
        if (i) g.lineTo(m.x, m.y); else g.moveTo(m.x, m.y);
      });
      g.stroke();
    }

    // Destination (#11): an amber ring, pinned to the rim when off the map.
    const dest = getTarget();
    if (dest) {
      const m = worldToMap(dest.x, dest.z, view, SIZE);
      const d = fromCentre(m);
      const max = RADIUS - EDGE_PAD;
      const t = d > max ? max / d : 1;
      g.strokeStyle = '#fbbf24';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(SIZE / 2 + (m.x - SIZE / 2) * t, SIZE / 2 + (m.y - SIZE / 2) * t, BLIP_R, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();

    // You are here: the arrow never moves - the map turned instead.
    g.fillStyle = '#7dd3fc';
    g.beginPath();
    g.moveTo(SIZE / 2, SIZE / 2 - 9);
    g.lineTo(SIZE / 2 + 5.5, SIZE / 2 + 5);
    g.lineTo(SIZE / 2, SIZE / 2 + 2.5);
    g.lineTo(SIZE / 2 - 5.5, SIZE / 2 + 5);
    g.closePath();
    g.fill();

    // Which way is north, now that up is wherever you are looking: 'N' for true
    // north, a dot for grid north, the 16.7 degrees between them visible.
    const n = trueNorthOnMap(view.heading);
    const gn = gridNorthOnMap(view.heading);
    g.fillStyle = '#93a3b5';
    g.font = '10px ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', SIZE / 2 + n.x * TICK_R, SIZE / 2 + n.y * TICK_R);
    g.beginPath();
    g.arc(SIZE / 2 + gn.x * TICK_R, SIZE / 2 + gn.y * TICK_R, 1.5, 0, Math.PI * 2);
    g.fill();
  }

  ctx.onFrame.push((dt) => {
    const show = visible();
    if (root.hidden === show) root.hidden = !show;
    if (!show) return;
    accum += dt;
    // The whole map turns with the head, and looking around is faster than
    // walking: redraw at once while turning, at REFRESH otherwise.
    camera.getWorldDirection(dir);
    const turning = Math.abs(headingOf(dir.x, dir.z) - view.heading) > TURN_EPS;
    if (accum < REFRESH && !turning) return;
    accum = 0;
    draw();
  });

  function toggle(force) {
    wanted = typeof force === 'boolean' ? force : !wanted;
    accum = REFRESH;              // draw on the very next frame
    root.hidden = !visible();
    return wanted;
  }

  function onKey(e) {
    const t = e.target;
    if (isTyping(t)) return;
    if (e.code === 'KeyM' && !e.repeat) toggle();
  }
  window.addEventListener('keydown', onKey);

  // Dots are not drawn on the rim, so nothing there is clickable either.
  const viewpointAt = (e) => (fromCentre({ x: e.offsetX, y: e.offsetY }) > RADIUS - VIEWPOINT_R ? null
    : pickViewpoint(e.offsetX, e.offsetY, VIEWPOINTS, view, SIZE, undefined, undefined, view.heading));
  canvas.addEventListener('click', (e) => {
    const v = viewpointAt(e);
    if (v) controls.teleport(v.id);
  });
  canvas.addEventListener('mousemove', (e) => {
    const v = viewpointAt(e);
    canvas.title = v ? v.name : '';
    canvas.style.cursor = v ? 'pointer' : 'default';
  });

  return {
    toggle,
    shown: () => !root.hidden,
    draw,
    dispose() {
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
