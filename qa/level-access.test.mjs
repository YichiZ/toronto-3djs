/**
 * Issue #110: a level change lifted the walker straight up, into the inside of
 * whatever stood above. `npm test`
 *
 * The two decisions behind the fix, without WebGL: would this landing be inside
 * a building, and which stair, escalator or lift joins the two levels.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insideSolidAt, pickAccess, nearestOpenSpot, LEVEL_ACCESS_METRES } from '../src/ui/levelChange.js';
import { BUILDINGS, footprint } from '../src/data/buildings.js';

const boxes = BUILDINGS.map((b) => ({ ...footprint(b), height: b.height ?? 0 }));

test('the York Concourse\'s straight-up landing is inside the head house', () => {
  // The spot the issue reproduces: teleport('york-concourse'), press E.
  assert.equal(insideSolidAt(boxes, -214, 58, 0), true);
});

test('the street outside a building is not inside one', () => {
  // Front Street's centreline at Bay, and the middle of the forecourt promenade.
  assert.equal(insideSolidAt(boxes, -11.5, -104, 0), false);
  assert.equal(insideSolidAt(boxes, -170, 14, 0), false);
});

test('below grade a footprint is where the interiors are, not a solid', () => {
  assert.equal(insideSolidAt(boxes, -214, 58, -3.5), false);
  assert.equal(insideSolidAt(boxes, -214, 58, -6.5), false);
});

test('a building shorter than the level it is under does not block it', () => {
  const low = [{ minX: -10, maxX: 10, minZ: -10, maxZ: 10, height: 4 }];
  assert.equal(insideSolidAt(low, 0, 0, 0), true, 'at street it is solid');
  assert.equal(insideSolidAt(low, 0, 0, 6.5), false, 'the viaduct deck clears its roof');
});

const list = [
  { kind: 'Stairs', x: 0, z: 0, lowY: -6.5, highY: 0, lowName: 'the PATH', highName: 'street level' },
  { kind: 'Escalator', x: 30, z: 0, lowY: -3.5, highY: 0.2, lowName: 'York Concourse', highName: 'the Great Hall' },
  { kind: 'Lift', x: 4, z: 3, lowY: -3.5, highY: 0.2, lowName: 'Bay Concourse', highName: 'the Great Hall' },
];

test('the nearest access that joins the two levels wins, either way round', () => {
  const up = pickAccess(list, { x: 10, z: 0 }, -3.5, 0);
  assert.equal(up.access.kind, 'Lift', 'took a stair that does not reach the concourse');
  const down = pickAccess(list, { x: 10, z: 0 }, 0.2, -3.5);
  assert.equal(down.access.kind, 'Lift', 'the same link, coming down');
});

test('an access that joins neither level is not offered', () => {
  const r = pickAccess(list, { x: 0, z: 0 }, -6.5, -3.5);
  assert.equal(r, null, 'the PATH-to-street stair was offered for PATH to concourse');
});

test('from inside the head house, the nearest open spot is out from under it', () => {
  const spot = nearestOpenSpot(boxes, -214, 58, 0);
  assert.ok(spot, 'nowhere open within 80 m of the York Concourse');
  assert.equal(insideSolidAt(boxes, spot.x, spot.z, 0), false);
  assert.ok(spot.distance <= 40, `${spot.distance} m to get out from under the station`);
});

test('already in the open, the open spot is where you stand', () => {
  const spot = nearestOpenSpot(boxes, -11.5, -104, 0);
  assert.deepEqual([spot.x, spot.z, spot.distance], [-11.5, -104, 0]);
});

test('out of range is no way at all: the level change refuses instead', () => {
  assert.equal(pickAccess(list, { x: 400, z: 0 }, -3.5, 0), null);
  assert.ok(pickAccess(list, { x: LEVEL_ACCESS_METRES - 5, z: 0 }, -3.5, 0), 'inside the reach, still nothing');
});
