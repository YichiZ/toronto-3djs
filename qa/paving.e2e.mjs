/**
 * Issue #113 in a real browser: the sidewalk paving ran as high-contrast bands
 * across the direction of travel, filled the bottom 40% of nearly every street
 * frame, flickered as you walked, and was brighter and busier than the
 * limestone beside it.
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

/**
 * Luminance spread of the near ground at the bottom of the frame: pavement and
 * nothing else, with the traffic hidden, so this is the paving's own contrast.
 */
async function pavingContrast(viewpoint) {
  await page.evaluate((id) => {
    const T = window.__TWIN__;
    T.controls.teleport(id);
    T.time.setHour(13);
    for (const name of ['pedestrians', 'vehicles']) {
      const g = T.ctx.scene.getObjectByName(name);
      if (g) g.visible = false;
    }
  }, viewpoint);
  await page.waitForTimeout(1200);
  const sd = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 100;
    const g = c.getContext('2d');
    g.drawImage(window.__TWIN__.ctx.renderer.domElement, 0, 0, 160, 100);
    const d = g.getImageData(0, 86, 160, 12).data;
    const L = [];
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    const mean = L.reduce((a, b) => a + b, 0) / L.length;
    res(Math.sqrt(L.reduce((a, b) => a + (b - mean) ** 2, 0) / L.length));
  })));
  await page.evaluate(() => {
    for (const name of ['pedestrians', 'vehicles']) {
      const g = window.__TWIN__.ctx.scene.getObjectByName(name);
      if (g) g.visible = true;
    }
  });
  return sd;
}

test('the pavement reads as a surface, not a pattern (#113)', async () => {
  const sd = await pavingContrast('front-bay-west');
  // Unfixed: 12.6 on the promenade at Front & Bay, the busiest surface in shot.
  assert.ok(sd < 7, `the paving's luminance spread is ${sd.toFixed(1)}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
