/**
 * End-to-end cover for traffic shoving the walker aside.
 *
 * The unit test in qa/vehiclePush.test.mjs pins the push arithmetic. This one
 * stands the walker in a live lane in the real scene, lets a real car arrive,
 * and checks what the report was about: the walker is never inside a car, ends
 * up outside the lane, the car never stops, and a walker with a wall on the
 * far side is never pushed through it.
 *
 *   npm run e2e
 *
 * Needs a Playwright chromium (`npx playwright install chromium`).
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
});

after(async () => { await world?.close(); });

const EYE = 1.7;
const BODY_RADIUS = 0.55;   // src/ui/controls.js
const SAMPLE_MS = 50;

/** Every moving, pushable car in the fleet, copied out of the reused pose. */
const fleet = () => page.evaluate(() => {
  const { ctx } = window.__TWIN__;
  const nearby = ctx.scene.getObjectByName('vehicles').userData.nearby;
  const out = [];
  nearby(0, 0, 1e6, (c) => out.push({ ...c }));
  return out;
});

/** Cars within `r` of the walker right now, plus the walker's own position. */
const snapshot = (r) => page.evaluate((radius) => {
  const { ctx } = window.__TWIN__;
  const nearby = ctx.scene.getObjectByName('vehicles').userData.nearby;
  const c = ctx.camera.position;
  const cars = [];
  nearby(c.x, c.z, radius, (car) => cars.push({ ...car }));
  return { x: c.x, z: c.z, y: c.y, cars };
}, r);

/** Walker's (along, lateral) in a car's frame. */
function relative(car, w) {
  const rx = w.x - car.x;
  const rz = w.z - car.z;
  return { along: rx * car.dx + rz * car.dz, lateral: rx * -car.dz + rz * car.dx };
}

const inside = (car, w) => {
  const { along, lateral } = relative(car, w);
  return Math.abs(along) < car.half - 0.05 && Math.abs(lateral) < car.halfWidth - 0.05;
};

/**
 * Nearest wall from a point, cast horizontally along (dx, dz) through the
 * walker's own collision index, or null within `far` metres.
 */
const wallDistance = (x, z, dx, dz, far) => page.evaluate(async ([px, pz, ddx, ddz, f]) => {
  const { ctx, controls } = window.__TWIN__;
  const THREE = await import('/node_modules/three/build/three.module.js');
  const ray = new THREE.Raycaster(new THREE.Vector3(px, 1.0, pz), new THREE.Vector3(ddx, 0, ddz).normalize(), 0, f);
  for (const hit of controls.collision.intersect(ray)) {
    let o = hit.object.userData.collisionSource ?? hit.object;
    let skip = false;
    for (; o; o = o.parent) if (o.visible === false || o.userData?.noCollide) skip = true;
    if (skip) continue;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (Math.abs(n.y) > 0.7) continue;   // a floor, not a wall
    let named = hit.object.userData.collisionSource ?? hit.object;
    while (named && !named.name) named = named.parent;
    return { d: hit.distance, name: named?.name ?? '?', y: hit.point.y };
  }
  return null;
}, [x, z, dx, dz, far]);

const stand = (x, z, yaw) => standWalker(page, { x, y: EYE, z, yaw });

const trafficCount = () => page.evaluate(() =>
  window.__TWIN__.ctx.scene.getObjectByName('vehicles').userData.count());

/**
 * A spot `ahead` metres in front of a car that no other car is about to reach,
 * and the car really is driving toward it. Tries the fleet in order.
 */
async function pickApproach({ ahead = 14 } = {}) {
  const cars = await fleet();
  for (const car of cars) {
    // A bus's length makes the timing sloppy; a bicycle at 4.5 m/s takes most
    // of the watch to arrive.
    if (car.half > 4 || car.half < 1.5) continue;
    if (car.s + ahead + 4 > car.len) continue;   // the lane ends first: the car wraps, never arrives
    const spot = { x: car.x + car.dx * ahead, z: car.z + car.dz * ahead };
    const crowded = cars.some((o) => o !== car
      && Math.hypot(o.x - spot.x, o.z - spot.z) < ahead - 2);
    if (crowded) continue;
    // Is it still coming? Sample the same car (nearest to its last pose) later.
    await page.waitForTimeout(250);
    // Same heading, nearest to where it was: the follower in a queue is the
    // only thing that can be confused for it, and that is fine.
    const later = (await fleet())
      .filter((o) => o.dx === car.dx && o.dz === car.dz)
      .reduce((b, o) => (!b || Math.hypot(o.x - car.x, o.z - car.z) < Math.hypot(b.x - car.x, b.z - car.z) ? o : b), null);
    if (!later) continue;
    const moved = (later.x - car.x) * car.dx + (later.z - car.z) * car.dz;
    if (moved < 0.5) continue;
    return { car: later, spot };
  }
  return null;
}

/**
 * Count, in the page, every rendered frame on which the walker is inside a
 * car's footprint. Polling from Node sees one frame in four; a one-frame clip
 * is exactly what this suite exists to catch.
 */
const startFrameRecorder = () => page.evaluate(() => {
  const { ctx } = window.__TWIN__;
  const nearby = ctx.scene.getObjectByName('vehicles').userData.nearby;
  const rec = { frames: 0, inside: 0 };
  rec.fn = () => {
    const c = ctx.camera.position;
    rec.frames++;
    let hit = false;
    nearby(c.x, c.z, 20, (car) => {
      const rx = c.x - car.x;
      const rz = c.z - car.z;
      const along = rx * car.dx + rz * car.dz;
      const lateral = rx * -car.dz + rz * car.dx;
      if (Math.abs(along) < car.half - 0.05 && Math.abs(lateral) < car.halfWidth - 0.05) hit = true;
    });
    if (hit) rec.inside++;
  };
  ctx.onFrame.push(rec.fn);
  window.__pushRecorder = rec;
});
const stopFrameRecorder = () => page.evaluate(() => {
  const { ctx } = window.__TWIN__;
  const rec = window.__pushRecorder;
  ctx.onFrame.splice(ctx.onFrame.indexOf(rec.fn), 1);
  delete window.__pushRecorder;
  return { frames: rec.frames, inside: rec.inside };
});

/** Sample the walker and nearby traffic for `ms`. */
async function watch(ms, r = 20) {
  const samples = [];
  for (let t = 0; t < ms; t += SAMPLE_MS) {
    await page.waitForTimeout(SAMPLE_MS);
    samples.push(await snapshot(r));
  }
  return samples;
}

test('a car arriving at the walker shoves them out of the lane, never through them', async () => {
  const pick = await pickApproach();
  assert.ok(pick, 'no car with a clear run-up found in the fleet');
  const { car, spot } = pick;
  const yaw = Math.atan2(-car.dx, -car.dz);   // face the oncoming car
  await stand(spot.x, spot.z, yaw + Math.PI);
  const before = await trafficCount();

  await startFrameRecorder();
  const samples = await watch(4000);
  const frames = await stopFrameRecorder();

  assert.ok(frames.frames > 60, `only ${frames.frames} frames rendered in 4 s`);
  assert.equal(frames.inside, 0, `walker was inside a car on ${frames.inside} of ${frames.frames} frames`);
  const overlaps = samples.filter((s) => s.cars.some((c) => inside(c, s)));
  assert.equal(overlaps.length, 0, `walker was inside a car on ${overlaps.length} of ${samples.length} samples`);

  // Some car drew level with the walker (its centre beside them) - the pass
  // really happened, and the walker was outside its body when it did.
  const passed = samples.filter((s) => s.cars.some((c) => Math.abs(relative(c, s).along) < c.half));
  assert.ok(passed.length > 0, 'no car ever drew level with the walker');

  const end = samples.at(-1);
  const laneOffset = Math.abs(relative({ ...car, x: spot.x, z: spot.z }, end).lateral);
  assert.ok(laneOffset > car.halfWidth,
    `walker still ${laneOffset.toFixed(2)} m from the lane centre (car half width ${car.halfWidth.toFixed(2)})`);

  assert.equal(await trafficCount(), before, 'the push changed the traffic count');
});

test('a shove leaves no momentum behind: the walker stops where they are put', async () => {
  const pick = await pickApproach();
  assert.ok(pick, 'no car with a clear run-up found in the fleet');
  await stand(pick.spot.x, pick.spot.z, 0);
  const samples = await watch(4000, 6);

  // Find the last sample at which any car was still in reach, then require
  // the walker to be still for the rest of the watch.
  let lastTouch = -1;
  samples.forEach((s, i) => { if (s.cars.some((c) => Math.abs(relative(c, s).lateral) < c.halfWidth + 0.5 + 0.05
    && Math.abs(relative(c, s).along) < c.half + 0.5)) lastTouch = i; });
  assert.ok(lastTouch >= 0, 'no car ever reached the walker');
  const rest = samples.slice(lastTouch + 6);
  assert.ok(rest.length >= 5, 'the pass happened too late in the watch to see the walker settle');
  const drift = Math.hypot(rest.at(-1).x - rest[0].x, rest.at(-1).z - rest[0].z);
  assert.ok(drift < 0.05, `walker drifted ${drift.toFixed(3)} m after the car had gone`);
});

test('the car keeps going: a walker in the lane does not stop traffic', async () => {
  const pick = await pickApproach();
  assert.ok(pick, 'no car with a clear run-up found in the fleet');
  const { car, spot } = pick;
  await stand(spot.x, spot.z, 0);
  const samples = await watch(6000);
  // A car in this lane drew level with the spot, and later a car in this lane
  // is clear beyond it. The lane is one-way, so "past" is unambiguous.
  const inLane = (c) => Math.abs((c.x - spot.x) * -car.dz + (c.z - spot.z) * car.dx) < 1;
  const alongOf = (c) => (c.x - spot.x) * car.dx + (c.z - spot.z) * car.dz;
  const level = samples.findIndex((s) => s.cars.some((c) => inLane(c) && Math.abs(alongOf(c)) < c.half));
  assert.ok(level >= 0, 'no car in the lane ever reached the walker');
  const past = samples.slice(level).some((s) => s.cars.some((c) => inLane(c) && alongOf(c) > c.half + 2));
  assert.ok(past, 'a car reached the walker but never got clear past them');
});

/**
 * A spot in some lane with a wall close enough on one side that the shove
 * would reach it, and a car on its way there. Looks along each lane ahead of
 * each car, so it does not depend on where the fleet happens to be right now.
 */
async function pickPinch() {
  const cars = (await fleet()).filter((c) => c.half <= 4 && c.half >= 1.5);
  for (const car of cars) {
    if (car.speed < 2) continue;   // queued at a light: might not arrive in the watch
    for (let ahead = 8; ahead <= 40; ahead += 4) {
      if (car.s + ahead + 4 > car.len) break;
      if (ahead > car.speed * 5) break;   // must arrive well inside the 8 s watch
      const spot = { x: car.x + car.dx * ahead, z: car.z + car.dz * ahead };
      for (const side of [1, -1]) {
        const w = await wallDistance(spot.x, spot.z, -car.dz * side, car.dx * side, 12);
        // The walker must start clear of the wall (a pole right on the lane
        // would fail the assertion at sample 0, before any shove), yet close
        // enough that the shove would reach it.
        if (w && w.d > BODY_RADIUS + 0.1 && w.d <= car.halfWidth + 0.5 + BODY_RADIUS + 0.8) return { car, spot, side, wall: w };
      }
    }
  }
  return null;
}

test('a walker with a wall beside the lane is never pushed through it', async (t) => {
  const pick = await pickPinch();
  if (!pick) { t.skip('no lane in the scene has a wall within reach of the shove'); return; }
  const { car, spot, side } = pick;
  const nx = -car.dz * side;
  const nz = car.dx * side;
  await stand(spot.x, spot.z, 0);
  const samples = await watch(8000, 8);

  const reached = samples.some((s) => s.cars.some((c) => Math.abs(relative(c, s).along) < c.half + 0.5
    && Math.abs(relative(c, s).lateral) < c.halfWidth + 0.5 + 0.05));
  assert.ok(reached, 'no car reached the pinned walker in 8 s');
  const where = (s) => `(${s.x.toFixed(2)}, ${s.z.toFixed(2)}) from spot (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)}), wall ${pick.wall.name} ${pick.wall.d.toFixed(2)} m off the lane`;
  for (const [i, s] of samples.entries()) {
    // The wall must always still be in front of the walker on that side, and
    // never closer than the body radius allows.
    const w = await wallDistance(s.x, s.z, nx, nz, 12);
    assert.ok(w, `wall vanished from beside the walker at sample ${i} ${where(s)} - pushed through?`);
    assert.ok(w.d > BODY_RADIUS - 0.1, `walker ${w.d.toFixed(2)} m from ${w.name} (hit y ${w.y.toFixed(2)}) at sample ${i} ${where(s)}`);
  }
});

test('no console errors during the traffic passes', () => {
  assert.deepEqual(consoleErrors, []);
});
