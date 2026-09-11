/**
 * Issue #80 in a real browser: reference mode stacked dozens of labels on top
 * of each other, and a pink "ORIGIN · Front & Bay · 0,0" ran across the lower
 * third of the screen, over the HUD bar.
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

/** In-page: every drawn reference label and tag as a screen rectangle. */
const LAYOUT = `async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { ctx } = window.__TWIN__;
  const cam = ctx.camera;
  cam.updateMatrixWorld();
  const H = innerHeight; const W = innerWidth;
  const k = H / (2 * Math.tan((cam.fov * Math.PI) / 360));
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const v = new THREE.Vector3();
  const rect = (s) => {
    s.getWorldPosition(v);
    const depth = -v.clone().applyMatrix4(cam.matrixWorldInverse).z;
    if (depth <= 0) return null;
    const p = v.clone().project(cam);
    const x = (p.x + 1) / 2 * W; const y = (1 - p.y) / 2 * H;
    const w = (s.scale.x * k) / depth; const h = (s.scale.y * k) / depth;
    if (x + w / 2 < 0 || x - w / 2 > W || y + h / 2 < 0 || y - h / 2 > H) return null;
    return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h, origin: s.position.x === 0 && s.position.z === 0 };
  };
  const sprites = [];
  for (const name of ['reference-labels', 'reference-grid', 'reference-section']) {
    ctx.scene.getObjectByName(name).traverse((o) => { if (o.isSprite && shown(o)) sprites.push(o); });
  }
  const rects = sprites.map(rect).filter(Boolean);
  let overlaps = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i]; const b = rects[j];
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) overlaps++;
  }
  const labels = ctx.scene.getObjectByName('reference-labels').children.filter(shown).map(rect).filter(Boolean).length;
  const origin = rects.find((r) => r.origin) ?? null;
  const barTop = document.querySelector('.hud-bar').getBoundingClientRect().top;
  return { drawn: rects.length, labels, overlaps, origin, barTop };
}`;

for (const viewpoint of ['front-bay-west', 'bay-north-of-front']) {
  test(`reference mode at "${viewpoint}" draws no label on top of another (#80)`, async () => {
    await page.evaluate((id) => {
      const T = window.__TWIN__;
      T.controls.teleport(id);
      T.time.setHour(13);
      T.reference.toggle(true);
    }, viewpoint);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(`(${LAYOUT})()`);
    await page.evaluate(() => window.__TWIN__.reference.toggle(false));
    const where = `${viewpoint}: ${JSON.stringify({ ...r, origin: r.origin && { w: Math.round(r.origin.w), bottom: Math.round(r.origin.y1) } })}`;
    // Unfixed: 207 overlapping pairs at Front & Bay, 140 facing the origin.
    assert.equal(r.overlaps, 0, `labels drawn over each other - ${where}`);
    assert.ok(r.labels >= 12, `decluttered down to ${r.labels} labels - ${where}`);
    if (r.origin) {
      // Unfixed: 358 px wide from 104 m, and across the HUD bar up close.
      assert.ok(r.origin.w <= 320, `the origin tag is ${Math.round(r.origin.w)} px wide - ${where}`);
      assert.ok(r.origin.y1 <= r.barTop, `the origin tag runs over the HUD bar - ${where}`);
    }
  });
}

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
