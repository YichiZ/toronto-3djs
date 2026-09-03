/**
 * Street trees, planters and planting beds.
 *
 * REAL-WORLD FACTS ENCODED HERE
 *  - Downtown Toronto's street tree palette is dominated by honey locust
 *    (Gleditsia triacanthos 'Skyline' and similar cultivars) - the tall, narrow,
 *    open-crowned tree that survives salt, compaction and a 2 m tree pit - with
 *    Norway/Freeman maples on the wider frontages and small ornamentals
 *    (serviceberry, ornamental pear) where a canopy would foul a canopy or sign.
 *    Three archetypes stand in for that palette.
 *  - Street trees sit in tree pits with cast-iron grates set flush into the
 *    sidewalk, on the curb line, not in the middle of the walk.
 *  - The Union Station forecourt and the Front Street promenade carry large
 *    precast/granite planters rather than open pits: there is a station
 *    concourse directly beneath.
 *  - The Park at CIBC SQUARE is a deck ABOVE the rail corridor, so its planting
 *    sits at y = 11, not on grade. Its beds are raised planters over structure.
 *
 * SEASON. Everything here is built for LATE SPRING / SUMMER: full leaf, mid to
 * deep green, mown turf. That is a deliberate single-season choice - there is no
 * bare-branch or autumn variant - and it is recorded in every registry note so
 * the QA report carries it.
 *
 * PERFORMANCE. Each archetype is one merged trunk geometry plus one merged
 * canopy geometry (~230-330 triangles) drawn as two InstancedMeshes, with
 * per-instance scale and yaw variation from a deterministic hash so no two
 * trees are identical and the layout is stable across reloads.
 */
import * as THREE from 'three';
import { getStreet } from '../data/grid.js';
import { M } from '../core/materials.js';
import { noise } from '../core/textures.js';
import { ringGeometry } from '../world/buildingKit.js';
import { register } from '../core/registry.js';
import {
  SIDEWALK_Y, sidewalkSpots, spotsOn, insideFootprint, buildType, propMaterial,
} from './streetFurniture.js';

const ico = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Deterministic 0..1 from an integer index and a channel. */
const rnd = (i, ch) => noise(i + 1, ch + 1, 1013);

/** Late-spring foliage greens, one per archetype so the street reads varied. */
const foliageMat = (key, color) =>
  propMaterial(`foliage:${key}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }));

/**
 * The three street-tree archetypes.
 *
 * `parts` are in local space with the origin at the sidewalk surface. Canopy
 * shells are ellipsoids scaled from an icosahedron, which is what keeps a
 * believable crown down to ~250 triangles.
 */
function treeArchetypes() {
  const bark = M.bark();

  /** Columnar honey locust: tall, narrow, high branching, open crown. */
  const honeyLocust = () => {
    const shells = [
      { r: 1.85, y: 6.0, sx: 1.0, sy: 1.25, sz: 0.95 },
      { r: 1.5, y: 7.6, sx: 0.95, sy: 1.15, sz: 0.9 },
      { r: 1.1, y: 8.8, sx: 0.9, sy: 1.0, sz: 0.85 },
    ];
    return [
      { geo: cyl(0.14, 0.24, 4.6), mat: bark, pos: [0, 2.3, 0] },
      { geo: cyl(0.1, 0.15, 2.2, 6), mat: bark, pos: [0, 5.4, 0] },
      ...shells.map((s) => ({
        geo: ico(s.r).scale(s.sx, s.sy, s.sz), mat: foliageMat('locust', 0x5f7f3e), pos: [0, s.y, 0],
      })),
    ];
  };

  /** Broader maple: lower branching, rounder and denser crown. */
  const maple = () => {
    const shells = [
      { r: 2.6, y: 5.2, sx: 1.15, sy: 0.9, sz: 1.1 },
      { r: 2.1, y: 6.7, sx: 1.05, sy: 0.9, sz: 1.0 },
      { r: 1.4, y: 7.7, sx: 1.0, sy: 0.85, sz: 0.95 },
    ];
    return [
      { geo: cyl(0.19, 0.32, 3.6), mat: bark, pos: [0, 1.8, 0] },
      { geo: cyl(0.12, 0.18, 2.0, 6), mat: bark, pos: [0, 4.4, 0], rot: [0, 0, 0.14] },
      ...shells.map((s) => ({
        geo: ico(s.r).scale(s.sx, s.sy, s.sz), mat: foliageMat('maple', 0x486b34), pos: [0, s.y, 0],
      })),
    ];
  };

  /** Small ornamental for tight frontages and under signage. */
  const ornamental = () => {
    const shells = [
      { r: 1.5, y: 3.3, sx: 1.1, sy: 0.85, sz: 1.05 },
      { r: 1.1, y: 4.2, sx: 1.0, sy: 0.8, sz: 0.95 },
    ];
    return [
      { geo: cyl(0.1, 0.16, 2.3), mat: bark, pos: [0, 1.15, 0] },
      ...shells.map((s) => ({
        geo: ico(s.r).scale(s.sx, s.sy, s.sz), mat: foliageMat('ornamental', 0x6b8a46), pos: [0, s.y, 0],
      })),
    ];
  };

  return [
    { id: 'honey-locust', name: 'Street tree - columnar honey locust', parts: honeyLocust(), share: 0.55 },
    { id: 'maple', name: 'Street tree - maple', parts: maple(), share: 0.3 },
    { id: 'ornamental', name: 'Street tree - small ornamental', parts: ornamental(), share: 0.15 },
  ];
}

/** Cast-iron tree grate set flush in the sidewalk around a pit. */
const treeGrateParts = () => [
  { geo: ringGeometry(1.9, 1.9, 0.55, 0.06), mat: propMaterial('treeGrate', () =>
      new THREE.MeshStandardMaterial({ color: 0x3a3937, roughness: 0.8, metalness: 0.45 })), pos: [0, 0.01, 0] },
  { geo: new THREE.BoxGeometry(1.0, 0.04, 1.0), mat: propMaterial('treeSoil', () =>
      new THREE.MeshStandardMaterial({ color: 0x38302a, roughness: 1.0 })), pos: [0, -0.01, 0] },
];

/** Large precast planter with a massed shrub inside. */
function planterParts() {
  const shrub = foliageMat('shrub', 0x53703a);
  return [
    { geo: ringGeometry(2.6, 1.7, 0.26, 0.85), mat: M.limestonePlain(), pos: [0, 0.42, 0] },
    { geo: new THREE.BoxGeometry(2.1, 0.06, 1.2), mat: propMaterial('treeSoil', () =>
        new THREE.MeshStandardMaterial({ color: 0x38302a, roughness: 1.0 })), pos: [0, 0.74, 0] },
    { geo: ico(0.72, 1).scale(1.15, 0.7, 0.85), mat: shrub, pos: [-0.6, 1.05, 0] },
    { geo: ico(0.66, 1).scale(1.1, 0.75, 0.85), mat: shrub, pos: [0.55, 1.02, 0.08] },
    { geo: ico(0.5, 0).scale(1.2, 0.8, 0.9), mat: shrub, pos: [0, 1.14, -0.1] },
  ];
}

/** Massed shrub for beds - one low ellipsoid, instanced by the hundred. */
const shrubParts = () => [
  { geo: ico(0.8, 1).scale(1.2, 0.68, 1.05), mat: foliageMat('shrub', 0x53703a), pos: [0, 0.5, 0] },
];

/**
 * Planting beds. `y` is the surface the bed sits on: the CIBC SQUARE bed is on
 * the deck over the rail corridor at y = 11, and skips the footprint test
 * because the deck IS the ground there.
 */
const BEDS = [
  { id: 'berczy-park', name: 'Berczy Park planting', x: 298, z: -78, w: 16, d: 20, y: SIDEWALK_Y, trees: 6, shrubs: 22 },
  { id: 'roundhouse-park', name: 'Roundhouse Park lawn', x: -670, z: 271, w: 100, d: 13, y: SIDEWALK_Y, trees: 12, shrubs: 30 },
  { id: 'cibc-park', name: 'The Park at CIBC SQUARE planting', x: 61, z: 174, w: 52, d: 78, y: 11, trees: 16, shrubs: 48, onDeck: true },
  { id: 'maple-leaf-square', name: 'Maple Leaf Square plaza planting', x: -203, z: 282, w: 11, d: 54, y: SIDEWALK_Y, trees: 5, shrubs: 18 },
];

/** Streets that carry a continuous street-tree line. */
const TREE_STREETS = ['front-w', 'front-e', 'bay', 'york', 'wellington', 'bremner', 'lakeshore'];

let COUNTS = {};

/** Per-type instance counts for the QA report. */
export function counts() {
  return { ...COUNTS };
}

/** Scatter n points inside a bed, deterministically, skipping footprints. */
function bedPoints(bed, n, seed) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = bed.x + (rnd(i * 7 + seed, 1) - 0.5) * (bed.w - 2);
    const z = bed.z + (rnd(i * 7 + seed, 2) - 0.5) * (bed.d - 2);
    if (!bed.onDeck && insideFootprint(x, z)) continue;
    out.push({ x, y: bed.y, z, ry: rnd(i + seed, 3) * Math.PI * 2, s: 0.85 + rnd(i + seed, 4) * 0.4 });
  }
  return out;
}

export function build() {
  const root = new THREE.Group();
  root.name = 'vegetation';
  COUNTS = {};

  const SEASON = 'Built for late spring / summer: full leaf, mid-to-deep green. No autumn or bare-branch variant exists in this model.';

  // --- street trees ----------------------------------------------------------
  // One walk of the sidewalk band feeds trees and grates alike, so a grate can
  // never end up without its tree or vice versa.
  const pits = spotsOn(TREE_STREETS, { interval: 15, phase: 7, inset: 1.9 });
  const archetypes = treeArchetypes();
  /** @type {Record<string, Array<object>>} */
  const bySpecies = Object.fromEntries(archetypes.map((a) => [a.id, []]));

  pits.forEach((p, i) => {
    // Species chosen by a stable hash, weighted toward honey locust.
    const r = rnd(i, 0);
    let acc = 0;
    let pick = archetypes[0];
    for (const a of archetypes) {
      acc += a.share;
      if (r <= acc) { pick = a; break; }
    }
    bySpecies[pick.id].push({
      x: p.x, y: p.y, z: p.z,
      ry: rnd(i, 1) * Math.PI * 2,
      s: 0.78 + rnd(i, 2) * 0.5, // 0.78-1.28: young infill trees next to mature ones
    });
  });

  for (const a of archetypes) {
    const places = bySpecies[a.id];
    const g = buildType(a.parts, places, { name: `tree-${a.id}`, shadow: true });
    if (!g) continue;
    root.add(g);
    COUNTS[`tree-${a.id}`] = places.length;
    register({
      id: `veg-tree-${a.id}`, name: a.name, kind: 'prop', object: g,
      confidence: 'inferred',
      source: 'City of Toronto street tree palette; crown form from photographic proportion',
      note: `${SEASON} Per-instance scale 0.78-1.28 and random yaw so no two read alike. Species mix is representative, not a survey of individual trees.`,
      data: { instances: places.length, spacing: 15 },
    });
  }

  const grates = buildType(treeGrateParts(), pits, { name: 'tree-grate' });
  if (grates) {
    root.add(grates);
    COUNTS['tree-grate'] = pits.length;
    register({
      id: 'veg-tree-grate', name: 'Tree pit and cast-iron grate', kind: 'prop', object: grates,
      confidence: 'inferred', source: 'Standard Toronto tree pit detail',
      note: 'Flush grate on the curb line, one per street tree.',
      data: { instances: pits.length },
    });
  }

  // --- forecourt and Front Street planters -----------------------------------
  const planterSpots = [
    ...sidewalkSpots(getStreet('front-w'), 'south', { interval: 24, inset: 5.5, phase: 12, clear: 16 }),
    ...sidewalkSpots(getStreet('front-w'), 'north', { interval: 34, inset: 3.2, phase: 20 }),
    ...sidewalkSpots(getStreet('front-e'), 'south', { interval: 34, inset: 3.2, phase: 15 }),
  ];
  const planters = buildType(planterParts(), planterSpots, { name: 'planter', shadow: true });
  if (planters) {
    root.add(planters);
    COUNTS.planter = planterSpots.length;
    register({
      id: 'veg-planter', name: 'Precast planter with massed shrubs', kind: 'prop', object: planters,
      confidence: 'inferred',
      source: 'Union Station forecourt / Front Street revitalisation planters',
      note: `Large precast planters rather than open tree pits, because the station concourse runs directly beneath the forecourt. ${SEASON}`,
      data: { instances: planterSpots.length },
    });
  }

  // --- parks and planting beds ----------------------------------------------
  const lawnMat = M.grass();
  const bedTrees = Object.fromEntries(archetypes.map((a) => [a.id, []]));
  const bedShrubs = [];
  let lawnArea = 0;

  BEDS.forEach((bed, bi) => {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(bed.w, bed.d), lawnMat);
    lawn.geometry.rotateX(-Math.PI / 2);
    lawn.position.set(bed.x, bed.y + 0.02, bed.z);
    lawn.receiveShadow = true;
    lawn.name = `bed-${bed.id}`;
    root.add(lawn);
    lawnArea += bed.w * bed.d;

    // Park trees lean toward the broader archetypes - no salt, no compaction.
    bedPoints(bed, bed.trees, bi * 31).forEach((p, i) => {
      const a = archetypes[(i + bi) % 2 === 0 ? 1 : (i % 3 === 0 ? 2 : 0)];
      bedTrees[a.id].push(p);
    });
    bedShrubs.push(...bedPoints(bed, bed.shrubs, bi * 97 + 5));

    register({
      id: `veg-bed-${bed.id}`, name: bed.name, kind: 'prop', object: lawn,
      confidence: bed.onDeck ? 'reference' : 'inferred',
      source: bed.onDeck ? 'The Park at CIBC SQUARE, the deck park over the rail corridor' : 'Park boundary from block geometry',
      note: bed.onDeck
        ? `Planting sits on the deck at y = ${bed.y} m over the rail corridor, not on grade. ${SEASON}`
        : `${SEASON} Bed outline is a simplification of the real planting layout.`,
      data: { area: Math.round(bed.w * bed.d) },
    });
  });

  for (const a of archetypes) {
    const places = bedTrees[a.id];
    if (!places.length) continue;
    const g = buildType(a.parts, places, { name: `park-tree-${a.id}`, shadow: true });
    if (!g) continue;
    root.add(g);
    COUNTS[`park-tree-${a.id}`] = places.length;
  }
  register({
    id: 'veg-park-trees', name: 'Park and plaza trees', kind: 'prop', object: root,
    confidence: 'inferred', source: 'Same three archetypes as the street trees',
    note: `Trees in Berczy Park, Roundhouse Park, the Maple Leaf Square plaza and on The Park at CIBC SQUARE deck. ${SEASON}`,
    data: { instances: Object.values(bedTrees).reduce((n, l) => n + l.length, 0) },
  });

  const shrubs = buildType(shrubParts(), bedShrubs, { name: 'bed-shrub' });
  if (shrubs) {
    root.add(shrubs);
    COUNTS.shrub = bedShrubs.length;
    register({
      id: 'veg-shrub', name: 'Massed bed shrubs', kind: 'prop', object: shrubs,
      confidence: 'approximated', source: 'Massing only - species not identified',
      note: `Shrub massing stands in for the real planting schedules, which were not surveyed. ${SEASON}`,
      data: { instances: bedShrubs.length },
    });
  }

  COUNTS['lawn-bed'] = BEDS.length;
  COUNTS['lawn-area-m2'] = Math.round(lawnArea);
  return root;
}
