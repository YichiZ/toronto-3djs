/**
 * Issue #27 in a real browser: the street by Union was noon-bright at night.
 *
 * Interiors carry AmbientLights, and three.js ambient light is global: whenever
 * the Great Hall and concourses streamed in, their ambient lit the whole city.
 * From the air they are streamed out, which is why the aerial looked right.
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
 * Mean luminance (0-255) of the rendered city at a viewpoint and hour. Read in
 * a frame callback queued after the app's own, so it is the frame as drawn,
 * without the HUD.
 */
async function luminance(viewpoint, hour) {
  await page.evaluate(([id, h]) => {
    window.__TWIN__.controls.teleport(id);
    window.__TWIN__.time.setHour(h);
  }, [viewpoint, hour]);
  // Streaming, and the indoor-light check with it, runs every 0.25 s.
  await page.waitForTimeout(700);
  return page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 100;
    const g = c.getContext('2d');
    g.drawImage(window.__TWIN__.ctx.renderer.domElement, 0, 0, 160, 100);
    const d = g.getImageData(0, 0, 160, 100).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    res(s / (d.length / 4));
  })));
}

test('the forecourt at 23:30 is under half as bright as at 13:00', async () => {
  const noon = await luminance('union-forecourt', 13);
  const night = await luminance('union-forecourt', 23.5);
  // Unfixed: 180 by day, 131 at night (0.73).
  assert.ok(night < noon / 2, `23:30 is ${night.toFixed(0)} against ${noon.toFixed(0)} at 13:00`);
});

test('the Great Hall keeps its indoor light at night', async () => {
  // The guard on the fix: interiors must not go dark with the street. Today 165;
  // switching each room's ambient off outside that room alone gave 92.
  const night = await luminance('great-hall', 23.5);
  assert.ok(night > 120, `the Great Hall at 23:30 is ${night.toFixed(0)}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
