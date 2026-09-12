/**
 * Issue #128 in a real browser: the Union Station wing and centre volumes were
 * solid boxes standing on y = 0, and the concourses are below them with ceilings
 * at +1.9 — so the block's underside hung inside those rooms as a stone lid two
 * metres over a visitor's head. Looking up in York, Bay or VIA was 100% masonry,
 * and the faceted plaster ceiling those rooms are known for was never seen.
 *
 * What this keeps: what is overhead in a concourse is that concourse's ceiling.
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

/** Stand at a viewpoint, look straight up, and tally the frame by material. */
const OVERHEAD = `async (vp) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { controls, ctx } = window.__TWIN__;
  controls.setMode('walk');
  controls.teleport(vp);
  await new Promise((r) => setTimeout(r, 900));
  ctx.camera.rotation.order = 'YXZ';
  ctx.camera.rotation.set((80 * Math.PI) / 180, ctx.camera.rotation.y, 0);
  ctx.camera.updateMatrixWorld();

  // Through the parents: streamed-out modules leave their own meshes .visible.
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const rc = new THREE.Raycaster();
  rc.camera = ctx.camera;
  const tally = {};
  let n = 0;
  for (let j = 0; j < 12; j++) for (let i = 0; i < 20; i++) {
    rc.setFromCamera(new THREE.Vector2(-1 + (i + 0.5) / 10, -1 + (j + 0.5) / 6), ctx.camera);
    rc.far = 400;
    const h = rc.intersectObject(ctx.scene, true).find((x) => x.face && shown(x.object));
    n++;
    const key = h ? (h.object.material?.name || '?') : 'nothing';
    tally[key] = (tally[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, Math.round((100 * v) / n)]));
}`;

for (const vp of ['york-concourse', 'bay-concourse', 'via-concourse']) {
  test(`${vp} looks up at its own ceiling, not the masonry above it (#128)`, async () => {
    const f = await page.evaluate(`(${OVERHEAD})(${JSON.stringify(vp)})`);
    const where = JSON.stringify(f);
    const stone = Object.entries(f)
      .filter(([k]) => k.startsWith('limestone'))
      .reduce((n, [, v]) => n + v, 0);
    // Unfixed: limestone:floodlit at y = 0.0, 100% of the frame.
    assert.equal(stone, 0, `the head house massing is ${stone}% of the view overhead - ${where}`);
    const ceiling = (f['conc:ceilingWhite'] ?? 0) + (f['conc:cove'] ?? 0);
    assert.ok(ceiling > 60, `only ${ceiling}% of the view overhead is the ceiling - ${where}`);
  });
}

test('the Great Hall and the PATH still have their own ceilings (#128)', async () => {
  const hall = await page.evaluate(`(${OVERHEAD})("great-hall")`);
  assert.ok((hall['conc:ceilingWhite'] ?? 0) === 0, `a concourse ceiling in the Great Hall - ${JSON.stringify(hall)}`);
  const path = await page.evaluate(`(${OVERHEAD})("path-corridor")`);
  assert.ok((path['path:soffit'] ?? 0) > 50, `the PATH soffit is gone - ${JSON.stringify(path)}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
