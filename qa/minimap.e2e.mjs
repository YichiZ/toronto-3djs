/**
 * Issue #7 in a real browser: the walk-mode minimap.
 *
 * The unit test in qa/minimap-plan.test.mjs checks what gets drawn and the
 * heading-up maths; this checks the real thing - on by default while walking,
 * M hiding it, the per-level plan following the walker, the pixels on the
 * canvas, and a click on a viewpoint dot actually teleporting under the
 * heading the walker happens to be facing.
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

/**
 * How many canvas pixels are accent-blue: the PATH spine, the rooms, the arrow.
 * getImageData reads the square backing store; only the inscribed circle is
 * counted, since that is all the CSS disc ever shows.
 */
const bluePixels = () => page.evaluate(() => {
  const c = document.querySelector('.hud-minimap canvas');
  const w = c.width;
  const d = c.getContext('2d').getImageData(0, 0, w, c.height).data;
  const r = w / 2;
  let blue = 0;
  let painted = 0;
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4;
    if (Math.hypot((p % w) - r, Math.floor(p / w) - r) > r) continue;
    total++;
    if (d[i] !== 0x0e || d[i + 1] !== 0x13 || d[i + 2] !== 0x1a) painted++;
    if (d[i + 2] > 200 && d[i + 1] > 170 && d[i] < 160) blue++;
  }
  return { blue, painted, total };
});

test('on by default while walking, with the street plan at street level', async () => {
  await walkTo(-16, 1.7, 40);
  await until({ shown: true, level: 'street' });
  const s = await state();
  assert.equal(s.shown, true);
  assert.equal(s.level, 'street');
  const px = await bluePixels();
  assert.ok(px.painted > px.total * 0.3, `the map is mostly empty: ${px.painted} of ${px.total} pixels painted`);
});

test('M hides it, M shows it again', async () => {
  await page.keyboard.press('KeyM');
  await until({ shown: false });
  assert.equal((await state()).shown, false, 'M hides');
  await page.keyboard.press('KeyM');
  await until({ shown: true, level: 'street' });
  assert.equal((await state()).shown, true, 'M again brings it back');
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

/** Street-coloured pixels along the disc's centre column and centre row. */
const streetAxes = () => page.evaluate(() => {
  const c = document.querySelector('.hud-minimap canvas');
  const w = c.width;
  const d = c.getContext('2d').getImageData(0, 0, w, w).data;
  const street = (x, y) => { const i = (y * w + x) * 4; return d[i] === 0x46 && d[i + 1] === 0x50 && d[i + 2] === 0x5c; };
  let column = 0;
  let row = 0;
  for (let t = 0; t < w; t++) { if (street(w >> 1, t)) column++; if (street(t, w >> 1)) row++; }
  return { column, row };
});

test('heading-up: facing east along Front Street, the street runs straight up the map', async () => {
  await walkTo(-16, 1.7, 0);                     // on Front's centreline, west of Bay
  await page.evaluate(() => { const { ctx } = window.__TWIN__; ctx.camera.lookAt(ctx.camera.position.x + 10, ctx.camera.position.y, ctx.camera.position.z); });
  await until({ level: 'street' });
  await page.waitForTimeout(250);
  const east = await streetAxes();
  assert.ok(east.column > east.row * 3 && east.column > 100,
    `facing east, Front should fill the centre column, not the row: column ${east.column}, row ${east.row}`);
  // Turn to face grid north (-z): now Front crosses the map left to right.
  await page.evaluate(() => { const { ctx } = window.__TWIN__; ctx.camera.lookAt(ctx.camera.position.x, ctx.camera.position.y, ctx.camera.position.z - 10); });
  await page.waitForTimeout(250);
  const north = await streetAxes();
  assert.ok(north.row > north.column * 3 && north.row > 100,
    `facing north, Front should fill the centre row: column ${north.column}, row ${north.row}`);
});

test('clicking a viewpoint dot teleports there', async () => {
  await walkTo(-126, 1.7, 36);                   // 30 m from the forecourt viewpoint
  await until({ level: 'street' });
  await page.waitForTimeout(250);                // and a redraw centred on the new spot, which the click maps onto
  const target = await page.evaluate(async () => {
    const { ctx } = window.__TWIN__;
    const { worldToMap, headingOf, VIEW_METRES } = await import('/src/ui/minimapPlan.js');
    const { getViewpoint } = await import('/src/data/references.js');
    const vp = getViewpoint('union-forecourt');
    const c = document.querySelector('.hud-minimap canvas');
    const r = c.getBoundingClientRect();
    const dir = ctx.camera.getWorldDirection(ctx.camera.up.clone());   // any spare Vector3; 'three' is not importable from the page
    const centre = { x: ctx.camera.position.x, z: ctx.camera.position.z };
    const m = worldToMap(vp.position.x, vp.position.z, centre, r.width, VIEW_METRES, headingOf(dir.x, dir.z));
    return { x: r.left + m.x, y: r.top + m.y, vp: vp.position };
  });
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(150);
  const at = await page.evaluate(() => window.__TWIN__.ctx.camera.position.toArray());
  assert.ok(Math.hypot(at[0] - target.vp.x, at[2] - target.vp.z) < 0.5,
    `clicked the dot but stood at ${at.map((v) => v.toFixed(1))}, not ${target.vp.x}, ${target.vp.z}`);
});

test('hidden outside walk mode, back when walking again, and M still hides it', async () => {
  await page.evaluate(() => window.__TWIN__.controls.setMode('orbit'));
  await until({ shown: false });
  assert.equal((await state()).shown, false, 'orbit');
  await page.evaluate(() => window.__TWIN__.controls.setMode('walk'));
  await until({ shown: true });
  assert.equal((await state()).shown, true, 'walking again, on as it was');
  await page.keyboard.press('KeyM');
  await until({ shown: false });
  assert.equal((await state()).shown, false, 'M hides it');
});

test('on a touchscreen the disc sits under the place panel, whatever the nearby strip adds', async () => {
  // The desktop viewports in wayfinding.e2e.mjs never enter (pointer: coarse);
  // only a touch context does, and that is where the always-on disc used to
  // overlap the place panel once the nearby strip (#15) grew it.
  const touch = await openWorld({ consoleErrors, contextOptions: { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } } });
  try {
    await touch.page.evaluate(() => {
      const { ctx, controls } = window.__TWIN__;
      controls.setMode('walk');
      ctx.camera.position.set(-16, 1.7, 40);
      controls.setLevelByY(0);
    });
    await touch.page.waitForFunction(() => {
      const m = document.querySelector('.hud-minimap');
      return m && !m.hidden && document.querySelector('.hud-place')?.offsetHeight > 0;
    }, null, { timeout: 5000 });
    await touch.page.waitForTimeout(300);        // the strip fills in and the ResizeObserver publishes the height
    await touch.page.touchscreen.tap(195, 500);    // the touch layer (stick + look pad) is built on the first touch
    await touch.page.waitForSelector('.touch-controls .look-pad', { timeout: 3000 });
    const r = await touch.page.evaluate(() => {
      const box = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
      const place = box('.hud-place');
      const map = box('.hud-minimap');
      const pad = box('.touch-controls .look-pad');
      return { coarse: matchMedia('(pointer: coarse)').matches, placeBottom: place.bottom, mapTop: map.top, mapRight: map.right, padLeft: pad?.left ?? null };
    });
    assert.equal(r.coarse, true, 'the touch context should be pointer: coarse');
    assert.ok(r.mapTop >= r.placeBottom, `the disc (top ${r.mapTop}) overlaps the place panel (bottom ${r.placeBottom})`);
    assert.notEqual(r.padLeft, null, 'no look pad in a touch context');
    assert.ok(r.mapRight <= r.padLeft, `the disc (right ${r.mapRight}) reaches under the look pad (left ${r.padLeft}), which would swallow look drags`);
  } finally {
    await touch.close();
  }
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
