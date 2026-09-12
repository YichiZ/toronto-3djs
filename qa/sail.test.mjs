/**
 * Issue #74: the L Tower was a plain slab. The real tower's north face sweeps
 * out in a concave curve toward the top. `npm test`
 *
 * Checked on the geometry itself: no renderer, no textures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sailGeometry } from '../src/world/buildingKit.js';
import { BUILDINGS } from '../src/data/buildings.js';

const W = 34;
const D = 34;
const H = 205;
const FLARE = 12;
const geo = sailGeometry({ width: W, depth: D, height: H, flare: FLARE });
const pos = geo.attributes.position;

/** The northmost (least z) and southmost points of the solid at height y. */
function extentAt(y) {
  let north = Infinity;
  let south = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - y) > 1e-6) continue;
    north = Math.min(north, pos.getZ(i));
    south = Math.max(south, pos.getZ(i));
  }
  return { north, south };
}

/** Heights at which the geometry has a ring of vertices. */
const levels = [...new Set(Array.from({ length: pos.count }, (_, i) => +pos.getY(i).toFixed(6)))].sort((a, b) => a - b);

test('the north face starts plumb and sweeps out toward the top', () => {
  assert.equal(levels[0], 0);
  assert.equal(levels.at(-1), H);
  assert.ok(Math.abs(extentAt(0).north - -D / 2) < 1e-6, 'the base is not the footprint');
  assert.ok(Math.abs(extentAt(H).north - (-D / 2 - FLARE)) < 1e-6, `the top reaches ${extentAt(H).north}`);
});

test('the sweep is concave: slow low down, fast near the top', () => {
  const mid = levels.reduce((best, y) => (Math.abs(y - H / 2) < Math.abs(best - H / 2) ? y : best), 0);
  const outMid = -D / 2 - extentAt(mid).north;
  assert.ok(outMid < FLARE * 0.35, `already ${outMid.toFixed(1)} m out at half height`);
  // and it only ever moves outward
  let last = -Infinity;
  for (const y of levels) {
    const out = -D / 2 - extentAt(y).north;
    assert.ok(out >= last - 1e-9, `the face steps back in at y ${y}`);
    last = out;
  }
});

test('the south face stays plumb, and the width does not change', () => {
  for (const y of levels) assert.ok(Math.abs(extentAt(y).south - D / 2) < 1e-6, `the south face moves at y ${y}`);
  geo.computeBoundingBox();
  assert.ok(Math.abs(geo.boundingBox.max.x - W / 2) < 1e-6 && Math.abs(geo.boundingBox.min.x + W / 2) < 1e-6);
});

test('every face maps the facade 0..1, so storeys land like the box did', () => {
  const uv = geo.attributes.uv;
  assert.ok(uv, 'no uv attribute');
  for (let i = 0; i < uv.count; i++) {
    assert.ok(uv.getX(i) >= -1e-6 && uv.getX(i) <= 1 + 1e-6 && uv.getY(i) >= -1e-6 && uv.getY(i) <= 1 + 1e-6, `uv ${i} out of range`);
  }
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) assert.ok(Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i)), `normal ${i} is NaN`);
});

test('the L Tower record asks for the sail', () => {
  assert.equal(BUILDINGS.find((b) => b.id === 'l-tower')?.shape, 'sail');
});
