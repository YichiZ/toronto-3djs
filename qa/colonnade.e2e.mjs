/**
 * Issue #28 in a real browser: the Front Street colonnade, as the forecourt
 * viewpoint frames it.
 *
 * Retail fascias ("SHOPPERS DRUG MART", "LCBO") hung between the Tuscan columns,
 * though those tenants trade inside the station; and the viewpoint stood on the
 * portico's axis with a twin-lantern pole dead centre of frame.
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

test('no storefront fascia hangs on the Front Street colonnade', async () => {
  const onColonnade = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { BUILDINGS } = await import('/src/data/buildings.js');
    const b = BUILDINGS.find((x) => x.id === 'union-station');
    const faceZ = b.z - b.d / 2; // north, the Front Street side
    const plates = window.__TWIN__.ctx.scene.getObjectByName('storefront-fascias').children;
    const p = new THREE.Vector3();
    return plates
      .filter((m) => { m.getWorldPosition(p); return Math.abs(p.z - faceZ) < 1 && Math.abs(p.x - b.x) < b.w / 2; })
      .map((m) => m.userData.tenant?.name);
  });
  // Unfixed: all seven of union-station's north-face tenants, Shoppers and LCBO among them.
  assert.deepEqual(onColonnade, []);
});

test('the forecourt viewpoint has no street furniture or fascia in the middle of frame', async () => {
  const centre = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ctx, controls } = window.__TWIN__;
    controls.teleport('union-forecourt');
    await new Promise((r) => setTimeout(r, 400));
    ctx.camera.updateMatrixWorld();
    const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
    const within = (o, name) => { for (let q = o; q; q = q.parent) if (q.name === name) return true; return false; };
    const rc = new THREE.Raycaster();
    const hits = { furniture: 0, fascia: 0 };
    // The middle ninth of the frame: 9 x 9 rays.
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      rc.setFromCamera(new THREE.Vector2(i * 0.05, j * 0.1), ctx.camera);
      rc.far = 200;
      const h = rc.intersectObject(ctx.scene, true).find((x) => x.face && shown(x.object) && !x.object.userData?.noCollide);
      if (h && within(h.object, 'streetFurniture')) hits.furniture++;
      if (h && within(h.object, 'storefront-fascias')) hits.fascia++;
    }
    return hits;
  });
  // Unfixed: a twin-lantern pole on 9 of the 81 rays and fascias on 4.
  assert.deepEqual(centre, { furniture: 0, fascia: 0 });
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
