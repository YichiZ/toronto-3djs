/**
 * Issue #11 in a real browser: pick a destination, follow the arrow.
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
  await page.evaluate(() => window.__TWIN__.controls.teleport('front-bay-west'));
});

after(async () => { await world?.close(); });

const guide = () => page.evaluate(() => {
  const el = document.querySelector('.hud-guide');
  return { shown: el.checkVisibility(), text: el.querySelector('.guide-text').textContent, turn: Number(el.dataset.turn) };
});

/** Face a world point, or its opposite, at eye height; then let the HUD tick. */
async function face(x, z, away = false) {
  await page.evaluate(([x, z, away]) => {
    const c = window.__TWIN__.ctx.camera;
    const tx = away ? 2 * c.position.x - x : x;
    const tz = away ? 2 * c.position.z - z : z;
    c.lookAt(tx, c.position.y, tz);
  }, [x, z, away]);
  await page.waitForTimeout(400);
}

const FRONT_YONGE = () => page.evaluate(async () => {
  const { getDestination } = await import('/src/ui/wayfinding.js');
  return getDestination('x:front-yonge');
});

test('choosing a corner shows its name and the walking distance along the sidewalks', async () => {
  await page.selectOption('.hud-goto', 'x:front-yonge');
  await page.waitForTimeout(300);
  const { walk, crow } = await page.evaluate(async () => {
    const { route, streetGraph } = await import('/src/ui/route.js');
    const { getDestination } = await import('/src/ui/wayfinding.js');
    const d = getDestination('x:front-yonge');
    const c = window.__TWIN__.ctx.camera.position;
    return { walk: route(streetGraph(), c, d).length, crow: Math.hypot(d.x - c.x, d.z - c.z) };
  });
  const g = await guide();
  assert.equal(g.shown, true, 'no guide after choosing a destination');
  const m = g.text.match(/^Front & Yonge · (\d+) m$/);
  assert.ok(m, `the guide reads "${g.text}"`);
  assert.ok(Math.abs(Number(m[1]) - walk) <= 1, `says ${m[1]} m; the walk is ${walk.toFixed(1)} m`);
  assert.ok(walk >= crow - 0.5, `the walk (${walk.toFixed(0)} m) beats the straight line (${crow.toFixed(0)} m)`);
});

/** The point the arrow is aiming at: the next corner of the route. */
const aim = () => page.evaluate(() => document.querySelector('.hud-guide').dataset.aim.split(',').map(Number));

test('the arrow points ahead when facing its next corner and behind when facing away', async () => {
  const [x, z] = await aim();
  await face(x, z);
  assert.ok(Math.abs((await guide()).turn) <= 3, `facing it, the arrow turns ${(await guide()).turn} deg`);
  const [x2, z2] = await aim();
  await face(x2, z2, true);
  assert.ok(Math.abs((await guide()).turn) >= 177, `facing away, the arrow turns ${(await guide()).turn} deg`);
});

test('the route is drawn on the minimap, corner by corner', async () => {
  const pts = await page.evaluate(async () => (await import('/src/ui/wayfinding.js')).getRoute());
  assert.ok(pts && pts.length >= 3, `route: ${JSON.stringify(pts)}`);
});

test('the minimap shows the destination as an amber ring', async () => {
  const amber = () => page.evaluate(() => {
    const c = document.querySelector('.hud-minimap canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 170 && d[i + 1] < 210 && d[i + 2] < 80) n++;
    return n;
  });
  await page.waitForTimeout(300);        // the minimap is up whenever you are walking
  assert.ok(await amber() > 10, 'no amber destination ring on the minimap');
  await page.click('.guide-clear');
  await page.waitForTimeout(300);
  assert.equal(await amber(), 0, 'the ring stayed after clearing the destination');
  assert.equal((await guide()).shown, false, 'the guide stayed after clearing');
});

test('with the guide up, no HUD panel overlaps another', async () => {
  await page.selectOption('.hud-goto', 'x:front-yonge');
  await page.waitForTimeout(300);
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.hud-panel')].filter((e) => e.checkVisibility() && e.getClientRects().length);
      const out = [];
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect();
        const b = els[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
          out.push(`${els[i].className} x ${els[j].className}`);
        }
      }
      return out;
    });
    assert.deepEqual(over, [], `at ${width} px`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('the guide is for walking: hidden in orbit', async () => {
  await page.evaluate(() => window.__TWIN__.controls.setMode('orbit'));
  await page.waitForTimeout(400);
  assert.equal((await guide()).shown, false);
  await page.evaluate(() => window.__TWIN__.controls.setMode('walk'));
});

test('walking within 8 m says arrived and clears the destination', async () => {
  const dest = await FRONT_YONGE();
  await page.evaluate((d) => {
    const { ctx, controls } = window.__TWIN__;
    controls.teleport('front-bay-west');
    ctx.camera.position.set(d.x + 3, ctx.camera.position.y, d.z + 3);
  }, dest);
  await page.waitForTimeout(400);
  const g = await guide();
  assert.equal(g.text, 'Arrived · Front & Yonge');
  const target = await page.evaluate(async () => (await import('/src/ui/wayfinding.js')).getTarget());
  assert.equal(target, null);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
