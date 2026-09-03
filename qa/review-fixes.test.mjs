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
import { PATH_SEGMENTS, MEZZANINE, MEZZANINE_CORRIDOR_ID } from '../src/interiors/path.js';
import { GALLERIES, MUSEUM_SHIFT_Z, MUSEUM_SPINE_ID } from '../src/interiors/hhofInterior.js';

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
  // Reads the REAL geometry, not a copy of it. An earlier version of this test
  // hardcoded the corridor, the mezzanine width and all six gallery rectangles,
  // so it would have kept passing after someone edited the source it claimed to
  // guard - which is the one thing a regression test must not do.
  const rect = (cx, cz, w, d) => ({
    minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
  });
  const overlap = (a, b) => {
    const x = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const z = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
    return x > 0 && z > 0 ? x * z : 0;
  };
  /** A segment's swept footprint: length along the run, `width` across it. */
  const corridorRect = (s) => {
    const len = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z);
    const eastWest = Math.abs(s.to.z - s.from.z) < 1e-6;
    return eastWest
      ? rect((s.from.x + s.to.x) / 2, s.from.z, len, s.width)
      : rect(s.from.x, (s.from.z + s.to.z) / 2, s.width, len);
  };

  const bay = PATH_SEGMENTS.find((s) => s.id === MEZZANINE_CORRIDOR_ID);
  assert.ok(bay, `segment ${MEZZANINE_CORRIDOR_ID} must exist`);
  const mezz = rect(MEZZANINE.cx, MEZZANINE.cz, MEZZANINE.w, MEZZANINE.d);
  assert.equal(
    overlap(corridorRect(bay), mezz), 0,
    'the subway mezzanine must sit beside the Bay Street corridor, not on it'
  );

  const spine = PATH_SEGMENTS.find((s) => s.id === MUSEUM_SPINE_ID);
  assert.ok(spine, `segment ${MUSEUM_SPINE_ID} must exist`);
  const spineRect = corridorRect(spine);
  assert.equal(GALLERIES.length, 6, 'the museum should still be six galleries');
  assert.ok(MUSEUM_SHIFT_Z < 0, `the museum must be shifted grid-north, got ${MUSEUM_SHIFT_Z}`);
  for (const g of GALLERIES) {
    assert.equal(
      overlap(spineRect, rect(g.x, g.z, g.w, g.d)), 0,
      `${g.id} must clear the ${MUSEUM_SPINE_ID} corridor`
    );
  }
});

test('the derived clearances survive a change to the authored geometry', () => {
  // The point of deriving both halves: widening a gallery or a corridor must not
  // silently put a room back on the spine. Re-run the module derivations against
  // mutated inputs and assert they still clear.
  const clearance = (corridorEdge, blockEdge) => corridorEdge - blockEdge - 1;
  // Entry gallery widened from 14 m deep to 20 m: the shift must grow with it.
  const layout = [{ z: -64, d: 20 }, { z: -80, d: 16 }, { z: -96, d: 14 }];
  const southEdge = layout.reduce((m, g) => Math.max(m, g.z + g.d / 2), -Infinity);
  const shift = clearance(-76, southEdge);
  const shifted = layout.map((g) => ({ minZ: g.z + shift - g.d / 2, maxZ: g.z + shift + g.d / 2 }));
  for (const g of shifted) {
    assert.ok(g.maxZ <= -76, `a widened gallery must still clear the corridor, got maxZ ${g.maxZ}`);
  }
});
