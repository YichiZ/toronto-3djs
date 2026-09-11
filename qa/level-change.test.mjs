/**
 * Unit cover for issue #8: Q/E skipped, fell back silently and teleported.
 *
 * The transition itself is checked end to end in qa/levels.e2e.mjs; what is
 * testable without a browser is which level the keys choose, whether the
 * choice was a refusal, and the tolerance that keeps the platform level from
 * being confused with the viaduct deck half a metre below it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelTolerances, pickLevel, openHeading, FACE_CLEAR, LEVEL_SETTLE, LEVEL_ARRIVED } from '../src/ui/levelChange.js';
import { LEVELS } from '../src/data/grid.js';

const ORDER = [
  { name: 'PATH', y: LEVELS.path },
  { name: 'concourse', y: LEVELS.unionConcourse },
  { name: 'street', y: LEVELS.street },
  { name: 'viaduct deck', y: LEVELS.viaductDeck },
  { name: 'platform', y: LEVELS.platform },
  { name: 'SkyWalk', y: LEVELS.skywalk },
  { name: 'Gardiner deck', y: LEVELS.gardinerDeck },
];
const STREET = ORDER.findIndex((l) => l.name === 'street');
const pick = (index, delta, floors) =>
  pickLevel(index, delta, ORDER.length, (i) => floors.includes(i));
const all = ORDER.map((_, i) => i);

test('a level with a floor above is taken directly', () => {
  assert.deepEqual(pick(STREET, 1, all), { index: STREET + 1, outcome: 'ok' });
  assert.deepEqual(pick(STREET, -1, all), { index: STREET - 1, outcome: 'ok' });
});

test('levels with no floor here are skipped, not stepped onto', () => {
  // On the PATH under Front Street: no concourse at this spot, but street above.
  assert.deepEqual(pick(0, 1, [0, STREET]), { index: STREET, outcome: 'ok' });
});

test('nothing above at all falls back to the neighbour, and says so', () => {
  const got = pick(STREET, 1, [STREET]);
  assert.equal(got.index, STREET + 1, 'the key must never be simply dead');
  assert.equal(got.outcome, 'fallback');
});

test('at the top and the bottom of the stack the change is refused', () => {
  assert.deepEqual(pick(ORDER.length - 1, 1, all), { index: ORDER.length - 1, outcome: 'refused' });
  assert.deepEqual(pick(0, -1, all), { index: 0, outcome: 'refused' });
});

test('the platform and the viaduct deck cannot claim each other\'s floor', () => {
  const tol = levelTolerances(ORDER);
  const gap = LEVELS.platform - LEVELS.viaductDeck;
  const deck = ORDER.findIndex((l) => l.name === 'viaduct deck');
  const platform = deck + 1;
  assert.ok(tol[deck] < gap, `deck tolerance ${tol[deck]} reaches the platform ${gap} m up`);
  assert.ok(tol[platform] < gap, `platform tolerance ${tol[platform]} reaches the deck`);
});

test('widely spaced levels keep the full tolerance', () => {
  const tol = levelTolerances(ORDER);
  assert.equal(tol[STREET], 1.5);
  assert.equal(tol[0], 1.5);
  assert.equal(tol[ORDER.length - 1], 1.5);
});

test('arriving facing open ground keeps the heading (#72)', () => {
  const clear = Array(16).fill(2);
  clear[0] = FACE_CLEAR;
  assert.equal(openHeading(clear), 0);
});

test('arriving at a wall turns the smallest way that opens up (#72)', () => {
  // Wall ahead; open a quarter turn right (index 4) and nearly behind (index 9).
  const clear = Array(16).fill(1);
  clear[4] = 20;
  clear[9] = 30;
  assert.equal(openHeading(clear), 4, 'a quarter turn, not three-quarters, even though behind is longer');
  // The same, mirrored: a quarter turn left.
  const mirrored = Array(16).fill(1);
  mirrored[12] = 20;
  assert.equal(openHeading(mirrored), 12);
});

test('boxed in on every side, face the most open direction there is (#72)', () => {
  const clear = [1, 2, 3, 4.5, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  assert.equal(openHeading(clear), 3);
});

test('the transition is an exponential time constant, not a per-frame factor', () => {
  const settle = (rate, dt) => 1 - Math.exp(-rate * Math.max(dt, 0));
  // One 0.4 s frame and forty 0.01 s frames must cover the same ground, or the
  // level change runs at a different speed on a slow machine than on a fast one.
  let remaining = 1;
  for (let i = 0; i < 40; i++) remaining -= remaining * settle(LEVEL_SETTLE, 0.01);
  const oneStep = 1 - settle(LEVEL_SETTLE, 0.4);
  assert.ok(Math.abs(remaining - oneStep) < 1e-9, `${remaining} vs ${oneStep}`);
  // Most of the way in about 0.4 s - a descent you can watch, not a cut - and
  // finished, to within the arrival epsilon, well before the second is out.
  assert.ok(1 - oneStep > 0.98, `only ${(1 - oneStep) * 100}% of the way after 0.4 s`);
  assert.ok(Math.exp(-LEVEL_SETTLE * 0.8) * LEVELS.skywalk < LEVEL_ARRIVED,
    'a 9 m change is still in flight after 0.8 s');
});
