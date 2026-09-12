/**
 * Union's Line 1 platform, in a real browser (#131, closing out #118).
 *
 * #118 found the mezzanine stair dropping 5.2 m into nothing and put a shuttered
 * landing at the bottom, because the platform did not exist. It does now, and
 * the flight carries on down to it — so what this keeps is the whole descent:
 * every step from the landing to the platform floor, with nothing missing and
 * nothing buried. Building it turned up three of those, all measured here:
 * a flight sealed under the mezzanine slab, a flight coming down through the
 * platform ceiling, and a light fitting hanging in the stairwell that the
 * walker's floor ray stood on at -7.47.
 *
 *   npm run e2e
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld, standWalker } from './e2eHarness.mjs';

const FLOOR = -11.0;                   // LEVELS.subwayPlatform
let world;
let page;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors });
  page = world.page;
  await page.evaluate(async () => {
    const { controls } = window.__TWIN__;
    controls.setMode('walk');
    controls.teleport('path-corridor');
    await new Promise((r) => setTimeout(r, 800));
  });
  await standWalker(page, { x: 15, y: FLOOR + 1.7, z: 21, yaw: 0 });
});

after(async () => { await world?.close(); });

const MEASURE = `async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { PLATFORM } = await import('/src/interiors/subwayPlatform.js');
  const { STAIRWELL } = await import('/src/interiors/path.js');
  const { ctx } = window.__TWIN__;
  const rc = new THREE.Raycaster();
  rc.camera = ctx.camera;
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const solid = (h) => h.face && shown(h.object) && !h.object.userData?.noCollide;
  const DOWN = new THREE.Vector3(0, -1, 0);
  const floorAt = (x, z, from) => {
    rc.set(new THREE.Vector3(x, from, z), DOWN);
    rc.far = 30;
    const h = rc.intersectObject(ctx.scene, true).find(solid);
    return h ? +h.point.y.toFixed(2) : null;
  };

  const floors = [];
  for (let x = PLATFORM.x - PLATFORM.w / 2 + 4; x <= PLATFORM.x + PLATFORM.w / 2 - 4; x += 8) {
    for (let z = PLATFORM.z - PLATFORM.d / 2 + 2; z <= PLATFORM.z + PLATFORM.d / 2 - 2; z += 3) {
      floors.push(floorAt(x, z, PLATFORM.floorY + 2.5));
    }
  }

  // Every 0.4 m down the stairwell, from the mezzanine landing to the platform.
  const midX = (STAIRWELL.minX + STAIRWELL.maxX) / 2;
  const descent = [];
  for (let z = STAIRWELL.maxZ - 1.2; z <= PLATFORM.arrival.z + 1.2; z += 0.4) {
    descent.push([+z.toFixed(1), floorAt(midX, z, -6.0)]);
  }

  // Is the room enclosed? Level rays from the middle of the platform.
  const eye = new THREE.Vector3(PLATFORM.x, PLATFORM.floorY + 1.7, PLATFORM.z);
  const enclosure = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => {
    rc.set(eye, new THREE.Vector3(dx, 0, dz));
    rc.far = 200;
    const h = rc.intersectObject(ctx.scene, true).find((i) => i.face && shown(i.object));
    return h ? +h.distance.toFixed(1) : null;
  });

  return { floors, descent, enclosure, arrival: PLATFORM.arrival };
}`;

test('the Line 1 platform is a room with a floor at -11 (#131)', async () => {
  const m = await page.evaluate(`(${MEASURE})()`);
  assert.ok(m.floors.length > 10, 'nowhere was probed');
  const bad = m.floors.filter((y) => y === null || Math.abs(y - FLOOR) > 0.6);
  assert.deepEqual(bad, [], `floor heights away from ${FLOOR}: ${JSON.stringify(bad)}`);
});

test('the walker knows it is on the Line 1 platform (#131)', async () => {
  const stood = await standWalker(page, { x: 15, y: FLOOR + 1.7, z: 21, yaw: 0 });
  assert.equal(stood.level, 'Line 1 platform');
  assert.ok(Math.abs(stood.y - (FLOOR + 1.7)) < 0.3, `standing at ${stood.y}, not on the floor`);
});

test('the stair from the mezzanine reaches it without a gap (#131)', async () => {
  const m = await page.evaluate(`(${MEASURE})()`);
  const heights = m.descent.map(([, y]) => y);
  assert.deepEqual(heights.filter((y) => y === null), [],
    `nothing underfoot somewhere on the stair - ${JSON.stringify(m.descent)}`);
  // Unfixed in turn: -6.5 all the way (sealed under the mezzanine slab), then a
  // 2.7 m fall from the landing (the flight ran the wrong way), then -7.47 (a
  // light fitting in the opening).
  for (let i = 1; i < heights.length; i++) {
    const drop = heights[i - 1] - heights[i];
    assert.ok(Math.abs(drop) < 1.0,
      `a ${drop.toFixed(2)} m step at z ${m.descent[i][0]} - ${JSON.stringify(m.descent)}`);
  }
  assert.ok(heights[0] > -8.6 && heights[0] < -8.0, `the descent starts at ${heights[0]}, not the landing`);
  assert.ok(Math.abs(heights[heights.length - 1] - FLOOR) < 0.3,
    `the descent ends at ${heights[heights.length - 1]}, not the platform`);
});

test('the platform is enclosed, not open to the city (#131)', async () => {
  const m = await page.evaluate(`(${MEASURE})()`);
  // Unfixed: the ends were open apart from the bores, and a walker looked
  // straight out into downtown from eleven metres under it.
  for (const d of m.enclosure) {
    assert.ok(d !== null && d < 40, `nothing within 40 m in one direction - ${JSON.stringify(m.enclosure)}`);
  }
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
