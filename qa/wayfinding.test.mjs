/**
 * Issue #11: the straight-line guide - which way to turn, how far to go.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guide, DESTINATIONS, getDestination, setTarget, getTarget, ARRIVE_METRES } from '../src/ui/wayfinding.js';
import { getViewpoint } from '../src/data/references.js';

const HERE = { x: 0, z: 0 };
const FACING_MINUS_Z = { x: 0, z: -1 }; // three's default view direction; +x is to the right

test('straight ahead is no turn, and the distance is the straight line', () => {
  const g = guide(HERE, FACING_MINUS_Z, { x: 0, z: -30 });
  assert.ok(Math.abs(g.turn) < 1e-9);
  assert.equal(g.distance, 30);
  assert.equal(g.arrived, false);
});

test('to the right is a positive turn, to the left negative, behind is 180', () => {
  assert.ok(Math.abs(guide(HERE, FACING_MINUS_Z, { x: 40, z: 0 }).turn - 90) < 1e-9);
  assert.ok(Math.abs(guide(HERE, FACING_MINUS_Z, { x: -40, z: 0 }).turn + 90) < 1e-9);
  assert.ok(Math.abs(Math.abs(guide(HERE, FACING_MINUS_Z, { x: 0, z: 40 }).turn) - 180) < 1e-9);
});

test('the forward vector may be any length, and its height is ignored', () => {
  const a = guide(HERE, { x: 3, z: 0 }, { x: 5, z: 5 });
  const b = guide(HERE, { x: 0.2, z: 0 }, { x: 5, z: 5 });
  assert.ok(Math.abs(a.turn - b.turn) < 1e-9);
  assert.ok(Math.abs(a.turn - 45) < 1e-9, `facing +x, (5,5) is 45 degrees right, got ${a.turn}`);
});

test('arrival is within 8 m', () => {
  assert.equal(guide(HERE, FACING_MINUS_Z, { x: ARRIVE_METRES, z: 0 }).arrived, true);
  assert.equal(guide(HERE, FACING_MINUS_Z, { x: ARRIVE_METRES + 0.1, z: 0 }).arrived, false);
});

test('an orbit viewpoint is a destination at its subject, not its aerial camera', () => {
  const vp = getViewpoint('royal-bank-plaza-orbit');
  const d = getDestination('vp:royal-bank-plaza-orbit');
  assert.deepEqual([d.x, d.z], [vp.lookAt.x, vp.lookAt.z]);
});

test('destination ids are unique and span places and corners', () => {
  assert.equal(new Set(DESTINATIONS.map((d) => d.id)).size, DESTINATIONS.length);
  assert.ok(DESTINATIONS.some((d) => d.group === 'Places'));
  assert.ok(DESTINATIONS.some((d) => d.group === 'Corners'));
});

test('setting an unknown destination clears it', () => {
  assert.equal(setTarget('x:front-yonge').name, 'Front & Yonge');
  assert.equal(getTarget().id, 'x:front-yonge');
  assert.equal(setTarget('x:nowhere'), null);
  assert.equal(getTarget(), null);
});
