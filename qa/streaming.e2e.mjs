/**
 * Issue #132 in a real browser, as the issue probed it: find the streaming edge
 * for a room, park the camera on it with a few centimetres of movement, and
 * count how many times the whole room is switched on and off.
 *
 * Unfixed: edge at 69.95 m, six flips in six seconds — roughly one a second,
 * out of 24 checks, with 5 cm of movement. That is an ordinary walk tangentially
 * past a room, not a contrived one.
 *
 *   npm run e2e
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld } from './e2eHarness.mjs';

const ROOM = 'union-bay-concourse';
const CENTRE = { x: -40, y: 1.7, z: 46 };        // its registered centre
let world;
let page;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors });
  page = world.page;
  await page.evaluate(() => window.__TWIN__.controls.setMode('orbit'));
});

after(async () => { await world?.close(); });

/**
 * Is the room streamed in with the camera this far east of its centre?
 *
 * `from` settles the camera somewhere else first, which decides the state the
 * measurement starts in — and with hysteresis that is half the answer: the same
 * distance reads differently coming in and going out. Measuring the entry edge
 * without resetting to the outside finds the exit edge instead, which is how the
 * first draft of this test failed.
 */
const VISIBLE_AT = `async ([id, centre, dx, from]) => {
  const { interiorStates } = await import('/src/world/index.js');
  const { ctx } = window.__TWIN__;
  const settle = async (x) => {
    ctx.camera.position.set(centre.x + x, centre.y, centre.z);
    await new Promise((r) => setTimeout(r, 600));   // two checks at 0.25 s
  };
  if (from !== null) await settle(from);
  await settle(dx);
  return interiorStates().find((s) => s.id === id)?.visible ?? null;
}`;

/** Sit on a distance and jitter across it, counting visibility flips. */
const FLIPS_AT = `async ([id, centre, dx, jitter, checks]) => {
  const { interiorStates } = await import('/src/world/index.js');
  const { ctx } = window.__TWIN__;
  const state = () => interiorStates().find((s) => s.id === id)?.visible ?? null;
  let was = state();
  let flips = 0;
  for (let i = 0; i < checks; i++) {
    ctx.camera.position.set(centre.x + dx + (i % 2 ? jitter : -jitter), centre.y, centre.z);
    await new Promise((r) => setTimeout(r, 260));
    const now = state();
    if (now !== was) flips++;
    was = now;
  }
  return { flips, visible: was };
}`;

let edge;

/** Binary-search a threshold, each probe approached from `from`. */
async function threshold(from, lo, hi) {
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    const visible = await page.evaluate(
      `(${VISIBLE_AT})(${JSON.stringify([ROOM, CENTRE, mid, from])})`
    );
    if (visible) lo = mid; else hi = mid;
  }
  return +((lo + hi) / 2).toFixed(2);
}

test('a room comes in at its radius and leaves ten metres later (#132)', async () => {
  edge = await threshold(200, 40, 120);          // approached from outside
  assert.ok(Math.abs(edge - 70) < 2, `the room streams in at ${edge} m, not near its 70 m radius`);

  const out = await threshold(0, 40, 120);       // approached from inside
  assert.ok(out > edge + 5,
    `the room leaves at ${out} m and arrives at ${edge} m - there is no band between them`);
});

test('sitting on the edge does not switch the room on and off (#132)', async () => {
  // Approach from outside so the room is off, then step onto the edge and stay.
  await page.evaluate(`(${VISIBLE_AT})(${JSON.stringify([ROOM, CENTRE, 200, null])})`);
  const jittered = await page.evaluate(
    // ON the edge, with half a metre either side: the jitter has to straddle
    // the line by more than the search resolution, and half a metre of sway is
    // what walking tangentially past a room looks like.
    `(${FLIPS_AT})(${JSON.stringify([ROOM, CENTRE, edge, 0.5, 24])})`
  );
  // Unfixed: 6 flips over 24 checks. One is the honest crossing inward.
  assert.ok(jittered.flips <= 1,
    `${jittered.flips} visibility flips while standing still on the edge`);
});

test('a room still streams out when you walk away (#132)', async () => {
  const near = await page.evaluate(`(${VISIBLE_AT})(${JSON.stringify([ROOM, CENTRE, 40, null])})`);
  assert.equal(near, true, 'the room is not on at 40 m');
  const far = await page.evaluate(`(${VISIBLE_AT})(${JSON.stringify([ROOM, CENTRE, 140, null])})`);
  assert.equal(far, false, 'hysteresis must not mean never unloading');
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
