/**
 * Issue #11, the routing half: shortest walks on the sidewalk graph.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, nearestEdge, nextWaypoint, streetGraph } from '../src/ui/route.js';
import { getIntersection } from '../src/data/grid.js';

/** A hand-made block: a square of sidewalk with one diagonal that is a road crossing. */
function square() {
  const n = (x, z) => ({ x, z, edges: [] });
  const A = n(0, 0); const B = n(100, 0); const C = n(100, 100); const D = n(0, 100);
  const edges = [];
  const link = (a, b, cross = false) => {
    const e = { a, b, cross, len: Math.hypot(b.x - a.x, b.z - a.z) };
    a.edges.push(e); b.edges.push(e); edges.push(e);
  };
  link(A, B); link(B, C); link(C, D); link(D, A); link(A, C, true);
  return { nodes: [A, B, C, D], edges };
}

test('the walk goes round the block when that is shorter than the crossing', () => {
  const g = square();
  // Middle of AB to middle of CD: round by B is 50 + 100 + 50 = 200; the A-C
  // crossing would be 50 + 141 + 50.
  const r = route(g, { x: 50, z: 0 }, { x: 50, z: 100 });
  assert.ok(Math.abs(r.length - 200) < 1e-6, `length ${r.length}`);
});

test('and takes the crossing when that is shorter', () => {
  const g = square();
  // Next to A on AB to next to C on CD: 5 + 141 + 5 over the crossing, against 200 round.
  const r = route(g, { x: 5, z: 0 }, { x: 95, z: 100 });
  assert.ok(Math.abs(r.length - (10 + Math.SQRT2 * 100)) < 1e-6, `length ${r.length}`);
});

test('nobody snaps onto a crossing', () => {
  const g = square();
  const q = nearestEdge(g, { x: 51, z: 49 });   // on the diagonal crossing itself
  assert.equal(q.edge.cross, false);
});

test('on the same sidewalk run, the walk is straight along it', () => {
  const g = square();
  const r = route(g, { x: 10, z: 0 }, { x: 70, z: 0 });
  assert.equal(r.length, 60);
});

test('the arrow aims at the first route point more than 4 m off', () => {
  // Routes are worked out from where the walker stands, so they start there.
  const fromStart = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 50 }];
  assert.deepEqual(nextWaypoint(fromStart, { x: 0, z: 0 }), { x: 30, z: 0 });
  // Three metres short of the corner: already turning for the next leg.
  const nearCorner = [{ x: 27, z: 0 }, { x: 27.5, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 50 }];
  assert.deepEqual(nextWaypoint(nearCorner, { x: 27, z: 0 }), { x: 30, z: 50 });
});

test('on the real grid: Front & Bay to King & Yonge is a walk, not a beeline', () => {
  const a = getIntersection('front-bay');
  const b = getIntersection('king-yonge');
  const r = route(streetGraph(), a, b);
  const crow = Math.hypot(b.x - a.x, b.z - a.z);
  assert.ok(r.length >= crow, `route ${r.length.toFixed(0)} m is shorter than the straight line ${crow.toFixed(0)} m`);
  assert.ok(r.length < crow * 1.6, `route ${r.length.toFixed(0)} m is a detour on a ${crow.toFixed(0)} m trip`);
  assert.ok(r.points.length > 4, 'a two-block walk turns at least one corner');
});
