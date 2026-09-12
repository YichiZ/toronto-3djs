/**
 * Issue #132: interior streaming had one radius and no hysteresis, so a camera
 * on that circle toggled a whole room at the 250 ms check rate — six flips in
 * six seconds, with 5 cm of movement.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamsIn, EXIT_MARGIN, CONTACT_MARGIN } from '../src/world/streaming.js';

const at = (distance, visible) => streamsIn({
  visible, distance, contact: 999, radius: 70, contactRange: 4,
});

test('a room comes in at its radius (#132)', () => {
  assert.equal(at(70.1, false), false);
  assert.equal(at(69.9, false), true);
});

test('and does not go out again until the margin is crossed (#132)', () => {
  assert.equal(at(70.1, true), true, 'one step past the line is not leaving');
  assert.equal(at(70 + EXIT_MARGIN - 0.1, true), true);
  assert.equal(at(70 + EXIT_MARGIN + 0.1, true), false);
});

test('the band cannot be oscillated across (#132)', () => {
  // The probe in the issue: sit on the edge and jitter by 5 cm.
  let visible = false;
  let flips = 0;
  for (let i = 0; i < 24; i++) {
    const next = at(69.95 + (i % 2 ? 0.05 : -0.05), visible);
    if (next !== visible) flips++;
    visible = next;
  }
  // Unfixed: 24 - one flip per check. One is the honest crossing inward.
  assert.equal(flips, 1, 'a room should settle after the first crossing');
  assert.equal(visible, true);
});

test('the contact test gets a band too, but a much smaller one (#132)', () => {
  const box = (contact, visible) => streamsIn({
    visible, distance: 999, contact, radius: 70, contactRange: 4,
  });
  assert.equal(box(4.1, false), false);
  assert.equal(box(3.9, false), true);
  assert.equal(box(4.1, true), true, 'brushing along a wall should not toggle the room');
  assert.equal(box(4 + CONTACT_MARGIN + 0.1, true), false);
  // The PATH corridor tops out 4.6 m under a street-level eye and CONTACT = 4
  // is what keeps it from streaming in up there. The band must not reach it.
  assert.ok(4 + CONTACT_MARGIN < 4.6,
    'the contact band reaches the street above the Union-to-arena corridor');
  assert.equal(box(4.6, true), false, 'the pavement above a corridor still does not draw it');
});

test('walking away still streams a room out (#132)', () => {
  let visible = true;
  for (const d of [71, 75, 79, 81, 120]) visible = at(d, visible);
  assert.equal(visible, false, 'hysteresis must not mean never unloading');
});
