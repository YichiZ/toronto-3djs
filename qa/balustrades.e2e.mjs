/**
 * Issue #117 in a real browser: the concourse balustrades guarded a void that
 * was never built. `facetedCeiling` roofs the whole room, so the glass railing
 * stood on the concourse floor in the middle of a sealed space.
 *
 * The invariant is written generally, because the thing that went wrong was not
 * one railing: a railing must guard a drop. For every piece of balustrade glass
 * in the three concourses, the floor has to change height — or run out —
 * within a stride of one side of it.
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
  // The measurement runs inside a traverse, which cannot await an import.
  await page.evaluate(async () => {
    window.__THREE_FOR_QA__ = await import('/node_modules/three/build/three.module.js');
  });
});

after(async () => { await world?.close(); });

/** Interiors are proximity-streamed, so each room has to be stood in to be seen. */
const VIEWPOINT = {
  'union-york-concourse': 'york-concourse',
  'union-bay-concourse': 'bay-concourse',
  'union-via-concourse': 'via-concourse',
};

const visit = (vp) => page.evaluate(async (id) => {
  const { controls } = window.__TWIN__;
  controls.setMode('walk');
  controls.teleport(id);
  await new Promise((r) => setTimeout(r, 900));
}, vp);

/**
 * Every balustrade panel in a room, with the floor height a stride out on each
 * side of it. A panel that guards something has a drop, a gap or a stair on one
 * side; a panel with flat floor at its own height on both sides guards nothing.
 */
const PANELS = `(roomId) => {
  const { ctx } = window.__TWIN__;
  const room = ctx.scene.getObjectByName(roomId);
  if (!room) return null;
  const THREE = window.__THREE_FOR_QA__;
  const rc = new THREE.Raycaster();
  rc.camera = ctx.camera;
  const DOWN = new THREE.Vector3(0, -1, 0);
  const floorAt = (x, y, z) => {
    rc.set(new THREE.Vector3(x, y + 1.2, z), DOWN);
    rc.far = 14;
    const h = rc.intersectObject(ctx.scene, true).find((i) => i.face && !i.object.userData?.noCollide);
    return h ? +h.point.y.toFixed(2) : null;
  };

  const out = [];
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  room.traverse((o) => {
    if (o.material?.name !== 'conc:balGlass') return;
    o.updateWorldMatrix(true, false);
    o.matrixWorld.decompose(p, q, s);
    const g = o.geometry.parameters;
    // The panel's run is the long horizontal axis of its box, turned into world
    // space; what it guards is whatever lies across that run.
    const along = new THREE.Vector3(g.width > g.depth ? 1 : 0, 0, g.width > g.depth ? 0 : 1)
      .applyQuaternion(q);
    const across = new THREE.Vector3(-along.z, 0, along.x).normalize();
    const STRIDE = 1.3;
    out.push({
      at: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)],
      sides: [1, -1].map((sx) =>
        floorAt(p.x + across.x * STRIDE * sx, p.y, p.z + across.z * STRIDE * sx)),
    });
  });
  return out;
}`;

for (const [room, vp] of Object.entries(VIEWPOINT)) {
  test(`no railing in ${room} guards a floor (#117)`, async () => {
    await visit(vp);
    const panels = await page.evaluate(`(${PANELS})(${JSON.stringify(room)})`);
    assert.ok(panels !== null, `${room} did not stream in`);
    assert.ok(panels.length > 0, `${room} has no balustrades at all to check`);
    const guardingNothing = panels.filter(({ at, sides }) => {
      const [a, b] = sides;
      if (a === null || b === null) return false;            // a gap is a drop
      return Math.abs(a - b) < 0.5 && Math.abs(a - at[1]) < 0.8;
    });
    // Unfixed, in York and Bay: a run of glass across the north of the room
    // with flat floor at -3.5 on both sides of it.
    assert.deepEqual(guardingNothing, [],
      `${guardingNothing.length} of ${panels.length} panels guard flat floor - ${JSON.stringify(guardingNothing)}`);
  });
}

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
