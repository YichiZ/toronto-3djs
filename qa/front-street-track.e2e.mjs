/**
 * The no-streetcar-on-front invariant, checked against the BUILT SCENE (#133).
 *
 * qa/traps.mjs can only read what the source says, and the demonstration in that
 * issue says nothing: 400 m of running rail laid down Front Street, in a file
 * whose code never uses the word "streetcar", passed the source check outright.
 * What gives the invariant away is its shape — track is long, narrow, low, and
 * on the ground — so that is what this measures, on every mesh in the corridor
 * regardless of what it is called or which module built it.
 *
 * Kerbs are the near miss and they are 0.35 m wide; rail heads are 0.07-0.16.
 *
 * Instances are unpacked rather than trusted to their mesh: the model's track is
 * an InstancedMesh sitting at the origin with its rails laid out in the matrices,
 * and so is the streetcar fleet. Reading `getWorldPosition` on those reports
 * (0, 0, 0) — which is inside the Front Street corridor, and means nothing.
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

/** Every mesh instance in the scene, as a world-space box, named. */
const BOXES = `async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { ctx } = window.__TWIN__;
  ctx.scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  const out = [];
  const tagOf = (o) => { for (let n = o; n; n = n.parent) if (/streetcar|tram/i.test(n.name)) return n.name; return null; };

  ctx.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    const tag = tagOf(o);
    const count = o.isInstancedMesh ? o.count : 1;
    for (let i = 0; i < count; i++) {
      box.copy(o.geometry.boundingBox);
      if (o.isInstancedMesh) {
        o.getMatrixAt(i, m);
        box.applyMatrix4(m.premultiply(o.matrixWorld));
      } else {
        box.applyMatrix4(o.matrixWorld);
      }
      const sx = box.max.x - box.min.x;
      const sy = box.max.y - box.min.y;
      const sz = box.max.z - box.min.z;
      out.push({
        name: o.name || o.parent?.name || '?',
        tag,
        at: [
          +((box.max.x + box.min.x) / 2).toFixed(1),
          +((box.max.y + box.min.y) / 2).toFixed(2),
          +((box.max.z + box.min.z) / 2).toFixed(1),
        ],
        // length, width, height
        size: [+Math.max(sx, sz).toFixed(1), +Math.min(sx, sz).toFixed(2), +sy.toFixed(2)],
        top: +box.max.y.toFixed(2),
      });
    }
  });
  return out;
}`;

/** Front Street kerb to kerb, plus the promenade, up to the station frontage. */
const inFront = (b) => b.at[2] > -25 && b.at[2] < 24;
const atStreetLevel = (b) => b.at[1] > -1.5 && b.at[1] < 1.5;

let boxes;

test('no rail-shaped geometry at street level on Front Street (#133)', async () => {
  boxes = await page.evaluate(`(${BOXES})()`);
  assert.ok(boxes.length > 1000, `only ${boxes.length} meshes in the scene - the world did not build`);
  const rails = boxes.filter((b) =>
    inFront(b) && atStreetLevel(b)
    && b.size[0] >= 20        // long
    && b.size[1] <= 0.25      // narrower than a kerb, about a rail head
    && b.size[2] >= 0.03 && b.size[2] <= 0.6);
  // With the issue's 400 m of bait rail in world/: two entries at y 0.02.
  assert.deepEqual(rails, [],
    `${rails.length} rail-shaped mesh(es) on the Front Street surface - ${JSON.stringify(rails.slice(0, 4))}`);
});

test('nothing named streetcar surfaces in the Front corridor (#133)', async () => {
  const named = boxes.filter((b) => b.tag && inFront(b) && b.top > -1);
  // The Union Loop is the legitimate one and its rails are at -6.9; the fleet's
  // streetcars run on King, at z -300.
  assert.deepEqual(named, [],
    `streetcar geometry above grade on Front - ${JSON.stringify(named.slice(0, 4))}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
