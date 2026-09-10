/**
 * Look speed - issue #14. `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampLookSpeed, loadLookSpeed, saveLookSpeed, LOOK_SPEED_KEY, LOOK_SPEED_MIN, LOOK_SPEED_MAX } from '../src/ui/lookSpeed.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('anything becomes a usable speed', () => {
  assert.equal(clampLookSpeed(1.5), 1.5);
  assert.equal(clampLookSpeed('2'), 2);
  assert.equal(clampLookSpeed(0.01), LOOK_SPEED_MIN);
  assert.equal(clampLookSpeed(99), LOOK_SPEED_MAX);
  for (const junk of ['', 'fast', NaN, Infinity, -1, 0, undefined, null]) assert.equal(clampLookSpeed(junk), 1, String(junk));
});

test('remembered across a reload, clamped on the way in and out', () => {
  const s = memory();
  assert.equal(loadLookSpeed(s), 1, 'nothing remembered yet');
  saveLookSpeed(s, 2.25);
  assert.equal(s.m.get(LOOK_SPEED_KEY), '2.25');
  assert.equal(loadLookSpeed(s), 2.25);
  saveLookSpeed(s, 40);
  assert.equal(loadLookSpeed(s), LOOK_SPEED_MAX);
  assert.equal(loadLookSpeed(memory({ [LOOK_SPEED_KEY]: 'garbage' })), 1);
});

test('a storage that throws, or none at all, never breaks the setting', () => {
  assert.equal(loadLookSpeed(throwing), 1);
  assert.doesNotThrow(() => saveLookSpeed(throwing, 2));
  assert.equal(loadLookSpeed(null), 1);
  assert.doesNotThrow(() => saveLookSpeed(null, 2));
});
