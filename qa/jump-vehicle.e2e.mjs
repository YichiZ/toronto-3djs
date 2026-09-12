/**
 * End-to-end cover for traffic shoving a walker who is MID-HOP.
 *
 * qa/vehicle-push.e2e.mjs stands the walker in the lane and lets the car
 * arrive. This one has them hopping when it does: the shove was skipped while
 * airborne, so a bus drove straight through a jumping walker - the one thing
 * the push exists to prevent, switched off by pressing Space.
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
/** Seconds between picking a car and it reaching the spot - see vehicle-push.e2e.mjs. */
const LEAD = 2.5;

const fleet = () => page.evaluate(() => {
  const { ctx } = window.__TWIN__;
  const out = [];
  ctx.scene.getObjectByName('vehicles').userData.nearby(0, 0, 1e6, (c) => out.push({ ...c }));
  return out;
});

/** A spot LEAD seconds in front of a car that is really coming, and big enough to matter. */
async function pickApproach() {
  const cars = await fleet();
  for (const car of cars) {
    if (car.half < 1.5) continue;        // a bicycle takes the whole watch to arrive
    if (car.speed < 6) continue;         // queued or braking: the lead time means nothing
    const ahead = car.speed * LEAD;
    if (car.s + ahead + 4 > car.len) continue;   // the lane ends first: it wraps, never arrives
    const spot = { x: car.x + car.dx * ahead, z: car.z + car.dz * ahead };
    if (cars.some((o) => o !== car && Math.hypot(o.x - spot.x, o.z - spot.z) < ahead - 2)) continue;
    await page.waitForTimeout(250);
    const later = (await fleet())
      .filter((o) => o.dx === car.dx && o.dz === car.dz)
      .reduce((b, o) => (!b || Math.hypot(o.x - car.x, o.z - car.z) < Math.hypot(b.x - car.x, b.z - car.z) ? o : b), null);
    if (!later) continue;
    if ((later.x - car.x) * car.dx + (later.z - car.z) * car.dz < 0.5) continue;
    return { car: later, spot };
  }
  return null;
}

/**
 * Hop on the spot for `ms`, counting the frames the walker spends inside a
 * car's footprint - in the page, because a one-frame clip is the whole point
 * and polling from Node sees one frame in four.
 */
const hopAndWatch = (ms) => page.evaluate(async (runMs) => {
  const { ctx, controls } = window.__TWIN__;
  const nearby = ctx.scene.getObjectByName('vehicles').userData.nearby;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const out = { frames: 0, air: 0, inside: 0, insideAir: 0, hops: 0, reached: 0 };
  const t0 = performance.now();
  while (performance.now() - t0 < runMs) {
    if (!controls.airborne) { controls.jump(); out.hops++; }
    const c = ctx.camera.position;
    out.frames++;
    if (controls.airborne) out.air++;
    let hit = false;
    let near = false;
    nearby(c.x, c.z, 20, (car) => {
      const rx = c.x - car.x;
      const rz = c.z - car.z;
      const along = rx * car.dx + rz * car.dz;
      const lateral = rx * -car.dz + rz * car.dx;
      if (Math.abs(along) < car.half - 0.05 && Math.abs(lateral) < car.halfWidth - 0.05) hit = true;
      if (Math.abs(along) < car.half + 0.5 && Math.abs(lateral) < car.halfWidth + 0.5) near = true;
    });
    if (hit) out.inside++;
    if (hit && controls.airborne) out.insideAir++;
    if (near) out.reached++;
    await frame();
  }
  return out;
}, ms);

test('a car does not drive through a walker who is mid-hop', async () => {
  const pick = await pickApproach();
  assert.ok(pick, 'no car with a clear run-up found in the fleet');
  const { car, spot } = pick;
  await standWalker(page, { x: spot.x, y: EYE, z: spot.z, yaw: Math.atan2(-car.dx, -car.dz) + Math.PI });

  const r = await hopAndWatch(4000);

  assert.ok(r.frames > 60, `only ${r.frames} frames rendered in 4 s`);
  assert.ok(r.hops > 2, `the walker hardly hopped (${r.hops} hops)`);
  assert.ok(r.air > r.frames * 0.4, `barely airborne: ${r.air} of ${r.frames} frames`);
  assert.ok(r.reached > 0, 'no car ever reached the walker');
  // Before the fix the shove was skipped while airborne, so the car passed
  // clean through the hopping walker.
  assert.equal(r.insideAir, 0, `walker was inside a car mid-hop on ${r.insideAir} of ${r.air} airborne frames`);
  assert.equal(r.inside, 0, `walker was inside a car on ${r.inside} of ${r.frames} frames`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
