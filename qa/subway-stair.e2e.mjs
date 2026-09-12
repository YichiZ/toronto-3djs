/**
 * Issue #118 in a real browser: the subway mezzanine's stairs descended 5.2 m to
 * y = -11.7, where nothing is built and no walker level exists — and, since the
 * mezzanine floor slab had no opening, the whole flight was sealed underneath it.
 *
 * The invariant this keeps: the flight goes down one storey, lands on something,
 * and is closed there. Measured off the built geometry, not the source numbers.
 *
 *   npm run e2e
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld } from './e2eHarness.mjs';

const FLOOR = -6.5;                    // LEVELS.path, the bottom of LEVEL_ORDER
let world;
let page;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors });
  page = world.page;
  await page.evaluate(async () => {
    const { controls } = window.__TWIN__;
    controls.setMode('walk');
    controls.teleport('path-corridor');   // streams the PATH interior in
    await new Promise((r) => setTimeout(r, 800));
  });
});

after(async () => { await world?.close(); });

/** Rays straight down through the mezzanine, and one level ray off the landing. */
const MEASURE = `async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { MEZZANINE, STAIRWELL } = await import('/src/interiors/path.js');
  // The footprint of the stair this replaced, so a run against the unfixed
  // module measures the geometry that was there instead of throwing on a
  // missing export.
  const well = STAIRWELL ?? {
    minX: MEZZANINE.cx + 12, maxX: MEZZANINE.cx + 16,
    minZ: MEZZANINE.cz + 1.8, maxZ: MEZZANINE.cz + 6.8,
    run: 3.2, landingY: -8.3,
  };
  const { ctx } = window.__TWIN__;
  const FLOOR = -6.5;
  const rc = new THREE.Raycaster();
  rc.camera = ctx.camera;
  const DOWN = new THREE.Vector3(0, -1, 0);
  const hits = (x, z, from, far) => {
    rc.set(new THREE.Vector3(x, from, z), DOWN);
    rc.far = far;
    return rc.intersectObject(ctx.scene, true).filter((h) => h.face && !h.object.userData?.noCollide);
  };

  // Deepest surface anywhere in the room, starting just below the floor slab.
  let deepest = FLOOR;
  for (let x = MEZZANINE.cx - 21; x <= MEZZANINE.cx + 21; x += 1) {
    for (let z = MEZZANINE.cz - 8; z <= MEZZANINE.cz + 8; z += 1) {
      for (const h of hits(x, z, FLOOR - 0.05, 40)) deepest = Math.min(deepest, h.point.y);
    }
  }

  const mid = (well.minX + well.maxX) / 2;
  const under = (z) => {
    const h = hits(mid, z, FLOOR + 3, 12);
    return h.length ? +h[0].point.y.toFixed(2) : null;
  };
  const foot = well.maxZ - 0.9;

  // The way on, from a walker's chest on the landing.
  rc.set(new THREE.Vector3(mid, well.landingY + 1.0, foot - 0.6), new THREE.Vector3(0, 0, 1));
  rc.far = 6;
  const ahead = rc.intersectObject(ctx.scene, true)
    .filter((h) => h.face && !h.object.userData?.noCollide);

  return {
    deepest: +deepest.toFixed(2),
    head: under(well.minZ + 0.3),
    flight: under(well.minZ + well.run / 2),
    foot: under(foot),
    landingY: +well.landingY.toFixed(2),
    closedAt: ahead.length ? +ahead[0].distance.toFixed(2) : null,
    beyondLanding: under(well.maxZ + 3.4),
  };
}`;

test('the mezzanine stair arrives somewhere, not at an arbitrary depth (#118, #131)', async () => {
  const m = await page.evaluate(`(${MEASURE})()`);
  // This used to demand the stair stop within 2.5 m of the mezzanine floor,
  // because the Line 1 platform did not exist and the flight's -11.66 was a drop
  // into nothing. #131 built the platform at LEVELS.subwayPlatform = -11, so the
  // invariant is the one it always stood for: whatever the stair reaches is a
  // level of the model, not a number someone typed.
  assert.ok(m.deepest >= -11.95, `something is built below the platform, at ${m.deepest}`);
  assert.ok(m.deepest <= -10.9, `the stair stops short of the platform, at ${m.deepest}`);
});

test('the flight is open to the room and arrives on a landing (#118)', async () => {
  const m = await page.evaluate(`(${MEASURE})()`);
  // Unfixed: all three read -6.5 - the slab had no opening, so the stairs were
  // sealed under a continuous floor and a walker never saw them.
  assert.equal(m.head, FLOOR, `the head of the stairs is at ${m.head}`);
  assert.ok(m.flight < FLOOR - 0.3 && m.flight > m.landingY, `mid-flight reads ${m.flight}`);
  assert.ok(Math.abs(m.foot - m.landingY) < 0.2, `the foot is at ${m.foot}, landing at ${m.landingY}`);
});

test('the way on from the landing leads down, and is not a dead end (#118, #131)', async () => {
  const m = await page.evaluate(`(${MEASURE})()`);
  // The shutter that used to close this landing is gone: the flight continues to
  // the platform. What must never come back is the dead end — a walker standing
  // on the landing with nothing ahead and nothing below.
  assert.equal(m.closedAt, null,
    `something still blocks the way on ${m.closedAt} m past the landing`);
  assert.ok(Math.abs(m.beyondLanding - -11) < 0.4,
    `past the landing the floor is ${m.beyondLanding}, not the platform at -11`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
