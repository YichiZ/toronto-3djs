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
    const T = window.__TWIN__;
    T.controls.teleport(id);
    T.time.setHour(h);
    // The city, not the traffic. A crowd and a lane of cars drifting through
    // the frame move these readings several units between runs, and the
    // forecourt's "under half of noon" margin is thin enough to flake on it.
    for (const name of ['pedestrians', 'vehicles', 'trains']) {
      const g = T.ctx.scene.getObjectByName(name);
      if (g) g.visible = false;
    }
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

test('streetlamps throw a pool of light on the pavement (#76)', async () => {
  // Unlit pavement under the Bay lanterns read 4 at 23:30; with the pools, 13.
  const bay = await luminance('bay-north-of-front', 23.5);
  assert.ok(bay > 9, `Bay north of Front at 23:30 is ${bay.toFixed(1)}`);
  // The square has no lamps of its own: its light is the podium's outdoor
  // screen, so it is the reading most exposed to the ground's own brightness.
  // It read 12.5 until #113 took the contrast and the glare out of the paving
  // by design; now 10.8, and the screen and the silhouettes still read.
  const square = await luminance('maple-leaf-square', 23.5);
  assert.ok(square > 9, `Maple Leaf Square at 23:30 is ${square.toFixed(1)}`);
});

test('the head house is floodlit after dark (#85)', async () => {
  // Unfixed at 22:30: the forecourt 26 and Front & Bay 22, the colonnade near
  // black. Floodlit: 74 and 48, still under half of noon (the test above).
  const forecourt = await luminance('union-forecourt', 22.5);
  assert.ok(forecourt > 50, `the forecourt at 22:30 is ${forecourt.toFixed(1)}`);
  const frontBay = await luminance('front-bay-west', 22.5);
  assert.ok(frontBay > 35, `Front & Bay at 22:30 is ${frontBay.toFixed(1)}`);
});

test('the Great Hall lunettes follow the clock (#85)', async () => {
  const lunette = async (hour) => {
    await luminance('great-hall', hour);
    return page.evaluate(() => {
      let v = null;
      window.__TWIN__.ctx.scene.traverse((o) => { if (/lunette/.test(o.material?.name ?? '')) v = o.material.emissiveIntensity; });
      return v;
    });
  };
  const day = await lunette(13);
  const night = await lunette(22.5);
  // Unfixed: 1.5 at every hour, daylight-white glass at 22:30.
  assert.ok(night < day * 0.3, `lunette emissive ${night} at 22:30 against ${day} at 13:00`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
