/**
 * What the walk-mode minimap draws - issue #7. `npm test`
 *
 * Every number checked here is the city's own data, not a stand-in: the plan
 * module reads grid.js, buildings.js, the PATH, the concourses and the decks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFor, worldToMap, mapToWorld, trueNorthOnMap, pickViewpoint, LEVEL_PLANS, VIEW_METRES } from '../src/ui/minimapPlan.js';
import { STREETS } from '../src/data/grid.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { PATH_SEGMENTS } from '../src/interiors/path.js';
import { gridDirectionToBearing, GRID_ROTATION_DEG } from '../src/core/geo.js';

const byStyle = (plan, style) => plan.filter((p) => p.style === style);

test('every level the walker can be on has a plan, and an unknown one gets the street', () => {
  for (const level of LEVEL_PLANS) assert.ok(planFor(level).length > 0, level);
  assert.deepEqual(planFor('nowhere'), planFor('street'));
});

test('at street level: the grid and the footprints, nothing from other levels', () => {
  const plan = planFor('street');
  assert.equal(byStyle(plan, 'street').length, STREETS.length);
  assert.equal(byStyle(plan, 'building').length + byStyle(plan, 'landmark').length, BUILDINGS.length);
  for (const s of ['path', 'room', 'deck', 'streetDim', 'buildingDim']) assert.equal(byStyle(plan, s).length, 0, s);
});

test('in the PATH: the spine, over a dimmed street grid', () => {
  const plan = planFor('PATH');
  const spine = byStyle(plan, 'path');
  assert.equal(spine.length, PATH_SEGMENTS.length);
  assert.deepEqual(spine[0].points, [PATH_SEGMENTS[0].from, PATH_SEGMENTS[0].to]);
  assert.equal(byStyle(plan, 'streetDim').length, STREETS.length);
  assert.equal(byStyle(plan, 'street').length, 0, 'the grid is dimmed below grade');
});

test('in the concourse: the three rooms, where the model puts them', () => {
  const rooms = byStyle(planFor('concourse'), 'room');
  assert.equal(rooms.length, 3);
  // York Concourse: centre -215, 62 m wide - at the head house's west end.
  assert.deepEqual([rooms[0].x0, rooms[0].x1], [-246, -184]);
});

test('on the decks: the SkyWalk tube, the rail corridor, the Gardiner', () => {
  const sky = byStyle(planFor('SkyWalk'), 'deck');
  assert.equal(sky.length, 1);
  assert.equal(sky[0].width, 9, 'the tube is 9 m wide');
  assert.deepEqual([sky[0].points[0].x, sky[0].points.at(-1).x, sky[0].points[0].z], [-250, -640, 62]);
  for (const level of ['viaduct deck', 'platform']) {
    const [c] = byStyle(planFor(level), 'deck');
    assert.deepEqual([c.x0, c.z0, c.x1, c.z1], [-700, 70, 420, 200], level);
  }
  const [g] = byStyle(planFor('Gardiner deck'), 'deck');
  assert.deepEqual([g.x0, g.z0, g.x1, g.z1], [-820, 367, 420, 393]);
});

test('north-up in grid north, and the map round-trips', () => {
  const centre = { x: -100, z: 40 };
  const north = worldToMap(-100, 40 - 50, centre, 220);   // 50 m grid-north of the walker
  assert.equal(north.x, 110);
  assert.ok(north.y < 110, 'grid north is up');
  const back = mapToWorld(north.x, north.y, centre, 220);
  assert.ok(Math.abs(back.x - -100) < 1e-9 && Math.abs(back.z - -10) < 1e-9);
  const edge = worldToMap(-100 + VIEW_METRES / 2, 40, centre, 220);
  assert.equal(edge.x, 220, 'half the view width reaches the edge');
});

test('the true-north tick really points at true north, 16.7 degrees off grid north', () => {
  const n = trueNorthOnMap();
  const bearing = gridDirectionToBearing(n.x, n.y);
  assert.ok(Math.min(bearing, 360 - bearing) < 1e-6, `bearing ${bearing}`);
  const offUp = (Math.atan2(n.x, -n.y) * 180) / Math.PI;
  assert.ok(Math.abs(offUp - GRID_ROTATION_DEG) < 1e-6, `leans ${offUp} degrees`);
});

test('a click finds the dot under it, the nearest of two, and nothing elsewhere', () => {
  const centre = { x: 0, z: 0 };
  const vps = [
    { id: 'a', position: { x: 10, z: 0 } },
    { id: 'b', position: { x: 12, z: 0 } },
  ];
  const a = worldToMap(10, 0, centre, 220);
  assert.equal(pickViewpoint(a.x + 0.4, a.y, vps, centre, 220)?.id, 'a');
  assert.equal(pickViewpoint(a.x, a.y + 30, vps, centre, 220), null);
});
