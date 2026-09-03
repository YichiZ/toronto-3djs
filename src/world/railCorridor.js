/**
 * The Union Station rail corridor: viaduct, underpasses, tracks, platforms and
 * the train shed.
 *
 * REAL-WORLD FACTS ENCODED HERE
 *  - The corridor is ELEVATED. Between roughly Lower Simcoe and Yonge the tracks
 *    ride a continuous concrete/masonry retaining structure built out of the
 *    1927-31 viaduct project, and the cross streets duck underneath. That is why
 *    the deck sits at LEVELS.viaductDeck (+6.5) and Bay/York/Yonge/Lower Simcoe
 *    run at y=0 through portals with roughly 4.5 m of clearance to the soffit.
 *  - Simcoe Street ENDS at Front. The street that passes under the corridor on
 *    that alignment is LOWER Simcoe, through the tunnel opened in 2009. Never
 *    draw Simcoe through the corridor.
 *  - The corridor is NOT electrified. GO, VIA and UP Express all run diesel into
 *    Union. There is deliberately no catenary, no contact wire and no mast
 *    geometry anywhere in this module, and none should ever be added.
 *  - The corridor is not a constant-width slot: it holds the full Union throat
 *    east of York and tapers hard west of it (see `corridorAt` in data/grid.js),
 *    which is what leaves the CN Tower and the Rogers Centre standing on ground
 *    rather than on track. Every part of the structure here is driven off that
 *    function rather than off a fixed pair of z values.
 *  - The shed is a Bush-type train shed: a low steel roof sitting just above the
 *    platforms with a continuous smoke slot over every track, plus the modern
 *    glazed atrium raised over the centre bays.
 *
 * Exports TRACK_LANES and CORRIDOR_X so the train system can drive consists
 * along the same centrelines this module lays ballast on, rather than
 * re-deriving them and drifting out of alignment.
 */
import * as THREE from 'three';
import { CORRIDOR, UNDERPASSES, LEVELS, corridorAt } from '../data/grid.js';
import { getBuilding } from '../data/buildings.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';

/** Grid-east extent of the viaduct structure. */
export const CORRIDOR_X = Object.freeze({ west: -700, east: 420 });

const DECK = LEVELS.viaductDeck;       // 6.5, top of the deck slab
const SLAB = 2.0;                      // deck slab thickness
const SOFFIT = DECK - SLAB;            // 4.5 clearance over the roadways
const PLATFORM_Y = LEVELS.platform;    // 7.0

/** Track layout at Union: 7 pairs of tracks with an island platform between. */
const TRACK_CENTRE_Z = 128;
const PAIRS = 7;
const PAIR_GAP = 5.0;        // centre-to-centre within a pair
const PAIR_PITCH = 16.5;     // pair centre to pair centre (a platform fits between)
const GAUGE = 1.435;

/** Where the fan of tracks stops being parallel and starts converging. */
const THROAT_WEST = -300;
const THROAT_EAST = 260;
/** Ties are only laid across the stretch a viewer can actually stand near. */
const TIE_FROM = -520;
const TIE_TO = 300;

const PLATFORM_X0 = -250;
const PLATFORM_X1 = 20;
const PLATFORM_W = 9.5;

const UP = new THREE.Vector3(0, 1, 0);
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Write one instance as position + size + a yaw, so a single unit box serves all. */
function put(im, i, x, y, z, sx, sy, sz, rotY = 0) {
  _q.setFromAxisAngle(UP, rotY);
  im.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
}

function instanced(geo, mat, count, { shadow = false } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, count);
  im.castShadow = shadow;
  im.receiveShadow = shadow;
  return im;
}

function buildLanes() {
  const lanes = [];
  const span = (PAIRS - 1) * PAIR_PITCH;
  for (let p = 0; p < PAIRS; p++) {
    const centre = TRACK_CENTRE_Z - span / 2 + p * PAIR_PITCH;
    for (const side of [-1, 1]) {
      const z = centre + (side * PAIR_GAP) / 2;
      lanes.push({ id: `track-${String(lanes.length + 1).padStart(2, '0')}`, z, y: PLATFORM_Y });
    }
  }
  return lanes;
}

/**
 * Track centrelines through the station throat, north to south.
 * `y` is the railhead, which the trains module uses as its wheel datum.
 * @type {ReadonlyArray<{z:number, y:number, id:string}>}
 */
export const TRACK_LANES = Object.freeze(buildLanes().map(Object.freeze));

/** Island platform centrelines, derived from the lanes rather than re-guessed. */
const PLATFORM_Z = Array.from({ length: PAIRS - 1 }, (_, i) => {
  const a = TRACK_LANES[i * 2 + 1].z;
  const b = TRACK_LANES[i * 2 + 2].z;
  return (a + b) / 2;
});

/** Portal opening carries the roadway plus its sidewalks, not just the curb width. */
const portalWidth = (u) => u.width + 8;

/**
 * Map a lane's throat position into whatever width the corridor has at `x`, so
 * the fan collapses with the structure instead of spilling out of it west of
 * York. Keeping the ratio fixed also keeps the tracks in the same order.
 */
function laneAt(z, x) {
  const c = corridorAt(x);
  const t = (z - CORRIDOR.north) / (CORRIDOR.south - CORRIDOR.north);
  return c.north + t * (c.south - c.north);
}

/** East of the station the fan converges without the corridor itself narrowing. */
const pinchEast = (z) => TRACK_CENTRE_Z + (z - TRACK_CENTRE_Z) * 0.45;

/** Polyline of a single track: west throat, parallel middle, east throat. */
const trackKnots = (z) => [
  { x: CORRIDOR_X.west, z: laneAt(z, CORRIDOR_X.west) },
  { x: THROAT_WEST, z },
  { x: THROAT_EAST, z },
  { x: CORRIDOR_X.east, z: pinchEast(z) },
];

/** Structure is built in slices so it can follow the taper with flat boxes. */
const SLICE = 40;
function slices(a, b) {
  const n = Math.max(1, Math.round((b - a) / SLICE));
  return Array.from({ length: n }, (_, i) => {
    const x0 = a + ((b - a) / n) * i;
    const x1 = a + ((b - a) / n) * (i + 1);
    const c = corridorAt((x0 + x1) / 2);
    return { x: (x0 + x1) / 2, w: x1 - x0, z: (c.north + c.south) / 2, d: c.south - c.north, c };
  });
}

/** Recessed arch panel between the viaduct's pilasters. */
function archPanelGeometry(w, h, depth) {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 });
}

/** X ranges of solid viaduct fill, i.e. everything the portals do not cut out. */
function fillSpans() {
  const cuts = UNDERPASSES
    .map((u) => ({ a: u.x - portalWidth(u) / 2, b: u.x + portalWidth(u) / 2 }))
    .sort((p, q) => p.a - q.a);
  const spans = [];
  let cursor = CORRIDOR_X.west;
  for (const c of cuts) {
    if (c.a > cursor) spans.push({ a: cursor, b: c.a });
    cursor = Math.max(cursor, c.b);
  }
  if (cursor < CORRIDOR_X.east) spans.push({ a: cursor, b: CORRIDOR_X.east });
  return spans;
}

function buildViaduct() {
  const g = new THREE.Group();
  g.name = 'rail-viaduct';
  const spans = fillSpans();

  // Board-formed concrete fill between the portals, 0 -> soffit, sliced so the
  // west taper is followed rather than ignored.
  const fillSlices = spans.flatMap((s) => slices(s.a, s.b));
  const fill = instanced(UNIT, M.concrete(), fillSlices.length, { shadow: true });
  fillSlices.forEach((s, i) => put(fill, i, s.x, SOFFIT / 2, s.z, s.w + 0.05, SOFFIT, s.d));
  fill.instanceMatrix.needsUpdate = true;
  g.add(fill);

  // Continuous deck slab. It spans the portals, which is what makes them portals.
  const deckSlices = slices(CORRIDOR_X.west, CORRIDOR_X.east);
  const deck = instanced(UNIT, M.concrete(), deckSlices.length, { shadow: true });
  const parapets = instanced(UNIT, M.concretePlain(), deckSlices.length * 2, { shadow: true });
  let qi = 0;
  deckSlices.forEach((s, i) => {
    put(deck, i, s.x, DECK - SLAB / 2, s.z, s.w + 0.05, SLAB, s.d);
    // Parapets above the deck edge: the line you read the viaduct by from Front.
    put(parapets, qi++, s.x, DECK + 0.55, s.c.north, s.w + 0.05, 1.1, 0.55);
    put(parapets, qi++, s.x, DECK + 0.55, s.c.south, s.w + 0.05, 1.1, 0.55);
  });
  deck.instanceMatrix.needsUpdate = true;
  parapets.instanceMatrix.needsUpdate = true;
  g.add(deck, parapets);

  // Pier / arch rhythm on both long faces. One bay every 9 m, skipping the portals.
  const PITCH = 9.0;
  const PIER_W = 1.6;
  const bays = [];
  for (const s of spans) {
    const n = Math.floor((s.b - s.a) / PITCH);
    for (let i = 0; i < n; i++) bays.push(s.a + (s.b - s.a - n * PITCH) / 2 + PITCH * (i + 0.5));
  }
  const piers = instanced(UNIT, M.concrete(), bays.length * 2, { shadow: true });
  const panelGeo = archPanelGeometry(PITCH - PIER_W - 0.4, 3.6, 0.5);
  const panels = instanced(panelGeo, M.concretePlain(), bays.length * 2);
  let pi = 0;
  let ai = 0;
  for (const bx of bays) {
    const c = corridorAt(bx);
    for (const face of [-1, 1]) {
      const z = face < 0 ? c.north - 0.3 : c.south + 0.3;
      put(piers, pi++, bx - PITCH / 2, SOFFIT / 2, z, PIER_W, SOFFIT, 0.8);
      // panel extrudes along +Z, so the south face is turned to push into the fill
      const yaw = face < 0 ? 0 : Math.PI;
      const pz = face < 0 ? c.north - 0.45 : c.south + 0.45;
      panels.setMatrixAt(ai++, _m.compose(_p.set(bx, 0.5, pz), _q.setFromAxisAngle(UP, yaw), _s.set(1, 1, 1)));
    }
  }
  piers.count = pi;
  panels.count = ai;
  piers.instanceMatrix.needsUpdate = true;
  panels.instanceMatrix.needsUpdate = true;
  g.add(piers, panels);

  return g;
}

function buildUnderpass(u) {
  const g = new THREE.Group();
  g.name = `rail-underpass-${u.street}`;
  const w = portalWidth(u);
  const c = corridorAt(u.x);
  const depth = c.south - c.north;
  const midZ = (c.north + c.south) / 2;

  // Painted tunnel side walls, from roadway to soffit.
  const walls = instanced(UNIT, M.limestonePlain(), 2);
  put(walls, 0, u.x - w / 2 + 0.2, SOFFIT / 2, midZ, 0.4, SOFFIT, depth);
  put(walls, 1, u.x + w / 2 - 0.2, SOFFIT / 2, midZ, 0.4, SOFFIT, depth);
  walls.instanceMatrix.needsUpdate = true;
  walls.receiveShadow = true;
  g.add(walls);

  // Tunnel ceiling panel hung under the deck soffit.
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.14, depth), M.ceilingPanel());
  ceiling.position.set(u.x, SOFFIT - 0.07, midZ);
  g.add(ceiling);

  // Headwall band and jamb pilasters at both portal mouths.
  const heads = instanced(UNIT, M.concrete(), 2, { shadow: true });
  const jambs = instanced(UNIT, M.concrete(), 4, { shadow: true });
  let ji = 0;
  [c.north - 0.7, c.south + 0.7].forEach((z, k) => {
    put(heads, k, u.x, SOFFIT + 1.0, z, w + 3.4, 2.4, 1.4);
    for (const side of [-1, 1]) {
      put(jambs, ji++, u.x + side * (w / 2 + 0.9), SOFFIT / 2 + 0.2, z, 1.8, SOFFIT + 0.4, 1.4);
    }
  });
  heads.instanceMatrix.needsUpdate = true;
  jambs.instanceMatrix.needsUpdate = true;
  g.add(heads, jambs);

  // Ceiling fixtures down the tunnel centre.
  const lampCount = Math.floor(depth / 8);
  const lamps = instanced(UNIT, M.litInterior(0xffe7c2), lampCount);
  for (let i = 0; i < lampCount; i++) {
    put(lamps, i, u.x, SOFFIT - 0.24, c.north + 4 + i * 8, 0.9, 0.1, 1.5);
  }
  lamps.instanceMatrix.needsUpdate = true;
  g.add(lamps);

  // Clearance sign over each approach. Toronto posts these in metres.
  const signs = instanced(UNIT, M.signWhite(), 2);
  put(signs, 0, u.x, SOFFIT - 0.9, c.north - 1.5, 2.6, 1.0, 0.12);
  put(signs, 1, u.x, SOFFIT - 0.9, c.south + 1.5, 2.6, 1.0, 0.12);
  signs.instanceMatrix.needsUpdate = true;
  g.add(signs);

  return g;
}

function buildTracks() {
  const g = new THREE.Group();
  g.name = 'rail-tracks';

  const segs = [];
  for (const lane of TRACK_LANES) {
    const k = trackKnots(lane.z);
    for (let i = 0; i < k.length - 1; i++) segs.push([k[i], k[i + 1]]);
  }

  const ballast = instanced(UNIT, M.concretePlain(), segs.length);
  const rails = instanced(UNIT, M.steelDark(), segs.length * 2);
  let ri = 0;
  segs.forEach(([a, b], i) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dz, dx);
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    put(ballast, i, mx, DECK + 0.25, mz, len, 0.5, 4.6, yaw);
    const px = -dz / len;
    const pz = dx / len;
    for (const side of [-1, 1]) {
      const o = (side * GAUGE) / 2;
      put(rails, ri++, mx + px * o, PLATFORM_Y - 0.07, mz + pz * o, len, 0.16, 0.09, yaw);
    }
  });
  ballast.instanceMatrix.needsUpdate = true;
  rails.instanceMatrix.needsUpdate = true;
  g.add(ballast, rails);

  // Ties, only across the stretch anyone gets close to. 26 km of tie at full
  // corridor length buys nothing but instance count.
  const TIE_PITCH = 1.5;
  const maxTies = Math.ceil(((TIE_TO - TIE_FROM) / TIE_PITCH + 2) * TRACK_LANES.length);
  const ties = instanced(UNIT, M.bark(), maxTies);
  let ti = 0;
  for (const [a, b] of segs) {
    const lo = Math.max(TIE_FROM, Math.min(a.x, b.x));
    const hi = Math.min(TIE_TO, Math.max(a.x, b.x));
    if (hi <= lo) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const yaw = Math.atan2(-dz, dx);
    for (let x = lo; x <= hi && ti < maxTies; x += TIE_PITCH) {
      const t = (x - a.x) / dx;
      put(ties, ti++, x, DECK + 0.55, a.z + dz * t, 0.22, 0.2, 2.6, yaw);
    }
  }
  ties.count = ti;
  ties.instanceMatrix.needsUpdate = true;
  g.add(ties);

  return g;
}

function buildPlatforms() {
  const g = new THREE.Group();
  g.name = 'rail-platforms';
  const len = PLATFORM_X1 - PLATFORM_X0;
  const midX = (PLATFORM_X0 + PLATFORM_X1) / 2;
  const thick = PLATFORM_Y - DECK;

  const decks = instanced(UNIT, M.concretePlain(), PLATFORM_Z.length, { shadow: true });
  const tactile = instanced(UNIT, M.litInterior(0xd9b23a), PLATFORM_Z.length * 2);
  let si = 0;
  PLATFORM_Z.forEach((z, i) => {
    put(decks, i, midX, DECK + thick / 2, z, len, thick, PLATFORM_W);
    for (const side of [-1, 1]) {
      put(tactile, si++, midX, PLATFORM_Y + 0.01, z + (side * (PLATFORM_W - 0.7)) / 2, len, 0.03, 0.6);
    }
  });
  decks.instanceMatrix.needsUpdate = true;
  tactile.instanceMatrix.needsUpdate = true;
  g.add(decks, tactile);

  // The platforms run out past the east end of the shed, where the modern
  // stand-alone canopies take over.
  const shed = getBuilding('union-trainshed');
  const shedEast = shed.x + shed.w / 2;
  if (PLATFORM_X1 > shedEast + 6) {
    const cLen = PLATFORM_X1 - shedEast;
    const cMid = (shedEast + PLATFORM_X1) / 2;
    const posts = instanced(UNIT, M.steelWhite(), PLATFORM_Z.length * 4);
    const roofs = instanced(UNIT, M.steelWhite(), PLATFORM_Z.length, { shadow: true });
    let pi = 0;
    PLATFORM_Z.forEach((z, i) => {
      put(roofs, i, cMid, PLATFORM_Y + 4.1, z, cLen, 0.24, PLATFORM_W + 1.2);
      for (let k = 0; k < 4; k++) {
        put(posts, pi++, shedEast + (cLen / 4) * (k + 0.5), PLATFORM_Y + 2.05, z, 0.3, 4.1, 0.3);
      }
    });
    posts.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    g.add(posts, roofs);
  }
  return g;
}

function buildTrainShed() {
  const b = getBuilding('union-trainshed');
  const g = new THREE.Group();
  g.name = 'union-trainshed';
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2;
  const z1 = b.z + b.d / 2;
  const ROOF_Y = DECK + 8.5;        // Bush shed roof sits low, just over the cars
  const RIDGE_Y = DECK + b.height;  // the glazed atrium is what makes the 18 m
  const SLOT = 2.6;

  // Bush-type roof: continuous deck broken by a smoke slot over every track.
  const edges = [z0];
  for (const lane of TRACK_LANES) {
    if (lane.z < z0 || lane.z > z1) continue;
    edges.push(lane.z - SLOT / 2, lane.z + SLOT / 2);
  }
  edges.push(z1);
  const bands = [];
  for (let i = 0; i < edges.length; i += 2) {
    const w = edges[i + 1] - edges[i];
    if (w > 0.2) bands.push({ z: (edges[i] + edges[i + 1]) / 2, w });
  }
  const roof = instanced(UNIT, M.steelDark(), bands.length, { shadow: true });
  bands.forEach((s, i) => put(roof, i, b.x, ROOF_Y, s.z, b.w, 0.45, s.w));
  roof.instanceMatrix.needsUpdate = true;
  g.add(roof);

  // Upstands along each slot: the exhaust throat of a Bush shed.
  const slots = TRACK_LANES.filter((l) => l.z >= z0 && l.z <= z1);
  const upstands = instanced(UNIT, M.steelDark(), slots.length * 2);
  let ui = 0;
  for (const lane of slots) {
    for (const side of [-1, 1]) {
      put(upstands, ui++, b.x, ROOF_Y + 0.75, lane.z + (side * SLOT) / 2, b.w, 1.3, 0.18);
    }
  }
  upstands.instanceMatrix.needsUpdate = true;
  g.add(upstands);

  // Columns land on the platforms, never between the running rails.
  const COL_PITCH = 25;
  const cols = Math.floor(b.w / COL_PITCH);
  const columns = instanced(UNIT, M.steelDark(), cols * PLATFORM_Z.length, { shadow: true });
  let ci = 0;
  for (const z of PLATFORM_Z) {
    for (let i = 0; i < cols; i++) {
      put(columns, ci++, x0 + (b.w / cols) * (i + 0.5), (PLATFORM_Y + ROOF_Y) / 2, z,
        0.5, ROOF_Y - PLATFORM_Y, 0.5);
    }
  }
  columns.instanceMatrix.needsUpdate = true;
  g.add(columns);

  // Modern glazed atrium over the centre bays.
  const ax0 = b.x - 92;
  const ax1 = b.x + 92;
  const az0 = TRACK_CENTRE_Z - 23.5;
  const az1 = TRACK_CENTRE_Z + 23.5;
  const rise = RIDGE_Y - ROOF_Y;
  const half = (az1 - az0) / 2;
  const slope = Math.hypot(half, rise);
  const glassGeo = new THREE.PlaneGeometry(ax1 - ax0, slope);
  for (const side of [-1, 1]) {
    const pane = new THREE.Mesh(glassGeo, M.glazingClear());
    pane.rotation.order = 'YXZ';
    pane.rotation.y = Math.PI / 2;
    pane.rotation.x = side * Math.atan2(rise, half);
    pane.position.set(b.x, (ROOF_Y + RIDGE_Y) / 2, TRACK_CENTRE_Z + (side * half) / 2);
    g.add(pane);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(ax1 - ax0, 0.5, 0.6), M.steelWhite());
  ridge.position.set(b.x, RIDGE_Y, TRACK_CENTRE_Z);
  g.add(ridge);

  const TRUSS_PITCH = 9;
  const trussBays = Math.floor((ax1 - ax0) / TRUSS_PITCH) + 1;
  const trusses = instanced(UNIT, M.steelWhite(), trussBays * 2);
  let tri = 0;
  for (let i = 0; i < trussBays; i++) {
    const tx = ax0 + i * TRUSS_PITCH;
    for (const side of [-1, 1]) {
      const chord = new THREE.Object3D();
      chord.position.set(tx, (ROOF_Y + RIDGE_Y) / 2, TRACK_CENTRE_Z + (side * half) / 2);
      chord.rotation.set(side * -Math.atan2(rise, half), 0, 0);
      chord.scale.set(0.28, 0.4, slope);
      chord.updateMatrix();
      trusses.setMatrixAt(tri++, chord.matrix);
    }
  }
  trusses.instanceMatrix.needsUpdate = true;
  g.add(trusses);

  // Gable infill at each end of the atrium.
  const gable = new THREE.Shape();
  gable.moveTo(-half, 0);
  gable.lineTo(half, 0);
  gable.lineTo(0, rise);
  gable.closePath();
  const gableGeo = new THREE.ShapeGeometry(gable);
  for (const gx of [ax0, ax1]) {
    const mesh = new THREE.Mesh(gableGeo, M.glazingClear());
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(gx, ROOF_Y, TRACK_CENTRE_Z);
    g.add(mesh);
  }

  return g;
}

/** @param {import('../core/context.js').Context} _ctx */
export function build(_ctx) {
  const group = new THREE.Group();
  group.name = 'rail-corridor';

  const viaduct = buildViaduct();
  group.add(viaduct);
  register({
    id: 'rail-viaduct', name: 'Union Station rail viaduct', kind: 'infrastructure',
    object: viaduct, confidence: 'reference',
    source: '1927-31 viaduct grade separation; retaining wall rhythm from photography',
    note: 'Deck level, portal clearance and arch pitch are proportioned from imagery, not survey.',
    data: { west: CORRIDOR_X.west, east: CORRIDOR_X.east, deck: DECK, soffit: SOFFIT },
  });

  for (const u of UNDERPASSES) {
    const portal = buildUnderpass(u);
    group.add(portal);
    register({
      id: `rail-underpass-${u.street}`, name: u.note, kind: 'infrastructure',
      object: portal, confidence: 'reference',
      source: 'City of Toronto street network; Lower Simcoe tunnel opened 2009',
      note: u.street === 'lower-simcoe'
        ? 'Lower Simcoe only. Simcoe Street proper terminates at Front and does not cross the corridor.'
        : `Clearance modelled at ${SOFFIT.toFixed(1)} m to the deck soffit.`,
      data: { x: u.x, roadWidth: u.width, clearance: SOFFIT },
    });
  }

  const tracks = buildTracks();
  group.add(tracks);
  register({
    id: 'rail-tracks', name: 'Union Station track fan', kind: 'infrastructure',
    object: tracks, confidence: 'inferred',
    source: 'GO/VIA platform-track diagrams, track count and spacing from imagery',
    note: 'No catenary: the corridor is diesel-only (GO, VIA, UP Express). Throat convergence is stylised.',
    data: { lanes: TRACK_LANES.length, spacing: PAIR_GAP, electrified: false },
  });

  const platforms = buildPlatforms();
  group.add(platforms);
  register({
    id: 'rail-platforms', name: 'Union Station platforms', kind: 'infrastructure',
    object: platforms, confidence: 'inferred',
    source: 'Island platforms between each track pair, lengths from imagery',
    note: 'Platform edge tactile strips are modelled; individual platform numbering is not.',
    data: { count: PLATFORM_Z.length, level: PLATFORM_Y },
  });

  const shed = buildTrainShed();
  group.add(shed);
  const rec = getBuilding('union-trainshed');
  register({
    id: 'union-trainshed', name: rec.name, kind: 'infrastructure',
    object: shed, confidence: rec.confidence,
    source: 'Bush-type shed with 2010s glazed atrium over the centre bays',
    note: rec.note,
    data: { x: rec.x, z: rec.z, w: rec.w, d: rec.d, height: rec.height },
  });

  return group;
}
