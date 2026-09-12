/**
 * The moat, in a real browser (#117, #131).
 *
 * York and Bay open up into the cut flanking the Great Hall; before this the
 * ceiling roofed the whole room and the glass balustrade stood on the floor
 * guarding it. Two earlier attempts are why this measures what it measures:
 *
 *   - an opening cut in the ceiling is not enough. Until #128 the wing massing's
 *     underside hung inside these rooms and was 100% of the view looking up, so
 *     a correctly built well was invisible behind it. Hence the frame-share
 *     check: the canopy has to be ON SCREEN from the floor, not merely present.
 *   - the railing has to be at the rim. On the floor it guards nothing.
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
  await page.evaluate(async () => {
    window.__THREE_FOR_QA__ = await import('/node_modules/three/build/three.module.js');
  });
});

after(async () => { await world?.close(); });

const VIEWPOINT = {
  'union-york-concourse': 'york-concourse',
  'union-bay-concourse': 'bay-concourse',
};

const visit = (vp) => page.evaluate(async (id) => {
  const { controls } = window.__TWIN__;
  controls.setMode('walk');
  controls.teleport(id);
  await new Promise((r) => setTimeout(r, 900));
}, vp);

/** Rays up from the floor, and the share of the frame the moat covers. */
const MEASURE = `async (roomId) => {
  const THREE = window.__THREE_FOR_QA__;
  const cc = await import('/src/interiors/concourses.js');
  const { ctx } = window.__TWIN__;
  const FLOOR = -3.5;
  const room = cc.ROOMS.find((r) => r.id === roomId);
  const well = (cc.MOAT_WELLS ?? []).find((m) => m.room === roomId) ?? null;
  const spot = well ? { x: well.x, z: well.z } : { x: room.x, z: room.z - room.d / 2 + 4.5 };

  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const rc = new THREE.Raycaster();
  rc.camera = ctx.camera;
  const UP = new THREE.Vector3(0, 1, 0);
  const up = (x, z) => {
    rc.set(new THREE.Vector3(x, FLOOR + 1.7, z), UP);
    rc.far = 60;
    return rc.intersectObject(ctx.scene, true)
      .filter((h) => h.face && shown(h.object))
      .map((h) => ({ y: +h.point.y.toFixed(2), name: h.object.name || h.object.parent?.name || '', mat: h.object.material?.name ?? '' }));
  };
  const ceilingIn = (list) => list.find((h) => h.mat === 'conc:ceilingWhite') ?? null;

  // The railing at the opening, found by where it is rather than how it is
  // grouped: the stairs and escalators in the room carry the same glass.
  let railLow = Infinity;
  const group = ctx.scene.getObjectByName(roomId) ?? ctx.scene;
  const p = new THREE.Vector3();
  group.traverse((o) => {
    if (o.material?.name !== 'conc:balGlass' || !well) return;
    o.getWorldPosition(p);
    if (Math.abs(p.x - well.x) > well.w / 2 + 1.5) return;
    if (Math.abs(p.z - well.z) > well.d / 2 + 1.5) return;
    railLow = Math.min(railLow, p.y);
  });

  // Stand under the opening, look up at it, and see what is actually on screen.
  ctx.camera.position.set(spot.x, FLOOR + 1.7, spot.z + 6);
  ctx.camera.rotation.order = 'YXZ';
  // Yaw 0 faces -z, which is toward the well; the camera stands 6 m south of it.
  ctx.camera.rotation.set(Math.PI * 0.28, 0, 0);
  ctx.camera.updateMatrixWorld();
  let moat = 0;
  let n = 0;
  for (let j = 0; j < 12; j++) for (let i = 0; i < 20; i++) {
    rc.setFromCamera(new THREE.Vector2(-1 + (i + 0.5) / 10, -1 + (j + 0.5) / 6), ctx.camera);
    rc.far = 400;
    const h = rc.intersectObject(ctx.scene, true).find((x) => x.face && shown(x.object));
    n++;
    if (!h) continue;
    const name = h.object.name || h.object.parent?.name || '';
    if (name.startsWith('moat-') || h.object.material?.name === 'conc:moatGlass') moat++;
  }

  const overWell = up(spot.x, spot.z);
  return {
    well,
    ceilingOverWell: ceilingIn(overWell),
    ceilingOverFloor: ceilingIn(up(room.x, room.z + room.d / 4)),
    canopy: overWell.find((h) => h.name.startsWith('moat-')) ?? null,
    railLow: Number.isFinite(railLow) ? +railLow.toFixed(2) : null,
    moatShare: Math.round((100 * moat) / n),
  };
}`;

for (const [room, vp] of Object.entries(VIEWPOINT)) {
  test(`${room} is open to the moat where its balustrade is (#131)`, async () => {
    await visit(vp);
    const m = await page.evaluate(`(${MEASURE})(${JSON.stringify(room)})`);
    assert.ok(m.well, 'no moat well is built for this concourse');
    // Unfixed: a faceted ceiling at 1.7, the same as everywhere else in the room.
    assert.equal(m.ceilingOverWell, null,
      `the ceiling still roofs the moat opening at ${m.ceilingOverWell?.y}`);
    // The fold runs about a metre either side of 1.9; the canopy is at 4.9.
    assert.ok(m.ceilingOverFloor && m.ceilingOverFloor.y < 4,
      `the rest of the room lost its ceiling - ${JSON.stringify(m.ceilingOverFloor)}`);
  });

  test(`${room} can actually see the moat from the floor (#131)`, async () => {
    await visit(vp);
    const m = await page.evaluate(`(${MEASURE})(${JSON.stringify(room)})`);
    assert.ok(m.canopy, 'nothing of the moat is overhead through the opening');
    assert.ok(m.canopy.y > m.well.rimY, `the canopy is at ${m.canopy.y}, below the rim ${m.well.rimY}`);
    // Before #128 this was 0: the massing's underside was in front of all of it.
    assert.ok(m.moatShare >= 5,
      `the moat is ${m.moatShare}% of the frame looking up at it from the floor`);
  });

  test(`${room}'s railing stands at the rim of the drop (#131)`, async () => {
    await visit(vp);
    const m = await page.evaluate(`(${MEASURE})(${JSON.stringify(room)})`);
    assert.ok(m.railLow !== null, 'there is no railing at the moat opening');
    assert.ok(m.railLow > -0.5 + 0,
      `the railing at the opening sits at ${m.railLow}, not up at the rim`);
  });
}

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
