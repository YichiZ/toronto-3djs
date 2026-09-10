/**
 * Issue #31 in a real browser: a link that opens at the Great Hall at dusk.
 *
 *   npm run e2e
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld } from './e2eHarness.mjs';

let world;
let page;
let base;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors });
  page = world.page;
  base = page.url().split('#')[0];
});

after(async () => { await world?.close(); });

/** Open `base#hash` as a fresh page load - a hash-only goto is not a reload. */
async function open(hash) {
  await page.goto(`${base}#${hash}`);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
}

const where = () => page.evaluate(async () => {
  const { ctx, controls, time } = window.__TWIN__;
  const { getViewpoint } = await import('/src/data/references.js');
  const c = ctx.camera.position;
  const at = (id) => { const p = getViewpoint(id).position; return Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z); };
  return { mode: controls.mode, hour: time.getHour(), toGreatHall: at('great-hall'), toDefault: at('front-bay-west'), hash: location.hash };
});

test('a copied link opens at its viewpoint, mode and hour', async () => {
  await open('v=great-hall&mode=walk&t=18.75');
  const s = await where();
  assert.ok(s.toGreatHall < 0.5, `stood ${s.toGreatHall.toFixed(1)} m from the Great Hall viewpoint`);
  assert.equal(s.mode, 'walk');
  assert.ok(Math.abs(s.hour - 18.75) < 0.02, `the hour is ${s.hour}`);
});

test('the address bar follows teleports, mode changes and the clock', async () => {
  await page.evaluate(() => {
    window.__TWIN__.controls.teleport('royal-bank-plaza-orbit');
    window.__TWIN__.time.setHour(6.5);
  });
  await page.waitForFunction(() => location.hash === '#v=royal-bank-plaza-orbit&mode=orbit&t=6.5',
    null, { timeout: 3000, polling: 100 });
});

test('a bad link boots normally at the default opening frame', async () => {
  await open('v=nowhere&mode=fly&t=99');
  const s = await where();
  assert.ok(s.toDefault < 0.5, `stood ${s.toDefault.toFixed(1)} m from the default opening viewpoint`);
  assert.equal(s.mode, 'walk');
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
