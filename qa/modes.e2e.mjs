/**
 * End-to-end cover for issue #4: switching orbit <-> walk jumped the camera.
 *
 * The unit test in qa/mode-transition.test.mjs checks the arithmetic. This one
 * checks the thing the issue was actually reported against: a real browser, the
 * real scene, the real HUD buttons, and - the part no unit test can reach -
 * frames rendered AFTER the switch, because the old bug only showed its teeth
 * once ground() ran and pulled the walker down onto whatever roof was below.
 *
 *   npm run e2e
 *
 * Needs a Playwright chromium (`npx playwright install chromium`).
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

/** Put the orbit camera somewhere specific, the way the QA harness is meant to be used. */
const orbitFrom = (camera, target) => page.evaluate(([c, t]) => {
  const { ctx, controls } = window.__TWIN__;
  controls.setMode('orbit');
  controls.orbitControls.target.set(t[0], t[1], t[2]);
  ctx.camera.position.set(c[0], c[1], c[2]);
  ctx.camera.lookAt(controls.orbitControls.target);
  controls.orbitControls.update();
}, [camera, target]);

const readCamera = () => page.evaluate(() => {
  const { ctx, controls } = window.__TWIN__;
  const e = new (Object.getPrototypeOf(ctx.camera.rotation).constructor)(0, 0, 0, 'YXZ')
    .setFromQuaternion(ctx.camera.quaternion);
  const d = ctx.camera.getWorldDirection(ctx.camera.position.clone());
  return {
    pos: ctx.camera.position.toArray(),
    dir: d.toArray(),
    pitch: e.x,
    yaw: e.y,
    mode: controls.mode,
    level: controls.level,
    target: controls.orbitControls.target.toArray(),
  };
});

/**
 * Wait until the walker's height has stopped moving.
 *
 * ground() eases toward the floor rather than snapping, so a height sampled
 * right after a mode switch is still travelling. Measuring a 0.9 m hop against
 * a moving baseline made the hop test flaky.
 */
const waitForSettled = () => page.waitForFunction(() => {
  const y = window.__TWIN__.ctx.camera.position.y;
  const last = window.__settleProbe;
  window.__settleProbe = y;
  return last !== undefined && Math.abs(y - last) < 1e-3;
}, null, { timeout: 10_000, polling: 'raf' });

/** Click a HUD mode button by its label, so the test drives the real UI. */
const clickMode = async (label) => {
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  // Let the frame loop actually run: the old bug surfaced in ground(), not in
  // the switch itself.
  await page.waitForTimeout(400);
};

test('orbit -> walk lands at the subject on the street, not on a roof 300 m away', async () => {
  const target = [-40, 20, 60];
  await orbitFrom([140, 150, 240], target);
  await clickMode('Walk');

  const cam = await readCamera();
  assert.equal(cam.mode, 'walk');
  assert.ok(Math.hypot(cam.pos[0] - target[0], cam.pos[2] - target[2]) < 1.0,
    `landed ${Math.hypot(cam.pos[0] - target[0], cam.pos[2] - target[2]).toFixed(1)} m from the subject`);
  assert.equal(cam.level, 'street', 'a target framing downtown at 20 m is not the Gardiner deck');
  // Eye height over the pavement, after several frames of grounding - this is
  // the assertion the old code failed, landing at y 16.8 on a rooftop.
  assert.ok(cam.pos[1] > 0.5 && cam.pos[1] < 3.5, `eye height was ${cam.pos[1].toFixed(2)}`);
  assert.ok(Math.abs(cam.pitch) < 1e-6, 'arrives looking level, not at the pavement');
});

test('walk -> orbit does not rotate the view or move the camera', async () => {
  const before = await readCamera();
  await clickMode('Orbit');
  const after = await readCamera();

  assert.equal(after.mode, 'orbit');
  // The camera itself must not budge - that is the jump the issue reports.
  // Horizontally that is exact. Vertically it is a couple of millimetres: the
  // walker's ground() is still easing toward eye height in the frames either
  // side of the click, and a millimetre of settle is not a jump.
  assert.ok(Math.abs(after.pos[0] - before.pos[0]) < 1e-4, `camera moved in x: ${before.pos[0]} -> ${after.pos[0]}`);
  assert.ok(Math.abs(after.pos[2] - before.pos[2]) < 1e-4, `camera moved in z: ${before.pos[2]} -> ${after.pos[2]}`);
  assert.ok(Math.abs(after.pos[1] - before.pos[1]) < 0.05, `camera moved in y: ${before.pos[1]} -> ${after.pos[1]}`);
  // The view may tilt by the sliver needed to stay inside maxPolarAngle, and no
  // more. The old code swung the whole view to face grid-north.
  const dot = after.dir[0] * before.dir[0] + after.dir[1] * before.dir[1] + after.dir[2] * before.dir[2];
  const swungDeg = Math.acos(Math.min(1, dot)) * 180 / Math.PI;
  assert.ok(swungDeg < 2, `view swung ${swungDeg.toFixed(2)} degrees`);
  // The pivot is ahead of the camera along that same view ray.
  const ahead = after.dir[0] * (after.target[0] - after.pos[0]) + after.dir[2] * (after.target[2] - after.pos[2]);
  assert.ok(ahead > 0, 'the orbit target sits ahead of the camera, not 60 m grid-north of it');
});

test('orbiting the PATH and switching to walk puts you on the PATH', async () => {
  await orbitFrom([-120, 60, 140], [-120, -6.5, 40]);
  await clickMode('Walk');

  const cam = await readCamera();
  assert.equal(cam.level, 'PATH');
  assert.ok(cam.pos[1] < 0, `still below grade after grounding, got y ${cam.pos[1].toFixed(2)}`);
});

test('Space hops, and the walker comes back down to the same floor', async () => {
  // Stand somewhere flat and known: the street outside Union.
  await orbitFrom([0, 120, 220], [-16, 0, 40]);
  await clickMode('Walk');
  await waitForSettled();
  const before = await readCamera();

  await page.locator('canvas').first().click();   // focus the view, as a player would
  const trace = await page.evaluate(async () => {
    const { ctx, controls } = window.__TWIN__;
    const samples = [];
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    const started = performance.now();
    while (performance.now() - started < 1200) {
      samples.push({ y: ctx.camera.position.y, air: controls.airborne, level: controls.level });
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    return samples;
  });

  const rise = Math.max(...trace.map((s) => s.y)) - before.pos[1];
  assert.ok(rise > 0.6 && rise < 1.1, `hop rose ${rise.toFixed(2)} m, expected about 0.9`);
  assert.ok(trace.some((s) => s.air), 'the walker was actually airborne');

  const after = await readCamera();
  assert.equal(after.mode, 'walk');
  assert.ok(Math.abs(after.pos[1] - before.pos[1]) < 0.05,
    `landed at ${after.pos[1].toFixed(2)}, took off from ${before.pos[1].toFixed(2)}`);
  assert.equal(after.level, before.level, 'a hop is not a level change');
  // The level must not flicker mid-air onto whatever passes under the arc.
  assert.deepEqual([...new Set(trace.map((s) => s.level))], [before.level]);
});

/**
 * In-page: height of a real floor under (x, z) on a level, asked the way ground()
 * asks it - same origin, same invisible/noCollide skip - or null. Passed to
 * page.evaluate as source, since it has to run next to the scene.
 */
const FLOOR_AT = `(THREE, ctx) => {
  const down = new THREE.Raycaster();
  down.camera = ctx.camera;
  down.far = 11.4;                                   // PROBE_ABOVE + PROBE_BELOW
  return (x, z, levelY) => {
    down.set(new THREE.Vector3(x, levelY + 2.4, z), new THREE.Vector3(0, -1, 0));
    for (const hit of down.intersectObject(ctx.scene, true)) {
      if (!hit.face) continue;
      let solid = true;
      for (let o = hit.object; o; o = o.parent) if (o.visible === false || o.userData?.noCollide) solid = false;
      if (solid) return hit.point.y;
    }
    return null;
  };
}`;

test('a hop carries off a real ledge - the Royal Bank Plaza roof - onto the street', async () => {
  // The Royal Bank Plaza setback roof at 8.77, walkable at level 9 (see
  // qa/edges.e2e.mjs). Along x -28 it is only z -120 to -116 - probed, not
  // guessed; z -124, where the edge test starts, is held ground south of it.
  // Walking north stops at its edge; a hop taken there, still pressing W, must
  // carry the walker off it. The edge guard is for walking - mid-air it was an
  // invisible wall that stopped the hop dead at the parapet line.
  const ROOF = [-28, 8.77 + 1.7, -118];
  const run = await page.evaluate(async ([from, floorAtSrc]) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ctx, controls } = window.__TWIN__;
    const floorAt = eval(floorAtSrc)(THREE, ctx);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    controls.setMode('orbit');
    controls.setMode('walk');
    ctx.camera.position.set(from[0], from[1], from[2]);
    controls.setLevelByY(from[1] - 1.7);
    ctx.camera.lookAt(from[0], from[1], 100);        // grid-north, toward the edge
    for (let i = 0; i < 30; i++) await frame();
    const floorAtStart = floorAt(ctx.camera.position.x, ctx.camera.position.z, 9);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    let t0 = performance.now();
    while (performance.now() - t0 < 4000) await frame();
    const atEdge = { z: ctx.camera.position.z, level: controls.level };

    const seen = [];
    controls.jump();
    t0 = performance.now();
    while (performance.now() - t0 < 3000) { seen.push(controls.level); await frame(); }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    const p = ctx.camera.position;
    return { floorAtStart, atEdge, seen, end: { y: p.y, z: p.z, level: controls.level, air: controls.airborne } };
  }, [ROOF, FLOOR_AT]);

  assert.notEqual(run.floorAtStart, null, 'no roof modelled here any more - the test would be hopping off nothing');
  assert.equal(run.atEdge.level, 'SkyWalk');
  assert.ok(run.atEdge.z < -110, `walking should stop at the roof edge, but reached z ${run.atEdge.z.toFixed(1)}`);
  assert.equal(run.end.air, false, 'the walker landed');
  assert.equal(run.end.level, 'street', `the hop ended on ${run.end.level}, not the street below the ledge`);
  assert.ok(run.end.y < 3, `landed at ${run.end.y.toFixed(2)}, expected street level`);
  // One level change, on landing - not a flicker through what the arc passed over.
  const changes = run.seen.filter((l, i) => i === 0 || l !== run.seen[i - 1]);
  assert.deepEqual(changes.slice(0, 2), ['SkyWalk', 'street']);
});

test('a hop from ground the walker is only held at lands back at that height', async () => {
  // (-400, -160) at level 9 has no floor mesh: ground() holds the walker at the
  // nominal SkyWalk height, and walking there stays up there. A hop used to drop
  // the walker 9 m to the street instead, because the arc lands on whatever is
  // physically below. That is the "falls on some gaps and not others" the edge
  // guard exists to avoid - a hop has to agree with walking.
  const HELD = [-400, 9 + 1.7, -160];
  const run = await page.evaluate(async ([from, floorAtSrc]) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ctx, controls } = window.__TWIN__;
    const floorAt = eval(floorAtSrc)(THREE, ctx);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    controls.setMode('orbit');
    controls.setMode('walk');
    ctx.camera.position.set(from[0], from[1], from[2]);
    controls.setLevelByY(from[1] - 1.7);
    for (let i = 0; i < 30; i++) await frame();
    const start = { y: ctx.camera.position.y, level: controls.level };
    const floorAtLevel = floorAt(ctx.camera.position.x, ctx.camera.position.z, 9);
    const streetBelow = floorAt(ctx.camera.position.x, ctx.camera.position.z, 0);

    controls.jump();
    let peak = -Infinity;
    const t0 = performance.now();
    while (performance.now() - t0 < 2000) { peak = Math.max(peak, ctx.camera.position.y); await frame(); }
    return { start, floorAtLevel, streetBelow, peak, end: { y: ctx.camera.position.y, level: controls.level, air: controls.airborne } };
  }, [HELD, FLOOR_AT]);

  assert.equal(run.floorAtLevel, null, 'this spot is floored now; the test is only meaningful while it is held');
  assert.notEqual(run.streetBelow, null, 'with nothing modelled below, there is nothing to wrongly fall onto');
  assert.equal(run.start.level, 'SkyWalk');
  assert.ok(run.peak - run.start.y > 0.6, 'the hop rose');
  assert.equal(run.end.air, false, 'the walker landed');
  assert.equal(run.end.level, 'SkyWalk', `the hop dropped the walker to ${run.end.level}`);
  assert.ok(Math.abs(run.end.y - run.start.y) < 0.05,
    `landed at ${run.end.y.toFixed(2)}, took off from ${run.start.y.toFixed(2)}`);
});

test('a running hop from held ground lands at the held height, not a bob away from it', async () => {
  // jump() runs from a key handler between frames, while the head bob is still
  // laid on top of the camera height. From held ground a hop lands back at its
  // take-off height, so that bob - up to 4 cm at a run - was baked into the
  // landing. Stepped by hand rather than by frame, so the take-off can be timed
  // to a bob crest every run instead of depending on where the phase falls.
  const r = await page.evaluate(() => {
    const { ctx, controls } = window.__TWIN__;
    const DT = 1 / 60;
    const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
    const HELD_EYE = 9 + 1.7;   // (-400, -160) at level 9: no floor mesh, held
    controls.setMode('orbit');
    controls.setMode('walk');
    ctx.camera.position.set(-400, HELD_EYE, -160);
    controls.setLevelByY(9);
    ctx.camera.lookAt(-400, HELD_EYE, 100);
    for (let i = 0; i < 30; i++) controls.update(DT);
    key('keydown', 'ShiftLeft');
    key('keydown', 'KeyW');
    for (let i = 0; i < 60; i++) controls.update(DT);
    for (let n = 0; Math.abs(controls.bobOffset) < 0.03 && n < 200; n++) controls.update(DT);
    const bobAtTakeoff = controls.bobOffset;
    controls.jump();
    let landedEye = null;
    for (let i = 0; i < 120 && landedEye === null; i++) {
      const wasAirborne = controls.airborne;
      controls.update(DT);
      if (wasAirborne && !controls.airborne) landedEye = ctx.camera.position.y - controls.bobOffset;
    }
    key('keyup', 'KeyW');
    key('keyup', 'ShiftLeft');
    return { bobAtTakeoff, landedEye, heldEye: HELD_EYE, level: controls.level };
  });

  assert.ok(Math.abs(r.bobAtTakeoff) > 0.03, `the take-off was not at a bob crest (${r.bobAtTakeoff.toFixed(3)} m)`);
  assert.notEqual(r.landedEye, null, 'the walker never landed');
  assert.equal(r.level, 'SkyWalk');
  // Unfixed: off by exactly the bob at take-off, 3-4 cm. Fixed: 0.
  assert.ok(Math.abs(r.landedEye - r.heldEye) < 0.005,
    `landed ${(r.landedEye - r.heldEye).toFixed(4)} m off the held height (bob at take-off ${r.bobAtTakeoff.toFixed(4)})`);
});

test('holding Space does not pogo', async () => {
  const airborne = await page.evaluate(async () => {
    const { controls } = window.__TWIN__;
    // The browser sends repeat events while a key is held; only the first hops.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    const seen = [];
    for (let i = 0; i < 90; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', repeat: true, bubbles: true }));
      seen.push(controls.airborne);
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    return seen;
  });
  // One contiguous hop, then back on the ground and staying there.
  assert.equal(airborne.at(-1), false, 'still bouncing after the key was held');
  const hops = airborne.filter((a, i) => a && !airborne[i - 1]).length;
  assert.equal(hops, 1, `held Space produced ${hops} hops`);
});

test('a viewpoint teleport still lands where it says', async () => {
  const landed = await page.evaluate(() => {
    const { ctx, controls } = window.__TWIN__;
    const vp = controls.teleport(controls.viewpoints[0].id);
    return { want: vp.position, got: ctx.camera.position.toArray(), mode: controls.mode };
  });
  assert.ok(Math.hypot(landed.got[0] - landed.want.x, landed.got[2] - landed.want.z) < 0.01,
    'setMode must not overwrite the position teleport just set');
});

/**
 * Walk (or run) forward for `ms`, sampling the camera each frame.
 *
 * Drives the same key events a player sends, from a placed position and a yaw
 * chosen by the caller, so the walk is over known ground rather than wherever
 * the previous test left the view pointing.
 */
const walkForward = (pos, yaw, ms, shift) => page.evaluate(async ([at, yawAngle, span, run]) => {
  const { ctx, controls } = window.__TWIN__;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  controls.setMode('orbit');
  controls.setMode('walk');
  ctx.camera.position.set(at[0], at[1], at[2]);
  ctx.camera.rotation.set(0, yawAngle, 0);          // level, facing along the street
  for (let i = 0; i < 40; i++) await frame();       // let ground() settle

  const start = ctx.camera.position.clone();
  const keys = run ? ['KeyW', 'ShiftLeft'] : ['KeyW'];
  for (const code of keys) window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const samples = [];
  const t0 = performance.now();
  while (performance.now() - t0 < span) {
    samples.push({
      y: ctx.camera.position.y,
      bob: controls.bobOffset,
      fov: ctx.camera.fov,
      air: controls.airborne,
    });
    await frame();
  }
  for (const code of keys) window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));

  // Coast to a stop, and keep sampling: this is where the FOV must come back.
  const after = [];
  const t1 = performance.now();
  while (performance.now() - t1 < 1500) {
    after.push({ y: ctx.camera.position.y, bob: controls.bobOffset, fov: ctx.camera.fov });
    await frame();
  }
  const end = ctx.camera.position;
  return {
    samples,
    after,
    travelled: Math.hypot(end.x - start.x, end.z - start.z),
  };
}, [pos, yaw, ms, Boolean(shift)]);

/** A flat, open stretch of Front Street with room to run. */
const OPEN_STREET = [-16, 1.7, 60];
const ALONG_STREET = Math.PI / 2;

const span = (values) => Math.max(...values) - Math.min(...values);
/** Total distance a trace travelled, up and down - a bob shows up here, a grade barely does. */
const wander = (values) => values.reduce((sum, v, i) => (i ? sum + Math.abs(v - values[i - 1]) : 0), 0);

test('holding Shift widens the frame, and releasing it brings the frame back', async () => {
  const run = await walkForward(OPEN_STREET, ALONG_STREET, 1500, true);
  assert.ok(run.travelled > 4,
    `the walker only covered ${run.travelled.toFixed(1)} m - the test spot is blocked`);

  const widest = Math.max(...run.samples.map((s) => s.fov));
  assert.ok(widest > 62, `running only reached ${widest.toFixed(2)} deg, expected about 64`);
  assert.ok(widest <= 64.001, `overshot to ${widest.toFixed(2)} deg`);

  // And it comes all the way back to the lens the camera was built with.
  const rested = run.after.at(-1).fov;
  assert.ok(Math.abs(rested - 58) < 0.01, `left at ${rested.toFixed(3)} deg after stopping`);
});

test('a walk does not widen the frame - the kick means running', async () => {
  const walk = await walkForward(OPEN_STREET, ALONG_STREET, 1200, false);
  assert.ok(walk.travelled > 2, `the walker only covered ${walk.travelled.toFixed(1)} m`);
  const widest = Math.max(...walk.samples.map((s) => s.fov));
  assert.ok(widest < 58.01, `a walk widened the lens to ${widest.toFixed(3)} deg`);
});

test('the head bobs while walking, harder while running, and is still while standing', async () => {
  // Downtown has no long stretch of genuinely level pavement - every candidate
  // spot moves 20 cm or more of real grade over a few seconds, which swamps a
  // 3 cm bob in the raw camera height. So the offset itself is read back, and
  // then checked to be genuinely IN the height rather than merely reported.
  const walk = await walkForward(OPEN_STREET, ALONG_STREET, 1400, false);
  assert.ok(walk.travelled > 2,
    `the walker only covered ${walk.travelled.toFixed(1)} m - the test spot is blocked`);

  const bobs = walk.samples.map((s) => s.bob);
  const swing = span(bobs);
  assert.ok(swing > 0.03 && swing < 0.09,
    `the head swung ${(swing * 100).toFixed(1)} cm at a walk, expected about 5.6`);
  const reversals = bobs.filter((b, i) =>
    i > 0 && i < bobs.length - 1 && (b - bobs[i - 1]) * (bobs[i + 1] - b) < 0).length;
  assert.ok(reversals > 4, `the bob only turned around ${reversals} times in 1.4 s`);

  // The offset is really applied, and in phase: subtracting it from the camera
  // height leaves a far smoother trace than the height itself.
  const heights = walk.samples.map((s) => s.y);
  const flattened = heights.map((y, i) => y - bobs[i]);
  const removed = wander(heights) - wander(flattened);
  assert.ok(removed > wander(bobs) * 0.4,
    `removing the reported bob took only ${removed.toFixed(2)} m out of the camera's ` +
    `${wander(heights).toFixed(2)} m of travel, against ${wander(bobs).toFixed(2)} m of bob - ` +
    `it is not in the height, or it is out of phase with it`);

  // Standing still, the strength decays to nothing.
  const rest = walk.after.slice(-30);
  assert.ok(Math.max(...rest.map((s) => Math.abs(s.bob))) < 0.002,
    'the head kept bobbing after the walker stopped');
  assert.ok(span(rest.map((s) => s.y)) < 0.004, 'the camera height never settled');

  // And running bobs harder than walking - the amplitude scales with speed.
  const run = await walkForward(OPEN_STREET, ALONG_STREET, 1400, true);
  assert.ok(span(run.samples.map((s) => s.bob)) > swing * 1.2,
    'a run should bob harder than a walk');
});

test('the head does not bob mid-hop', async () => {
  const hop = await page.evaluate(async ([pos, yawAngle]) => {
    const { ctx, controls } = window.__TWIN__;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    controls.setMode('orbit');
    controls.setMode('walk');
    ctx.camera.position.set(pos[0], pos[1], pos[2]);
    ctx.camera.rotation.set(0, yawAngle, 0);
    for (let i = 0; i < 40; i++) await frame();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
    for (let i = 0; i < 30; i++) await frame();     // get the bob running first
    controls.jump();
    const seen = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) {
      seen.push({ y: ctx.camera.position.y, bob: controls.bobOffset, air: controls.airborne });
      await frame();
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
    return seen;
  }, [OPEN_STREET, ALONG_STREET]);

  assert.ok(hop.some((s) => s.air), 'the walker never left the ground');
  const air = hop.filter((s) => s.air);
  // The bob fades out at take-off rather than snapping, so the first few frames
  // still carry a little; by the middle of the arc it must be gone.
  const late = air.slice(Math.ceil(air.length / 2));
  assert.ok(Math.max(...late.map((s) => Math.abs(s.bob))) < 0.002,
    'the head was still bobbing in mid-air');
  // And the descent really is a clean fall, not a rippled one.
  const ys = air.map((s) => s.y);
  const peak = ys.indexOf(Math.max(...ys));
  const wobbles = ys.filter((y, i) =>
    i > peak + 2 && i < ys.length - 1 && ys[i + 1] > y + 1e-4).length;
  assert.equal(wobbles, 0, 'the descent went back up - something is riding on the arc');
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
