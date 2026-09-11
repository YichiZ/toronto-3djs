/**
 * Issue #15: which places and which way down the nearby strip names.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrowFor, nearbyPlaces, nearestAccess, accessText } from '../src/ui/nearby.js';

test('arrows: ahead, right, behind, left, and the diagonals between', () => {
  assert.equal(arrowFor(0), '↑');
  assert.equal(arrowFor(90), '→');
  assert.equal(arrowFor(180), '↓');
  assert.equal(arrowFor(-180), '↓');
  assert.equal(arrowFor(-90), '←');
  assert.equal(arrowFor(44), '↗');
  assert.equal(arrowFor(-135), '↙');
  assert.equal(arrowFor(-22), '↑');
});

const rec = (name, kind) => ({ name, kind });
const at = (record, distance) => ({ record, distance });

test('places: nearest first, the headline and non-places left out, one line per name', () => {
  const headline = rec('Union Station', 'landmark');
  const entries = [
    at(headline, 0),
    at(rec('Taxi lay-by', 'infrastructure'), 3),
    at(rec('Bollards', 'prop'), 2),
    at(rec('Royal York', 'landmark'), 80),
    at(rec('Royal York', 'building'), 81),
    at(rec('CIBC Square', 'building'), 60),
    at(rec('Brookfield Place', 'landmark'), 200),
  ];
  const names = nearbyPlaces(entries, { exclude: headline }).map((e) => e.record.name);
  assert.deepEqual(names, ['CIBC Square', 'Royal York']);
});

test('skip leaves out whatever the caller says - the HUD drops the headline\'s own parts', () => {
  const entries = [at(rec('Union Station colonnade', 'landmark'), 14), at(rec('Royal York', 'landmark'), 80), at(rec('CIBC Square', 'building'), 90)];
  const names = nearbyPlaces(entries, { skip: (e) => e.record.name.startsWith('Union Station') }).map((e) => e.record.name);
  assert.deepEqual(names, ['Royal York', 'CIBC Square']);
});

test('below grade the PATH itself counts, but not the corridor you are standing in', () => {
  const corridor = rec('PATH — Bay Street', 'infrastructure');
  const entries = [at(corridor, 0), at(rec('PATH — Royal York', 'infrastructure'), 30), at(rec('Streetcar Loop', 'infrastructure'), 12)];
  const names = nearbyPlaces(entries, { belowGrade: true }).map((e) => e.record.name);
  assert.deepEqual(names, ['Streetcar Loop', 'PATH — Royal York']);
});

const lift = { kind: 'Lift', x: 10, z: 0, lowY: -6.5, highY: 0, lowName: 'the PATH', highName: 'street level' };
const stairs = { kind: 'Stairs', x: 0, z: 30, lowY: -6.5, highY: -3.3, lowName: 'the PATH', highName: 'the concourses' };

test('from the street, the way down; from the PATH, the way up', () => {
  const top = nearestAccess([lift, stairs], { x: 0, z: 0 }, 0.1);
  assert.equal(top.access, lift);
  assert.equal(accessText(top), 'Lift down to the PATH ⇣');
  const bottom = nearestAccess([lift, stairs], { x: 0, z: 25 }, -6.5);
  assert.equal(bottom.access, stairs);
  assert.equal(accessText(bottom), 'Stairs up to the concourses ⇡');
});

test('no staircase from a floor it does not reach, or from 60 m off', () => {
  assert.equal(nearestAccess([stairs], { x: 0, z: 30 }, 0), null, 'these stairs never reach the street');
  assert.equal(nearestAccess([lift], { x: 80, z: 0 }, 0), null);
});
