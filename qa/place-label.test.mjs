/**
 * The HUD's "where am I" label - issue #10. `npm test`
 *
 * The distances are the real ones probed on Front Street and in the PATH, not
 * invented: see src/ui/placeLabel.js for why each case exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPlace, nearestIntersection } from '../src/ui/placeLabel.js';
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

test('in the Great Hall, the hall names the place - not the wings box around it (#69)', () => {
  // At street level interiors were not places, so the landmark whose box holds
  // the hall took the headline in the building's most famous room.
  const near = pickPlace([
    { record: rec('Union Station east and west wings', 'landmark'), distance: 0, footprint: 11519 },
    { record: rec('Union Station Great Hall', 'interior'), distance: 0, footprint: 1976 },
    { record: UNION, distance: 0, footprint: 20000 },
  ], false);
  assert.equal(near.record.name, 'Union Station Great Hall');
});

test('in the SkyWalk, the SkyWalk names the place - not the convention centre beside it (#69)', () => {
  const near = pickPlace([
    { record: rec('Metro Toronto Convention Centre - North Building', 'landmark'), distance: 3, footprint: 30000 },
    { record: rec('SkyWalk pedestrian corridor', 'interior'), distance: 0, footprint: 1500 },
  ], false);
  assert.equal(near.record.name, 'SkyWalk pedestrian corridor');
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

test('props never take the headline - a scattered set has a city-sized box', () => {
  // Real numbers from the model's west edge: "Pay-and-display parking machine"
  // is one record for every machine downtown, 651,165 m2, 0 m from almost
  // anywhere; the nearest building there is 72 m off.
  const near = pickPlace([
    { record: rec('Pay-and-display parking machine', 'prop'), distance: 0, footprint: 651165 },
    { record: rec('a building', 'building'), distance: 72, footprint: 900 },
  ], false);
  assert.equal(near.record.kind, 'building');
  assert.equal(near.distance, 72, 'and it says honestly how far away that is');
});

test('with only props around, nothing is named rather than a prop', () => {
  assert.equal(pickPlace([{ record: SIGN, distance: 0.5, footprint: 1 }], false), null);
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
