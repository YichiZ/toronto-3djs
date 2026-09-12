/**
 * Issue #38 in a real browser: a pedestrian no longer walks through the camera.
 *
 * Stand on a walking pedestrian's own line, 3 m ahead of it, and watch where
 * its rendered figure goes as it passes.
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

test('a pedestrian heading straight at the walker steps round it', async () => {
  const r = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ctx, controls } = window.__TWIN__;
    controls.teleport('front-bay-west');
    const agents = ctx.scene.getObjectByName('pedestrians').userData.agents();
    // A street agent walking, mid-edge, with room to pass the walker before its next corner.
    const a = agents.find((x) => x.wait <= 0 && x.edge.y >= -0.5 && x.edge.len - x.s > 8 && x.slot < x.im.count);
    if (!a) throw new Error('no suitable pedestrian');
    const from = a.rev ? a.edge.b : a.edge.a;
    const to = a.rev ? a.edge.a : a.edge.b;
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const dx = (to.x - from.x) / len;
    const dz = (to.z - from.z) / len;
    const f = a.s / len;
    const px = from.x + (to.x - from.x) * f;
    const pz = from.z + (to.z - from.z) * f;
    // On the agent's own line, lane and all (#112): on the centreline the
    // walker would simply be beside it, and the sidestep would go untested.
    const lane = a.lane ?? 0;
    ctx.camera.position.set(px - dz * lane + dx * 3, a.edge.y + 1.7, pz + dx * lane + dz * 3);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let min = Infinity;
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      await new Promise((res) => requestAnimationFrame(res));
      a.im.getMatrixAt(a.slot, m);
      p.setFromMatrixPosition(m);
      min = Math.min(min, Math.hypot(p.x - ctx.camera.position.x, p.z - ctx.camera.position.z));
    }
    return { min, speed: a.speed };
  });
  // Unfixed: it walks straight through, closest ~0 m.
  assert.ok(r.min > 0.8, `the pedestrian came within ${r.min.toFixed(2)} m of the walker`);
});

test('the crowd still never blocks the walker: pedestrians stay out of collision', async () => {
  const inIndex = await page.evaluate(() => {
    const { controls, ctx } = window.__TWIN__;
    const peds = ctx.scene.getObjectByName('pedestrians');
    let any = false;
    peds.traverse((o) => { if (o.isInstancedMesh && !o.userData.noCollide) any = true; });
    return any;
  });
  assert.equal(inIndex, false);
});

test('the Union concourses carry a crowd (#70)', async () => {
  for (const id of ['york-concourse', 'bay-concourse']) {
    const near = await page.evaluate(async (id) => {
      const { ctx, controls } = window.__TWIN__;
      controls.teleport(id);
      await new Promise((r) => setTimeout(r, 600));
      const p = ctx.camera.position;
      let n = 0;
      ctx.scene.getObjectByName('pedestrians').traverse((o) => {
        if (!o.isInstancedMesh) return;
        const a = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          const onFloor = Math.abs(a[i * 16 + 13] + 1.7 - p.y) < 1.5;
          if (onFloor && Math.hypot(a[i * 16 + 12] - p.x, a[i * 16 + 14] - p.z) < 25) n++;
        }
      });
      return n;
    }, id);
    // Unfixed: nobody at all.
    assert.ok(near >= 8, `${near} pedestrians within 25 m at ${id}`);
  }
});

test('the crowd walks the width of the way, not nose to tail down its middle (#112)', async () => {
  const r = await page.evaluate(() => {
    const agents = window.__TWIN__.ctx.scene.getObjectByName('pedestrians').userData.agents();
    const offs = agents.map((a) => Math.abs((a.side ?? 0) + (a.lane ?? 0)));
    const byEdge = new Map();
    for (const a of agents) {
      if (!byEdge.has(a.edge)) byEdge.set(a.edge, []);
      byEdge.get(a.edge).push(a);
    }
    let pairs = 0;
    let nose = 0;
    for (const list of byEdge.values()) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((p, q) => p.s - q.s);
      for (let i = 1; i < sorted.length; i++) {
        pairs++;
        const along = Math.abs(sorted[i].s - sorted[i - 1].s);
        const off = (a) => (a.side ?? 0) + (a.lane ?? 0);
        if (along < 4 && Math.abs(off(sorted[i]) - off(sorted[i - 1])) < 0.5) nose++;
      }
    }
    const speeds = agents.map((a) => a.speed);
    return {
      offCentre: offs.filter((o) => o > 0.3).length / agents.length,
      nose: pairs ? nose / pairs : 0,
      speedSpread: Math.max(...speeds) - Math.min(...speeds),
    };
  });
  const where = JSON.stringify(r);
  // Unfixed: every walker exactly on the centreline, 43% of same-edge
  // neighbours nose to tail, speeds 0.80-1.50.
  assert.ok(r.offCentre > 0.7, `only ${(r.offCentre * 100).toFixed(0)}% walk off the centreline - ${where}`);
  assert.ok(r.nose < 0.25, `${(r.nose * 100).toFixed(0)}% of neighbours are nose to tail - ${where}`);
  assert.ok(r.speedSpread > 0.8, `speeds span only ${r.speedSpread.toFixed(2)} m/s - ${where}`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
