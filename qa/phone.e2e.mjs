/**
 * Issue #83 in a real browser, as a phone: 390 x 844, a touchscreen, first visit.
 *
 * The first-visit card taught WASD, Shift, Space and Q/E to someone with no
 * keyboard, the minimap drew on top of it, and once walking the HUD bar took the
 * bottom third of the screen and sat on the move stick.
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
  world = await openWorld({
    consoleErrors,
    intro: true,
    contextOptions: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  });
  page = world.page;
});

after(async () => { await world?.close(); });

const visibleText = (selector) => page.evaluate((s) =>
  [...document.querySelectorAll(s)].filter((e) => e.checkVisibility()).map((e) => e.textContent.trim()), selector);

test('the first-visit card teaches touch, not keys', async () => {
  const terms = await visibleText('.hud-help dt');
  assert.ok(terms.some((t) => /stick/i.test(t)), `no stick line: ${JSON.stringify(terms)}`);
  assert.ok(terms.some((t) => /drag/i.test(t)), `no drag-to-look line: ${JSON.stringify(terms)}`);
  for (const key of ['W A S D', 'Shift', 'Space', 'Q / E', 'Esc']) {
    assert.ok(!terms.some((t) => t.includes(key)), `a phone is taught "${key}": ${JSON.stringify(terms)}`);
  }
  assert.deepEqual(await visibleText('.hud-intro-go span'), ['Tap to walk']);
});

test('nothing draws over the card', async () => {
  const minimap = await page.evaluate(() => document.querySelector('.hud-minimap')?.checkVisibility() ?? false);
  assert.equal(minimap, false, 'the minimap is drawn over the first-visit card');
});

test('once walking, the bar stays clear of the move stick', async () => {
  // The tap that dismisses the card is the first touch, which brings up the stick.
  await page.tap('.hud-intro-go');
  await page.waitForFunction(() => document.querySelector('.touch-controls .stick')?.checkVisibility(), null, { timeout: 3000 });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const rect = (s) => document.querySelector(s).getBoundingClientRect();
    const bar = rect('.hud-bar');
    const stick = rect('.touch-controls .stick');
    const hitAtStick = document.elementFromPoint(stick.left + stick.width / 2, stick.top + stick.height / 2);
    return {
      barTop: bar.top, barHeight: bar.height,
      stickTop: stick.top, stickBottom: stick.bottom,
      stickReachable: Boolean(hitAtStick?.closest('.stick')),
    };
  });
  assert.ok(r.stickBottom <= r.barTop, `the stick (${Math.round(r.stickTop)}-${Math.round(r.stickBottom)}) runs under the bar at ${Math.round(r.barTop)}`);
  assert.ok(r.stickReachable, 'something covers the middle of the stick');
  // It took the bottom third: 5 rows, ~290 px.
  assert.ok(r.barHeight < 844 / 6, `the bar is ${Math.round(r.barHeight)} px tall`);
});

test('no renderer counter on a phone', async () => {
  assert.equal(await page.evaluate(() => document.querySelector('.hud-stats').checkVisibility()), false);
});

test('More opens the folded controls, and closes them again', async () => {
  const extrasShown = () => page.evaluate(() =>
    [...document.querySelectorAll('.hud-extra')].filter((e) => e.checkVisibility()).length);
  assert.equal(await extrasShown(), 0, 'time, crowd, reference and jump are still in the bar');
  await page.tap('.hud-more');
  await page.waitForTimeout(150);
  assert.equal(await extrasShown(), 5, 'More did not bring them back');
  assert.equal(await page.getAttribute('.hud-more', 'aria-expanded'), 'true');
  await page.tap('.hud-more');
  await page.waitForTimeout(150);
  assert.equal(await extrasShown(), 0, 'More did not fold them away again');
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
