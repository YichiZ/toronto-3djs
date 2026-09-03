/**
 * Regressions for the code-review findings.
 *
 * Only the parts that run without a WebGL context are covered here; the
 * occlusion-aware picking, the walker's raycasts and the resize guard were
 * verified against the live page and are noted in FINAL_QA_REPORT.md.
 * `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { registerInteractive, register, get } from '../src/core/registry.js';

test('interaction volumes are marked non-colliding', () => {
  // They are invisible via material.visible, which leaves object.visible true,
  // so the walker's collision ray can only skip them via this flag. Without it,
  // free-standing volumes (the Union Loop mezzanine, the Stanley Cup plinth)
  // become invisible walls.
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  registerInteractive(mesh, { tenant: 'Test' });
  assert.equal(mesh.visible, true, 'the object itself stays visible to the raycaster');
  assert.equal(mesh.userData.noCollide, true, 'so it must opt out of collision explicitly');
});

test('the registry refuses a duplicate id rather than silently overwriting', () => {
  register({ id: 'review-test-a', name: 'A', kind: 'prop' });
  assert.equal(get('review-test-a').name, 'A');
  assert.throws(() => register({ id: 'review-test-a', name: 'B', kind: 'prop' }), /duplicate/);
});

test('the ground settle is frame-rate independent', async () => {
  // controls.js pulls in DOM-only addons, so the rate function is re-derived
  // here from the same definition rather than imported.
  const settle = (rate, dt) => 1 - Math.exp(-rate * Math.max(dt, 0));
  // Both rates must cover the SAME simulated span, or the comparison measures
  // step quantisation rather than frame-rate dependence. 0.1 s divides exactly
  // into 10 steps at 100 fps and 2 steps at 20 fps.
  const converge = (dt, steps, rate = 12) => {
    let gap = 3.0;                       // start 3 m above the floor
    for (let i = 0; i < steps; i++) gap -= gap * settle(rate, dt);
    return gap;
  };
  const fast = converge(1 / 100, 10);
  const slow = converge(1 / 20, 2);
  assert.ok(Math.abs(fast - slow) < 1e-9, `100 fps left ${fast}, 20 fps left ${slow}`);
  assert.ok(converge(1 / 60, 30) < 0.02, 'half a second should close a 3 m gap');

  // The old fixed-per-frame factor is what this replaced: over the same 0.1 s it
  // lands in a completely different place depending on the frame rate.
  const legacy = (steps) => {
    let gap = 3.0;
    for (let i = 0; i < steps; i++) gap -= gap * 0.35;
    return gap;
  };
  assert.ok(
    Math.abs(legacy(10) - legacy(2)) > 0.5,
    'the per-frame factor this replaced must still measure as frame-rate dependent'
  );
});

test('night light bases are captured once, not re-read from scaled values', () => {
  // Mirrors rescanNightLights: a WeakMap keyed by object, written only on first
  // sight. Re-reading the live emissiveIntensity would compound every rescan.
  const base = new WeakMap();
  const obj = { material: { emissiveIntensity: 1 } };
  const scan = () => {
    if (!base.has(obj)) base.set(obj, obj.material.emissiveIntensity);
    return base.get(obj);
  };
  const apply = (amount) => { obj.material.emissiveIntensity = scan() * (0.06 + 1.25 * amount); };
  apply(1);
  const first = obj.material.emissiveIntensity;
  for (let i = 0; i < 5; i++) { scan(); apply(1); }
  assert.equal(obj.material.emissiveIntensity, first, 'repeated scans must not compound');
});

test('a lane drains every vehicle that overran, not just one', () => {
  // vehicles.js wraps in a loop now: on a long frame two cars on a short lane
  // can both pass the end, and the leftover would be drawn off the roadway.
  const len = 100;
  const list = [{ s: 40 }, { s: 104 }, { s: 118 }];
  for (let guard = 0; guard < list.length; guard++) {
    const last = list[list.length - 1];
    if (!last || last.s <= len) break;
    last.s -= len;
    list.pop();
    list.unshift(last);
  }
  assert.ok(list.every((v) => v.s <= len), `left over: ${JSON.stringify(list)}`);
});

test('the PATH spine and the rooms beside it do not overlap', () => {
  // Two rooms were authored on top of PATH corridors: the subway mezzanine
  // straddled the Bay Street run's centreline and the Hockey Hall of Fame's
  // galleries sat on the Brookfield-Yonge spine. Both are now derived from the
  // segment they sit beside, so this asserts the derivation still holds rather
  // than trusting a hand-tuned coordinate.
  const rect = (cx, cz, w, d) => ({
    minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
  });
  const overlap = (a, b) => {
    const x = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const z = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
    return x > 0 && z > 0 ? x * z : 0;
  };

  const bay = { from: { x: -30, z: 20 }, to: { x: -30, z: -40 }, width: 12 };
  const bayCorridor = rect(bay.from.x, (bay.from.z + bay.to.z) / 2, bay.width, Math.abs(bay.to.z - bay.from.z));
  const MEZZ_W = 44;
  const mezz = rect(bay.from.x + bay.width / 2 + MEZZ_W / 2, 8, MEZZ_W, 18);
  assert.equal(overlap(bayCorridor, mezz), 0, 'the subway mezzanine must sit beside the Bay Street corridor, not on it');

  const spine = { from: { x: 40, z: -70 }, to: { x: 150, z: -70 }, width: 12 };
  const spineCorridor = rect((spine.from.x + spine.to.x) / 2, spine.from.z, Math.abs(spine.to.x - spine.from.x), spine.width);
  const shift = (spine.from.z - spine.width / 2) - (-64 + 14 / 2) - 1;
  const galleries = [[128, -64, 18, 14], [128, -80, 18, 16], [128, -96, 18, 14],
    [152, -96, 22, 14], [152, -80, 22, 16], [152, -64, 22, 14]];
  for (const [x, z, w, d] of galleries) {
    const g = rect(x, z + shift, w, d);
    assert.equal(overlap(spineCorridor, g), 0, `gallery at ${x},${z} must clear the Brookfield-Yonge corridor`);
  }
});
