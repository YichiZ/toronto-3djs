/**
 * Road traffic on the real roadways.
 *
 * REAL-WORLD FACTS ENCODED
 *   - Lanes are laid on the roadway width from data/grid.js (`road`), never the
 *     corridor width, so nothing drives on a sidewalk.
 *   - Right-hand traffic: heading grid-north (-Z) the right-hand side is grid
 *     east (+X), so northbound lanes sit east of the centreline and eastbound
 *     lanes sit south of it.
 *   - Wellington Street West is one-way eastbound (`oneWay`, `flow: 1`).
 *   - Bay, York, Yonge and Lower Simcoe pass UNDER the rail viaduct and Lake
 *     Shore Boulevard passes UNDER the Gardiner deck: road traffic stays at
 *     y = 0 for the whole length of those streets, the structure goes over it.
 *   - Taxis queue in the Union Station lay-by on the south side of Front.
 *   - NO STREETCARS AT STREET LEVEL EXCEPT ON KING. Streetcars reach Union
 *     below grade through the Bay Street tunnel into the Union Loop; there is
 *     no surface track on Front. King Street is the transit priority corridor
 *     and is the only street here that carries a Flexity - and because a
 *     streetcar is bound to a King lane object, it cannot leave King.
 *
 * WHY IT IS BUILT THIS WAY
 *   One InstancedMesh per vehicle type, one shared vertex-coloured material, and
 *   two instanced light quads for the whole fleet. Signals are a per-street
 *   phase lookup on a 25 s cycle, not per-vehicle pathfinding; queueing is a
 *   leader-follower gap inside a lane whose vehicle list is kept in order (no
 *   overtaking), which is what stops a red light from stacking ten cars into the
 *   same square metre.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STREETS, INTERSECTIONS } from '../data/grid.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';

/** Signal cycle: ~12 s of green each way with an all-red between. */
const CYCLE = 25;
const EW_GREEN = [0, 11.5];
const NS_GREEN = [13, 24.5];

const ACCEL = 2.2;      // m/s^2, unhurried city acceleration
const DECEL = 3.4;      // m/s^2, comfortable braking
const GAP = 1.8;        // m of clear air kept behind the vehicle ahead

/** One vehicle per (spacing / weight) metres of lane. */
const SPACING = 200;
const VEH_WEIGHT = Object.freeze({
  lakeshore: 1.5, 'front-w': 1.0, 'front-e': 0.9, bay: 1.1, york: 1.0,
  yonge: 0.8, church: 0.5, wellington: 0.7, king: 0.6, bremner: 0.6,
  'lower-simcoe': 0.5, rees: 0.3, john: 0.5,
});

const BODY_TINTS = [
  0xf2f2f0, 0xd8dade, 0x9aa0a6, 0x4b5158, 0x2b3138, 0x8ca3b8,
  0xb5c2c9, 0x7d4a44, 0x3f5a48, 0xe4e0d6,
];

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** @param {Array<[number,number,number,number,number,number,number]>} parts w,h,d,x,y,z,colour */
function partsGeometry(parts) {
  const geos = parts.map(([w, h, d, x, y, z, c]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return paint(g, c);
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

const TYRE = 0x1c1e21;
const GLASS = 0x223038;

/** Four (or six) flat wheel boxes. Wheels are never round here - nobody looks. */
function wheels(xs, halfTrack, dia, colour = TYRE) {
  const out = [];
  for (const x of xs) {
    out.push([dia, dia, 0.22, x, dia / 2, -halfTrack, colour]);
    out.push([dia, dia, 0.22, x, dia / 2, halfTrack, colour]);
  }
  return out;
}

/** All bodies are authored pointing +X and are yawed into their heading. */
const TYPES = [
  {
    id: 'sedan', len: 4.5, cruise: [11, 14], tinted: true, share: 0.34,
    parts: [
      [4.4, 0.62, 1.78, 0, 0.74, 0, 0xffffff],
      [2.3, 0.56, 1.66, -0.15, 1.30, 0, 0xffffff],
      [2.1, 0.34, 1.68, -0.15, 1.34, 0, GLASS],
      ...wheels([1.35, -1.35], 0.82, 0.62),
    ],
  },
  {
    id: 'suv', len: 5.0, cruise: [10.5, 13.5], tinted: true, share: 0.2,
    parts: [
      [4.9, 0.9, 1.92, 0, 0.95, 0, 0xffffff],
      [3.0, 0.72, 1.84, -0.3, 1.72, 0, 0xffffff],
      [2.7, 0.42, 1.86, -0.3, 1.76, 0, GLASS],
      ...wheels([1.5, -1.5], 0.88, 0.74),
    ],
  },
  {
    id: 'taxi', len: 4.6, cruise: [10, 13.5], tinted: false, share: 0.12,
    parts: [
      [4.5, 0.64, 1.80, 0, 0.76, 0, 0xe8e4dc],
      [2.4, 0.58, 1.68, -0.15, 1.34, 0, 0xe8e4dc],
      [2.2, 0.34, 1.70, -0.15, 1.38, 0, GLASS],
      [3.4, 0.26, 1.82, 0, 0.62, 0, 0xef8b23],       // Beck-style body stripe
      [0.78, 0.24, 0.34, -0.1, 1.75, 0, 0xf2c33c],   // roof sign
      ...wheels([1.4, -1.4], 0.82, 0.62),
    ],
  },
  {
    id: 'van', len: 6.1, cruise: [9.5, 12], tinted: true, share: 0.1,
    parts: [
      [4.3, 2.05, 2.12, -0.75, 1.42, 0, 0xffffff],
      [1.9, 1.35, 2.05, 2.05, 1.05, 0, 0xffffff],
      [1.5, 0.5, 2.07, 2.15, 1.5, 0, GLASS],
      ...wheels([2.0, -1.6], 0.92, 0.78),
    ],
  },
  {
    id: 'ttc-bus', len: 12.6, cruise: [8.5, 11], tinted: false, share: 0.08,
    parts: [
      [12.5, 0.6, 2.56, 0, 0.78, 0, 0x9aa0a6],       // grey skirt
      [12.5, 1.45, 2.56, 0, 1.82, 0, 0xd4302a],      // TTC red
      [11.6, 0.86, 2.60, 0, 2.18, 0, GLASS],
      [12.1, 0.22, 2.44, 0, 2.66, 0, 0xe8e6e0],
      ...wheels([4.6, -3.4, -4.6], 1.24, 1.02),
    ],
  },
  {
    id: 'go-bus', len: 12.6, cruise: [8.5, 11], tinted: false, share: 0.05,
    parts: [
      [12.5, 1.9, 2.56, 0, 1.45, 0, 0xf1f1ee],       // GO white
      [12.5, 0.42, 2.58, 0, 1.02, 0, 0x006341],      // GO green band
      [11.8, 0.8, 2.60, 0, 1.95, 0, GLASS],
      [12.1, 1.55, 2.50, 0, 3.30, 0, 0xf1f1ee],      // upper deck
      [11.4, 0.78, 2.54, 0, 3.42, 0, GLASS],
      [12.0, 0.2, 2.42, 0, 4.16, 0, 0xdfe2df],
      ...wheels([4.6, -3.4, -4.6], 1.24, 1.02),
    ],
  },
  {
    id: 'bicycle', len: 1.9, cruise: [4.5, 6.5], tinted: true, share: 0.11,
    parts: [
      [0.7, 0.7, 0.05, 0.6, 0.35, 0, 0x24272b],
      [0.7, 0.7, 0.05, -0.6, 0.35, 0, 0x24272b],
      [1.15, 0.32, 0.06, 0, 0.62, 0, 0x3a4046],
      [0.34, 0.58, 0.4, -0.1, 1.16, 0, 0xffffff],    // rider torso, takes the tint
      [0.2, 0.22, 0.2, -0.05, 1.55, 0, 0xe8c9a8],
    ],
  },
  {
    // Flexity Outlook, 30.2 m. KING STREET ONLY - see the file header.
    id: 'streetcar', len: 30.2, cruise: [7, 9.5], tinted: false, share: 0,
    parts: [
      [29.6, 0.62, 2.54, 0, 0.72, 0, 0x8f959b],
      [29.6, 1.5, 2.54, 0, 1.8, 0, 0xc4302a],
      [28.4, 0.92, 2.58, 0, 2.28, 0, GLASS],
      [29.2, 0.22, 2.42, 0, 2.78, 0, 0xd8d5cf],
      [2.8, 0.72, 2.3, -11, 0.4, 0, 0x1f2226],
      [2.8, 0.72, 2.3, 0, 0.4, 0, 0x1f2226],
      [2.8, 0.72, 2.3, 11, 0.4, 0, 0x1f2226],
    ],
  },
];

const typeIndex = Object.fromEntries(TYPES.map((t, i) => [t.id, i]));

/** Widest half-width of a body, wheels included - the footprint the walker feels. */
const halfWidthOf = (type) => Math.max(...type.parts.map(([, , d, , , z]) => Math.abs(z) + d / 2));

// ---------------------------------------------------------------------------
// lanes
// ---------------------------------------------------------------------------

/** Signalised crossings on a street, with the cross street's half roadway. */
function signalsOn(street) {
  const out = [];
  for (const i of INTERSECTIONS) {
    const onIt = street.axis === 'ew' ? i.z === street.z : i.x === street.x;
    if (!onIt) continue;
    const coord = street.axis === 'ew' ? i.x : i.z;
    if (coord < Math.min(street.from, street.to) || coord > Math.max(street.from, street.to)) continue;
    const cross = STREETS.find((s) => (street.axis === 'ew' ? s.axis === 'ns' && s.x === i.x : s.axis === 'ew' && s.z === i.z));
    out.push({ coord, half: cross ? cross.road / 2 : 8 });
  }
  return out;
}

function lanesFor(street) {
  const n = Math.max(1, street.lanes);
  const laneW = street.road / n;
  const lo = Math.min(street.from, street.to);
  const hi = Math.max(street.from, street.to);
  const len = hi - lo;
  const sig = signalsOn(street);
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * laneW;
    // Right-hand traffic. For an east-west street the +Z (grid south) half runs
    // eastbound; for a north-south street the +X (grid east) half runs north.
    let dir;
    if (street.oneWay) dir = street.axis === 'ew' ? (street.flow ?? 1) : (street.flow ?? -1);
    else dir = street.axis === 'ew' ? (off >= 0 ? 1 : -1) : (off >= 0 ? -1 : 1);

    const lane = {
      street, axis: street.axis, cross: (street.axis === 'ew' ? street.z : street.x) + off,
      dir, lo, hi, len, vehicles: [],
      signals: sig
        .map((s) => ({ s: dir > 0 ? s.coord - lo : hi - s.coord, half: s.half }))
        .filter((s) => s.s > 5 && s.s < len - 5)
        .sort((a, b) => a.s - b.s),
    };
    out.push(lane);
  }
  return out;
}

/** World position of a lane parameter. Always y = 0: underpasses go over us. */
function laneXZ(lane, s) {
  const along = lane.dir > 0 ? lane.lo + s : lane.hi - s;
  return lane.axis === 'ew' ? { x: along, z: lane.cross } : { x: lane.cross, z: along };
}

function laneHeading(lane) {
  return lane.axis === 'ew' ? { dx: lane.dir, dz: 0 } : { dx: 0, dz: lane.dir };
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

let vehicles = [];
let lanes = [];
let meshes = [];
let headlights = null;
let taillights = null;
let density = 1;
const _d = new THREE.Object3D();

function pickType(street, rnd) {
  if (street.id === 'king' && rnd < 0.14) return typeIndex.streetcar;
  const busOk = ['front-w', 'front-e', 'bay', 'yonge', 'king', 'bremner', 'york', 'lakeshore'].includes(street.id);
  let r = rnd;
  let acc = 0;
  for (let i = 0; i < TYPES.length; i++) {
    const t = TYPES[i];
    if (!t.share) continue;
    if (!busOk && (t.id === 'ttc-bus' || t.id === 'go-bus')) continue;
    acc += t.share;
    if (r <= acc) return i;
  }
  return typeIndex.sedan;
}

function update(dt, elapsed) {
  const phase = elapsed % CYCLE;
  const ewGreen = phase >= EW_GREEN[0] && phase < EW_GREEN[1];
  const nsGreen = phase >= NS_GREEN[0] && phase < NS_GREEN[1];

  for (const lane of lanes) {
    const green = lane.axis === 'ew' ? ewGreen : nsGreen;
    const list = lane.vehicles;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.slot >= v.im.count) continue;

      // Leader gap. The list never reorders (no overtaking), so the vehicle
      // ahead is simply the next index, wrapping around the loop.
      let gap = Infinity;
      if (list.length > 1) {
        const lead = list[(i + 1) % list.length];
        const ls = i + 1 === list.length ? lead.s + lane.len : lead.s;
        gap = ls - v.s - lead.half - v.half - GAP;
      }

      let stop = Infinity;
      const sig = lane.signals[v.sig];
      if (sig) {
        if (v.s > sig.s) v.sig = Math.min(v.sig + 1, lane.signals.length - 1);
        const d = sig.s - sig.half - 2.5 - v.half - v.s;
        if (!green && d > 0.15) stop = d;
      }

      const clear = Math.max(0, Math.min(gap, stop));
      const target = clear === Infinity ? v.cruise : Math.min(v.cruise, Math.sqrt(2 * DECEL * clear));
      const want = clear < 0.2 ? 0 : target;
      v.speed += Math.max(-DECEL * 2 * dt, Math.min(ACCEL * dt, want - v.speed));
      if (v.speed < 0) v.speed = 0;
      v.s += v.speed * dt;
    }

    // Drain every vehicle that passed the end this step, not just one. On a long
    // frame - an interior streaming hitch, or a backgrounded tab resuming with dt
    // at the 0.1 s ceiling - two cars on a short lane like Rees can both overrun,
    // and the one left behind would be extrapolated off the end of the roadway.
    for (let guard = 0; guard < list.length; guard++) {
      const last = list[list.length - 1];
      if (!last || last.s <= lane.len) break;
      last.s -= lane.len;
      last.sig = 0;
      list.pop();
      list.unshift(last);
    }
  }

  for (const v of vehicles) {
    if (v.slot >= v.im.count) continue;
    const p = v.parked ?? laneXZ(v.lane, v.s);
    const h = v.parked ? v.heading : laneHeading(v.lane);
    const yaw = Math.atan2(-h.dz, h.dx);
    _d.position.set(p.x, 0, p.z);
    _d.rotation.set(0, yaw, 0);
    _d.scale.setScalar(1);
    _d.updateMatrix();
    v.im.setMatrixAt(v.slot, _d.matrix);

    _d.position.set(p.x + h.dx * v.half, 0.62, p.z + h.dz * v.half);
    _d.updateMatrix();
    headlights.setMatrixAt(v.index, _d.matrix);
    _d.position.set(p.x - h.dx * v.half, 0.7, p.z - h.dz * v.half);
    _d.rotation.set(0, yaw + Math.PI, 0);
    _d.updateMatrix();
    taillights.setMatrixAt(v.index, _d.matrix);
  }

  for (const im of meshes) if (im) im.instanceMatrix.needsUpdate = true;
  headlights.instanceMatrix.needsUpdate = true;
  taillights.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) {
  const group = new THREE.Group();
  group.name = 'vehicles';

  // Not from materials.js: the fleet needs baked per-part livery (vertex
  // colours) multiplied by a per-instance body colour. One material, all types.
  const bodyMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.42, metalness: 0.25,
  });
  bodyMaterial.name = 'vehicle-body';

  vehicles = [];
  lanes = [];
  meshes = [];
  density = 1;

  // Pass 1: decide every vehicle so the instanced meshes can be sized exactly.
  const planned = TYPES.map(() => []);
  const parkedTaxis = [];

  // Union Station taxi lay-by, south side of Front west of Bay.
  for (let i = 0; i < 7; i++) {
    parkedTaxis.push({ x: -60 - i * 6.4, z: 13.6 });
  }

  for (const street of STREETS) {
    const weight = VEH_WEIGHT[street.id] ?? 0.5;
    for (const lane of lanesFor(street)) {
      lanes.push(lane);
      const n = Math.max(1, Math.round((lane.len * weight) / SPACING));
      const step = lane.len / n;
      for (let k = 0; k < n; k++) {
        // Guarantee one Flexity per King lane - the 504/508 headway is minutes,
        // and a King Street with no streetcar on it would be the wrong city.
        const t = (street.id === 'king' && k === 0) ? typeIndex.streetcar : pickType(street, Math.random());
        const type = TYPES[t];
        planned[t].push({
          lane, s: k * step + Math.random() * step * 0.5,
          cruise: type.cruise[0] + Math.random() * (type.cruise[1] - type.cruise[0]),
          half: type.len / 2, halfWidth: halfWidthOf(type), speed: type.cruise[0], sig: 0,
          // Streetcars and trains are out of scope for the walker push (#6).
          pushes: type.id !== 'streetcar',
        });
      }
    }
  }
  planned[typeIndex.taxi].unshift(...parkedTaxis.map((p) => ({ parked: p, heading: { dx: 1, dz: 0 }, half: TYPES[typeIndex.taxi].len / 2 })));

  const colour = new THREE.Color();
  TYPES.forEach((type, ti) => {
    const list = planned[ti];
    if (!list.length) { meshes.push(null); return; }
    const im = new THREE.InstancedMesh(partsGeometry(type.parts), bodyMaterial, list.length);
    im.name = `vehicle-${type.id}`;
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = false;
    for (let k = 0; k < list.length; k++) {
      // White leaves the baked livery alone; only private cars vary.
      im.setColorAt(k, type.tinted ? colour.setHex(BODY_TINTS[(Math.random() * BODY_TINTS.length) | 0]) : colour.setHex(0xffffff));
    }
    im.instanceColor.needsUpdate = true;
    group.add(im);
    meshes.push(im);

    list.forEach((v, k) => {
      v.im = im;
      v.slot = k;
      v.index = vehicles.length;
      vehicles.push(v);
      if (v.lane) v.lane.vehicles.push(v);
    });
  });

  for (const lane of lanes) lane.vehicles.sort((a, b) => a.s - b.s);

  // Lights are their own instanced quads so the time-of-day system can switch
  // the whole fleet in one place.
  const lampGeo = new THREE.PlaneGeometry(1.0, 0.16);
  lampGeo.rotateY(Math.PI / 2);
  headlights = new THREE.InstancedMesh(lampGeo, M.litInterior(0xfff3d0), vehicles.length);
  taillights = new THREE.InstancedMesh(lampGeo.clone(), M.litInterior(0xff4433), vehicles.length);
  for (const im of [headlights, taillights]) {
    im.frustumCulled = false;
    im.userData.nightLight = true;
    im.userData.nightOnly = true;   // timeOfDay hides these through the day
    group.add(im);
  }
  headlights.name = 'vehicle-headlights';
  taillights.name = 'vehicle-taillights';

  ctx.onFrame.push(update);

  group.userData.setDensity = setDensity;
  group.userData.count = count;
  group.userData.nearby = nearby;
  // Same slider as the crowd: emptying the sidewalks while the traffic stays
  // bumper to bumper reads as a bug, not as a setting.
  if (typeof window !== 'undefined') {
    window.addEventListener('twin:crowd-density', (e) => setDensity(e.detail));
  }

  register({
    id: 'vehicles', name: 'Road traffic', kind: 'system', object: group,
    confidence: 'inferred',
    source: 'lane geometry from data/grid.js roadway widths; fleet mix from observed downtown traffic',
    note: 'No surface streetcar anywhere except King Street, which is the real transit priority corridor; streetcars are bound to a King lane and cannot leave it. Signals are a fixed 25 s two-phase cycle, not the real adaptive timings, and vehicles do not turn - each stays in its lane.',
    data: { vehicles: vehicles.length, lanes: lanes.length, parkedTaxis: parkedTaxis.length },
  });
  return group;
}

/** Scale the fleet for the HUD. 0 clears the roads, 1 is the authored density. */
export function setDensity(multiplier) {
  density = Math.max(0, Math.min(3, Number(multiplier) || 0));
  // Reachable before build() has run on this module instance: a consumer that
  // imports by a different specifier (an HMR query, a QA harness, a second
  // bundle) gets a fresh instance whose meshes are still null.
  if (!headlights || !taillights) return density;
  for (const im of meshes) {
    if (!im) continue;
    const max = im.instanceMatrix.count;
    im.count = Math.min(max, Math.round(max * density));
  }
  // A hidden vehicle must not leave its headlights burning in mid-air.
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const v of vehicles) {
    if (v.slot >= v.im.count) {
      headlights.setMatrixAt(v.index, zero);
      taillights.setMatrixAt(v.index, zero);
    }
  }
  headlights.instanceMatrix.needsUpdate = true;
  taillights.instanceMatrix.needsUpdate = true;
  return density;
}

/**
 * Every moving vehicle currently drawn whose centre is within `r` metres of
 * (x, z), handed to `fn` as a pose that is REUSED between calls - read it,
 * don't keep it.
 *
 * This is what the walker gets instead of a raycast: vehicles are not in the
 * collision index on purpose (#6), so controls.js does a flat 2D test against
 * the lane position and heading already computed here.
 *
 * ponytail: a linear scan of the fleet (a few hundred), not a spatial index.
 * The fleet is already walked once per frame to write its matrices.
 */
const _pose = { x: 0, z: 0, dx: 0, dz: 0, half: 0, halfWidth: 0 };
export function nearby(x, z, r, fn) {
  for (const v of vehicles) {
    if (!v.lane || !v.pushes || v.slot >= v.im.count) continue;   // parked taxis and the Flexity sit this out
    const p = laneXZ(v.lane, v.s);
    const dx = p.x - x;
    const dz = p.z - z;
    const reach = r + v.half;
    if (dx * dx + dz * dz > reach * reach) continue;
    const h = laneHeading(v.lane);
    _pose.x = p.x; _pose.z = p.z;
    _pose.dx = h.dx; _pose.dz = h.dz;
    _pose.half = v.half; _pose.halfWidth = v.halfWidth;
    fn(_pose);
  }
}

/** Vehicles currently drawn and simulated. */
export function count() {
  let n = 0;
  for (const v of vehicles) if (v.slot < v.im.count) n++;
  return n;
}
