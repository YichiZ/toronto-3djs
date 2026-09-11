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
  // #79: 6 m from a corner pier, craning up; neither facade nor roofline read.
  ['hhof-front-yonge', 'hockey-hall-of-fame'],
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

// #79: the checks above pass a 19 m building seen from 8 m, with its roofline
// out of sight. The steepest part of the roofline to fit is its nearest top
// corner; if that is in frame, the facade reads whole.
test('the Hockey Hall of Fame arrives whole: its roofline in frame (#79)', async () => {
  await page.selectOption('.hud-bar select', 'hhof-front-yonge');
  await page.waitForTimeout(700);
  const corner = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const reg = await import('/src/core/registry.js');
    const cam = window.__TWIN__.ctx.camera;
    cam.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject(reg.get('hockey-hall-of-fame').object);
    let near = null;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
      const d = Math.hypot(x - cam.position.x, z - cam.position.z);
      if (!near || d < near.d) near = { x, z, d };
    }
    const p = new THREE.Vector3(near.x, box.max.y, near.z).project(cam);
    return { ndcX: +p.x.toFixed(2), ndcY: +p.y.toFixed(2), metres: +near.d.toFixed(1) };
  });
  // Unfixed: the corner 8 m off and far above the top of the frame.
  assert.ok(corner.ndcY < 0.95 && Math.abs(corner.ndcX) <= 1, `the roofline's nearest corner is out of frame - ${JSON.stringify(corner)}`);
});

// Below grade, #70: the streetcar loop's back-faced shell wrapped the PATH
// arrival (a grey wall 3 m ahead) and put its lid 0.3 m over the eye in the Bay
// Concourse. That shell is noCollide, so the check above never sees it; this
// one counts anything drawn.
for (const viewpoint of ['york-concourse', 'bay-concourse', 'path-corridor']) {
  test(`arriving at "${viewpoint}", nothing is drawn within 4 m of the middle of the frame`, async () => {
    await page.selectOption('.hud-bar select', viewpoint);
    await page.waitForTimeout(900);
    const hit = await page.evaluate(async () => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const { ctx } = window.__TWIN__;
      const cam = ctx.camera;
      cam.updateMatrixWorld();
      const moving = new Set(['vehicles', 'pedestrians', 'trains']);
      const shown = (o) => { for (let p = o; p; p = p.parent) { if (!p.visible || moving.has(p.name)) return false; } return o.material?.visible !== false; };
      const rc = new THREE.Raycaster();
      rc.camera = cam;
      let nearest = { d: Infinity };
      for (const x of [-0.3, 0, 0.3]) for (const y of [-0.2, 0, 0.3]) {
        rc.setFromCamera(new THREE.Vector2(x, y), cam);
        const h = rc.intersectObject(ctx.scene, true).find((i) => shown(i.object));
        if (h && h.distance < nearest.d) {
          const chain = [];
          for (let p = h.object; p && chain.length < 3; p = p.parent) chain.push(p.name || p.type);
          nearest = { d: +h.distance.toFixed(1), what: chain.join(' < ') };
        }
      }
      return nearest;
    });
    assert.ok(hit.d >= 4, `${hit.what} is ${hit.d} m away in the middle of the frame at ${viewpoint}`);
  });
}

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
