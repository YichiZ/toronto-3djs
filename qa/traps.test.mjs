/**
 * Issue #133: the no-streetcar-on-front check answered for a whole file at a
 * time, and its King Street token was an unanchored substring — so any file
 * containing the word "looking" was exempt, and `world/forecourt.js`, which is
 * exactly where surface track on Front would be written, contains one.
 *
 * These feed the predicate the bait directly.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streetcarOffences } from './traps.mjs';

const lines = (src) => streetcarOffences(src).map((o) => o.line);

test('a surface streetcar line with no context is an offence (#133)', () => {
  const src = [
    'export function build() {',
    '  const rails = streetcarTrack(400);',
    '  rails.position.set(-100, 0.02, 10);',
    '}',
  ].join('\n');
  assert.deepEqual(lines(src), [2]);
});

test('"looking" does not legitimise a streetcar reference (#133)', () => {
  // The exact shape of the demonstration in the issue.
  const src = [
    'export function build() {',
    '  const rails = streetcarTrack(400);   // surface track down Front',
    '  return rails;                        // looking good',
    '}',
  ].join('\n');
  assert.deepEqual(lines(src), [2], 'parking, working, marking and booking are not King Street');
});

test('the tunnel, the loop and King Street legitimise one (#133)', () => {
  const below = [
    '// The 509/510 arrive through the Bay Street tunnel; nothing surfaces.',
    'function buildStreetcarLoop() {',
    '  const y = LEVELS.path - 0.4;',
    '}',
  ].join('\n');
  assert.deepEqual(lines(below), []);

  // How the legitimate case is really written: the street id is a string, and
  // the check has to be able to see inside strings to find it.
  const onKing = [
    'function pickType(street, rnd) {',
    "  if (street.id === 'king' && rnd < 0.14) return typeIndex.streetcar;",
    '}',
  ].join('\n');
  assert.deepEqual(lines(onKing), []);
});

test('context is a window, not the whole file (#133)', () => {
  const src = [
    'function unionLoop() { return LEVELS.path; }',   // legitimate, line 1
    ...Array.from({ length: 20 }, () => '// filler'),
    'const track = streetcarTrack(400);',             // line 22, far away
  ].join('\n');
  assert.deepEqual(lines(src), [22],
    'one legitimate line no longer exempts everything else in the file');
});

test('a note documenting the trap is not the trap (#133)', () => {
  const src = [
    "register({ note: 'No surface streetcar track on Front Street.' });",
  ].join('\n');
  assert.deepEqual(lines(src), [], 'strings are blanked before the reference is looked for');
});

test('line numbers survive block comments and template literals (#133)', () => {
  const src = [
    '/**',
    ' * A long banner comment',
    ' * that runs for several lines.',
    ' */',
    'const t = `a template',
    'that spans lines`;',
    'const track = streetcarTrack(400);',            // line 7
  ].join('\n');
  assert.deepEqual(lines(src), [7]);
});
