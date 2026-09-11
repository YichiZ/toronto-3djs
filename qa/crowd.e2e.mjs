/**
 * Issue #38 in a real browser: a pedestrian no longer walks through the camera.
 *
 * Stand on a walking pedestrian's own line, 3 m ahead of it, and watch where
 * its rendered figure goes as it passes.
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

test('a pedestrian heading straight at the walker steps round it', async () => {
  const r = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ctx, controls } = window.__TWIN__;
    controls.teleport('front-bay-west');
    const agents = ctx.scene.getObjectByName('pedestrians').userData.agents();
    // A street agent walking, mid-edge, with room to pass the walker before its next corner.
    const a = agents.find((x) => x.wait <= 0 && x.edge.y >= -0.5 && x.edge.len - x.s > 8 && x.slot < x.im.count);
    if (!a) throw new Error('no suitable pedestrian');
    const from = a.rev ? a.edge.b : a.edge.a;
    const to = a.rev ? a.edge.a : a.edge.b;
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const dx = (to.x - from.x) / len;
    const dz = (to.z - from.z) / len;
    const f = a.s / len;
    const px = from.x + (to.x - from.x) * f;
    const pz = from.z + (to.z - from.z) * f;
    ctx.camera.position.set(px + dx * 3, a.edge.y + 1.7, pz + dz * 3);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let min = Infinity;
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      await new Promise((res) => requestAnimationFrame(res));
      a.im.getMatrixAt(a.slot, m);
      p.setFromMatrixPosition(m);
      min = Math.min(min, Math.hypot(p.x - ctx.camera.position.x, p.z - ctx.camera.position.z));
    }
    return { min, speed: a.speed };
  });
  // Unfixed: it walks straight through, closest ~0 m.
  assert.ok(r.min > 0.8, `the pedestrian came within ${r.min.toFixed(2)} m of the walker`);
});

test('the crowd still never blocks the walker: pedestrians stay out of collision', async () => {
  const inIndex = await page.evaluate(() => {
    const { controls, ctx } = window.__TWIN__;
    const peds = ctx.scene.getObjectByName('pedestrians');
    let any = false;
    peds.traverse((o) => { if (o.isInstancedMesh && !o.userData.noCollide) any = true; });
    return any;
  });
  assert.equal(inIndex, false);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
