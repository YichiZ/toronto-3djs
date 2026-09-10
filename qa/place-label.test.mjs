/**
 * The HUD's "where am I" label - issue #10. `npm test`
 *
 * The distances are the real ones probed on Front Street and in the PATH, not
 * invented: see src/ui/placeLabel.js for why each case exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPlace, nearestIntersection, HEADLINE_PENALTY } from '../src/ui/placeLabel.js';
import { INTERSECTIONS } from '../src/data/grid.js';

const rec = (name, kind) => ({ name, kind });
const UNION = rec('Union Station', 'landmark');
const PATH_CLUSTER = rec('PATH — Union Station cluster', 'interior');
const LAY_BY = rec('Union Station taxi and passenger lay-by', 'infrastructure');
const SIGN = rec('Union Station Bus Terminal signage', 'prop');

test('on Front Street, 4 m from Union, the headline is Union - not the PATH box you are standing over', () => {
  // The PATH cluster's box tops out 0.6 m above grade, so a street-level eye is
  // 1.1 m from it and inside its footprint. Distance alone would name it.
  const near = pickPlace([
    { record: UNION, distance: 4 },
    { record: PATH_CLUSTER, distance: 1.1 },
    { record: LAY_BY, distance: 2 },
  ], false);
  assert.equal(near.record, UNION);
  assert.equal(near.distance, 4, 'the distance shown is the real one, not the ranking');
});

test('below grade, inside the PATH, the PATH names the place', () => {
  const near = pickPlace([
    { record: UNION, distance: 4.8 },          // above you, 4.8 m up to its floor
    { record: PATH_CLUSTER, distance: 0 },
  ], true);
  assert.equal(near.record, PATH_CLUSTER);
});

test('below grade, a PATH corridor - registered as infrastructure - names the place', () => {
  const CORRIDOR = rec('PATH — Union Station east to Bay Street', 'infrastructure');
  const near = pickPlace([
    { record: UNION, distance: 4.8 },
    { record: CORRIDOR, distance: 0 },
  ], true);
  assert.equal(near.record, CORRIDOR);
});

test('below grade, nested boxes all at 0 m: the most specific place names it', () => {
  // The spot that failed in the browser, with its real footprints: the walker is
  // inside all four boxes at once.
  const near = pickPlace([
    { record: rec('Front Street forecourt and promenade', 'infrastructure'), distance: 0, footprint: 6962 },
    { record: PATH_CLUSTER, distance: 0, footprint: 20672 },
    { record: rec('PATH pedestrian network', 'infrastructure'), distance: 0, footprint: 84988 },
    { record: rec('PATH — Union Station north to Front Street', 'infrastructure'), distance: 0, footprint: 373 },
    { record: UNION, distance: 4.8, footprint: 11519 },
  ], true);
  assert.equal(near.record.name, 'PATH — Union Station north to Front Street');
});

test('a city-wide set loses the tie to the place you are standing in', () => {
  // Illustrative footprints: a lawn you are on, and one record for every street
  // tree downtown, both at 0 m and both props.
  const near = pickPlace([
    { record: rec('Street tree - maple', 'prop'), distance: 0, footprint: 713370 },
    { record: rec('Roundhouse Park lawn', 'prop'), distance: 0, footprint: 12000 },
  ], false);
  assert.equal(near.record.name, 'Roundhouse Park lawn');
});

test('a tie-break never overrides a real difference in distance', () => {
  const near = pickPlace([
    { record: UNION, distance: 4, footprint: 11519 },
    { record: rec('Union Station Front Street colonnade', 'landmark'), distance: 5, footprint: 669 },
  ], false);
  assert.equal(near.record, UNION, 'smaller, but a metre further away');
});

test('a sign right beside you does not outrank the building you are standing at', () => {
  const near = pickPlace([
    { record: UNION, distance: 10 },
    { record: SIGN, distance: 0.5 },
  ], false);
  assert.equal(near.record, UNION);
});

test('with no place anywhere near, the nearest thing is still named', () => {
  // Out on open ground the label must not go blank or name a building 200 m off.
  const near = pickPlace([
    { record: UNION, distance: 200 },
    { record: SIGN, distance: 3 },
  ], false);
  assert.equal(near.record, SIGN);
  assert.ok(3 + HEADLINE_PENALTY < 200);
});

test('an empty scene names nothing', () => {
  assert.equal(pickPlace([], false), null);
});

test('the nearest intersection comes from the real grid', () => {
  // Front & Bay is the grid origin.
  const at = nearestIntersection(3, -4, INTERSECTIONS);
  assert.equal(at.name, 'Front & Bay');
  assert.equal(at.distance, 5);
  assert.equal(nearestIntersection(0, 0, []), null);
});
