/**
 * Issue #30 in a real browser: losing the WebGL context.
 *
 * Nothing listened for it: the canvas froze under a live HUD with no message.
 * WEBGL_lose_context is the browser's own switch for what a GPU reset or a
 * phone reclaiming the context does.
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

/** Frames rendered over one second of wall time. */
const framesPerSecond = () => page.evaluate(() => new Promise((res) => {
  const info = window.__TWIN__.ctx.renderer.info.render;
  const f0 = info.frame;
  setTimeout(() => res(info.frame - f0), 1000);
}));

test('losing the context says so on screen and pauses the frame loop', async () => {
  await page.evaluate(() => {
    window.__loseContext = window.__TWIN__.ctx.renderer.getContext().getExtension('WEBGL_lose_context');
    window.__loseContext.loseContext();
  });
  // Polled on an interval: nothing here may depend on the frame loop it stops.
  await page.waitForFunction(() => {
    const o = document.getElementById('loading');
    return Boolean(o?.isConnected && !o.classList.contains('done'));
  }, null, { timeout: 3000, polling: 100 });
  const text = await page.evaluate(() => document.querySelector('#loading .stage').textContent);
  assert.match(text, /graphics context lost/i);
  assert.equal(await framesPerSecond(), 0, 'the frame loop kept running on a lost context');
});

test('when the context is restored the page reloads and runs again', async () => {
  const reloaded = page.waitForEvent('load', { timeout: 30_000 });
  await page.evaluate(() => window.__loseContext.restoreContext());
  await reloaded;
  await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
  const frames = await framesPerSecond();
  assert.ok(frames > 10, `only ${frames} frames in a second after the reload`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
