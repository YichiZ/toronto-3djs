/**
 * The coordinate system is the one piece of this project that everything else
 * is built on top of, so it gets real assertions rather than a smoke test.
 * `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  geoToLocal, localToGeo, gridDirectionToBearing, solarPosition,
  GRID_ROTATION_DEG, ORIGIN, metresPerDegLat, metresPerDegLon,
} from '../src/core/geo.js';
import { prism, ringGeometry } from '../src/world/buildingKit.js';

test('the origin maps to the world origin', () => {
  const p = geoToLocal(ORIGIN.lat, ORIGIN.lon);
  assert.ok(Math.abs(p.x) < 1e-6 && Math.abs(p.z) < 1e-6);
});

test('geo transforms round-trip', () => {
  for (const [lat, lon] of [[43.6426, -79.3871], [43.6489, -79.3733], [43.6440, -79.3820]]) {
    const p = geoToLocal(lat, lon);
    const back = localToGeo(p.x, p.z);
    assert.ok(Math.abs(back.lat - lat) < 1e-9, `lat drift at ${lat}`);
    assert.ok(Math.abs(back.lon - lon) < 1e-9, `lon drift at ${lon}`);
  }
});

test('the grid rotation lands Front Street and Bay Street on real bearings', () => {
  assert.ok(Math.abs(gridDirectionToBearing(1, 0) - (90 - GRID_ROTATION_DEG)) < 0.01);
  assert.ok(Math.abs(gridDirectionToBearing(0, -1) - (360 - GRID_ROTATION_DEG)) < 0.01);
  // Grid north is emphatically NOT true north - that difference is the point.
  assert.ok(Math.abs(gridDirectionToBearing(0, -1) - 360) > 15);
});

test('one metre of grid displacement is one metre on the ground', () => {
  const a = localToGeo(0, 0);
  const b = localToGeo(100, 0);
  const dLat = (b.lat - a.lat) * metresPerDegLat(a.lat);
  const dLon = (b.lon - a.lon) * metresPerDegLon(a.lat);
  assert.ok(Math.abs(Math.hypot(dLat, dLon) - 100) < 0.05);
});

test('the sun is where it should be over Toronto', () => {
  // Summer solstice, local solar noon: altitude = 90 - lat + 23.44.
  const noon = solarPosition(new Date('2026-06-21T17:00:00Z'));
  const altDeg = (noon.altitude * 180) / Math.PI;
  assert.ok(Math.abs(altDeg - (90 - ORIGIN.lat + 23.44)) < 1.5, `solstice noon altitude was ${altDeg}`);
  assert.ok(noon.azimuth > 140 && noon.azimuth < 200, `noon azimuth was ${noon.azimuth}`);

  // Midwinter midnight: the sun must be below the horizon.
  const night = solarPosition(new Date('2026-12-21T06:00:00Z'));
  assert.ok(night.altitude < 0);
  assert.ok(night.direction.y < 0, 'the light direction must follow the sun below the horizon');
});

test('extruded footprints sit on the ground and keep their handedness', () => {
  // An asymmetric wedge catches the mirrored-Z bug a symmetric shape hides.
  const geo = prism([[0, 0], [10, 0], [10, 4]], 6);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  assert.equal(b.min.y, 0, 'a prism must start at ground level, not float');
  assert.equal(b.max.y, 6);
  assert.equal(b.min.z, 0, 'the footprint must not be mirrored in Z');
  assert.equal(b.max.z, 4);
});

test('rings are centred on their own origin', () => {
  const geo = ringGeometry(10, 10, 1, 2);
  geo.computeBoundingBox();
  assert.equal(geo.boundingBox.min.y, -1);
  assert.equal(geo.boundingBox.max.y, 1);
});
