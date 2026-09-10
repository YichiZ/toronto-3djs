/**
 * Issue #31: the shareable-link hash, written and read.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHash, parseHash, applyHash } from '../src/ui/shareLink.js';

const IDS = ['front-bay-west', 'great-hall', 'royal-bank-plaza-orbit'];

test('a written hash reads back as the same viewpoint, mode and hour', () => {
  const hash = formatHash({ v: 'great-hall', mode: 'walk', t: 18.75 });
  assert.equal(hash, 'v=great-hall&mode=walk&t=18.75');
  assert.deepEqual(parseHash(`#${hash}`, IDS), { v: 'great-hall', mode: 'walk', t: 18.75 });
});

test('the tour is not written as a mode, and the hour is rounded', () => {
  assert.equal(formatHash({ v: 'great-hall', mode: 'cinematic', t: 18.756789 }), 'v=great-hall&t=18.76');
});

test('every bad field is dropped on its own, so a bad link boots normally', () => {
  assert.deepEqual(parseHash('#v=nowhere&mode=fly&t=99', IDS), { v: null, mode: null, t: null });
  assert.deepEqual(parseHash('#v=great-hall&mode=fly&t=abc', IDS), { v: 'great-hall', mode: null, t: null });
  assert.deepEqual(parseHash('#t=', IDS), { v: null, mode: null, t: null });
  assert.deepEqual(parseHash('', IDS), { v: null, mode: null, t: null });
  assert.deepEqual(parseHash(undefined, IDS), { v: null, mode: null, t: null });
  assert.deepEqual(parseHash('#t=0', IDS).t, 0, 'midnight is an hour, not a missing one');
});

test('replaying teleports first, so the link\'s mode beats the viewpoint\'s own', () => {
  const calls = [];
  const controls = { teleport: (v) => calls.push(`teleport ${v}`), setMode: (m) => calls.push(`mode ${m}`) };
  const time = { setHour: (h) => calls.push(`hour ${h}`) };
  applyHash('#v=royal-bank-plaza-orbit&mode=walk&t=6.5', { controls, time, ids: IDS });
  assert.deepEqual(calls, ['teleport royal-bank-plaza-orbit', 'mode walk', 'hour 6.5']);
});

test('replaying a bad link touches nothing', () => {
  const calls = [];
  const controls = { teleport: () => calls.push('teleport'), setMode: () => calls.push('mode') };
  const time = { setHour: () => calls.push('hour') };
  applyHash('#v=nowhere&mode=fly&t=-1', { controls, time, ids: IDS });
  assert.deepEqual(calls, []);
});
