/**
 * Issue #29 in a real browser: HUD panels on top of each other.
 *
 * The tour caption covered the mode bar, the stats panel covered the place
 * label on a phone, and the level chip read "SkyWalk" over an aerial.
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

/** Every pair of visible HUD panels whose boxes overlap by more than a pixel. */
const overlaps = () => page.evaluate(() => {
  const els = [...document.querySelectorAll('.hud-panel, #tour-caption')]
    .filter((e) => e.checkVisibility({ checkOpacity: true }) && e.getClientRects().length);
  const name = (e) => (e.id ? `#${e.id}` : `.${[...e.classList].filter((c) => c !== 'hud-panel').join('.')}`);
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i].getBoundingClientRect();
    const b = els[j].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 1 && h > 1) out.push(`${name(els[i])} x ${name(els[j])} (${Math.round(w)}x${Math.round(h)})`);
  }
  return out;
});

const chipShown = () => page.evaluate(() => document.querySelector('.hud-place .level').checkVisibility());

for (const [width, height] of [[1280, 800], [390, 844]]) {
  test(`at ${width} px no HUD panel overlaps another in walk, help, orbit or tour`, async () => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__TWIN__.controls.teleport('front-bay-west'));
    await page.waitForTimeout(600);
    assert.deepEqual(await overlaps(), [], 'walk');
    assert.equal(await chipShown(), true, 'the level chip belongs in walk mode');

    await page.keyboard.press('KeyH');
    await page.waitForTimeout(200);
    assert.deepEqual(await overlaps(), [], 'walk, help open');
    await page.keyboard.press('KeyH');

    await page.evaluate(() => window.__TWIN__.controls.teleport('royal-bank-plaza-orbit'));
    await page.waitForTimeout(600);
    assert.deepEqual(await overlaps(), [], 'orbit');
    // Unfixed: it read the last walked level over the aerial.
    assert.equal(await chipShown(), false, 'the level chip is up in orbit');

    await page.evaluate(() => window.__TWIN__.tour.start());
    await page.waitForTimeout(1200); // the caption fades in over 0.5 s
    // Unfixed: the caption sat 57 px (1280) and 112 px (390) into the mode bar.
    assert.deepEqual(await overlaps(), [], 'tour');
    assert.equal(await chipShown(), false, 'the level chip is up during the tour');
    await page.evaluate(() => window.__TWIN__.tour.stop());
  });
}

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
