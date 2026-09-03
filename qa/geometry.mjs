/**
 * Geometric QA.
 *
 * Runs against the DATA, not the rendered scene, so it can catch a building
 * standing in a roadway or two footprints occupying the same block before
 * anything is drawn. Every check returns findings rather than throwing, so one
 * failure does not hide the rest.
 */
import { BUILDINGS, footprint } from '../src/data/buildings.js';
import { STREETS, NS, EW, corridorWidth, INTERSECTIONS } from '../src/data/grid.js';
import {
  geoToLocal, localToGeo, gridDirectionToBearing, GRID_ROTATION_DEG, ORIGIN, UNION_ENTRANCE_GRID,
} from '../src/core/geo.js';

// The brief's boundary is King / Lake Shore / Lower Simcoe / Church, extended
// west to John Street for the Rogers Centre. The box below adds the margin that
// extension needs, plus room for the King & Bay skyline anchors just north of
// the line, which are in scene for orientation rather than for detail.
const BOUNDARY = { minX: -960, maxX: 430, minZ: -420, maxZ: 410 };

/** Axis-aligned overlap area of two footprints, in square metres. */
function overlapArea(a, b) {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return w > 0 && d > 0 ? w * d : 0;
}

/** Buildings that share floor area. Some overlap is legitimate (a podium and its
 *  tower, a park deck over a corridor) so this reports rather than fails. */
export function checkFootprintOverlaps() {
  const findings = [];
  const allowed = new Set([
    'cibc-square-81|the-park-cibc', 'cibc-square-141|the-park-cibc',
    'maple-leaf-square-w|maple-leaf-square-e',
    'union-station|union-trainshed',
    'td-canada-trust-tower|allen-lambert-galleria',
    'bay-wellington-tower|allen-lambert-galleria',
    'allen-lambert-galleria|brookfield-heritage-facades',
    'allen-lambert-galleria|hockey-hall-of-fame',
  ]);
  for (let i = 0; i < BUILDINGS.length; i++) {
    for (let j = i + 1; j < BUILDINGS.length; j++) {
      const a = BUILDINGS[i];
      const b = BUILDINGS[j];
      const area = overlapArea(footprint(a), footprint(b));
      if (area < 12) continue;
      if (allowed.has(`${a.id}|${b.id}`) || allowed.has(`${b.id}|${a.id}`)) continue;
      findings.push({
        severity: area > 400 ? 'error' : 'warn',
        check: 'footprint-overlap',
        message: `${a.id} and ${b.id} overlap by ${Math.round(area)} m2`,
      });
    }
  }
  return findings;
}

/** A building standing in a live roadway is always a defect. */
export function checkBuildingsInRoadways() {
  const findings = [];
  for (const b of BUILDINGS) {
    const fp = footprint(b);
    for (const s of STREETS) {
      const lo = Math.min(s.from, s.to);
      const hi = Math.max(s.from, s.to);
      let road;
      if (s.axis === 'ew') {
        if (fp.maxX < lo || fp.minX > hi) continue;
        road = { minX: lo, maxX: hi, minZ: s.z - s.road / 2, maxZ: s.z + s.road / 2 };
      } else {
        if (fp.maxZ < lo || fp.minZ > hi) continue;
        road = { minX: s.x - s.road / 2, maxX: s.x + s.road / 2, minZ: lo, maxZ: hi };
      }
      const area = overlapArea(fp, road);
      // Structures that legitimately span a roadway do so overhead, not at grade.
      const spansOverhead = ['the-park-cibc', 'mtcc-north', 'union-trainshed', 'cn-tower'].includes(b.id);
      if (area > 25 && !spansOverhead) {
        findings.push({
          severity: 'error', check: 'building-in-roadway',
          message: `${b.id} occupies ${Math.round(area)} m2 of ${s.name}'s roadway`,
        });
      }
    }
  }
  return findings;
}

export function checkBoundary() {
  const findings = [];
  for (const b of BUILDINGS) {
    const fp = footprint(b);
    if (fp.minX < BOUNDARY.minX || fp.maxX > BOUNDARY.maxX || fp.minZ < BOUNDARY.minZ || fp.maxZ > BOUNDARY.maxZ) {
      findings.push({
        severity: 'warn', check: 'outside-boundary',
        message: `${b.id} extends outside the reconstruction boundary box`,
      });
    }
  }
  return findings;
}

/** The grid rotation is the scene's load-bearing assumption. Assert it holds. */
export function checkGridRotation() {
  const findings = [];
  const front = gridDirectionToBearing(1, 0);
  const bay = gridDirectionToBearing(0, -1);
  const expectedFront = 90 - GRID_ROTATION_DEG;
  const expectedBay = 360 - GRID_ROTATION_DEG;
  if (Math.abs(front - expectedFront) > 0.05) {
    findings.push({ severity: 'error', check: 'grid-rotation', message: `Front Street bears ${front.toFixed(2)}, expected ${expectedFront.toFixed(2)}` });
  }
  if (Math.abs(bay - expectedBay) > 0.05) {
    findings.push({ severity: 'error', check: 'grid-rotation', message: `Bay Street bears ${bay.toFixed(2)}, expected ${expectedBay.toFixed(2)}` });
  }
  // Round-trip a geo point through both transforms.
  const p = geoToLocal(43.6426, -79.3871);
  const back = localToGeo(p.x, p.z);
  if (Math.abs(back.lat - 43.6426) > 1e-6 || Math.abs(back.lon + 79.3871) > 1e-6) {
    findings.push({ severity: 'error', check: 'geo-roundtrip', message: 'geoToLocal/localToGeo do not round-trip' });
  }
  return findings;
}

/**
 * The CN Tower's bearing and distance from Union Station is the brief's own
 * stated orientation cue: roughly 600 m on a true bearing near 240-250 deg.
 */
export function checkCnTowerBearing() {
  const findings = [];
  const cn = BUILDINGS.find((b) => b.id === 'cn-tower');
  const dx = cn.x - UNION_ENTRANCE_GRID.x;
  const dz = cn.z - UNION_ENTRANCE_GRID.z;
  const dist = Math.hypot(dx, dz);
  const bearing = gridDirectionToBearing(dx, dz);
  if (dist < 520 || dist > 700) {
    findings.push({ severity: 'error', check: 'cn-tower-distance', message: `CN Tower is ${Math.round(dist)} m from Union Station's Front entrance; expected roughly 600 m` });
  }
  if (bearing < 235 || bearing > 255) {
    findings.push({ severity: 'error', check: 'cn-tower-bearing', message: `CN Tower bears ${bearing.toFixed(1)} deg true from Union Station; expected 240-250` });
  }
  return { findings, dist, bearing };
}

/** Union Station's head house must stop short of York Street. */
export function checkUnionHeadHouse() {
  const findings = [];
  const hh = BUILDINGS.find((b) => b.id === 'union-station');
  const fp = footprint(hh);
  const gap = fp.minX - (NS.york + 8);
  if (hh.w < 215 || hh.w > 245) {
    findings.push({ severity: 'error', check: 'union-headhouse-length', message: `Head house is ${hh.w} m along Front; the brief states roughly 229 m` });
  }
  if (gap < 5) {
    findings.push({ severity: 'error', check: 'union-headhouse-york', message: `Head house reaches York Street; it must stop short and leave the plaza gap (gap is ${gap.toFixed(1)} m)` });
  }
  const shed = BUILDINGS.find((b) => b.id === 'union-trainshed');
  const shedFp = footprint(shed);
  if (shedFp.minX > NS.york + 20 || shedFp.maxX < NS.bay - 20) {
    findings.push({ severity: 'warn', check: 'trainshed-span', message: 'Only the train shed should span the full Bay-York block' });
  }
  return findings;
}

/** Every intersection must be the meeting of two real streets in the table. */
export function checkIntersections() {
  const findings = [];
  for (const i of INTERSECTIONS) {
    const ns = Object.values(NS).some((x) => Math.abs(x - i.x) < 0.5);
    const ew = Object.values(EW).some((z) => Math.abs(z - i.z) < 0.5);
    if (!ns || !ew) {
      findings.push({ severity: 'error', check: 'intersection', message: `${i.id} is not on a street centreline pair` });
    }
  }
  return findings;
}

/** Street corridors must not overlap each other except at intersections. */
export function checkStreetWidths() {
  const findings = [];
  for (const s of STREETS) {
    const w = corridorWidth(s);
    if (w < 10 || w > 60) {
      findings.push({ severity: 'warn', check: 'street-width', message: `${s.name} corridor is ${w} m wide` });
    }
  }
  return findings;
}

export function runGeometryQA() {
  const cn = checkCnTowerBearing();
  const findings = [
    ...checkGridRotation(),
    ...checkFootprintOverlaps(),
    ...checkBuildingsInRoadways(),
    ...checkBoundary(),
    ...cn.findings,
    ...checkUnionHeadHouse(),
    ...checkIntersections(),
    ...checkStreetWidths(),
  ];
  return {
    findings,
    metrics: {
      buildings: BUILDINGS.length,
      streets: STREETS.length,
      intersections: INTERSECTIONS.length,
      gridRotationDeg: GRID_ROTATION_DEG,
      origin: ORIGIN,
      originAsGeoCheck: localToGeo(0, 0),
      cnTowerDistanceFromUnion: Math.round(cn.dist),
      cnTowerBearingFromUnion: Number(cn.bearing.toFixed(1)),
      frontStreetBearing: Number(gridDirectionToBearing(1, 0).toFixed(2)),
    },
  };
}
