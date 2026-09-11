/**
 * Issue #11, the last piece: routes down into the PATH and back up.
 *
 * Hand-made corridors and a lift, in real street coordinates, so this runs
 * without path.js (which needs Three).
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWalkGraph, pathGraph, route, nearestEdge, routable, PATH_FLOOR, LEVEL_CHANGE_COST,
} from '../src/ui/route.js';
import { getIntersection } from '../src/data/grid.js';

// A corridor under Front Street from the station east to Bay, like path-union-east.
const CORRIDOR = [{ from: { x: -115, z: 20 }, to: { x: -30, z: 20 } }];
const LIFT = { kind: 'Lift', x: -112, z: 12, lowY: PATH_FLOOR, highY: 0, lowName: 'the PATH', highName: 'street level' };

const liftOnRoute = (r) => r.points.some((p) => p.access === LIFT);

test('from the street to a spot in the PATH, the route goes down the lift', () => {
  const g = buildWalkGraph({ pathSegments: CORRIDOR, access: [LIFT] });
  const r = route(g, getIntersection('front-bay'), { x: -60, z: 20 }, { fromY: 0, toY: PATH_FLOOR });
  assert.ok(liftOnRoute(r), `no lift on the route: ${JSON.stringify(r.points)}`);
  assert.ok(r.length > LEVEL_CHANGE_COST, 'the climb is not costed');
});

test('and from the PATH back up to a street corner', () => {
  const g = buildWalkGraph({ pathSegments: CORRIDOR, access: [LIFT] });
  const r = route(g, { x: -60, z: 20 }, getIntersection('front-york'), { fromY: PATH_FLOOR, toY: 0 });
  assert.ok(liftOnRoute(r), `no lift on the route: ${JSON.stringify(r.points)}`);
});

test('with no way between the floors, the guide keeps the straight line', () => {
  const g = buildWalkGraph({ pathSegments: CORRIDOR, access: [] });
  const r = route(g, getIntersection('front-bay'), { x: -60, z: 20 }, { fromY: 0, toY: PATH_FLOOR });
  assert.equal(r.points.length, 2);
});

test('an end snaps onto its own floor, even under a nearer sidewalk', () => {
  const g = buildWalkGraph({ pathSegments: CORRIDOR, access: [LIFT] });
  // Straight under Front Street's south sidewalk.
  assert.equal(nearestEdge(g, { x: -60, z: 20 }, PATH_FLOOR).edge.y, PATH_FLOOR);
  assert.ok(Math.abs(nearestEdge(g, { x: -60, z: 20 }, 0).edge.y) < 0.5);
});

test('joining the floors changes no street route: nothing snaps onto a lift connector', () => {
  const plain = buildWalkGraph({ pathSegments: CORRIDOR, access: [] });
  const joined = buildWalkGraph({ pathSegments: CORRIDOR, access: [LIFT] });
  // Standing right by the lift head, on Front Street's south sidewalk.
  const here = { x: -110, z: 14 };
  const to = getIntersection('front-bay');
  const a = route(plain, here, to, { fromY: 0, toY: 0 });
  const b = route(joined, here, to, { fromY: 0, toY: 0 });
  assert.ok(Math.abs(a.length - b.length) < 1e-6, `${a.length} with no lift, ${b.length} with one`);
  assert.equal(nearestEdge(joined, here, 0).edge.connector, undefined);
});

test('corridor ends within 2 m are one junction', () => {
  const g = pathGraph([
    { from: { x: 0, z: 0 }, to: { x: 50, z: 0 } },
    { from: { x: 50.6, z: 0.4 }, to: { x: 50, z: 60 } },
  ]);
  assert.equal(g.nodes.length, 3);
});

test('the street and the PATH are routable; the concourses and the SkyWalk are not yet', () => {
  assert.equal(routable(0), true);
  assert.equal(routable(0.2), true);          // the Great Hall floor
  assert.equal(routable(PATH_FLOOR), true);
  assert.equal(routable(-3.3), false);        // concourse level
  assert.equal(routable(9), false);           // the SkyWalk
});
