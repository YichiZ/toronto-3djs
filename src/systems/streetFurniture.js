/**
 * Street furniture: the City of Toronto Coordinated Street Furniture family,
 * plus the traffic, lighting and utility hardware that shares the sidewalk.
 *
 * REAL-WORLD FACTS ENCODED HERE
 *  - Toronto's coordinated street furniture programme (2007, Astral) gave the
 *    downtown one family: charcoal-grey powder-coated steel frames with warm
 *    wood slats, paired litter/recycling receptacles, glazed transit shelters
 *    with a backlit ad panel at one end, cylindrical poster columns, banks of
 *    publication boxes, and multi-publication structures. They are all drawn
 *    from that family so the sidewalk reads as Toronto and not Anywhere.
 *  - TO360 wayfinding pylons: tall narrow dark slabs carrying a heads-up
 *    yellow-ground map panel. Rolled out around Union Station / the PATH from
 *    2015 and one of the most recognisable pieces of Toronto street kit.
 *  - Bike Share Toronto stations are a modular docking rail (8-14 docks) plus a
 *    solar payment kiosk at one end. Six plausible downtown stations are placed.
 *  - Downtown Front and Bay carry the twin-lantern heritage-style pole; the
 *    outer streets carry ordinary cobra-head poles.
 *  - Street name blades are NOT built here: they carry lettering, so they live
 *    in signage.js with the rest of the canvas-generated type.
 *
 * PLACEMENT. Nothing is hand-positioned in the roadway. `sidewalkSpots()` walks
 * a street's sidewalk band from src/data/grid.js at a fixed interval, sets the
 * prop `CURB_INSET` metres in from the curb line, clears the intersection
 * corners, rejects anything landing inside a building footprint from
 * src/data/buildings.js, and rejects the rail-corridor band on the north-south
 * streets (that stretch is the viaduct underpass, not sidewalk).
 *
 * PERFORMANCE. Every type is composed from primitives, merged per material, and
 * drawn as one InstancedMesh per material. Several thousand props cost a few
 * dozen draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STREETS, INTERSECTIONS, corridorAt, getStreet } from '../data/grid.js';
import { BUILDINGS, footprint } from '../data/buildings.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';

/** Sidewalk slab top, matching CURB_HEIGHT in world/streets.js. */
export const SIDEWALK_Y = 0.15;
/** How far in from the curb face the coordinated furniture line sits. */
export const CURB_INSET = 1.2;
/** Keep-clear radius around an intersection centre, so corners stay walkable. */
const CORNER_CLEAR = 11;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);

// ---------------------------------------------------------------------------
// Shared prop material cache
// ---------------------------------------------------------------------------

const matCache = new Map();

/**
 * Memoised material for prop-specific finishes that core/materials.js does not
 * already cover. Shared with vegetation.js and signage.js so the three prop
 * systems never build the same material twice.
 * @param {string} key
 * @param {() => THREE.Material} build
 */
export function propMaterial(key, build) {
  let m = matCache.get(key);
  if (!m) {
    m = build();
    m.name = `prop:${key}`;
    matCache.set(key, m);
  }
  return m;
}

/** Warm slat wood used on benches and the shelter seat. */
const woodMat = () =>
  propMaterial('slatWood', () => new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.88 }));

/** Charcoal powder-coat: the colour of the whole coordinated family. */
const charcoal = () => M.paintedSteel(0x2b2f33);

/**
 * Lamp / lit-panel material. Emissive so the time-of-day system has something
 * to drive; meshes using it also carry `userData.nightLight = true`.
 */
const lampMat = () =>
  propMaterial('lampGlow', () =>
    new THREE.MeshStandardMaterial({
      color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0.15, roughness: 0.4,
    }));

/** Backlit advertising / map faces. Same switching contract as lamp heads. */
const litPanel = (color) =>
  propMaterial(`litPanel:${color}`, () =>
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.12, roughness: 0.35,
    }));

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** Footprints, expanded by a margin, cached once - the rejection test is hot. */
let blockers = null;
function footprintBlockers() {
  if (!blockers) {
    blockers = BUILDINGS.map((b) => {
      const f = footprint(b);
      return { minX: f.minX - 0.8, maxX: f.maxX + 0.8, minZ: f.minZ - 0.8, maxZ: f.maxZ + 0.8 };
    });
  }
  return blockers;
}

/** True if a sidewalk position would sit inside (or hard against) a building. */
export function insideFootprint(x, z) {
  for (const f of footprintBlockers()) {
    if (x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ) return true;
  }
  return false;
}

/** True if the position is in an intersection's keep-clear box. */
function atIntersection(x, z, clear) {
  for (const i of INTERSECTIONS) {
    if (Math.abs(x - i.x) < clear && Math.abs(z - i.z) < clear) return true;
  }
  return false;
}

/**
 * Placement spots along one sidewalk band of one street.
 *
 * @param {object} street a record from grid.STREETS
 * @param {'north'|'south'|'east'|'west'} side
 * @param {{interval?:number, inset?:number, phase?:number, clear?:number}} [opts]
 * @returns {Array<{x:number, y:number, z:number, ry:number}>} ry faces the roadway
 */
export function sidewalkSpots(street, side, opts = {}) {
  const { interval = 40, inset = CURB_INSET, phase = 0, clear = CORNER_CLEAR } = opts;
  const isEW = street.axis === 'ew';
  const walk = isEW
    ? (side === 'north' ? street.northWalk : street.southWalk)
    : (side === 'east' ? street.eastWalk : street.westWalk);
  if (!walk) return [];

  // Clamp so the prop always lands on the sidewalk slab, never in the roadway
  // and never hanging off the back edge into the building line.
  const off = Math.min(Math.max(inset, 0.6), Math.max(0.6, walk - 0.6));
  const sign = side === 'north' || side === 'west' ? -1 : 1;
  const lat = street.road / 2 + off;
  const ry = isEW
    ? (side === 'north' ? 0 : Math.PI)
    : (side === 'west' ? Math.PI / 2 : -Math.PI / 2);

  const lo = Math.min(street.from, street.to) + clear;
  const hi = Math.max(street.from, street.to) - clear;
  const out = [];
  for (let t = lo + phase; t <= hi; t += interval) {
    const x = isEW ? t : street.x + sign * lat;
    const z = isEW ? street.z + sign * lat : t;
    // The north-south streets duck under the rail viaduct through the corridor;
    // that band is underpass, not sidewalk furniture territory. The corridor
    // tapers west of York, so ask the grid for its edges at this x.
    if (!isEW) {
      const c = corridorAt(x);
      if (z > c.north - 6 && z < c.south + 6) continue;
    }
    if (atIntersection(x, z, clear)) continue;
    if (insideFootprint(x, z)) continue;
    out.push({ x, y: SIDEWALK_Y, z, ry });
  }
  return out;
}

/** Spots along both sidewalks of every named street. */
export function spotsOn(streetIds, opts = {}) {
  const out = [];
  for (const id of streetIds) {
    const s = getStreet(id);
    if (!s) continue;
    const sides = s.axis === 'ew' ? ['north', 'south'] : ['west', 'east'];
    for (let i = 0; i < sides.length; i++) {
      out.push(...sidewalkSpots(s, sides[i], { ...opts, phase: (opts.phase ?? 0) + i * (opts.interval ?? 40) / 2 }));
    }
  }
  return out;
}

/** Thin a spot list, keeping every nth. Cheaper than a second grid walk. */
const everyNth = (list, n, offset = 0) => list.filter((_, i) => (i + offset) % n === 0);

/** The two street records meeting at an intersection. */
export function streetsAt(i) {
  const ew = STREETS.find(
    (s) => s.axis === 'ew' && s.z === i.z && i.x >= Math.min(s.from, s.to) && i.x <= Math.max(s.from, s.to)
  );
  const ns = STREETS.find(
    (s) => s.axis === 'ns' && s.x === i.x && i.z >= Math.min(s.from, s.to) && i.z <= Math.max(s.from, s.to)
  );
  return { ew, ns };
}

// ---------------------------------------------------------------------------
// Instancing
// ---------------------------------------------------------------------------

/**
 * Compose a prop type from primitives and stamp it at every placement.
 *
 * Parts sharing a material are merged into one geometry, so a prop made of
 * eleven boxes in two finishes costs two InstancedMeshes, not eleven. Parts
 * flagged `nightLight` are kept in their own mesh so the time-of-day system can
 * find them with a single `userData` test.
 *
 * @param {Array<{geo:THREE.BufferGeometry, mat:THREE.Material, pos?:number[], rot?:number[], nightLight?:boolean}>} parts
 * @param {Array<{x:number,y:number,z:number,ry?:number,s?:number}>} placements
 * @param {{name:string, shadow?:boolean}} opts
 * @returns {THREE.Group|null}
 */
export function buildType(parts, placements, { name, shadow = false }) {
  if (!placements.length) return null;
  const groups = new Map();
  for (const p of parts) {
    const g = p.geo.clone();
    if (p.rot) g.rotateX(p.rot[0] || 0), g.rotateY(p.rot[1] || 0), g.rotateZ(p.rot[2] || 0);
    if (p.pos) g.translate(p.pos[0] || 0, p.pos[1] || 0, p.pos[2] || 0);
    const key = `${p.mat.uuid}${p.nightLight ? ':lit' : ''}`;
    const slot = groups.get(key) ?? { mat: p.mat, night: !!p.nightLight, geos: [] };
    slot.geos.push(g);
    groups.set(key, slot);
  }

  const group = new THREE.Group();
  group.name = name;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (const slot of groups.values()) {
    const geo = slot.geos.length > 1 ? mergeGeometries(slot.geos, false) : slot.geos[0];
    if (!geo) continue;
    const im = new THREE.InstancedMesh(geo, slot.mat, placements.length);
    placements.forEach((t, i) => {
      e.set(0, t.ry ?? 0, 0);
      q.setFromEuler(e);
      pos.set(t.x, t.y ?? SIDEWALK_Y, t.z);
      const s = t.s ?? 1;
      scl.set(s, s, s);
      im.setMatrixAt(i, m.compose(pos, q, scl));
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadow;
    im.receiveShadow = false;
    im.frustumCulled = false; // one instanced mesh spans the whole downtown
    if (slot.night) im.userData.nightLight = true;
    group.add(im);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Prop definitions - each returns the primitive parts in local space, origin at
// the sidewalk surface, +Z facing the roadway.
// ---------------------------------------------------------------------------

function benchParts() {
  const wood = woodMat();
  const frame = charcoal();
  const parts = [];
  // Four seat slats and three back slats: the coordinated bench's read.
  for (let i = 0; i < 4; i++) parts.push({ geo: box(1.9, 0.05, 0.11), mat: wood, pos: [0, 0.46, -0.2 + i * 0.14] });
  for (let i = 0; i < 3; i++) parts.push({ geo: box(1.9, 0.11, 0.05), mat: wood, pos: [0, 0.62 + i * 0.15, -0.3] });
  for (const s of [-1, 1]) {
    parts.push({ geo: box(0.06, 0.46, 0.62), mat: frame, pos: [s * 0.94, 0.23, -0.05] });
    parts.push({ geo: box(0.06, 0.5, 0.06), mat: frame, pos: [s * 0.94, 0.72, -0.3] });
    parts.push({ geo: box(0.1, 0.06, 0.7), mat: frame, pos: [s * 0.94, 0.03, -0.05] });
  }
  return parts;
}

/** The paired litter / recycling receptacle - two bins under one shared frame. */
function litterBinParts() {
  const shell = charcoal();
  const lid = M.steelDark();
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push({ geo: cyl(0.3, 0.28, 0.92, 10), mat: shell, pos: [s * 0.34, 0.46, 0] });
    parts.push({ geo: cyl(0.33, 0.33, 0.14, 10), mat: lid, pos: [s * 0.34, 1.0, 0] });
    // The opening reads as a dark slot in the hood.
    parts.push({ geo: box(0.3, 0.16, 0.05), mat: lid, pos: [s * 0.34, 0.92, 0.28] });
  }
  parts.push({ geo: box(0.86, 0.08, 0.5), mat: shell, pos: [0, 0.04, 0] });
  return parts;
}

/** Glazed shelter, flat roof, backlit ad panel at the grid-east end. */
function shelterParts() {
  const frame = charcoal();
  const glass = M.glazingClear();
  const parts = [
    { geo: box(4.2, 0.16, 2.3), mat: frame, pos: [0, 2.62, -0.2] },          // roof
    { geo: box(4.0, 2.1, 0.05), mat: glass, pos: [0, 1.45, -1.28] },          // rear glazing
    { geo: box(0.05, 2.1, 2.0), mat: glass, pos: [-2.05, 1.45, -0.25] },      // open end
    { geo: box(0.12, 2.7, 0.12), mat: frame, pos: [-2.05, 1.35, -1.28] },
    { geo: box(0.12, 2.7, 0.12), mat: frame, pos: [-2.05, 1.35, 0.75] },
    { geo: box(0.12, 2.7, 0.12), mat: frame, pos: [2.05, 1.35, -1.28] },
    { geo: box(0.12, 2.7, 0.12), mat: frame, pos: [2.05, 1.35, 0.75] },
    { geo: box(1.7, 0.06, 0.42), mat: woodMat(), pos: [-0.6, 0.5, -1.05] },   // bench
    { geo: box(0.1, 0.5, 0.42), mat: frame, pos: [-1.4, 0.25, -1.05] },
    { geo: box(0.1, 0.5, 0.42), mat: frame, pos: [0.2, 0.25, -1.05] },
    // Backlit advertising panel closing the grid-east end.
    { geo: box(0.22, 2.3, 1.9), mat: frame, pos: [2.14, 1.2, -0.25] },
    { geo: box(0.06, 1.9, 1.5), mat: litPanel(0xf3ecd8), pos: [2.27, 1.25, -0.25], nightLight: true },
  ];
  return parts;
}

/** Publication structure: a bank of four boxes under a common hood. */
function newspaperBankParts() {
  const shell = charcoal();
  const parts = [{ geo: box(2.0, 0.09, 0.55), mat: shell, pos: [0, 1.12, 0] }];
  for (let i = 0; i < 4; i++) {
    const x = -0.72 + i * 0.48;
    parts.push({ geo: box(0.44, 1.0, 0.44), mat: shell, pos: [x, 0.55, 0] });
    parts.push({ geo: box(0.34, 0.34, 0.04), mat: M.steelDark(), pos: [x, 0.85, 0.23] });
    parts.push({ geo: box(0.12, 0.6, 0.1), mat: shell, pos: [x, 0.05, 0] });
  }
  return parts;
}

/** Cylindrical poster column. */
function posterColumnParts() {
  return [
    { geo: cyl(0.56, 0.56, 2.6, 14), mat: propMaterial('posterSkin', () =>
        new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.7 })), pos: [0, 1.42, 0] },
    { geo: cyl(0.62, 0.6, 0.18, 14), mat: charcoal(), pos: [0, 2.8, 0] },
    { geo: cyl(0.64, 0.66, 0.24, 14), mat: charcoal(), pos: [0, 0.12, 0] },
  ];
}

/**
 * TO360 wayfinding pylon: a tall narrow charcoal slab with a yellow-ground
 * heads-up map panel on the pedestrian face and a name band above it.
 */
function wayfindingPylonParts() {
  const shell = charcoal();
  return [
    { geo: box(1.0, 2.95, 0.2), mat: shell, pos: [0, 1.48, 0] },
    { geo: box(1.06, 0.16, 0.26), mat: shell, pos: [0, 3.0, 0] },
    { geo: box(0.86, 1.5, 0.05), mat: litPanel(0xe4cf62), pos: [0, 1.55, 0.12], nightLight: true },
    { geo: box(0.86, 0.34, 0.05), mat: litPanel(0xf0eee6), pos: [0, 2.52, 0.12], nightLight: true },
    { geo: box(0.86, 0.9, 0.05), mat: litPanel(0xd8c657), pos: [0, 1.55, -0.12], nightLight: true },
    { geo: box(0.4, 0.1, 0.32), mat: shell, pos: [0, 0.05, 0] },
  ];
}

/** Bike Share Toronto station: docking rail plus solar payment kiosk. */
function bikeStationParts(docks) {
  const shell = charcoal();
  const parts = [
    { geo: box(docks * 0.78, 0.14, 0.5), mat: shell, pos: [0, 0.07, 0] },
  ];
  for (let i = 0; i < docks; i++) {
    const x = -((docks - 1) * 0.78) / 2 + i * 0.78;
    parts.push({ geo: box(0.16, 0.62, 0.16), mat: shell, pos: [x, 0.34, -0.12] });
    parts.push({ geo: box(0.1, 0.16, 0.34), mat: M.steelDark(), pos: [x, 0.58, 0.06] });
  }
  const kx = ((docks - 1) * 0.78) / 2 + 0.9;
  parts.push({ geo: box(0.6, 1.35, 0.4), mat: shell, pos: [kx, 0.68, 0] });
  parts.push({ geo: box(0.44, 0.36, 0.05), mat: litPanel(0xbfd7e2), pos: [kx, 1.05, 0.22], nightLight: true });
  parts.push({ geo: box(0.7, 0.06, 0.5), mat: M.steelDark(), pos: [kx, 1.42, 0.06], rot: [-0.25, 0, 0] });
  return parts;
}

/** Low-poly docked bike. */
function bikeParts() {
  const frame = propMaterial('bikeFrame', () =>
    new THREE.MeshStandardMaterial({ color: 0x2f5f8a, roughness: 0.5, metalness: 0.3 }));
  const rubber = M.steelDark();
  const wheel = new THREE.TorusGeometry(0.32, 0.045, 5, 12);
  return [
    { geo: wheel, mat: rubber, pos: [0, 0.34, -0.52], rot: [0, Math.PI / 2, 0] },
    { geo: wheel, mat: rubber, pos: [0, 0.34, 0.52], rot: [0, Math.PI / 2, 0] },
    { geo: box(0.09, 0.09, 1.0), mat: frame, pos: [0, 0.56, 0] },
    { geo: box(0.08, 0.5, 0.08), mat: frame, pos: [0, 0.5, -0.3], rot: [0.35, 0, 0] },
    { geo: box(0.5, 0.06, 0.06), mat: frame, pos: [0, 1.02, -0.42] },
    { geo: box(0.14, 0.07, 0.3), mat: frame, pos: [0, 0.86, 0.24] },
    { geo: box(0.3, 0.2, 0.24), mat: frame, pos: [0, 0.76, -0.5] },
  ];
}

const bollardParts = () => [
  { geo: cyl(0.085, 0.1, 0.92, 10), mat: charcoal(), pos: [0, 0.46, 0] },
  { geo: cyl(0.11, 0.11, 0.07, 10), mat: charcoal(), pos: [0, 0.95, 0] },
  { geo: cyl(0.14, 0.15, 0.06, 10), mat: charcoal(), pos: [0, 0.03, 0] },
];

/** Mast-arm traffic signal: three lamp heads out over the roadway. */
function trafficSignalParts(arm) {
  const shell = charcoal();
  const parts = [
    { geo: cyl(0.11, 0.14, 6.4, 10), mat: shell, pos: [0, 3.2, 0] },
    { geo: cyl(0.22, 0.24, 0.5, 10), mat: M.concretePlain(), pos: [0, 0.25, 0] },
    { geo: box(0.16, 0.16, arm), mat: shell, pos: [0, 6.25, arm / 2] },
    { geo: box(0.12, 0.6, 0.12), mat: shell, pos: [0, 5.95, arm * 0.35], rot: [0.6, 0, 0] },
    { geo: box(0.4, 1.05, 0.36), mat: shell, pos: [0, 5.55, arm * 0.62] },
    { geo: box(0.4, 1.05, 0.36), mat: shell, pos: [0, 5.55, arm * 0.92] },
  ];
  for (const zf of [0.62, 0.92]) {
    for (let i = 0; i < 3; i++) {
      parts.push({
        geo: cyl(0.11, 0.11, 0.05, 8), mat: lampMat(), nightLight: true,
        pos: [0, 5.9 - i * 0.32, arm * zf + 0.19], rot: [Math.PI / 2, 0, 0],
      });
    }
  }
  return parts;
}

/** Pedestrian signal head with its push-button post. */
const pedSignalParts = () => [
  { geo: cyl(0.075, 0.09, 3.1, 8), mat: charcoal(), pos: [0, 1.55, 0] },
  { geo: box(0.38, 0.44, 0.24), mat: charcoal(), pos: [0, 3.15, 0.05] },
  { geo: box(0.3, 0.34, 0.04), mat: lampMat(), pos: [0, 3.15, 0.19], nightLight: true },
  { geo: box(0.16, 0.22, 0.1), mat: M.steelDark(), pos: [0, 1.05, 0.11] },
];

/** Pay-and-display parking machine. */
const parkingMeterParts = () => [
  { geo: cyl(0.06, 0.07, 1.15, 8), mat: charcoal(), pos: [0, 0.58, 0] },
  { geo: box(0.3, 0.58, 0.22), mat: charcoal(), pos: [0, 1.42, 0] },
  { geo: box(0.2, 0.16, 0.04), mat: M.steelDark(), pos: [0, 1.56, 0.13] },
  { geo: box(0.34, 0.05, 0.26), mat: M.steelDark(), pos: [0, 1.73, 0] },
];

const hydrantParts = () => [
  { geo: cyl(0.13, 0.15, 0.62, 8), mat: propMaterial('hydrantRed', () =>
      new THREE.MeshStandardMaterial({ color: 0xa8332b, roughness: 0.7 })), pos: [0, 0.31, 0] },
  { geo: cyl(0.16, 0.14, 0.12, 8), mat: propMaterial('hydrantRed', () =>
      new THREE.MeshStandardMaterial({ color: 0xa8332b, roughness: 0.7 })), pos: [0, 0.68, 0] },
  { geo: cyl(0.06, 0.06, 0.12, 6), mat: M.steelDark(), pos: [0, 0.5, 0.15], rot: [Math.PI / 2, 0, 0] },
  { geo: cyl(0.05, 0.05, 0.1, 6), mat: M.steelDark(), pos: [0, 0.74, 0] },
];

/** Cast-iron cover, laid flat on the roadway - a decal, not a bump. */
const coverParts = () => [
  { geo: cyl(0.36, 0.36, 0.03, 14), mat: propMaterial('castIron', () =>
      new THREE.MeshStandardMaterial({ color: 0x39383a, roughness: 0.85, metalness: 0.4 })), pos: [0, 0.015, 0] },
];

/** Sidewalk grate over a service vault. */
const grateParts = () => [
  { geo: box(0.95, 0.05, 1.7), mat: propMaterial('grate', () =>
      new THREE.MeshStandardMaterial({ color: 0x2e2d2f, roughness: 0.75, metalness: 0.5 })), pos: [0, 0.01, 0] },
];

/** Fire-department standpipe / siamese connection against the building line. */
const standpipeParts = () => [
  { geo: cyl(0.055, 0.055, 1.05, 8), mat: M.steelDark(), pos: [-0.16, 0.52, 0] },
  { geo: cyl(0.055, 0.055, 1.05, 8), mat: M.steelDark(), pos: [0.16, 0.52, 0] },
  { geo: box(0.5, 0.14, 0.14), mat: M.steelDark(), pos: [0, 1.08, 0] },
  { geo: cyl(0.075, 0.075, 0.16, 8), mat: propMaterial('brassCap', () =>
      new THREE.MeshStandardMaterial({ color: 0x9a7b3c, roughness: 0.45, metalness: 0.7 })),
    pos: [-0.16, 1.08, 0.12], rot: [Math.PI / 2, 0, 0] },
  { geo: cyl(0.075, 0.075, 0.16, 8), mat: propMaterial('brassCap', () =>
      new THREE.MeshStandardMaterial({ color: 0x9a7b3c, roughness: 0.45, metalness: 0.7 })),
    pos: [0.16, 1.08, 0.12], rot: [Math.PI / 2, 0, 0] },
];

/** Downtown twin-lantern pole - the Front / Bay heritage-style luminaire. */
const twinLanternParts = () => [
  { geo: cyl(0.13, 0.19, 5.0, 10), mat: charcoal(), pos: [0, 2.5, 0] },
  { geo: cyl(0.26, 0.3, 0.55, 10), mat: charcoal(), pos: [0, 0.28, 0] },
  { geo: box(2.0, 0.1, 0.1), mat: charcoal(), pos: [0, 5.05, 0] },
  { geo: cyl(0.1, 0.1, 0.35, 8), mat: charcoal(), pos: [-1.0, 5.2, 0] },
  { geo: cyl(0.1, 0.1, 0.35, 8), mat: charcoal(), pos: [1.0, 5.2, 0] },
  { geo: cyl(0.3, 0.16, 0.62, 6), mat: lampMat(), pos: [-1.0, 5.65, 0], nightLight: true },
  { geo: cyl(0.3, 0.16, 0.62, 6), mat: lampMat(), pos: [1.0, 5.65, 0], nightLight: true },
  { geo: cyl(0.05, 0.09, 0.22, 6), mat: charcoal(), pos: [-1.0, 6.05, 0] },
  { geo: cyl(0.05, 0.09, 0.22, 6), mat: charcoal(), pos: [1.0, 6.05, 0] },
];

/** Cobra-head pole for the outer streets. Arm reaches out over the roadway. */
const cobraHeadParts = () => [
  { geo: cyl(0.11, 0.16, 8.6, 10), mat: charcoal(), pos: [0, 4.3, 0] },
  { geo: cyl(0.22, 0.25, 0.4, 10), mat: M.concretePlain(), pos: [0, 0.2, 0] },
  { geo: box(0.12, 0.12, 2.6), mat: charcoal(), pos: [0, 8.75, 1.2], rot: [-0.12, 0, 0] },
  { geo: box(0.42, 0.16, 0.9), mat: charcoal(), pos: [0, 8.95, 2.45] },
  { geo: box(0.34, 0.05, 0.72), mat: lampMat(), pos: [0, 8.85, 2.45], nightLight: true },
];

// ---------------------------------------------------------------------------
// Placement tables
// ---------------------------------------------------------------------------

/**
 * Bike Share Toronto stations. Coordinates are the plausible curbside / plaza
 * positions named in the brief; each is validated against the footprint table
 * at build time and dropped with a warning rather than pushed into a wall.
 */
const BIKE_STATIONS = [
  { id: 'union-forecourt', x: -170, z: 19, ry: Math.PI, docks: 14 },
  { id: 'front-york', x: -252, z: 12, ry: Math.PI, docks: 11 },
  { id: 'bay-wellington', x: -11.5, z: -140, ry: Math.PI / 2, docks: 10 },
  { id: 'bremner', x: -330, z: 261, ry: Math.PI, docks: 9 },
  { id: 'roundhouse-park', x: -700, z: 268, ry: 0, docks: 12 },
  { id: 'lakeshore-york', x: -256, z: 362, ry: Math.PI, docks: 8 },
];

/** Street sets, named so the intent of each interval is readable. */
const CORE = ['front-w', 'front-e', 'bay', 'york', 'wellington', 'bremner'];
const ALL_IDS = STREETS.map((s) => s.id);
const OUTER = ALL_IDS.filter((id) => !['front-w', 'front-e', 'bay'].includes(id));

let COUNTS = {};

/** Per-type instance counts for the QA report. */
export function counts() {
  return { ...COUNTS };
}

export function build() {
  const root = new THREE.Group();
  root.name = 'streetFurniture';
  COUNTS = {};

  /** Add one prop type, register it once, and record its instance count. */
  const add = (id, name, parts, placements, opts = {}) => {
    const g = buildType(parts, placements, { name: id, shadow: opts.shadow ?? false });
    if (!g) return;
    root.add(g);
    COUNTS[id] = placements.length;
    register({
      id: `furn-${id}`, name, kind: 'prop', object: g,
      confidence: opts.confidence ?? 'inferred',
      source: opts.source ?? 'City of Toronto Coordinated Street Furniture programme, typology from photography',
      note: opts.note ?? '',
      data: { instances: placements.length, interval: opts.interval ?? null },
    });
  };

  // --- the coordinated family ------------------------------------------------
  add('bench', 'Street bench (coordinated street furniture)', benchParts(),
    spotsOn(CORE, { interval: 46, inset: 1.4 }),
    { shadow: true, interval: 46,
      note: 'Astral-era slatted bench with a charcoal steel frame. Spacing is regularised at 46 m; the real spacing follows frontage and transit stops.' });

  add('litter-bin', 'Paired litter / recycling receptacle', litterBinParts(),
    spotsOn([...CORE, 'king', 'yonge'], { interval: 58, phase: 21 }),
    { interval: 58, note: 'Paired-bin type: waste and recycling under one hood.' });

  const shelterSpots = everyNth(
    spotsOn(['bay', 'york', 'front-w', 'bremner', 'lakeshore', 'king', 'yonge'], { interval: 90, phase: 34, inset: 2.6 }),
    3
  );
  add('transit-shelter', 'Transit shelter', shelterParts(), shelterSpots,
    { shadow: true, note: 'Glazed shelter, flat roof, backlit ad panel at one end (userData.nightLight). Stop locations are plausible, not surveyed.', confidence: 'approximated' });

  add('publication-box', 'Publication structure (bank of four)', newspaperBankParts(),
    everyNth(spotsOn(['front-w', 'front-e', 'bay', 'york', 'yonge'], { interval: 110, phase: 55 }), 2),
    { note: 'Multi-publication structure holding four boxes.' });

  add('poster-column', 'Poster board column', posterColumnParts(),
    everyNth(spotsOn(['front-w', 'front-e', 'king', 'bay', 'york'], { interval: 130, phase: 66 }), 2),
    { note: 'Cylindrical poster column from the same family.' });

  add('wayfinding-pylon', 'TO360 wayfinding pylon', wayfindingPylonParts(),
    everyNth(spotsOn(['front-w', 'front-e', 'bay', 'york', 'bremner'], { interval: 150, phase: 40, inset: 2.0 }), 2),
    { confidence: 'reference',
      source: 'TO360 wayfinding strategy pylon typology',
      note: 'Charcoal slab with a yellow-ground heads-up map panel; genuinely distinctive Toronto kit. Exact pylon locations are plausible, the type is not.' });

  // --- bike share ------------------------------------------------------------
  const stations = BIKE_STATIONS.filter((s) => {
    if (insideFootprint(s.x, s.z)) {
      console.warn(`[streetFurniture] bike station "${s.id}" rejected: inside a building footprint`);
      return false;
    }
    return true;
  });
  // Each dock rail length differs, so stations are grouped by dock count and
  // one instanced type is emitted per distinct rail length.
  const byDocks = new Map();
  for (const s of stations) {
    const list = byDocks.get(s.docks) ?? [];
    list.push({ x: s.x, y: SIDEWALK_Y, z: s.z, ry: s.ry });
    byDocks.set(s.docks, list);
  }
  let stationTotal = 0;
  const bikes = [];
  for (const [docks, places] of byDocks) {
    const g = buildType(bikeStationParts(docks), places, { name: `bikeshare-${docks}` });
    if (g) root.add(g);
    stationTotal += places.length;
    // Park a bike in roughly two thirds of the docks.
    for (const p of places) {
      const filled = Math.max(2, Math.round(docks * 0.65));
      for (let i = 0; i < filled; i++) {
        const off = -((docks - 1) * 0.78) / 2 + i * 0.78;
        bikes.push({
          x: p.x + Math.cos(p.ry) * off, y: SIDEWALK_Y, z: p.z - Math.sin(p.ry) * off, ry: p.ry,
        });
      }
    }
  }
  COUNTS['bikeshare-station'] = stationTotal;
  register({
    id: 'furn-bikeshare-station', name: 'Bike Share Toronto station', kind: 'prop',
    object: root, confidence: 'inferred',
    source: 'Bike Share Toronto station typology (docking rail + solar payment kiosk)',
    note: `${stationTotal} stations at Union forecourt, Front & York, Bay & Wellington, Bremner, Roundhouse Park and Lake Shore & York. Positions are plausible curbside locations, not surveyed.`,
    data: { instances: stationTotal },
  });
  add('bikeshare-bike', 'Docked bike share bicycle', bikeParts(), bikes,
    { note: 'Roughly two thirds of the docks are occupied.' });

  // --- traffic and signals ---------------------------------------------------
  const signals = [];
  const pedHeads = [];
  for (const i of INTERSECTIONS) {
    const { ew, ns } = streetsAt(i);
    if (!ew || !ns) continue;
    const ox = ns.road / 2 + 1.3;
    const oz = ew.road / 2 + 1.3;
    // Two opposing mast arms per intersection, each reaching over its approach.
    signals.push({ x: i.x - ox, y: SIDEWALK_Y, z: i.z + oz, ry: 0, arm: ns.road });
    signals.push({ x: i.x + ox, y: SIDEWALK_Y, z: i.z - oz, ry: Math.PI, arm: ns.road });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pedHeads.push({ x: i.x + sx * ox, y: SIDEWALK_Y, z: i.z + sz * oz, ry: sz > 0 ? Math.PI : 0 });
      }
    }
  }
  // Arm length varies with the roadway width, so one type per distinct width.
  const armGroups = new Map();
  for (const s of signals) {
    const list = armGroups.get(s.arm) ?? [];
    list.push(s);
    armGroups.set(s.arm, list);
  }
  for (const [arm, list] of armGroups) {
    const g = buildType(trafficSignalParts(arm / 2 + 2), list, { name: `signal-${arm}`, shadow: false });
    if (g) root.add(g);
  }
  COUNTS['traffic-signal'] = signals.length;
  register({
    id: 'furn-traffic-signal', name: 'Mast-arm traffic signal', kind: 'prop', object: root,
    confidence: 'inferred', source: 'Toronto signalised intersection typology',
    note: 'Mast arm reaches half the roadway plus 2 m; three lamp heads per head carry userData.nightLight.',
    data: { instances: signals.length },
  });

  add('ped-signal', 'Pedestrian signal head and push button', pedSignalParts(), pedHeads,
    { note: 'One per intersection corner; countdown face carries userData.nightLight.' });

  // --- parking, utility and hydrant hardware ---------------------------------
  add('bollard', 'Sidewalk bollard', bollardParts(),
    [
      ...sidewalkSpots(getStreet('front-w'), 'south', { interval: 7, inset: 2.2, clear: 14 }),
      ...sidewalkSpots(getStreet('bremner'), 'north', { interval: 9, inset: 1.6 }),
      ...sidewalkSpots(getStreet('york'), 'east', { interval: 9, inset: 1.6 }),
    ],
    { note: 'Dense along the Union Station promenade, which is the widest walk in the model at 14 m.' });

  add('parking-meter', 'Pay-and-display parking machine', parkingMeterParts(),
    everyNth(spotsOn(['wellington', 'front-e', 'church', 'yonge', 'john', 'rees'], { interval: 60, phase: 25 }), 2),
    { note: 'Pay-and-display machines replaced individual meters downtown; one machine serves a block face.' });

  add('hydrant', 'Fire hydrant', hydrantParts(),
    spotsOn(ALL_IDS, { interval: 95, phase: 12, inset: 0.9 }),
    { note: 'Curbside hydrant spacing regularised at ~95 m.' });

  add('standpipe', 'Standpipe / siamese connection', standpipeParts(),
    everyNth(spotsOn(CORE, { interval: 75, phase: 61, inset: 4.2 }), 2),
    { note: 'Set back near the building line rather than at the curb.' });

  add('sidewalk-grate', 'Sidewalk service grate', grateParts(),
    everyNth(spotsOn(CORE, { interval: 65, phase: 33, inset: 2.4 }), 2),
    { note: 'Flat vault grate; sits on the sidewalk surface.' });

  // Utility covers belong in the roadway, so they are placed on the centreline
  // rather than through the sidewalk walker.
  const covers = [];
  for (const s of STREETS) {
    const lo = Math.min(s.from, s.to);
    const hi = Math.max(s.from, s.to);
    for (let t = lo + 20, k = 0; t < hi; t += 38, k++) {
      const off = ((k % 3) - 1) * (s.road / 4);
      const x = s.axis === 'ew' ? t : s.x + off;
      const z = s.axis === 'ew' ? s.z + off : t;
      if (s.axis === 'ns') {
        const c = corridorAt(x);
        if (z > c.north && z < c.south) continue;
      }
      covers.push({ x, y: 0, z });
    }
  }
  add('utility-cover', 'Manhole / utility cover', coverParts(), covers,
    { note: 'Flat decals on the roadway surface, 3 cm proud, so vehicles never clip them.' });

  // --- street lighting -------------------------------------------------------
  add('twin-lantern-pole', 'Downtown twin-lantern street light', twinLanternParts(),
    spotsOn(['front-w', 'front-e', 'bay'], { interval: 30, phase: 8, inset: 1.5 }),
    { shadow: false, confidence: 'reference',
      source: 'Downtown Toronto heritage-style twin-lantern luminaire, Front and Bay',
      note: 'Two lanterns on a cross arm at 5 m. Lantern meshes carry userData.nightLight and an emissive material.' });

  add('cobra-head-pole', 'Cobra-head street light', cobraHeadParts(),
    spotsOn(OUTER, { interval: 36, phase: 17, inset: 1.5 }),
    { note: 'Standard mast-arm luminaire on every street that does not carry the downtown twin-lantern pole. Heads carry userData.nightLight.' });

  return root;
}
