/**
 * The cinematic tour in a real browser: #25 (facing backwards) and #67 (the
 * camera was between stops, inside walls, for ten of thirteen captions).
 *
 * Its own file: the tour needs an untouched page.
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
    offStop: cam.position.distanceTo(new THREE.Vector3(...beat.pos)),
    caption: document.querySelector('#tour-caption .tour-text')?.textContent ?? '',
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
    // Unfixed (#25): -1.00 at every sample, the camera facing straight away.
    assert.ok(f.facing > 0.9, `${when} the camera faces its look target at ${f.facing.toFixed(2)}`);
    assert.equal(f.colonnade, true, `${when} the Union colonnade is out of frame`);
    assert.equal(f.cnTower, true, `${when} the CN Tower is out of frame`);
  }
});

test('every caption plays over its own stop, facing what it describes', async () => {
  // #67: each beat spent its caption travelling toward the next stop, on a
  // straight line through buildings. Now, 60% into every beat - past the
  // glide - the camera must stand on that beat's stop, facing it.
  const beats = await page.evaluate(() => window.__TWIN__.tour.beats.map((b) => ({ id: b.id, seconds: b.seconds, caption: b.caption })));
  let start = 0;
  const wrong = [];
  for (const b of beats) {
    await page.evaluate((t) => window.__TWIN__.tour.seek(t), start + b.seconds * 0.6);
    await page.waitForTimeout(250);
    const f = await page.evaluate(`(${FRAME})()`);
    if (f.beat !== b.id || f.offStop > 0.5 || f.facing < 0.95 || f.caption !== b.caption) {
      wrong.push(`${b.id}: on "${f.beat}", ${f.offStop.toFixed(1)} m off its stop, facing ${f.facing.toFixed(2)}`);
    }
    start += b.seconds;
  }
  assert.deepEqual(wrong, []);
});

test('the tour cuts rather than flying through walls', async () => {
  const r = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ctx, tour } = window.__TWIN__;
    const plan = tour.plan();
    const rc = new THREE.Raycaster();
    rc.camera = ctx.camera;
    // Checked here independently of tour.js: every glide's straight line is
    // clear of static geometry. Traffic moves; a car on the line is not a wall.
    const MOVING = new Set(['vehicles', 'pedestrians', 'trains']);
    const moving = (o) => { for (let p = o; p; p = p.parent) if (MOVING.has(p.name)) return true; return false; };
    const blockedGlides = [];
    tour.beats.forEach((b, i) => {
      if (!plan[i]) return;
      const from = new THREE.Vector3(...tour.beats[i - 1].pos);
      const to = new THREE.Vector3(...b.pos);
      rc.set(from, to.clone().sub(from).normalize());
      rc.far = from.distanceTo(to);
      if (rc.intersectObject(ctx.scene, true).some((h) => h.face && !h.object.userData?.noCollide && !moving(h.object))) blockedGlides.push(b.id);
    });
    const cut = (id) => !plan[tour.beats.findIndex((b) => b.id === id)];
    return { blockedGlides, interiorCuts: ['great-hall', 'concourse', 'path'].every(cut) };
  });
  assert.deepEqual(r.blockedGlides, [], 'a glide passes through geometry');
  // The issue's worst frames: facade-from-inside, grey planes, street-from-underground.
  assert.equal(r.interiorCuts, true, 'colonnade -> Great Hall -> concourse -> PATH should be cuts');
});

test('the tour ends back on the street, in walk mode', async () => {
  // #67: it ended in walk mode 16 m over Front Street, level chip "Gardiner deck".
  const total = await page.evaluate(() => window.__TWIN__.tour.duration);
  await page.evaluate((t) => window.__TWIN__.tour.seek(t), total - 0.2);
  await page.waitForTimeout(800);
  const s = await page.evaluate(async () => {
    const { controls, ctx, tour } = window.__TWIN__;
    const { getViewpoint } = await import('/src/data/references.js');
    const p = getViewpoint('front-bay-west').position;
    const c = ctx.camera.position;
    return { running: tour.isRunning(), mode: controls.mode, level: controls.level, fromLanding: Math.hypot(c.x - p.x, c.z - p.z) };
  });
  assert.equal(s.running, false);
  assert.equal(s.mode, 'walk');
  assert.equal(s.level, 'street');
  assert.ok(s.fromLanding < 1, `landed ${s.fromLanding.toFixed(1)} m from Front & Bay`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
