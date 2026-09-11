/**
 * Issue #23 in a real browser: what a visitor sees first.
 *
 * Its own file, because "the first frame" is only meaningful on a page nobody
 * has touched yet - and each e2e file gets a fresh browser.
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

/**
 * In-page: what a camera's view is made of. A 40 x 24 grid of screen rays, the
 * first VISIBLE surface each, sorted into Union Station, the Loop entrance
 * canopy, and anything else. Rays, not pixels: the canopy's glass renders light
 * grey, which a "near-white row" pixel rule never sees (#23).
 */
const VIEW_SHARE = `async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { ctx } = window.__TWIN__;
  const reg = await import('/src/core/registry.js');
  const canopy = reg.get('forecourt-loop-headhouse').object;
  const union = ['union-station', 'union-colonnade'].map((id) => reg.get(id)?.object).filter(Boolean);
  const under = (o, roots) => { for (let p = o; p; p = p.parent) if (roots.includes(p)) return true; return false; };
  const visible = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
  ctx.camera.updateMatrixWorld();
  const rc = new THREE.Raycaster();
  rc.camera = ctx.camera;
  let c = 0, u = 0, n = 0;
  for (let j = 0; j < 24; j++) for (let i = 0; i < 40; i++) {
    rc.setFromCamera(new THREE.Vector2(-1 + (i + 0.5) / 20, -1 + (j + 0.5) / 12), ctx.camera);
    rc.far = 400;
    const h = rc.intersectObject(ctx.scene, true).find((x) => x.face && visible(x.object) && !x.object.userData?.noCollide);
    n++;
    if (h && under(h.object, [canopy])) c++;
    else if (h && under(h.object, union)) u++;
  }
  const colonnade = new THREE.Box3().setFromObject(reg.get('union-colonnade').object);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse));
  return { union: Math.round((100 * u) / n), canopy: Math.round((100 * c) / n), colonnadeInView: frustum.intersectsBox(colonnade) };
}`;

test('the first frame shows Union Station and the Front Street canyon', async () => {
  // PROMPT.md: "When the application loads, the viewer should immediately see:
  // Union Station and the Front Street canyon." The aerial boot framed CIBC
  // Square and the Royal York; the station was 6% of the view. This runs first,
  // on the page exactly as it loaded, before any test moves the camera.
  const view = await page.evaluate(`(${VIEW_SHARE})()`);
  assert.equal(view.colonnadeInView, true);
  assert.ok(view.union >= 20, `Union Station is ${view.union}% of the first frame`);
  assert.equal(view.canopy, 0, `the Loop canopy is ${view.canopy}% of the first frame`);
  // The card fills on a throttled HUD tick; under a loaded full-suite run it
  // can still read "—" here. Wait for it, then assert on whatever it says.
  await page.waitForFunction(() => (document.querySelector('.hud-place .place-name')?.textContent ?? '—') !== '—', null, { timeout: 5000 }).catch(() => {});
  const label = await page.evaluate(() => document.querySelector('.hud-place .place-name')?.textContent ?? '');
  assert.match(label, /^Union Station\b/, `the HUD opens on "${label}"`);
});

test('the first "Jump to" entry, Front & Bay, is not a wash of Loop-entrance glass', async () => {
  // From (-16, 16) the canopy's glazing filled 39% of the frame.
  await page.selectOption('.hud-bar select', 'front-bay-west');
  await page.waitForTimeout(400);
  const view = await page.evaluate(`(${VIEW_SHARE})()`);
  assert.ok(view.canopy < 3, `the Loop canopy is ${view.canopy}% of the frame`);
  assert.ok(view.union >= 20, `Union Station is ${view.union}% of the frame`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
