/**
 * Issue #120 in a real browser: Union's excavated retail concourse — the level
 * the revitalisation dug under the train shed — was collapsed into the PATH.
 * The PATH is the city's pedestrian network passing through Union; this is the
 * station's own floor, one level under York, Bay and VIA.
 *
 * What this keeps: the room is there, it can be stood on, the walker knows which
 * level it is on, and the doorway from the VIA Concourse is a way through rather
 * than a picture of one.
 *
 *   npm run e2e
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld, standWalker } from './e2eHarness.mjs';

let world;
let page;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors });
  page = world.page;
  await page.evaluate(async () => {
    const { controls } = window.__TWIN__;
    controls.setMode('walk');
    controls.teleport('via-concourse');
    await new Promise((r) => setTimeout(r, 700));
  });
  // Interiors stream by proximity, so the room has to be stood in to be seen.
  await standWalker(page, { x: -157.5, y: -5.0 + 1.7, z: 93, yaw: 0 });
});

after(async () => { await world?.close(); });

const MEASURE = `async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  // Falls back to the published extent when the module is absent, so a run
  // against a build without it measures the empty ground instead of throwing.
  const RETAIL = await import('/src/interiors/retailConcourse.js')
    .then((m) => m.RETAIL)
    .catch(() => ({
      x: -157.5, z: 93, w: 65, d: 38, floorY: -5.0,
      door: { x: -140, width: 6, sillY: -3.5 },
    }));
  const { ctx } = window.__TWIN__;
  const rc = new THREE.Raycaster();
  rc.camera = ctx.camera;
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const solid = (h) => h.face && shown(h.object) && !h.object.userData?.noCollide;
  const DOWN = new THREE.Vector3(0, -1, 0);
  const UP = new THREE.Vector3(0, 1, 0);
  const SOUTH = new THREE.Vector3(0, 0, 1);
  const cast = (from, dir, far, test) => {
    rc.set(from, dir);
    rc.far = far;
    return rc.intersectObject(ctx.scene, true).find(test) ?? null;
  };

  const floors = [];
  for (let x = RETAIL.x - RETAIL.w / 2 + 4; x <= RETAIL.x + RETAIL.w / 2 - 4; x += 8) {
    for (let z = RETAIL.z - RETAIL.d / 2 + 6; z <= RETAIL.z + RETAIL.d / 2 - 4; z += 8) {
      const h = cast(new THREE.Vector3(x, RETAIL.floorY + 2.5, z), DOWN, 30, solid);
      floors.push(h ? +h.point.y.toFixed(2) : null);
    }
  }
  const ceiling = cast(new THREE.Vector3(RETAIL.x, RETAIL.floorY + 0.2, RETAIL.z), UP, 30, (h) => h.face && shown(h.object));

  // The doorway, from a walker's chest inside VIA heading south: clear through
  // the opening, and solid a few metres to the side of it.
  const wallZ = RETAIL.z - RETAIL.d / 2;
  const chest = (x) => new THREE.Vector3(x, RETAIL.door.sillY + 1.2, wallZ - 3);
  const through = cast(chest(RETAIL.door.x), SOUTH, 8, solid);
  const beside = cast(chest(RETAIL.door.x + 8), SOUTH, 8, solid);

  return {
    floors,
    ceilingY: ceiling ? +ceiling.point.y.toFixed(2) : null,
    throughDoor: through ? +through.distance.toFixed(2) : null,
    besideDoor: beside ? +beside.distance.toFixed(2) : null,
  };
}`;

test('the retail concourse is a room with a floor at -5.0 (#120)', async () => {
  const m = await page.evaluate(`(${MEASURE})()`);
  // Unfixed: the module does not exist and nothing is built at this depth.
  assert.ok(m.floors.length > 10, 'nowhere was probed');
  assert.deepEqual(m.floors.filter((y) => y === null), [], `${m.floors.filter((y) => y === null).length} holes in the floor`);
  const off = m.floors.filter((y) => Math.abs(y - -5.0) > 0.6);
  assert.deepEqual(off, [], `floor heights away from -5.0: ${JSON.stringify(off)}`);
  assert.ok(m.ceilingY !== null && m.ceilingY < -1.0, `no ceiling over the room - ${m.ceilingY}`);
});

test('the walker knows it is on the retail concourse (#120)', async () => {
  const stood = await standWalker(page, { x: -157.5, y: -5.0 + 1.7, z: 93, yaw: 0 });
  // Unfixed: the nearest level to -5.0 was the PATH, 1.5 m below the floor.
  assert.equal(stood.level, 'retail concourse');
  assert.ok(Math.abs(stood.y - (-5.0 + 1.7)) < 0.3, `standing at ${stood.y}, not on the floor`);
});

test('the VIA doorway is a way through, not a picture of one (#120)', async () => {
  const m = await page.evaluate(`(${MEASURE})()`);
  assert.equal(m.throughDoor, null, `something blocks the doorway ${m.throughDoor} m in`);
  assert.ok(m.besideDoor !== null && m.besideDoor < 4,
    `the wall beside the doorway is missing - nearest ${m.besideDoor}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
