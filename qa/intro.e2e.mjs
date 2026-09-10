/**
 * Issue #26 in a real browser: a first visit shows a click-to-start card.
 *
 * Nothing on screen said the controls existed; the help panel only opened on H.
 * Its own file, with `intro: true`: every other suite has the card marked seen.
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
  world = await openWorld({ consoleErrors, intro: true });
  page = world.page;
});

after(async () => { await world?.close(); });

const card = () => page.evaluate(() => {
  const el = document.querySelector('.hud-help');
  const r = el.getBoundingClientRect();
  return {
    shown: !el.hidden && el.classList.contains('hud-intro'),
    centreX: r.left + r.width / 2,
    top: r.top,
    bottom: r.bottom,
    barTop: document.querySelector('.hud-bar').getBoundingClientRect().top,
    seen: localStorage.getItem('twin.introSeen'),
  };
});

const reload = async () => {
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
};

test('a fresh session shows the controls as a centred card', async () => {
  const c = await card();
  assert.equal(c.shown, true, 'no card on a first visit');
  assert.ok(Math.abs(c.centreX - 640) < 2, `the card is not centred: x ${Math.round(c.centreX)}`);
  // Centred on the viewport it overlapped the HUD bar and hid the mode buttons.
  assert.ok(c.top >= 0 && c.bottom <= c.barTop,
    `the card spans ${Math.round(c.top)}-${Math.round(c.bottom)} px; the HUD bar starts at ${Math.round(c.barTop)}`);
  assert.equal(c.seen, null);
});

test('clicking the card captures the pointer and starts walk mode', async () => {
  // Leave walk first, so "starts walk mode" is something the click did.
  await page.evaluate(() => window.__TWIN__.controls.setMode('orbit'));
  await page.click('.hud-intro-go');
  await page.waitForFunction(() => document.pointerLockElement !== null, null, { timeout: 3000 });
  const after = await page.evaluate(() => ({
    mode: window.__TWIN__.controls.mode,
    lockedCanvas: document.pointerLockElement?.tagName,
  }));
  assert.equal(after.mode, 'walk');
  assert.equal(after.lockedCanvas, 'CANVAS');
  assert.equal((await card()).shown, false, 'the card is still up after the click');
  assert.equal((await card()).seen, '1');
});

test('a second visit does not show it', async () => {
  await reload();
  assert.equal((await card()).shown, false);
});

test('Esc dismisses it too, and that is remembered', async () => {
  await page.evaluate(() => localStorage.removeItem('twin.introSeen'));
  await reload();
  assert.equal((await card()).shown, true, 'clearing storage did not bring the card back');
  await page.keyboard.press('Escape');
  assert.equal((await card()).shown, false);
  await reload();
  assert.equal((await card()).shown, false, 'Esc was not remembered');
});

test('on a phone the card clears the two-row HUD bar too', async () => {
  // The compact bar wraps to two rows: centred above a one-row bar, the card
  // ran 45 px into it at 375 x 812.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => localStorage.removeItem('twin.introSeen'));
  await reload();
  const c = await card();
  assert.equal(c.shown, true);
  assert.ok(c.top >= 0 && c.bottom <= c.barTop,
    `the card spans ${Math.round(c.top)}-${Math.round(c.bottom)} px; the HUD bar starts at ${Math.round(c.barTop)}`);
  // The list is taller than the card here, so it scrolls; the button must not
  // scroll away with it.
  const go = await page.evaluate(() => {
    const r = document.querySelector('.hud-intro-go').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  assert.ok(go.top >= c.top && go.bottom <= c.bottom,
    `"Click to walk" is at ${Math.round(go.top)}-${Math.round(go.bottom)} px, outside the card's ${Math.round(c.top)}-${Math.round(c.bottom)}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
