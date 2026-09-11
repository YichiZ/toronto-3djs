/**
 * Issue #14 in a real browser with a touchscreen: the look pad over the HUD,
 * touch-capable hardware driven by a mouse, and look speed.
 *
 * Drags are real touch input through CDP, so pointer capture behaves as it
 * does on a phone; synthetic PointerEvents cannot take capture.
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
  world = await openWorld({ consoleErrors, contextOptions: { hasTouch: true } });
  page = world.page;
  await page.evaluate(() => {
    window.__TWIN__.controls.setMode('walk');
    // Headless cannot grant pointer lock; count the requests instead.
    window.__lockRequests = 0;
    window.__TWIN__.controls.pointerLock.lock = () => { window.__lockRequests++; };
  });
});

after(async () => { await world?.close(); });

test('a Map button hides and shows the minimap, since touch has no M key', async () => {
  await page.waitForFunction(() => !document.querySelector('.hud-minimap')?.hidden, null, { timeout: 3000 });
  const shown = () => page.evaluate(() => !document.querySelector('.hud-minimap').hidden);
  const visible = await page.evaluate(() => document.querySelector('.hud-minimap-btn').checkVisibility());
  assert.equal(visible, true, 'the Map button should show on a coarse pointer');
  await page.click('.hud-minimap-btn');
  await page.waitForFunction(() => document.querySelector('.hud-minimap').hidden, null, { timeout: 2000 });
  assert.equal(await shown(), false, 'tap hides');
  assert.equal(await page.getAttribute('.hud-minimap-btn', 'aria-pressed'), 'false');
  await page.click('.hud-minimap-btn');
  await page.waitForFunction(() => !document.querySelector('.hud-minimap').hidden, null, { timeout: 2000 });
  assert.equal(await shown(), true, 'tap again shows');
});

async function touchDrag(from, to, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const joystick = () => page.evaluate(() => {
  const t = document.querySelector('.touch-controls');
  return t ? t.style.display !== 'none' : null;
});
const yaw = () => page.evaluate(() => {
  const c = window.__TWIN__.ctx.camera;
  return new (Object.getPrototypeOf(c.rotation).constructor)(0, 0, 0, 'YXZ').setFromQuaternion(c.quaternion).y;
});

test('on touchscreen hardware, a mouse click still captures the pointer - and no joystick until a touch', async () => {
  assert.equal(await joystick(), null, 'the joystick was installed before anyone touched anything');
  await page.mouse.click(640, 420);
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => window.__lockRequests) >= 1, 'a mouse click did not ask for pointer lock');
});

test('a touch brings up the joystick, and the mouse puts it away again', async () => {
  await page.touchscreen.tap(640, 420);
  await page.waitForTimeout(100);
  assert.equal(await joystick(), true, 'no joystick after a touch');
  const before = await page.evaluate(() => window.__lockRequests);
  await page.touchscreen.tap(640, 420);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__lockRequests), before, 'a tap asked for pointer lock');
  await page.mouse.click(640, 420);
  await page.waitForTimeout(100);
  assert.equal(await joystick(), false, 'the joystick stayed up for a mouse user');
  await page.touchscreen.tap(640, 420);                // back to touch for what follows
  await page.waitForTimeout(100);
});

test('HUD panels take taps above the look pad', async () => {
  const hit = await page.evaluate(() => {
    const r = document.querySelector('.hud-stats').getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { stats: !!el?.closest('.hud-stats'), pad: !!el?.closest('.look-pad') };
  });
  assert.equal(hit.pad, false, 'the look pad is on top of the stats panel');
  assert.equal(hit.stats, true);
});

test('look speed: set in the help panel, it scales a touch drag, and it is remembered', async () => {
  await page.keyboard.press('KeyH');
  const input = page.locator('.hud-look input');
  const dragYaw = async () => {
    const y0 = await yaw();
    await touchDrag({ x: 820, y: 300 }, { x: 920, y: 300 });
    await page.waitForTimeout(150);
    return Math.abs((await yaw()) - y0);
  };
  await input.fill('1');
  const at1 = await dragYaw();
  await input.fill('2');
  const at2 = await dragYaw();
  assert.ok(at1 > 0.1, `a 100 px drag barely turned the view (${at1.toFixed(3)} rad)`);
  assert.ok(Math.abs(at2 / at1 - 2) < 0.15, `speed 2 turned ${(at2 / at1).toFixed(2)}x as far as speed 1`);
  assert.equal(await page.evaluate(() => localStorage.getItem('twin.lookSpeed')), '2');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
  assert.equal(await page.evaluate(() => window.__TWIN__.controls.lookSpeed), 2, 'forgotten on reload');
  assert.equal(await page.evaluate(() => window.__TWIN__.controls.pointerLock.pointerSpeed), 2, 'mouse look not scaled');
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
