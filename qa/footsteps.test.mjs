/**
 * Issue #12: which surface a floor is, and when a footfall lands.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceFor, stepsCrossed, SURFACES } from '../src/ui/footsteps.js';

test('floors map to the surfaces the issue names', () => {
  assert.equal(surfaceFor(['', 'union-great-hall', 'downtown-toronto']), 'marble');
  assert.equal(surfaceFor(['floor', 'galleria-interior']), 'marble');
  assert.equal(surfaceFor(['', 'path-union-streetcar-loop', 'path-network']), 'concrete');
  assert.equal(surfaceFor(['', 'conc-link-passage', 'union-concourses']), 'concrete');
  assert.equal(surfaceFor(['deck', 'skywalk-tube', 'skywalk']), 'steel');
  assert.equal(surfaceFor(['', 'streets', 'downtown-toronto']), 'pavement');
  assert.equal(surfaceFor([]), 'pavement');
});

test('the nearest named group decides: the HHOF entrance inside the Galleria is marble', () => {
  assert.equal(surfaceFor(['gal-hhof-entrance', 'galleria-interior']), 'marble');
});

test('every surface has a voice', () => {
  for (const s of ['marble', 'concrete', 'pavement', 'steel']) {
    assert.ok(SURFACES[s]?.decay > 0, s);
  }
});

test('one footfall per 1.2 m stride, counted off distance walked', () => {
  assert.equal(stepsCrossed(0, 1.19), 0);
  assert.equal(stepsCrossed(1.19, 1.21), 1);
  assert.equal(stepsCrossed(0, 3.7), 3);
  assert.equal(stepsCrossed(2.5, 2.5), 0);
});
