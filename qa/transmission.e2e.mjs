/**
 * Issue #61 in a real browser: while any material with `transmission > 0` is in
 * view, three.js renders the whole scene a second time for it to refract. Ten
 * glass materials kept that pass on everywhere downtown: 640 of 1335 draw calls.
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

test('no glass in the city turns on the transmission pass (#61)', async () => {
  await page.evaluate(() => window.__TWIN__.controls.teleport('union-forecourt'));
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
    const names = new Set();
    window.__TWIN__.ctx.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m?.transmission > 0) names.add(m.name || m.uuid);
    });
    res({ transmissive: [...names], calls: window.__TWIN__.ctx.renderer.info.render.calls });
  })));
  assert.deepEqual(r.transmissive, [], 'materials with transmission > 0');
  // Unfixed: 1082 at the forecourt, half of it the hidden second pass.
  assert.ok(r.calls < 800, `${r.calls} draw calls at the forecourt`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
