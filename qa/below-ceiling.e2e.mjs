/**
 * Issue #111 in a real browser: below the street there was no ceiling to read.
 *
 * In the PATH corridor the upper half of the frame was featureless white,
 * brighter than the floor, under tour beat 6's "no daylight anywhere". The Bay
 * underpass was the same in beige, with tour beat 10 saying "the corridor is
 * carried on steel" over a flat slab and no steel in shot.
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

/** The top third of the frame, and what the upper rays land on. */
const CEILING = `async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { ctx } = window.__TWIN__;
  const cam = ctx.camera;
  cam.updateMatrixWorld();
  await new Promise((res) => requestAnimationFrame(res));
  const c = document.createElement('canvas');
  c.width = 160; c.height = 100;
  const g = c.getContext('2d');
  g.drawImage(ctx.renderer.domElement, 0, 0, 160, 100);
  const d = g.getImageData(0, 0, 160, 30).data;
  const L = [];
  for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
  const mean = L.reduce((a, b) => a + b, 0) / L.length;
  const sd = Math.sqrt(L.reduce((a, b) => a + (b - mean) ** 2, 0) / L.length);
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return o.material?.visible !== false; };
  const rc = new THREE.Raycaster();
  rc.camera = cam;
  const mats = [];
  for (const [x, y] of [[-0.4, 0.5], [0, 0.5], [0.4, 0.5], [0, 0.25]]) {
    rc.setFromCamera(new THREE.Vector2(x, y), cam);
    const h = rc.intersectObject(ctx.scene, true).find((i) => shown(i.object));
    mats.push(h?.object.material?.name ?? null);
  }
  return { mean: +mean.toFixed(1), sd: +sd.toFixed(1), mats };
}`;

test('the Bay underpass shows the steel the tour says carries the corridor (#111)', async () => {
  await page.evaluate(() => {
    window.__TWIN__.controls.teleport('bay-underpass');
    window.__TWIN__.time.setHour(13);
  });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(`(${CEILING})()`);
  const where = JSON.stringify(r);
  // Unfixed: one flat slab, mean 209 and a spread of 1.1, every ray on ceilingPanel.
  assert.ok(r.sd > 12, `the ceiling is a flat slab: spread ${r.sd} - ${where}`);
  assert.ok(r.mats.some((m) => /steel/i.test(m ?? '')), `no steel overhead - ${where}`);
});

test('the PATH corridor has a soffit with ribs, not a white void (#111)', async () => {
  await page.evaluate(() => {
    window.__TWIN__.controls.teleport('path-corridor');
    window.__TWIN__.time.setHour(13);
  });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(`(${CEILING})()`);
  const where = JSON.stringify(r);
  // Unfixed: every upper ray landed on the one ceilingPanel plane.
  assert.ok(r.mats.some((m) => /rib/.test(m ?? '')), `nothing but flat ceiling overhead - ${where}`);
  assert.ok(r.mats.every((m) => !/ceilingPanel/.test(m ?? '')), `still the pale interior panel - ${where}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
