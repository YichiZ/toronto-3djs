/**
 * Issue #77 in a real browser: the Bay Concourse read as an empty flat box at
 * every hour. After #70 (the loop shell's lid gone, the view re-aimed, a crowd
 * and signs) what was left was the floor: one flat pale plane filling the lower
 * third of the frame.
 *
 *   npm run e2e
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld } from './e2eHarness.mjs';

// Luminance spread over the floor band, crowd hidden. The plain floor read 3.2
// at 13:00 and 11.1 at 23:30; with the inlay grid, 18.8 and 37.9. The day floor
// is near white under the concourse lighting, so each hour has its own bar.
const FLOOR_SD = { 13: 12, 23.5: 20 };

let world;
let page;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors });
  page = world.page;
});

after(async () => { await world?.close(); });

/**
 * Standard deviation of luminance (0-255) over the floor band of the frame,
 * with the crowd hidden: it walks at random, and its legs are not the floor.
 */
async function floorContrast(viewpoint, hour) {
  await page.evaluate(([id, h]) => {
    const T = window.__TWIN__;
    T.controls.teleport(id);
    T.time.setHour(h);
    T.ctx.scene.getObjectByName('pedestrians').visible = false;
  }, [viewpoint, hour]);
  await page.waitForTimeout(900);
  const sd = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 100;
    const g = c.getContext('2d');
    g.drawImage(window.__TWIN__.ctx.renderer.domElement, 0, 0, 160, 100);
    const d = g.getImageData(0, 60, 160, 22).data;   // below the balustrade, above the HUD bar
    const L = [];
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    const mean = L.reduce((a, b) => a + b, 0) / L.length;
    res(Math.sqrt(L.reduce((a, b) => a + (b - mean) ** 2, 0) / L.length));
  })));
  await page.evaluate(() => { window.__TWIN__.ctx.scene.getObjectByName('pedestrians').visible = true; });
  return sd;
}

for (const hour of [13, 23.5]) {
  test(`the Bay Concourse floor carries a pattern at ${hour}:00 (#77)`, async () => {
    const sd = await floorContrast('bay-concourse', hour);
    assert.ok(sd > FLOOR_SD[hour], `the floor's luminance spread is ${sd.toFixed(1)}`);
  });
}

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
