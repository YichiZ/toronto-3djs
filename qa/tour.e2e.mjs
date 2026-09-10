/**
 * Issue #25 in a real browser: the tour filmed every beat facing backwards.
 *
 * tour.js aimed a bare Object3D and copied its rotation onto the camera, but
 * Object3D.lookAt points +Z at the target while a camera looks down -Z. The
 * opening shot, captioned "Union Station along the bottom, the CN Tower closing
 * the west end", was 88-93% sky. Its own file: the tour needs an untouched page.
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

/** In-page: what the tour camera is framing right now. */
const FRAME = `async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const reg = await import('/src/core/registry.js');
  const { ctx, tour } = window.__TWIN__;
  const cam = ctx.camera;
  cam.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const inView = (id) => frustum.intersectsBox(new THREE.Box3().setFromObject(reg.get(id).object));
  const beat = tour.beat();
  const toTarget = new THREE.Vector3(...beat.look).sub(cam.position).normalize();
  return {
    beat: beat.id,
    elapsed: beat.elapsed,
    colonnade: inView('union-colonnade'),
    cnTower: inView('cn-tower'),
    facing: cam.getWorldDirection(new THREE.Vector3()).dot(toTarget),
  };
}`;

test('the establishing shot frames the colonnade and the CN Tower at 1 s and 10 s', async () => {
  await page.evaluate(() => window.__TWIN__.tour.start());
  const t0 = Date.now();
  for (const at of [1, 10]) {
    await page.waitForTimeout(at * 1000 - (Date.now() - t0));
    const f = await page.evaluate(`(${FRAME})()`);
    const when = `at ${f.elapsed.toFixed(1)} s`;
    assert.equal(f.beat, 'establishing', when);
    // Unfixed: -1.00 at every sample, the camera facing straight away.
    assert.ok(f.facing > 0.9, `${when} the camera faces its look target at ${f.facing.toFixed(2)}`);
    assert.equal(f.colonnade, true, `${when} the Union colonnade is out of frame`);
    assert.equal(f.cnTower, true, `${when} the CN Tower is out of frame`);
  }
  await page.evaluate(() => window.__TWIN__.tour.stop());
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
