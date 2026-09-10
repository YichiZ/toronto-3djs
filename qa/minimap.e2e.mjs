/**
 * Issue #7 in a real browser: the walk-mode minimap.
 *
 * The unit test in qa/minimap-plan.test.mjs checks what gets drawn; this checks
 * the real thing - the M key, the per-level plan following the walker, the
 * pixels on the canvas, and a click on a viewpoint dot actually teleporting.
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

const state = () => page.evaluate(() => {
  const root = document.querySelector('.hud-minimap');
  return root ? { shown: !root.hidden, level: root.dataset.level ?? null } : null;
});

const walkTo = (x, eyeY, z) => page.evaluate(([px, py, pz]) => {
  const { ctx, controls } = window.__TWIN__;
  controls.setMode('walk');
  ctx.camera.position.set(px, py, pz);
  controls.setLevelByY(py - 1.7);
}, [x, eyeY, z]);

/**
 * Wait until the minimap reaches a state, rather than a fixed time. The first
 * move into the PATH can stall the page for ~300 ms while the interior streams
 * in - no frames run, so no redraw - and a fixed 300 ms wait raced that stall.
 */
const until = (want, timeout = 2000) => page.waitForFunction((w) => {
  const root = document.querySelector('.hud-minimap');
  return root && Object.entries(w).every(([k, v]) => (k === 'shown' ? !root.hidden : root.dataset[k]) === v);
}, want, { timeout });

/** How many canvas pixels are accent-blue: the PATH spine, the rooms, the wedge. */
const bluePixels = () => page.evaluate(() => {
  const c = document.querySelector('.hud-minimap canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let blue = 0;
  let painted = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] !== 0x0e || d[i + 1] !== 0x13 || d[i + 2] !== 0x1a) painted++;
    if (d[i + 2] > 200 && d[i + 1] > 170 && d[i] < 160) blue++;
  }
  return { blue, painted, total: d.length / 4 };
});

test('off by default', async () => {
  await walkTo(-16, 1.7, 40);
  await page.waitForTimeout(200);
  assert.deepEqual(await state(), { shown: false, level: null });
});

test('M shows it while walking, with the street plan at street level', async () => {
  await page.keyboard.press('KeyM');
  await until({ shown: true, level: 'street' });
  const s = await state();
  assert.equal(s.shown, true);
  assert.equal(s.level, 'street');
  const px = await bluePixels();
  assert.ok(px.painted > px.total * 0.3, `the map is mostly empty: ${px.painted} of ${px.total} pixels painted`);
});

test('the plan follows the walker below grade: the PATH spine appears', async () => {
  const street = await bluePixels();
  await walkTo(-111.5, -6.5 + 1.7, 40);          // a PATH corridor
  await until({ level: 'PATH' });
  assert.equal((await state()).level, 'PATH');
  const path = await bluePixels();
  assert.ok(path.blue > street.blue * 3 + 200,
    `the PATH plan should be full of spine: ${path.blue} blue pixels vs ${street.blue} at street level`);
});

test('clicking a viewpoint dot teleports there', async () => {
  await walkTo(-126, 1.7, 36);                   // 30 m from the forecourt viewpoint
  await until({ level: 'street' });
  await page.waitForTimeout(250);                // and a redraw centred on the new spot, which the click maps onto
  const target = await page.evaluate(async () => {
    const { ctx } = window.__TWIN__;
    const { worldToMap } = await import('/src/ui/minimapPlan.js');
    const { getViewpoint } = await import('/src/data/references.js');
    const vp = getViewpoint('union-forecourt');
    const c = document.querySelector('.hud-minimap canvas');
    const r = c.getBoundingClientRect();
    const m = worldToMap(vp.position.x, vp.position.z, { x: ctx.camera.position.x, z: ctx.camera.position.z }, r.width);
    return { x: r.left + m.x, y: r.top + m.y, vp: vp.position };
  });
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(150);
  const at = await page.evaluate(() => window.__TWIN__.ctx.camera.position.toArray());
  assert.ok(Math.hypot(at[0] - target.vp.x, at[2] - target.vp.z) < 0.5,
    `clicked the dot but stood at ${at.map((v) => v.toFixed(1))}, not ${target.vp.x}, ${target.vp.z}`);
});

test('hidden outside walk mode, back when walking again, and M hides it', async () => {
  await page.evaluate(() => window.__TWIN__.controls.setMode('orbit'));
  await until({ shown: false });
  assert.equal((await state()).shown, false, 'orbit');
  await page.evaluate(() => window.__TWIN__.controls.setMode('walk'));
  await until({ shown: true });
  assert.equal((await state()).shown, true, 'walking again, still toggled on');
  await page.keyboard.press('KeyM');
  await until({ shown: false });
  assert.equal((await state()).shown, false, 'M again');
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
