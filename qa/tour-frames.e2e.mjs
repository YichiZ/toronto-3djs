/**
 * Issue #114 in a real browser: three tour beats did not show what their
 * captions name, and they are the opening shot and the two most specific
 * promises in the script.
 *
 * Sampled mid-beat — min(seconds / 2, 12) in, where a viewer spends the time,
 * not at the knot between beats.
 *
 *   npm run e2e
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld } from './e2eHarness.mjs';

let world;
let page;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors });
  page = world.page;
});

after(async () => { await world?.close(); });

/** Seek the tour to the middle of a beat and let the frame settle. */
async function midBeat(index) {
  await page.evaluate(async (i) => {
    const { tour, controls } = window.__TWIN__;
    controls.setMode('cinematic');
    if (!tour.isRunning()) tour.start();
    let start = 0;
    for (let k = 0; k < i; k++) start += tour.beats[k].seconds;
    tour.seek(start + Math.min(tour.beats[i].seconds / 2, 12));
  }, index);
  await page.waitForTimeout(900);
}

/** What share of the frame each named entity covers, and what is nearest. */
const FRAME = `async (ids) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const reg = await import('/src/core/registry.js');
  const { ctx } = window.__TWIN__;
  const cam = ctx.camera;
  cam.updateMatrixWorld();
  const moving = new Set(['vehicles', 'pedestrians', 'trains']);
  const shown = (o) => { for (let p = o; p; p = p.parent) { if (!p.visible || moving.has(p.name)) return false; } return o.material?.visible !== false; };
  const under = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
  const roots = ids.map((id) => ({ id, object: reg.get(id)?.object ?? null }));
  const rc = new THREE.Raycaster();
  rc.camera = cam;
  const share = Object.fromEntries(ids.map((id) => [id, 0]));
  let n = 0;
  let nearest = Infinity;
  for (let j = 0; j < 12; j++) for (let i = 0; i < 20; i++) {
    rc.setFromCamera(new THREE.Vector2(-1 + (i + 0.5) / 10, -1 + (j + 0.5) / 6), cam);
    rc.far = 4000;
    const h = rc.intersectObject(ctx.scene, true).find((x) => x.face && shown(x.object) && !x.object.userData?.noCollide);
    n++;
    if (!h) continue;
    for (const r of roots) if (r.object && under(h.object, r.object)) share[r.id]++;
    if (Math.abs(i - 9.5) < 4 && Math.abs(j - 5.5) < 3) nearest = Math.min(nearest, h.distance);
  }
  return {
    share: Object.fromEntries(Object.entries(share).map(([k, v]) => [k, Math.round((100 * v) / n)])),
    nearest: +nearest.toFixed(1),
  };
}`;

test('beat 1 opens on the station and the tower it names (#114)', async () => {
  await midBeat(0);
  const f = await page.evaluate(`(${FRAME})(["union-station", "cn-tower"])`);
  const where = JSON.stringify(f);
  // Unfixed: a CIBC Square curtain wall at a Dutch angle - both at 0%.
  assert.ok(f.share['union-station'] >= 1, `no station in the establishing shot - ${where}`);
  assert.ok(f.share['cn-tower'] >= 1, `no CN Tower closing the west end - ${where}`);
});

test('beat 3 shows the entablature its caption is about (#114)', async () => {
  await midBeat(2);
  const f = await page.evaluate(`(${FRAME})(["union-colonnade", "union-entablature"])`);
  const where = JSON.stringify(f);
  // Unfixed: the entablature was cropped above the frame at 5%, with a lamp
  // post 5.7 m away down the middle of the shot.
  assert.ok(f.share['union-entablature'] >= 10, `the entablature is ${f.share['union-entablature']}% of the frame - ${where}`);
  assert.ok(f.share['union-colonnade'] >= 8, `the columns are ${f.share['union-colonnade']}% of the frame - ${where}`);
  assert.ok(f.nearest >= 8, `something is ${f.nearest} m away in the middle of the shot - ${where}`);
});

test('beat 4 has a frieze that reads at tour distance (#114)', async () => {
  await midBeat(3);
  const sd = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
    // The right-hand wall's carved names, at the frame's own resolution:
    // downscaled, 0.8 m lettering 30 m away disappears entirely.
    const c = document.createElement('canvas');
    c.width = 260; c.height = 170;
    const g = c.getContext('2d');
    g.drawImage(window.__TWIN__.ctx.renderer.domElement, 950, 55, 260, 170, 0, 0, 260, 170);
    const d = g.getImageData(0, 0, 260, 170).data;
    const L = [];
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    const mean = L.reduce((a, b) => a + b, 0) / L.length;
    res(Math.sqrt(L.reduce((a, b) => a + (b - mean) ** 2, 0) / L.length));
  })));
  // Unfixed: 4.2 - white-on-white, with "C A L G A" the only legible fragment.
  assert.ok(sd > 5.5, `the frieze reads at ${sd.toFixed(1)} against the stone`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
