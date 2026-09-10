/**
 * Issue #9 in a real browser: the walk-mode reticle, the hover hint and F.
 *
 * Headless Chromium cannot grant pointer lock - there is no user gesture - so
 * the test sets PointerLockControls' own isLocked flag and fires its 'lock'
 * event: exactly the state a real click-to-capture leaves behind. Everything
 * else is real - the registry, both raycasts, the occlusion pass, the DOM.
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

const lock = (on) => page.evaluate((v) => {
  const pl = window.__TWIN__.controls.pointerLock;
  pl.isLocked = v;
  pl.dispatchEvent({ type: v ? 'lock' : 'unlock' });
}, on);

const hudState = () => page.evaluate(() => {
  const r = document.querySelector('.hud-reticle');
  const h = document.querySelector('.hud-hint');
  const c = document.querySelector('.hud-card');
  return {
    reticle: r ? !r.hidden : null,
    aiming: r ? r.classList.contains('on') : null,
    hint: h && !h.hidden ? h.textContent.trim() : null,
    card: c && !c.hidden ? c.querySelector('h3')?.textContent.trim() ?? null : null,
  };
});

/** Is the interaction volume `uuid` currently wearing the highlight? */
const highlighted = (uuid) => page.evaluate((id) => {
  const vol = window.__TWIN__.ctx.scene.getObjectByProperty('uuid', id);
  return vol.material.visible !== false && vol.material.transparent === true;
}, uuid);

/**
 * Stand 6 m out from a real, let storefront and face it. Tries frontages in
 * registry order until one is in clear view: a tree or a bus shelter can
 * legitimately stand in front of any single one.
 */
const faceAStorefront = () => page.evaluate(async () => {
  const { ctx, controls } = window.__TWIN__;
  const { getInteractive } = await import('/src/core/registry.js');
  const V = ctx.camera.position.constructor;
  const settle = () => new Promise((r) => setTimeout(r, 450));   // LOD + the HUD's 0.25 s tick
  const lets = getInteractive().filter((o) => o.userData.payload?.category && o.userData.payload.category !== 'vacant');
  for (const vol of lets.slice(0, 80)) {
    const p = vol.getWorldPosition(new V());
    const n = new V(0, 0, 1).applyQuaternion(vol.getWorldQuaternion(ctx.camera.quaternion.clone()));
    n.y = 0;
    if (n.lengthSq() < 1e-6) continue;
    n.normalize();
    controls.setMode('walk');
    ctx.camera.position.set(p.x + n.x * 6, Math.max(p.y, 1.7), p.z + n.z * 6);
    controls.setLevelByY(ctx.camera.position.y - 1.7);
    ctx.camera.lookAt(p.x, p.y, p.z);
    await settle();
    const hint = document.querySelector('.hud-hint');
    if (hint && !hint.hidden) return { tenant: vol.userData.payload.tenant, uuid: vol.uuid, at: p.toArray(), n: n.toArray() };
  }
  return null;
});

let shop = null;

test('no reticle until the pointer is captured', async () => {
  await lock(false);
  await page.waitForTimeout(300);
  const s = await hudState();
  assert.equal(s.reticle, false, 'the reticle exists and is hidden');
  assert.equal(s.hint, null);
});

test('captured and facing a storefront: reticle, tenant hint, highlighted volume', async () => {
  await lock(true);
  shop = await faceAStorefront();
  assert.ok(shop, 'no let storefront in clear view among the first 80 frontages');
  const s = await hudState();
  assert.equal(s.reticle, true);
  assert.equal(s.aiming, true, 'the reticle marks that it is on something');
  assert.ok(s.hint.startsWith(shop.tenant), `the hint said "${s.hint}", expected "${shop.tenant}"`);
  assert.equal(await highlighted(shop.uuid), true, 'the interaction volume is tinted');
});

test('F opens the card for exactly that storefront', async () => {
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(100);
  const s = await hudState();
  assert.equal(s.card, shop.tenant);
  await page.keyboard.press('Escape');
});

test('looking away clears the hint and puts the volume back', async () => {
  await page.evaluate((sh) => {
    const { ctx } = window.__TWIN__;
    // Turn round: face straight away from the storefront.
    ctx.camera.lookAt(sh.at[0] + sh.n[0] * 30, ctx.camera.position.y, sh.at[2] + sh.n[2] * 30);
  }, shop);
  await page.waitForTimeout(450);
  const s = await hudState();
  assert.equal(s.hint, null, `still hinting "${s.hint}"`);
  assert.equal(s.aiming, false);
  assert.equal(await highlighted(shop.uuid), false, 'the volume is invisible again');
});

test('releasing the pointer hides the reticle at once', async () => {
  await lock(false);
  await page.waitForTimeout(50);   // event-driven: well under the 0.25 s tick
  const s = await hudState();
  assert.equal(s.reticle, false);
  assert.equal(s.hint, null);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
