/**
 * The walker's vertical motion. `npm test`
 *
 * controls.js pulls in DOM-only Three addons, so the arithmetic lives in
 * src/ui/jump.js and is exercised directly here; qa/modes.e2e.mjs jumps for
 * real in a browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ballistic, hasLanded, GRAVITY, JUMP_HEIGHT, JUMP_SPEED } from '../src/ui/jump.js';

/** Integrate a whole arc from take-off at dt, returning the apex and the airtime. */
function arc(dt) {
  let y = 0;
  let vy = JUMP_SPEED;
  let apex = 0;
  let t = 0;
  for (let i = 0; i < 10_000; i++) {
    const feet = y;
    ({ y, vy } = ballistic(y, vy, dt));
    t += dt;
    apex = Math.max(apex, y);
    if (hasLanded(feet, y, 0, vy)) return { apex, airtime: t };
  }
  throw new Error('the walker never came down');
}

test('the hop reaches its stated height', () => {
  const { apex } = arc(1 / 240);
  assert.ok(Math.abs(apex - JUMP_HEIGHT) < 0.02, `apex was ${apex.toFixed(3)} m`);
});

test('the arc is the same at any frame rate controls.js will hand it', () => {
  // A frame-rate-dependent jump is the classic version of this bug: the walker
  // clears a bollard on a fast machine and clips it on a slow one. Raw 1/30
  // really does lose 8 cm of apex, which is why updateWalk substeps the arc to
  // MAX_AIR_DT; this checks the arc across the range that substepping leaves.
  const slow = arc(1 / 120);
  const fast = arc(1 / 240);
  assert.ok(Math.abs(slow.apex - fast.apex) < 0.02,
    `apex drifted ${Math.abs(slow.apex - fast.apex).toFixed(3)} m between frame rates`);
  assert.ok(Math.abs(slow.airtime - fast.airtime) < 0.02,
    `airtime drifted ${Math.abs(slow.airtime - fast.airtime).toFixed(3)} s`);
});

test('the hop stays under the step-up, so it never becomes a way to change level', () => {
  // STEP_UP in controls.js is 1.2 m. If the jump could out-reach it, Space would
  // quietly become the vertical control instead of Q/E.
  assert.ok(JUMP_HEIGHT < 1.2, 'a jump must not reach further than a step');
  // And the concourse is 3 m under the street: no hop reaches between levels.
  assert.ok(JUMP_HEIGHT < 3, 'a hop must not span a storey');
});

test('landing is a crossing test, so a fast fall cannot tunnel through the floor', () => {
  // One 100 ms step at 18 m/s covers about 2 m - from 1.5 m up, a proximity
  // test with any sane epsilon misses the floor entirely and the walker keeps
  // going. controls.js substeps the arc so this does not arise in practice;
  // the predicate must be right regardless.
  const before = 1.5;
  const { y: after, vy } = ballistic(before, -18, 0.1);
  assert.ok(after < 0, 'the step really does overshoot the floor');
  assert.equal(hasLanded(before, after, 0, vy), true);
});

test('rising through a floor is not a landing', () => {
  // Hopping up through the lip of a ledge, or under a canopy: treating the
  // upward crossing as a landing would glue the walker to the underside.
  assert.equal(hasLanded(0.1, 0.5, 0, +4), false);
});

test('no floor underneath is not a landing', () => {
  assert.equal(hasLanded(5, 4, null, -3), false);
});

test('gravity is stronger than the real thing, on purpose', () => {
  // Real gravity gives a 0.9 m hop about 0.86 s of hang, which reads as floating.
  assert.ok(GRAVITY > 9.81);
  assert.ok(arc(1 / 120).airtime < 0.75, 'the hop should feel like a person, not the Moon');
});

test('a hop where nothing is modelled underneath still lands', () => {
  // controls.js substitutes the take-off height when the probe finds no floor,
  // the same fallback grounded walking uses. Without it the walker fell 40 m
  // over any spot the model does not floor, then snapped back.
  const takeoff = -6.5;
  const { y: after, vy } = ballistic(takeoff + 0.05, -2, 0.1);
  assert.equal(hasLanded(takeoff + 0.05, after, takeoff, vy), true);
});

test('a rising hop stops at a ceiling, head clear of it, and turns over there', async () => {
  const { underCeiling, HEAD_CLEARANCE } = await import('../src/ui/jump.js');
  // The measured case: eye 1.64 under a surface at 1.99.
  const r = underCeiling(1.64, 1.90, 3.2, 1.99);
  assert.ok(Math.abs(r.y - (1.99 - HEAD_CLEARANCE)) < 1e-9, `eye at ${r.y}`);
  assert.equal(r.vy, 0, 'the arc turns over at the ceiling');
});

test('a ceiling out of reach, no ceiling, or falling: the step is untouched', async () => {
  const { underCeiling } = await import('../src/ui/jump.js');
  assert.deepEqual(underCeiling(1.7, 1.8, 3, 9), { y: 1.8, vy: 3 });
  assert.deepEqual(underCeiling(1.7, 1.8, 3, null), { y: 1.8, vy: 3 });
  assert.deepEqual(underCeiling(2.0, 1.9, -2, 2.05), { y: 1.9, vy: -2 });
});

test('already closer to a ceiling than the head clearance: never pushed down, just cannot rise', async () => {
  const { underCeiling } = await import('../src/ui/jump.js');
  assert.deepEqual(underCeiling(1.9, 1.95, 3, 1.99), { y: 1.9, vy: 0 });
});
