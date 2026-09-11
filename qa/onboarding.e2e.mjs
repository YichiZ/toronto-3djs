/**
 * Issue #78 in a real browser: the first-visit card listed 13 controls when
 * only moving and looking matter in the first minute; "Jump to…" and "Go to…"
 * sat side by side with no hint which teleports and which guides; and an fps /
 * draw-call counter was always on screen.
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

const visibleTerms = () => page.evaluate(() =>
  [...document.querySelectorAll('.hud-help dt')].filter((e) => e.checkVisibility()).map((e) => e.textContent.trim()));

test('the first-visit card leads with moving and looking (#78)', async () => {
  const terms = await visibleTerms();
  // Unfixed: 13 rows, W A S D to "Go to…".
  assert.deepEqual(terms, ['W A S D / arrows', 'Mouse / drag'], JSON.stringify(terms));
  const hint = await page.evaluate(() => document.querySelector('.hud-intro-more')?.checkVisibility() ?? false);
  assert.equal(hint, true, 'nothing says where the rest of the controls are');
});

test('after the card, H still opens every control', async () => {
  await page.click('.hud-intro-go');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyH');
  const terms = await visibleTerms();
  assert.ok(terms.length >= 12, `the full panel lists only ${terms.length} controls`);
  await page.keyboard.press('KeyH');
});

test('the two menus say what they do (#78)', async () => {
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.hud-bar select')].map((s) => s.options[0].textContent));
  // Unfixed: "Jump to…" and "Go to…".
  assert.deepEqual(labels, ['Teleport to…', 'Guide me to…']);
});

test('the renderer counter shows only in reference mode (#78)', async () => {
  const stats = () => page.evaluate(() => document.querySelector('.hud-stats').checkVisibility());
  assert.equal(await stats(), false, 'the fps / draw-call counter is on screen outside reference mode');
  await page.evaluate(() => window.__TWIN__.reference.toggle(true));
  await page.waitForTimeout(400);   // the HUD refreshes every 0.25 s
  assert.equal(await stats(), true, 'no counter in reference mode');
  await page.evaluate(() => window.__TWIN__.reference.toggle(false));
  await page.waitForTimeout(400);
  assert.equal(await stats(), false);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
