/**
 * Traffic drives through the walker: how far a car shoves it aside.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { push, CLEARANCE, AHEAD, REACT, PUSH_RATE } from '../src/systems/vehiclePush.js';

// A sedan heading grid-east along z = 0. Its right-hand normal is (0, +1) = +Z.
const EAST = { x: 0, z: 0, dx: 1, dz: 0, speed: 20, half: 2.25, halfWidth: 0.93 };   // fast enough to earn the full AHEAD
const DT = 1;   // a whole second, so the per-frame cap is never what bites

test('a walker clear of the car is not touched', () => {
  assert.deepEqual(push(EAST, { cx: 20, cz: 0 }, DT), { x: 0, z: 0 });          // far ahead
  assert.deepEqual(push(EAST, { cx: 0, cz: 4 }, DT), { x: 0, z: 0 });           // beside the lane
  assert.deepEqual(push(EAST, { cx: -3, cz: 0 }, DT), { x: 0, z: 0 });          // just behind the tail
  assert.deepEqual(push(EAST, { cx: EAST.half + AHEAD, cz: 0 }, DT), { x: 0, z: 0 });   // at the edge of the window ahead
});

test('a stopped car gets no lead-in: the walker can cross in front of a queue', () => {
  const queued = { ...EAST, speed: 0 };
  assert.deepEqual(push(queued, { cx: EAST.half + CLEARANCE + 0.1, cz: 0.2 }, DT), { x: 0, z: 0 });
  assert.ok(push(queued, { cx: EAST.half + CLEARANCE - 0.1, cz: 0.2 }, DT).z > 0, 'still shoved off the bumper itself');
  // Half speed, half the lead: speed × REACT, capped at AHEAD.
  const slow = { ...EAST, speed: 5 };
  assert.ok(push(slow, { cx: EAST.half + 5 * REACT - 0.1, cz: 0.2 }, DT).z > 0);
  assert.deepEqual(push(slow, { cx: EAST.half + 5 * REACT + 0.1, cz: 0.2 }, DT), { x: 0, z: 0 });
});

test('the shove starts well ahead of the bumper, so a fast car is cleared in time', () => {
  const ahead = push(EAST, { cx: EAST.half + AHEAD - 0.1, cz: 0.2 }, DT);
  assert.ok(ahead.z > 0, `got ${ahead.z}`);
  const behind = push(EAST, { cx: -(EAST.half + CLEARANCE + 0.1), cz: 0.2 }, DT);
  assert.deepEqual(behind, { x: 0, z: 0 });
});

test('a walker inside the footprint goes sideways, to the nearer side', () => {
  const south = push(EAST, { cx: 0, cz: 0.4 }, DT);                             // +Z half
  assert.ok(Math.abs(south.x) < 1e-12, 'no push along the heading');
  assert.ok(Math.abs(south.z - (EAST.halfWidth + CLEARANCE - 0.4)) < 1e-9, `got ${south.z}`);

  const north = push(EAST, { cx: 0, cz: -0.4 }, DT);
  assert.ok(Math.abs(north.x) < 1e-12);
  assert.ok(Math.abs(north.z + (EAST.halfWidth + CLEARANCE - 0.4)) < 1e-9, `got ${north.z}`);
});

test('dead on the centreline it takes the fallback side, deterministically', () => {
  const a = push(EAST, { cx: 1, cz: 0 }, DT, 1);
  const b = push(EAST, { cx: 1, cz: 0 }, DT, -1);
  assert.ok(a.z > 0 && b.z < 0, `${a.z} / ${b.z}`);
  assert.equal(a.z, -b.z);
  assert.deepEqual(push(EAST, { cx: 1, cz: 0 }, DT, 1), a);   // same input, same side
});

test('the push is capped per frame', () => {
  const frame = push(EAST, { cx: 0, cz: 0 }, 1 / 60);
  assert.ok(Math.abs(frame.z) <= PUSH_RATE / 60 + 1e-9, `got ${frame.z}`);
  assert.ok(Math.abs(frame.z) > 0);
});

test('a car heading grid-north pushes along X', () => {
  const north = { x: 0, z: 0, dx: 0, dz: -1, speed: 20, half: 2.25, halfWidth: 0.93 };
  const p = push(north, { cx: 0.4, cz: 0 }, DT);
  assert.ok(Math.abs(p.z) < 1e-12);
  assert.ok(p.x > 0, `got ${p.x}`);
});
