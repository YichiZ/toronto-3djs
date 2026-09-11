/**
 * End-to-end cover for issue #8: Q/E teleported between floors and holding the
 * key ripped through the whole stack.
 *
 * The unit test in qa/level-change.test.mjs checks which level the keys pick.
 * Only a real browser can check the part the issue is actually about - what
 * happens over the frames AFTER the key, because the old code had none: the
 * height was at its destination on the very first one.
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

/** A spot on Front Street with the PATH and a concourse modelled under it. */
const OVER_THE_PATH = [-120, 40];

/** Stand the walker at a place and a level, and let grounding settle. */
const standAt = ([x, z], y) => page.evaluate(async ([px, pz, py]) => {
  const { ctx, controls } = window.__TWIN__;
  controls.setMode('orbit');
  controls.setMode('walk');
  ctx.camera.position.set(px, py + 1.7, pz);
  controls.setLevelByY(py);
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  return { y: ctx.camera.position.y, level: controls.level };
}, [x, z, y]);

/** Press a key once and sample the height every frame for `ms`. */
const pressAndTrace = (code, ms = 1500) => page.evaluate(async ([key, span]) => {
  const { ctx, controls } = window.__TWIN__;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: key, bubbles: true }));
  const seen = [];
  const t0 = performance.now();
  while (performance.now() - t0 < span) {
    seen.push({ y: ctx.camera.position.y, level: controls.level, moving: controls.changingLevel });
    await new Promise((r) => requestAnimationFrame(r));
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: key, bubbles: true }));
  return seen;
}, [code, ms]);

test('Q descends below grade over many frames, not in one', async () => {
  const start = await standAt(OVER_THE_PATH, 0);
  assert.equal(start.level, 'street', 'the test spot is no longer street level');

  const seen = await pressAndTrace('KeyQ');
  const end = seen.at(-1);
  assert.equal(end.level, 'concourse', `ended on ${end.level}`);
  assert.ok(end.y < -1, `did not arrive below grade, y ${end.y.toFixed(2)}`);

  // The assertion the old code failed: it was already at the bottom on frame
  // one, so there were no heights in between at all.
  const between = seen.filter((s) => s.y < start.y - 0.5 && s.y > end.y + 0.5);
  assert.ok(between.length >= 4, `only ${between.length} frames between the two levels`);
  // And it is a descent, never a bounce back up through the pavement.
  const rose = seen.filter((s, i) => i > 0 && s.y > seen[i - 1].y + 1e-3);
  assert.equal(rose.length, 0, 'the height went back up mid-descent');
  // It ends: the transition hands the height back to grounding.
  assert.equal(end.moving, false, 'still easing after 1.5 s');
});

test('holding E steps one level, not six', async () => {
  const start = await standAt(OVER_THE_PATH, -6.5);
  assert.equal(start.level, 'PATH', 'the test spot is no longer on the PATH');
  const levels = await page.evaluate(async () => {
    const { controls } = window.__TWIN__;
    const seen = [];
    // The browser sends one plain keydown and then a stream of repeats.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    for (let i = 0; i < 120; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', repeat: true, bubbles: true }));
      seen.push(controls.level);
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }));
    return seen;
  });
  // One step up and then nothing, however long the key is held. The old code
  // reached the Gardiner deck in a fraction of a second.
  assert.deepEqual([...new Set(levels)], ['concourse'],
    `held E ran through ${[...new Set(levels)].join(' -> ')}`);
});

test('a refused level change tells you so', async () => {
  const toast = await page.evaluate(async () => {
    const { controls } = window.__TWIN__;
    // Top of the stack: there is nothing above the Gardiner deck anywhere.
    controls.setLevelByY(12);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    const el = document.querySelector('.hud-toast');
    return { text: el?.textContent, hidden: el?.hidden, warn: el?.classList.contains('warn'), level: controls.level };
  });
  assert.equal(toast.hidden, false, 'the HUD said nothing at all');
  assert.match(toast.text, /no level above/);
  assert.ok(toast.warn, 'a refusal should not read like an ordinary level change');
  assert.equal(toast.level, 'Gardiner deck', 'the level changed after all');
});

test('after a level change the walker faces somewhere walkable, not a wall (#72)', async () => {
  // The issue's repro: in the York Concourse, E rose to street level on the
  // spot, still facing the way it faced below - into a blank stone wall.
  await page.evaluate(() => window.__TWIN__.controls.teleport('york-concourse'));
  await page.waitForTimeout(500);
  await pressAndTrace('KeyE', 1500);
  const r = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ctx, controls } = window.__TWIN__;
    const shown = (h) => { for (let o = h.object.userData?.collisionSource ?? h.object; o; o = o.parent) if (!o.visible || o.userData?.noCollide) return false; return true; };
    const dir = ctx.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const rc = new THREE.Raycaster(ctx.camera.position.clone().setY(ctx.camera.position.y - 0.5), dir, 0, 30);
    rc.camera = ctx.camera;
    const hit = controls.collision.intersect(rc).find((h) => h.face && shown(h));
    return { level: controls.level, clear: hit ? hit.distance : 30 };
  });
  // FACE_CLEAR in src/ui/levelChange.js. Unfixed: 5.9 m, a wall.
  assert.ok(r.clear >= 8, `after E, on ${r.level}, only ${r.clear.toFixed(1)} m clear ahead`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
