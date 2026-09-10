/**
 * Unit cover for the edge guard (issue #13, problem 2): walking off the SkyWalk
 * or a setback roof used to continue on thin air at the level's nominal height.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepAtEdge } from '../src/ui/edge.js';

const R = 0.55;
/** A world that is floored only where `ok(dx, dz)` says so. */
const world = (ok) => (dx, dz) => ok(dx, dz);
const solid = () => true;
const void_ = () => false;

test('a step onto floor is taken unchanged', () => {
  const step = { x: 0.1, z: 0 };
  assert.equal(stepAtEdge(step, true, R, solid), step);
});

test('a step off a real floor into nothing is refused', () => {
  assert.deepEqual(stepAtEdge({ x: 0.1, z: 0 }, true, R, void_), { x: 0, z: 0 });
});

test('nominal-held ground is not blocked - the PATH at -120, 40 has no floor mesh at all', () => {
  // The regression this guards: blocking on "no floor ahead" alone would freeze
  // the walker everywhere the model was never floored, which is most of the PATH.
  const step = { x: 0.1, z: 0.1 };
  assert.equal(stepAtEdge(step, false, R, void_), step);
});

test('walking into an edge at an angle slides along it', () => {
  // Floor to the north (-z) is gone; floor to the east (+x) remains.
  const north = world((dx, dz) => dz > -1e-9);
  assert.deepEqual(stepAtEdge({ x: 0.1, z: -0.1 }, true, R, north), { x: 0.1, z: 0 });
});

test('the probe reaches a body radius ahead, not just to the end of the step', () => {
  const seen = [];
  stepAtEdge({ x: 0.02, z: 0 }, true, R, (dx, dz) => { seen.push([dx, dz]); return false; });
  assert.deepEqual(seen[0], [R, 0], 'a 2 cm substep must still probe 0.55 m ahead');
});

test('a standing walker is never blocked', () => {
  const step = { x: 0, z: 0 };
  assert.equal(stepAtEdge(step, true, R, void_), step);
});
