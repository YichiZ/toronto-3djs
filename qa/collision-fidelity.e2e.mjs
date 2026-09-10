/**
 * Issue #13 in a real browser: collision that matches the geometry.
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

/** Stand at an eye position on a level, let ground() settle, return the settled eye height. */
const settleAt = (x, eyeY, z, levelY) => page.evaluate(async ([px, py, pz, ly]) => {
  const { ctx, controls } = window.__TWIN__;
  controls.setMode('walk');
  ctx.camera.position.set(px, py, pz);
  controls.setLevelByY(ly);
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  let last = Infinity;
  for (let i = 0; i < 240; i++) {
    await frame();
    const y = ctx.camera.position.y;
    if (i > 20 && Math.abs(y - last) < 1e-3) break;
    last = y;
  }
  return ctx.camera.position.y;
}, [x, eyeY, z, levelY]);

test('no 2 m step up onto a slab: the step-up guard is one step, not 3.6 m', async () => {
  // At (-16, 40), inside Union's east wing, the Bay Concourse's hall ceiling
  // reaches 1.9-1.99 m above the street. The guard compared a surface's rise
  // against STEP_UP + PROBE_ABOVE = 3.6 m - more than the probe can ever see
  // above the feet - so it rejected nothing, and a walker placed on the street
  // stepped straight up onto the slab and stood at eye 3.69.
  const eye = await settleAt(-16, 1.7, 40, 0);
  assert.ok(eye < 2.2, `stood at eye ${eye.toFixed(2)} - on the slab, 2 m above the street`);
});

test('a long PATH corridor is drawn while you stand in it, and its walls are solid', async () => {
  // The Union-to-arena corridor belongs to the cluster nearest its MIDPOINT,
  // 'path-cluster-south', centred 112 m from its Union end. Streaming by centre
  // distance left it hidden there - not drawn, and walk-through: rays across it
  // were clear for 8 m, past its 6 m half-width. Stepped by hand, so the answer
  // does not depend on how fast frames arrive.
  const r = await page.evaluate(async () => {
    const { ctx, controls } = window.__TWIN__;
    const { interiorStates } = await import('/src/world/index.js');
    const moving = ['pedestrians', 'vehicles', 'trains'].map((n) => ctx.scene.getObjectByName(n)).filter(Boolean);
    moving.forEach((g) => { g.visible = false; });
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const put = () => {
      controls.setMode('walk');
      ctx.camera.position.set(-111.5, -6.5 + 1.7, 50);
      controls.setLevelByY(-6.5);
      ctx.camera.lookAt(-11.5, -4.8, 50);                  // across the corridor, +x
    };
    put();
    ctx.onFrame.forEach((f) => { try { f(0.3); } catch {} });   // the streaming check, here
    put();
    const drawn = interiorStates().find((s) => s.id === 'path-cluster-south').visible;
    const x0 = ctx.camera.position.x;
    key('keydown', 'KeyW');
    for (let i = 0; i < 300; i++) controls.update(1 / 60);    // five seconds of walking
    key('keyup', 'KeyW');
    moving.forEach((g) => { g.visible = true; });
    return { drawn, moved: ctx.camera.position.x - x0 };
  });
  assert.equal(r.drawn, true, 'the corridor you are standing in is not drawn');
  assert.ok(r.moved < 6, `walked ${r.moved.toFixed(1)} m across a 12 m corridor - through its wall`);
});

test('the street above that corridor does not stream it in - only being in it does', async () => {
  // Its box tops out 4.6 m under a street-level eye. Streaming it from the
  // street would draw a whole cluster nobody up there can see.
  const drawn = await page.evaluate(async () => {
    const { ctx, controls } = window.__TWIN__;
    const { interiorStates } = await import('/src/world/index.js');
    controls.setMode('walk');
    ctx.camera.position.set(-111.5, 1.7, 50);
    controls.setLevelByY(0);
    ctx.onFrame.forEach((f) => { try { f(0.3); } catch {} });
    return interiorStates().find((s) => s.id === 'path-cluster-south').visible;
  });
  assert.equal(drawn, false);
});

test('a hop under a low ceiling stops at the ceiling instead of putting the head through it', async () => {
  // Under the Bay Concourse's slab at (-16, 40) the first surface above a
  // street-level eye is 0.35 m up; a hop used to lift the eye to 2.52, half a
  // metre past it.
  const r = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ctx, controls } = window.__TWIN__;
    const { HEAD_CLEARANCE } = await import('/src/ui/jump.js');
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const solid = (h) => {
      if (!h.face) return false;
      for (let o = h.object.userData?.collisionSource ?? h.object; o; o = o.parent) if (o.visible === false || o.userData?.noCollide) return false;
      return true;
    };
    controls.setMode('walk');
    ctx.camera.position.set(-16, 1.7, 40);
    controls.setLevelByY(0);
    for (let i = 0; i < 40; i++) await frame();
    const rc = new THREE.Raycaster(ctx.camera.position.clone(), new THREE.Vector3(0, 1, 0), 0, 5);
    rc.camera = ctx.camera;
    const above = controls.collision.intersect(rc).find(solid);
    const eye0 = ctx.camera.position.y;
    controls.jump();
    let maxEye = eye0;
    for (let i = 0; i < 70; i++) { await frame(); maxEye = Math.max(maxEye, ctx.camera.position.y); }
    return { eye0, ceiling: above ? above.point.y : null, maxEye, head: HEAD_CLEARANCE, landed: !controls.airborne };
  });
  assert.notEqual(r.ceiling, null, 'no ceiling over this spot any more - the test would prove nothing');
  assert.ok(r.maxEye + r.head <= r.ceiling + 0.01,
    `the head reached ${(r.maxEye + r.head).toFixed(2)}; the ceiling is at ${r.ceiling.toFixed(2)}`);
  assert.ok(r.maxEye > r.eye0 + 0.05, 'it did still hop');
  assert.equal(r.landed, true);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
