/**
 * The walk-mode minimap (issue #7).
 *
 * Supplementary by design: the brief requires orientation to work without a
 * minimap, so it stays off until M is pressed, and only ever shows while
 * walking. What it draws is decided in minimapPlan.js, which is pure and
 * unit-tested; this module owns the canvas, the toggle and click-to-teleport.
 *
 * ponytail: the plan is redrawn from primitives on each refresh - 10 Hz, only
 * while shown, culled to the view - rather than blitted from a cached layer
 * per level as the issue sketched. Measured at 0.1 ms a redraw on the street
 * and 0.02 ms in the PATH; add the cache if a denser plan ever makes it show
 * up in a profile.
 */
import * as THREE from 'three';
import { VIEWPOINTS } from '../data/references.js';
import { planFor, worldToMap, pickViewpoint, trueNorthOnMap, VIEW_METRES } from './minimapPlan.js';

const SIZE = 220;                 // CSS px; matches .hud-minimap canvas in style.css
const REFRESH = 0.1;              // seconds: ~10 Hz is plenty at walking pace
const BACKGROUND = '#0e131a';
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

  let wanted = false;             // M toggles this; walk mode is the other condition
  let plan = [];
  let planLevel = null;
  let accum = REFRESH;
  const dir = new THREE.Vector3();
  const centre = { x: 0, z: 0 };  // what the map is centred on as last drawn - clicks map onto that

  const visible = () => wanted && controls.mode === 'walk';

  const outside = (x0, z0, x1, z1) => {
    const half = VIEW_METRES / 2;
    return x1 < centre.x - half || x0 > centre.x + half || z1 < centre.z - half || z0 > centre.z + half;
  };

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
    centre.x = camera.position.x;
    centre.z = camera.position.z;
    const k = SIZE / VIEW_METRES;

    for (const p of plan) {
      const st = STYLE[p.style];
      if (p.kind === 'rect') {
        if (outside(p.x0, p.z0, p.x1, p.z1)) continue;
        const a = worldToMap(p.x0, p.z0, centre, SIZE);
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
        const m = worldToMap(q.x, q.z, centre, SIZE);
        if (i) g.lineTo(m.x, m.y); else g.moveTo(m.x, m.y);
      });
      g.stroke();
    }

    // Viewpoints: the dots you can click to jump to.
    g.fillStyle = '#e8edf3';
    for (const v of VIEWPOINTS) {
      const m = worldToMap(v.position.x, v.position.z, centre, SIZE);
      if (m.x < 0 || m.y < 0 || m.x > SIZE || m.y > SIZE) continue;
      g.beginPath();
      g.arc(m.x, m.y, 3, 0, Math.PI * 2);
      g.fill();
    }

    // You are here: a wedge along the view direction. The map stays north-up.
    camera.getWorldDirection(dir);
    g.save();
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(Math.atan2(dir.z, dir.x));
    g.fillStyle = '#7dd3fc';
    g.beginPath();
    g.moveTo(9, 0);
    g.lineTo(-5, 5.5);
    g.lineTo(-2.5, 0);
    g.lineTo(-5, -5.5);
    g.closePath();
    g.fill();
    g.restore();

    // True north: the grid runs 16.7 degrees off it, so a tick says where it is.
    const n = trueNorthOnMap();
    const r = SIZE / 2 - 12;
    g.fillStyle = '#93a3b5';
    g.font = '10px ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', SIZE / 2 + n.x * r, SIZE / 2 + n.y * r);
  }

  ctx.onFrame.push((dt) => {
    const show = visible();
    if (root.hidden === show) root.hidden = !show;
    if (!show) return;
    accum += dt;
    if (accum < REFRESH) return;
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
    if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
    if (e.code === 'KeyM' && !e.repeat) toggle();
  }
  window.addEventListener('keydown', onKey);

  const viewpointAt = (e) => pickViewpoint(e.offsetX, e.offsetY, VIEWPOINTS, centre, SIZE);
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
