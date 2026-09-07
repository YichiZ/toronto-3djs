/**
 * Issue #4: switching orbit <-> walk jumped the camera.
 *
 * controls.js pulls in DOM-only Three addons, so the arithmetic under test
 * lives in src/ui/modeTransition.js and is exercised directly. `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orbitTargetFrom, walkLevelForTarget } from '../src/ui/modeTransition.js';
import { LEVELS } from '../src/data/grid.js';

const LEVEL_HEIGHTS = [
  LEVELS.path, LEVELS.unionConcourse, LEVELS.street,
  LEVELS.viaductDeck, LEVELS.skywalk, LEVELS.gardinerDeck,
];
const STREET = 2;
const TOLERANCE = 1.5;

test('the orbit target lands on the view ray, so the switch does not rotate the view', () => {
  const pos = { x: 10, y: 1.7, z: 20 };
  const dir = { x: 1, y: 0, z: 0 };           // looking grid-east
  const t = orbitTargetFrom(pos, dir);
  assert.equal(t.z, 20, 'no swing toward north');
  assert.ok(t.x > pos.x, 'the target is ahead of the walker, not behind');
});

test('looking down shortens the ray instead of tilting it, keeping the view exact', () => {
  const pos = { x: 0, y: 40, z: 0 };
  const inv = 1 / Math.SQRT2;
  const t = orbitTargetFrom(pos, { x: inv, y: -inv, z: 0 });
  assert.ok(t.y >= 0.4, 'the target does not bury itself under the pavement');
  // Still exactly on the ray: equal run and drop for a 45-degree look.
  assert.ok(Math.abs(t.x - (pos.y - t.y)) < 1e-9, 'target stayed on the view ray');
});

test('altitude no longer decides the level - the orbit target does', () => {
  // The old bug: nearest level to a camera at y 150 is the Gardiner deck.
  assert.equal(
    walkLevelForTarget(20, LEVEL_HEIGHTS, STREET, TOLERANCE), STREET,
    'a target framing downtown from 20 m is not a floor; default to street'
  );
  assert.equal(
    walkLevelForTarget(LEVELS.path + 0.3, LEVEL_HEIGHTS, STREET, TOLERANCE), 0,
    'but orbiting the PATH really does drop you onto the PATH'
  );
  assert.equal(walkLevelForTarget(LEVELS.street, LEVEL_HEIGHTS, STREET, TOLERANCE), STREET);
});

test('a level look drops the target under the polar limit, so orbit does not nudge the camera', () => {
  const maxPolarAngle = Math.PI * 0.495;
  const pos = { x: 0, y: 1.7, z: 0 };
  const t = orbitTargetFrom(pos, { x: 0, y: 0, z: -1 }, { maxPolarAngle });
  const d = Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z);
  const polar = Math.acos((pos.y - t.y) / d);
  assert.ok(polar <= maxPolarAngle + 1e-9, `polar angle ${polar} exceeds the orbit limit`);
  assert.ok(pos.y - t.y < 1.1, 'and the drop is a sliver, not a tilt you would see');
});
