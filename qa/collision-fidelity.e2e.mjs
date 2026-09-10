/**
 * Issue #13 in a real browser: collision that matches the geometry.
 *
 *   npm run e2e
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld } from './e2eHarness.mjs';

let world;
let page;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors });
  page = world.page;
});

after(async () => { await world?.close(); });

/** Stand at an eye position on a level, let ground() settle, return the settled eye height. */
const settleAt = (x, eyeY, z, levelY) => page.evaluate(async ([px, py, pz, ly]) => {
  const { ctx, controls } = window.__TWIN__;
  controls.setMode('walk');
  ctx.camera.position.set(px, py, pz);
  controls.setLevelByY(ly);
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  let last = Infinity;
  for (let i = 0; i < 240; i++) {
    await frame();
    const y = ctx.camera.position.y;
    if (i > 20 && Math.abs(y - last) < 1e-3) break;
    last = y;
  }
  return ctx.camera.position.y;
}, [x, eyeY, z, levelY]);

test('no 2 m step up onto a slab: the step-up guard is one step, not 3.6 m', async () => {
  // At (-16, 40), inside Union's east wing, the Bay Concourse's hall ceiling
  // reaches 1.9-1.99 m above the street. The guard compared a surface's rise
  // against STEP_UP + PROBE_ABOVE = 3.6 m - more than the probe can ever see
  // above the feet - so it rejected nothing, and a walker placed on the street
  // stepped straight up onto the slab and stood at eye 3.69.
  const eye = await settleAt(-16, 1.7, 40, 0);
  assert.ok(eye < 2.2, `stood at eye ${eye.toFixed(2)} - on the slab, 2 m above the street`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
