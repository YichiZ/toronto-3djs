/**
 * Issue #12 in a real browser: footsteps keyed to the surface, and no bob for
 * visitors who ask for reduced motion.
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

const teleport = async (id) => {
  await page.evaluate((v) => window.__TWIN__.controls.teleport(v), id);
  await page.waitForTimeout(500);
};
const counters = () => page.evaluate(() => ({
  d: window.__TWIN__.controls.strideDistance,
  plays: window.__TWIN__.footsteps.plays(),
  audio: window.__TWIN__.footsteps.audioState(),
}));
const walk = async (ms) => {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(150);
};

test('the surface underfoot: pavement, marble, concrete, steel', async () => {
  for (const [vp, want] of [
    ['front-bay-west', 'pavement'],
    ['great-hall', 'marble'],
    ['path-corridor', 'concrete'],
    ['skywalk-east', 'steel'],
  ]) {
    await teleport(vp);
    assert.equal(await page.evaluate(() => window.__TWIN__.footsteps.surface()), want, vp);
  }
});

test('no sound before the pointer is first captured: autoplay wants a gesture', async () => {
  await teleport('front-bay-west');
  const a = await counters();
  await walk(1500);
  const b = await counters();
  assert.ok(b.d - a.d > 1.2, `walked only ${(b.d - a.d).toFixed(2)} m`);
  assert.equal(b.audio, 'none');
  assert.equal(b.plays, a.plays);
});

test('once captured, one footfall per 1.2 m stride', async () => {
  await teleport('front-bay-west');
  await page.click('canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, null, { timeout: 3000 });
  const a = await counters();
  assert.notEqual(a.audio, 'none', 'no AudioContext after the pointer lock');
  await walk(2000);
  const b = await counters();
  const strides = Math.floor(b.d / 1.2) - Math.floor(a.d / 1.2);
  assert.ok(strides >= 2, `only ${strides} strides walked`);
  assert.ok(Math.abs(b.plays - a.plays - strides) <= 1, `${b.plays - a.plays} footfalls for ${strides} strides`);
});

test('the help panel mutes them, and the mute is remembered', async () => {
  // Release the pointer so the checkbox can be clicked. Not with Escape: headless
  // Chromium keeps the lock on a synthetic Escape, and a locked pointer sends
  // every click to the canvas.
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => document.pointerLockElement === null, null, { timeout: 3000 });
  await page.keyboard.press('KeyH');
  await page.click('.hud-sound input');
  await page.keyboard.press('KeyH');
  await teleport('front-bay-west');
  const a = await counters();
  await walk(1500);
  const b = await counters();
  assert.ok(b.d - a.d > 1.2);
  assert.equal(b.plays, a.plays, 'footsteps played while muted');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
  assert.equal(await page.evaluate(() => window.__TWIN__.footsteps.muted), true, 'the mute was forgotten on reload');
  assert.equal(await page.evaluate(() => document.querySelector('.hud-sound input').checked), false);
});

test('prefers-reduced-motion: walking does not bob the head', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await teleport('front-bay-west');
  await page.keyboard.down('KeyW');
  const maxBob = await page.evaluate(() => new Promise((res) => {
    let max = 0;
    const t0 = performance.now();
    const tick = () => {
      max = Math.max(max, Math.abs(window.__TWIN__.controls.bobOffset));
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(max);
    };
    requestAnimationFrame(tick);
  }));
  await page.keyboard.up('KeyW');
  await page.emulateMedia({ reducedMotion: null });
  assert.ok(maxBob < 1e-6, `the head bobbed ${(maxBob * 100).toFixed(2)} cm`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
