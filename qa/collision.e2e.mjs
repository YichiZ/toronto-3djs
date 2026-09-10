/**
 * End-to-end cover for issue #13: the walker strolled through street furniture.
 *
 * The unit test in qa/probes.test.mjs pins the probe arithmetic. This one is
 * the thing the issue was actually reported against - a real bollard in the
 * real scene, walked into with the real W key - because the bug was never in
 * the arithmetic, it was in there only being one ray, 1.1 m up, sailing over a
 * 0.98 m post.
 *
 *   npm run e2e
 *
 * Needs a Playwright chromium (`npx playwright install chromium`).
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
 * A prop instance to walk into, and a clear run-up to it.
 *
 * The run-up is taken along the line of its own row - a bollard row follows the
 * sidewalk, so that line is guaranteed to be walkable pavement, which picking a
 * compass direction is not: half the time it would start the walker in a
 * roadway planter or inside a building.
 */
const targetProp = (name) => page.evaluate((groupName) => {
  const { ctx } = window.__TWIN__;
  const group = ctx.scene.getObjectByName(groupName);
  if (!group) throw new Error(`no "${groupName}" in the scene`);
  const mesh = group.children.find((c) => c.isInstancedMesh);
  const m = new (Object.getPrototypeOf(ctx.camera.matrixWorld).constructor)();
  const spots = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    spots.push({ x: m.elements[12], y: m.elements[13], z: m.elements[14] });
  }
  // Middle of the row: the ends are next to intersections and driveways.
  const it = spots[Math.floor(spots.length / 2)];
  let neighbour = null;
  let best = Infinity;
  for (const s of spots) {
    const d = Math.hypot(s.x - it.x, s.z - it.z);
    if (d > 0.01 && d < best) { best = d; neighbour = s; }
  }
  const len = Math.hypot(neighbour.x - it.x, neighbour.z - it.z);
  // The prop's own local +Z faces the roadway (see streetFurniture.js), so that
  // is the direction to come at a bench from - end-on it is all gaps.
  mesh.getMatrixAt(spots.indexOf(it), m);
  return {
    prop: it,
    alongRow: { x: (neighbour.x - it.x) / len, z: (neighbour.z - it.z) / len },
    fromRoadway: { x: m.elements[8], z: m.elements[10] },
  };
}, name);

/**
 * Walk forward for `ms`, sampling the approach to `prop`.
 *
 * `past` - how far beyond the prop's own origin the walker ends up, measured
 * along the direction of travel - is the assertion that matters. Distance to
 * the origin is not: a bench is stopped by its back rail, which sits 0.3 m the
 * far side of the origin, so a correctly blocked walker stands right on it.
 *
 * @returns {Promise<{min:number, past:number, travelled:number}>}
 */
async function walkInto(prop, approach, distance, ms) {
  const start = { x: prop.x + approach.x * distance, z: prop.z + approach.z * distance };
  await page.evaluate(([s, p]) => {
    const { ctx, controls } = window.__TWIN__;
    controls.setMode('walk');
    ctx.camera.position.set(s.x, 0.15 + 1.7, s.z);
    controls.setLevelByY(0.15);
    ctx.camera.lookAt(p.x, 0.15 + 1.7, p.z);
  }, [start, prop]);
  // Let ground() settle before the first step, so the low ray is hung off a
  // real floor reading rather than the level's nominal height.
  await page.waitForTimeout(200);

  const distanceNow = () => page.evaluate((p) => {
    const c = window.__TWIN__.ctx.camera.position;
    return { d: Math.hypot(c.x - p.x, c.z - p.z), x: c.x, z: c.z };
  }, prop);

  await page.keyboard.down('KeyW');
  let min = Infinity;
  let last = null;
  for (let t = 0; t < ms; t += 100) {
    await page.waitForTimeout(100);
    last = await distanceNow();
    min = Math.min(min, last.d);
  }
  await page.keyboard.up('KeyW');
  return {
    min,
    past: -((last.x - prop.x) * approach.x + (last.z - prop.z) * approach.z),
    travelled: Math.hypot(last.x - start.x, last.z - start.z),
  };
}

test('a bollard stops the walker instead of passing through them', async () => {
  const { prop, alongRow } = await targetProp('bollard');
  const walk = await walkInto(prop, alongRow, 2.5, 1600);

  assert.ok(walk.travelled > 1.0, `the walker never set off (${walk.travelled.toFixed(2)} m)`);
  // Before the fix the walker went straight through the middle of the post and
  // out the far side. Sliding around a 0.2 m post is allowed - being inside it
  // is not.
  assert.ok(walk.min > 0.25, `walked to ${walk.min.toFixed(2)} m of the bollard centre`);
});

test('a bench stops the walker too', async () => {
  const { prop, fromRoadway } = await targetProp('bench');
  const walk = await walkInto(prop, fromRoadway, 3.0, 1800);

  assert.ok(walk.travelled > 1.0, `the walker never set off (${walk.travelled.toFixed(2)} m)`);
  // The bench is stopped by its back rail, 0.3 m past the origin, so the
  // walker legitimately ends up standing on the origin. What it must not do is
  // carry on out the other side, which is what it did before the fix.
  assert.ok(walk.past < 0.35, `walked ${walk.past.toFixed(2)} m out the far side of the bench`);
});

test('a hop carries over a bollard without freezing on it mid-air', async () => {
  // Mid-hop ground() does not run, so a knee ray hung off the take-off floor
  // stays 0.75 m over the pavement. The walker did still get over the post -
  // but only after stopping DEAD in mid-air against it (0.00 m/s on every run)
  // until the arc lifted it high enough for the ray to be dropped as stale.
  // Distance travelled cannot see that; the minimum airborne speed can.
  const { prop, alongRow } = await targetProp('bollard');
  const start = { x: prop.x + alongRow.x * 3.0, z: prop.z + alongRow.z * 3.0 };
  await page.evaluate(([s, p]) => {
    const { ctx, controls } = window.__TWIN__;
    controls.setMode('walk');
    ctx.camera.position.set(s.x, 0.15 + 1.7, s.z);
    controls.setLevelByY(0.15);
    ctx.camera.lookAt(p.x, 0.15 + 1.7, p.z);
  }, [start, prop]);
  await page.waitForTimeout(200);

  await page.keyboard.down('KeyW');
  // Take off and sample in-page, per frame, so neither depends on how fast the
  // test process polls.
  const result = await page.evaluate(async (p) => {
    const { ctx, controls } = window.__TWIN__;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    let hopped = false;
    let minAirSpeed = Infinity;
    let minDist = Infinity;
    let prev = null;
    const t0 = performance.now();
    while (performance.now() - t0 < 2000) {
      const c = ctx.camera.position;
      const now = performance.now();
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      minDist = Math.min(minDist, d);
      if (!hopped && d <= 1.0) {
        controls.jump();
        hopped = true;
      }
      if (hopped && controls.airborne && prev && now > prev.t) {
        minAirSpeed = Math.min(minAirSpeed, Math.hypot(c.x - prev.x, c.z - prev.z) / ((now - prev.t) / 1000));
      }
      prev = { x: c.x, z: c.z, t: now };
      await frame();
    }
    return { hopped, minAirSpeed, minDist };
  }, prop);
  await page.keyboard.up('KeyW');

  assert.ok(result.hopped, 'never got within a metre of the bollard to take off');
  assert.ok(result.minDist < 0.2, `went around the post rather than over it (closest ${result.minDist.toFixed(2)} m)`);
  // Fixed: never below ~0.57 m/s. Unfixed: 0.00, a dead stop in mid-air.
  assert.ok(result.minAirSpeed > 0.3,
    `froze in mid-air on the bollard (min airborne speed ${result.minAirSpeed.toFixed(2)} m/s)`);
});

test('a curb is still a step and not a wall', async () => {
  // The risk in adding a low ray: it reads every short walkable thing as a
  // wall. The curb is the one the whole downtown is made of - approach the
  // bollard row's sidewalk from the roadway and the walker must climb the
  // 0.15 m curb rather than stopping against it.
  const { prop, fromRoadway } = await targetProp('bench');
  const aside = { x: prop.x + fromRoadway.x * 4 - fromRoadway.z * 3, z: prop.z + fromRoadway.z * 4 + fromRoadway.x * 3 };
  const climbed = await page.evaluate(async ([s, dir]) => {
    const { ctx, controls } = window.__TWIN__;
    controls.setMode('walk');
    ctx.camera.position.set(s.x, 1.85, s.z);
    controls.setLevelByY(0);
    ctx.camera.lookAt(s.x - dir.x, 1.85, s.z - dir.z);
    return null;
  }, [aside, fromRoadway]);
  void climbed;
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => window.__TWIN__.ctx.camera.position.toArray());
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__TWIN__.ctx.camera.position.toArray());

  const travelled = Math.hypot(after[0] - before[0], after[2] - before[2]);
  assert.ok(travelled > 2.0, `the curb stopped the walker after ${travelled.toFixed(2)} m`);
  assert.ok(after[1] > before[1] + 0.1, `never climbed the curb: y ${before[1].toFixed(2)} -> ${after[1].toFixed(2)}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
