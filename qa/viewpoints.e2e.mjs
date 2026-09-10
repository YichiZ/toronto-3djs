/**
 * Every walk viewpoint stands on a real floor - issue #24, at runtime.
 *
 * qa/viewpoints.mjs checks the data for below-street viewpoints; this asks the
 * real scene about ALL of them: teleport, let streaming catch up, and cast down
 * from the eye through the walker's own collision index. "Held at the level's
 * nominal height with nothing underneath" is exactly what the PATH corridor
 * viewpoint did, 8 m inside solid ground.
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

test('every walk viewpoint has a real floor under the walker', async () => {
  const floorless = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ctx, controls } = window.__TWIN__;
    const { VIEWPOINTS } = await import('/src/data/references.js');
    const solid = (h) => {
      if (!h.face) return false;
      for (let o = h.object.userData?.collisionSource ?? h.object; o; o = o.parent) if (o.visible === false || o.userData?.noCollide) return false;
      return true;
    };
    const tick = () => ctx.onFrame.forEach((f) => { try { f(0.3); } catch { /* one system failing is reported elsewhere */ } });
    const missing = [];
    for (const v of VIEWPOINTS.filter((x) => x.mode === 'walk')) {
      controls.teleport(v.id);
      tick(); tick();                                     // streaming and LOD, made current here
      const p = ctx.camera.position;
      const rc = new THREE.Raycaster(p.clone(), new THREE.Vector3(0, -1, 0), 0, 3.2);   // eye to 1.5 m below the feet
      rc.camera = ctx.camera;
      if (!controls.collision.intersect(rc).find(solid)) missing.push(`${v.id} (${p.x.toFixed(0)}, ${p.y.toFixed(1)}, ${p.z.toFixed(0)})`);
    }
    return missing;
  });
  assert.deepEqual(floorless, [], `no floor under: ${floorless.join(', ')}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
