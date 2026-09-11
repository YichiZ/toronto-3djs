/**
 * Unit cover for the walker's collision probe heights (issue #13).
 *
 * The e2e test walks into a real bollard; this one pins the arithmetic that
 * decides where the two rays sit, including the case the change nearly broke:
 * the forecourt PATH headhouse stair, whose 0.325 m rise over 0.32 m of going
 * puts a riser 0.65 m up within the walker's body radius.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { probeHeights, LOW_PROBE, HIGH_DROP, AIR_LIFT } from '../src/ui/probes.js';

const EYE = 1.7;
const BODY_RADIUS = 0.55;
const standingOn = (floorY) => probeHeights(floorY + EYE, floorY);

test('on flat pavement both rays are cast, the low one at knee-plus', () => {
  const { high, low } = standingOn(0);
  assert.equal(high, EYE - HIGH_DROP);
  assert.equal(low, LOW_PROBE);
  assert.ok(low < high, 'the low ray must actually be lower');
});

test('the low ray clears the steepest stair in the model', () => {
  // Forecourt headhouse: rise 0.325, going 0.32. The tallest riser face within
  // one body radius ahead tops out at ceil(BODY_RADIUS / going) * rise.
  const RISE = 0.325;
  const GOING = 0.32;
  const reachable = Math.ceil(BODY_RADIUS / GOING) * RISE;
  const { low } = standingOn(0);
  assert.ok(low > reachable,
    `a probe at ${low} would read a riser at ${reachable} as a wall and seal the stairs`);
});

test('the low ray still catches the street furniture the walker used to ghost through', () => {
  const { low } = standingOn(0.15); // sidewalk slab top
  const tops = { planter: 0.85, bollard: 0.98, bench: 0.98, litterBin: 1.07 };
  for (const [what, top] of Object.entries(tops)) {
    assert.ok(low < 0.15 + top, `${what} tops out at ${top} above the sidewalk, under the probe`);
  }
});

test('the low ray is measured from the floor, not the eye', () => {
  // Running up the headhouse stair, ground() eases and the camera trails the
  // floor. The probe must not trail with it into the risers.
  const floorY = 3.0;
  const lagging = probeHeights(floorY + EYE - 0.2, floorY);
  assert.equal(lagging.low, floorY + LOW_PROBE);
  // Lag hard enough - a run up a 45 degree stair - and the two rays converge,
  // so the low one is dropped rather than duplicating the high one. That is the
  // right side to err on: it is the stair case, where a low ray is a liability.
  assert.equal(probeHeights(floorY + EYE - 0.5, floorY).low, null);
});

test('mid-air the low ray stays below the top of the furniture until the feet are near it', () => {
  // Hung LOW_PROBE off rising feet, it cleared a 0.98 m bollard with the feet
  // only 0.25 m up and the walker passed through the post's top.
  const bollardTop = 0.15 + 0.98;
  const feet = 0.15 + 0.5;
  const { low } = probeHeights(feet + EYE, feet, AIR_LIFT);
  assert.ok(low < bollardTop, `a hop 0.5 m up ghosts through the bollard (low ray at ${low})`);
  // ...and still clears it once the feet are within AIR_LIFT of the top, so a
  // 0.9 m hop can get over.
  assert.ok(probeHeights(bollardTop + EYE - 0.1, bollardTop - 0.1, AIR_LIFT).low > bollardTop);
});

test('no low ray when it would sit on top of the high one', () => {
  const floorY = 0;
  // Camera dropped to within 1.5 m of the floor: the two rays would see the
  // same obstacles, so the second is pure cost.
  assert.equal(probeHeights(floorY + 0.8, floorY).low, null);
});

test('no low ray on a stale floor reading', () => {
  // Straight after a teleport to the SkyWalk the last floor is still the street
  // 9 m down; a ray hung off that is nowhere near the walker.
  assert.equal(probeHeights(9 + EYE, 0).low, null);
  assert.equal(probeHeights(EYE, NaN).low, null);
});
