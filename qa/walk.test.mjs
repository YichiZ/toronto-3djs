/**
 * The walker's own arithmetic - issue #16. `npm test`
 *
 * These lived inside controls.js's install(), reachable only through a WebGL
 * page. The raycasts that feed them are covered end to end by qa/*.e2e.mjs;
 * here each rule is pinned on its own, with the case its comment names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_ORDER, STREET_LEVEL, nearestLevel, floorAtLevel, substeps, slide } from '../src/ui/walkMath.js';
import { LEVELS } from '../src/data/grid.js';

const name = (i) => LEVEL_ORDER[i].name;

test('the eight levels, low to high, with street as the fallback', () => {
  assert.deepEqual(LEVEL_ORDER.map((l) => l.name),
    ['PATH', 'retail concourse', 'concourse', 'street', 'viaduct deck', 'platform',
      'SkyWalk', 'Gardiner deck']);
  for (let i = 1; i < LEVEL_ORDER.length; i++) assert.ok(LEVEL_ORDER[i].y > LEVEL_ORDER[i - 1].y, 'low to high');
  assert.equal(name(STREET_LEVEL), 'street');
  assert.equal(nearestLevel(0, []), STREET_LEVEL, 'an empty list falls back to street');
});

test('the nearest level to a height, including the half-metre deck/platform split', () => {
  assert.equal(name(nearestLevel(LEVELS.path + 0.2)), 'PATH');
  // The excavated retail level sits 1.5 m under the concourses and 1.5 m over
  // the PATH (#120); the two neighbours are what make its tolerance 0.75.
  assert.equal(name(nearestLevel(LEVELS.unionRetail)), 'retail concourse');
  assert.equal(name(nearestLevel(LEVELS.unionRetail - 0.6)), 'retail concourse');
  assert.equal(name(nearestLevel(LEVELS.unionConcourse)), 'concourse');
  assert.equal(name(nearestLevel(0.15)), 'street', 'a kerb-top is street');
  assert.equal(name(nearestLevel(8.77)), 'SkyWalk', 'the Royal Bank Plaza setback roof walks as level 9');
  assert.equal(name(nearestLevel(6.6)), 'viaduct deck');
  assert.equal(name(nearestLevel(6.9)), 'platform');
  assert.equal(name(nearestLevel(-50)), 'PATH', 'far below anything: the lowest');
  assert.equal(name(nearestLevel(99)), 'Gardiner deck', 'far above: the highest');
});

test('a floor is found under whatever stands on it, not just at the first hit', () => {
  // The case in the comment: a planter top (1.51 m) and a bus roof (1.58 m)
  // over the pavement. Judging the first hit only, street level read floorless.
  assert.equal(floorAtLevel([1.58, 1.51, 0.02], 0, 1.5 - 0.01), true);
  assert.equal(floorAtLevel([0.02], 0, 1.5), true);
});

test('past the level means no floor there, and nothing means nothing', () => {
  assert.equal(floorAtLevel([-3.5, -6.5], 0, 1.5), false, 'hits already below the street: no street floor');
  assert.equal(floorAtLevel([], 0, 1.5), false);
  assert.equal(floorAtLevel([9.8], 9, 0.25), false, 'outside a tight tolerance');
});

test('a normal frame is one step; a long one is split so no step can tunnel', () => {
  const o = { runSpeed: 7.5, maxStep: 0.44 };
  assert.equal(substeps(3.4, 1 / 60, o), 1);
  // From a DEAD STOP at dt 0.5 s: the stale speed (0) would say one step.
  const n = substeps(0, 0.5, o);
  assert.ok(n >= Math.ceil((7.5 * 0.5) / 0.44), `dead-stop long frame took ${n} steps`);
  assert.ok((7.5 * 0.5) / n <= 0.44, 'no substep longer than maxStep');
  assert.equal(substeps(0, 10, o), 16, 'capped');
});

test('airborne, the arc gets short steps at low frame rates', () => {
  const o = { runSpeed: 7.5, maxStep: 0.44, maxAirDt: 1 / 120 };
  assert.equal(substeps(0, 1 / 30, { ...o, airborne: true }), 4);
  assert.equal(substeps(0, 1 / 30, { ...o, airborne: false }), 1);
});

/** A wall along x = 0 facing +x (the walker is on the +x side), and optionally one along z = 0 facing +z. */
const walls = (corner = false) => (dx, dz) => {
  if (dx < -1e-9) return { x: 1, z: 0 };
  if (corner && dz < -1e-9) return { x: 0, z: 1 };
  return null;
};

test('walking into a wall head-on stops, and sheds the speed into it', () => {
  const r = slide({ x: -0.05, z: 0 }, { x: -3, z: 0 }, walls());
  assert.equal(r.step.x, 0);
  assert.equal(r.velocity.x, 0, 'no speed builds up against the wall');
  assert.equal(r.blocker, null, 'nothing left to push against');
});

test('at an angle it slides along the wall, keeping the tangential part', () => {
  const r = slide({ x: -0.03, z: -0.04 }, { x: -1.8, z: -2.4 }, walls());
  assert.equal(r.step.x, 0, 'the part into the wall is gone');
  assert.equal(r.step.z, -0.04, 'the part along it is kept exactly');
  assert.deepEqual(r.velocity, { x: 0, z: -2.4 });
  assert.equal(r.blocker, null);
});

test('in an inside corner the second pass resolves the second wall - and then it is wedged, not stuck in a loop', () => {
  const calls = [];
  const probe = (dx, dz) => { calls.push([dx, dz]); return walls(true)(dx, dz); };
  const r = slide({ x: -0.03, z: -0.04 }, { x: -1.8, z: -2.4 }, probe);
  assert.deepEqual(r.step, { x: 0, z: 0 });
  assert.deepEqual(r.velocity, { x: 0, z: 0 });
  assert.equal(calls.length, 2, 'first wall, then the corner; a zero step is not probed again');
});

test('an unobstructed step costs exactly one probe and is untouched', () => {
  let probes = 0;
  const r = slide({ x: 0.05, z: 0.01 }, { x: 3, z: 0.6 }, () => { probes++; return null; });
  assert.deepEqual(r.step, { x: 0.05, z: 0.01 });
  assert.deepEqual(r.velocity, { x: 3, z: 0.6 });
  assert.equal(probes, 1);
});

test('a standing walker is not probed at all', () => {
  let probes = 0;
  slide({ x: 0, z: 0 }, { x: 0, z: 0 }, () => { probes++; return null; });
  assert.equal(probes, 0);
});
