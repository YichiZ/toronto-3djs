/**
 * Issue #82 in a real browser: a Jump-to landmark opens on the landmark.
 *
 * Six entries arrived on a wall, a canopy roof or a lamp post: the Royal York
 * from 7 m under its canopy, the CN Tower staring 79 degrees up its shaft, the
 * arena's Postal Delivery facade as a 19 m close-up at 36 degrees, Maple Leaf
 * Square from inside the podium, the Flatiron behind a neighbouring block 6 m
 * away, and Front & York with a transit sign 3 m dead ahead.
 *
 * On arrival each must frame the thing it names, at a level-ish gaze, with
 * nothing in the middle of the frame within arm's reach and a clear walk ahead.
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

// viewpoint -> the registry entry it names
const LANDMARKS = [
  ['royal-york-porte-cochere', 'royal-york'],
  ['cn-tower-base', 'cn-tower'],
  ['arena-bay-heritage', 'scotiabank-arena'],
  ['maple-leaf-square', 'mls-square'],
  ['gooderham-flatiron', 'gooderham-flatiron'],
  ['front-york-east', 'union-station'],
];

/** In-page: what the camera frames on arrival. Moving things never count. */
const FRAME = `async (subjectId) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const reg = await import('/src/core/registry.js');
  const { ctx } = window.__TWIN__;
  const cam = ctx.camera;
  cam.updateMatrixWorld();
  const subj = reg.get(subjectId).object;
  const moving = new Set(['vehicles', 'pedestrians', 'trains']);
  const shown = (o) => { for (let p = o; p; p = p.parent) { if (!p.visible || moving.has(p.name)) return false; } return true; };
  const under = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
  const ok = (h) => h.face && shown(h.object) && !h.object.userData?.noCollide;
  const rc = new THREE.Raycaster();
  rc.camera = cam;
  let s = 0, n = 0, nearest = Infinity;
  for (let j = 0; j < 12; j++) for (let i = 0; i < 20; i++) {
    rc.setFromCamera(new THREE.Vector2(-1 + (i + 0.5) / 10, -1 + (j + 0.5) / 6), cam);
    rc.far = 1000;
    const h = rc.intersectObject(ctx.scene, true).find(ok);
    n++;
    if (h && under(h.object, subj)) s++;
    // The middle of the frame: what the eye lands on first.
    if (h && Math.abs(i - 9.5) < 4 && Math.abs(j - 5.5) < 3) nearest = Math.min(nearest, h.distance);
  }
  const dir = cam.getWorldDirection(new THREE.Vector3());
  rc.set(cam.position.clone().setY(cam.position.y - 0.5), dir.clone().setY(0).normalize());
  rc.far = 200;
  const ahead = rc.intersectObject(ctx.scene, true).find((h) => ok(h) && h.object.material?.visible !== false);
  return {
    share: Math.round((100 * s) / n),
    pitch: Math.round((Math.asin(dir.y) * 180) / Math.PI),
    nearest: +nearest.toFixed(1),
    clearAhead: ahead ? +ahead.distance.toFixed(1) : 200,
  };
}`;

for (const [viewpoint, subject] of LANDMARKS) {
  test(`Jump to "${viewpoint}" frames ${subject}, level, with a clear line ahead`, async () => {
    await page.selectOption('.hud-bar select', viewpoint);
    await page.waitForTimeout(700);
    const f = await page.evaluate(`(${FRAME})(${JSON.stringify(subject)})`);
    const where = `${viewpoint}: ${JSON.stringify(f)}`;
    // 10%, not more: the CN Tower is a thin shaft, and at a gaze that shows its
    // base it fills about 13% of a frame. Every old viewpoint failed a check.
    assert.ok(f.share >= 10, `${subject} is only ${f.share}% of the frame - ${where}`);
    assert.ok(f.pitch <= 25, `craning ${f.pitch} degrees up - ${where}`);
    assert.ok(f.nearest >= 4, `something ${f.nearest} m away in the middle of the frame - ${where}`);
    assert.ok(f.clearAhead >= 8, `only ${f.clearAhead} m of clear walking ahead - ${where}`);
  });
}

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
