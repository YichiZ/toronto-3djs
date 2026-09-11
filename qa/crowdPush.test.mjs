/**
 * Issue #38: how far a pedestrian sidesteps the walker.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearance, CLEARANCE, MAX_SIDE } from '../src/systems/crowdPush.js';

const P = { px: 0, pz: 0 };
const NORTH = { dx: 0, dz: -1 };   // travelling -z; its right is +x... (-dz, dx) = (1, 0)

test('a walker out of reach moves nobody', () => {
  assert.equal(clearance(P, NORTH, { cx: 0, cz: -5 }), 0);
  assert.equal(clearance(P, NORTH, { cx: 3, cz: 0 }), 0);
});

test('a walker to the right sends the agent left, just far enough', () => {
  // Level with the agent, 0.5 m to its right: pass at CLEARANCE, so 0.7 m left.
  const s = clearance(P, NORTH, { cx: 0.5, cz: 0 });
  assert.ok(Math.abs(s - (0.5 - CLEARANCE)) < 1e-9, `got ${s}`);
});

test('dead on the line, the agent takes its fallback side, capped', () => {
  assert.equal(clearance(P, NORTH, { cx: 0, cz: 0 }, 1), -MAX_SIDE);
  assert.equal(clearance(P, NORTH, { cx: 0, cz: 0 }, -1), MAX_SIDE);
});

test('the sidestep shrinks as the walker falls behind or ahead', () => {
  const level = Math.abs(clearance(P, NORTH, { cx: 0.2, cz: 0 }));
  const ahead = Math.abs(clearance(P, NORTH, { cx: 0.2, cz: -1.0 }));
  assert.ok(ahead < level, `${ahead} should be under ${level}`);
  assert.ok(ahead > 0);
});
