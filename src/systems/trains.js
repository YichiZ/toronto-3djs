/**
 * Trains on the Union Station rail corridor.
 *
 * REAL-WORLD FACTS ENCODED
 *   - The corridor is NOT ELECTRIFIED. Every consist here is diesel: there is no
 *     catenary, no overhead wire, no pantograph and no third rail anywhere in
 *     this module. Wire would not clear the 1930 heritage train shed, and GO's
 *     electrification has never been built on this stretch.
 *   - GO Transit runs MP40PH-3C diesels (green and white) pulling bilevel
 *     coaches with the stepped roofline - tall centre section, dropped ends over
 *     the vestibules - and a cab car at the far end for push-pull working, so
 *     the locomotive stays at one end all day.
 *   - VIA Rail runs a blue-and-yellow locomotive with stainless-steel coaches.
 *   - UP Express is a short 2-3 car diesel multiple unit in green and grey-white.
 *   - Trains run through: they arrive from the east or west throat, dwell at a
 *     platform for a half minute to a minute and a half, and leave the way they
 *     were pointing.
 *
 * WHY IT IS BUILT THIS WAY
 *   One InstancedMesh per car type, so a nine-car GO set is one draw call for
 *   its coaches. Bogies are a single dark box per truck - at platform distance
 *   individual wheels are below the pixel budget and cost 20x the triangles.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEVELS } from '../data/grid.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';

const CRUISE = 16;      // m/s through the throat, ~58 km/h
const ACCEL = 0.42;
const DECEL = 0.45;
const DWELL = [30, 90];

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

const GO_GREEN = 0x006341;
const GO_WHITE = 0xeef0ec;
const VIA_BLUE = 0x1c3f78;
const VIA_YELLOW = 0xe8c33a;
const STAINLESS = 0xc3c8cc;
const UP_GREEN = 0x2f6b46;
const UP_GREY = 0xdfe3e0;
const DARKGLASS = 0x1e262c;
const TRUCK = 0x1a1c1f;

/** Two bogies. Y = 0 is top of rail, so the truck sits just above it. */
const bogies = (x) => [
  [3.7, 0.95, 2.9, -x, 0.52, 0, TRUCK],
  [3.7, 0.95, 2.9, x, 0.52, 0, TRUCK],
];

/** Cars are authored pointing +X with the leading end at +X. */
const CAR_TYPES = {
  'go-loco': {
    len: 21.9,
    parts: [
      [20.4, 2.5, 3.05, 0, 2.3, 0, GO_WHITE],
      [20.4, 0.5, 3.08, 0, 1.35, 0, GO_GREEN],
      [4.6, 1.15, 3.05, 7.6, 4.1, 0, GO_WHITE],       // cab
      [3.9, 0.5, 3.07, 7.6, 4.35, 0, DARKGLASS],
      [11.5, 0.85, 2.7, -4.0, 3.95, 0, 0x8f959b],     // hood / radiator
      [1.1, 2.4, 3.0, 10.4, 2.3, 0, GO_GREEN],        // nose
      ...bogies(7.2),
    ],
  },
  'go-bilevel': {
    len: 26.0,
    parts: [
      [17.8, 4.35, 3.05, 0, 2.5, 0, GO_WHITE],        // tall centre section
      [4.0, 3.2, 3.05, -10.9, 1.95, 0, GO_WHITE],     // dropped ends
      [4.0, 3.2, 3.05, 10.9, 1.95, 0, GO_WHITE],
      [25.6, 0.45, 3.07, 0, 1.05, 0, GO_GREEN],
      [24.6, 0.85, 3.08, 0, 1.75, 0, DARKGLASS],
      [17.2, 0.9, 3.08, 0, 3.95, 0, DARKGLASS],       // upper deck windows
      [17.4, 0.2, 2.9, 0, 4.72, 0, 0xdfe2df],
      ...bogies(9.4),
    ],
  },
  'go-cab': {
    len: 26.0,
    parts: [
      [16.0, 4.35, 3.05, -1.2, 2.5, 0, GO_WHITE],
      [4.0, 3.2, 3.05, -10.9, 1.95, 0, GO_WHITE],
      [5.6, 3.4, 3.05, 10.1, 2.05, 0, GO_WHITE],      // cab end, dropped roof
      [4.2, 0.55, 3.07, 10.4, 3.35, 0, DARKGLASS],
      [25.6, 0.45, 3.07, 0, 1.05, 0, GO_GREEN],
      [22.0, 0.85, 3.08, -1.5, 1.75, 0, DARKGLASS],
      [15.4, 0.9, 3.08, -1.2, 3.95, 0, DARKGLASS],
      [15.6, 0.2, 2.9, -1.2, 4.72, 0, 0xdfe2df],
      ...bogies(9.4),
    ],
  },
  'via-loco': {
    len: 17.4,
    parts: [
      [16.0, 2.9, 3.05, 0, 2.35, 0, VIA_BLUE],
      [16.0, 0.32, 3.08, 0, 1.35, 0, VIA_YELLOW],
      [4.4, 1.1, 3.05, 5.3, 4.2, 0, VIA_BLUE],
      [3.6, 0.5, 3.07, 5.4, 4.4, 0, DARKGLASS],
      [8.5, 0.8, 2.7, -3.4, 4.0, 0, 0x8f959b],
      [1.0, 2.6, 3.0, 8.2, 2.3, 0, VIA_YELLOW],
      ...bogies(5.6),
    ],
  },
  'via-coach': {
    len: 25.9,
    parts: [
      [25.4, 3.0, 3.05, 0, 2.35, 0, STAINLESS],
      [24.4, 0.95, 3.08, 0, 2.75, 0, DARKGLASS],
      [25.4, 0.28, 3.09, 0, 1.35, 0, VIA_YELLOW],
      [25.0, 0.22, 2.9, 0, 3.92, 0, 0xaeb4b8],
      ...bogies(9.3),
    ],
  },
  'up-dmu': {
    len: 25.9,
    parts: [
      [25.4, 1.5, 3.02, 0, 1.6, 0, UP_GREEN],
      [25.4, 1.5, 3.02, 0, 3.05, 0, UP_GREY],
      [24.2, 0.95, 3.05, 0, 2.95, 0, DARKGLASS],
      [25.0, 0.22, 2.88, 0, 3.9, 0, 0xc9cecb],
      [1.0, 2.7, 2.95, 12.9, 2.2, 0, UP_GREY],
      ...bogies(9.2),
    ],
  },
};

/** Slot -> consist. Fixed per slot so the instanced meshes can be sized once. */
const SLOTS = [
  { type: 'GO Transit bilevel', cars: ['go-loco', ...Array(8).fill('go-bilevel'), 'go-cab'] },
  { type: 'GO Transit bilevel', cars: ['go-loco', ...Array(7).fill('go-bilevel'), 'go-cab'] },
  { type: 'VIA Rail', cars: ['via-loco', ...Array(5).fill('via-coach')] },
  { type: 'VIA Rail', cars: ['via-loco', ...Array(6).fill('via-coach')] },
  { type: 'UP Express', cars: Array(3).fill('up-dmu') },
];

// ---------------------------------------------------------------------------
// corridor
// ---------------------------------------------------------------------------

/** TRACK_LANES is authored by railCorridor.js; accept the obvious shapes. */
function normaliseLanes(raw) {
  const out = [];
  for (const l of raw ?? []) {
    const z = typeof l === 'number' ? l : (l?.z ?? l?.centre ?? l?.center);
    const y = (typeof l === 'object' && Number.isFinite(l?.y)) ? l.y : LEVELS.platform;
    if (Number.isFinite(z)) out.push({ z, y });
  }
  return out;
}

function normaliseX(raw) {
  if (Array.isArray(raw) && raw.length >= 2 && raw.every(Number.isFinite)) {
    return { min: Math.min(...raw), max: Math.max(...raw) };
  }
  const min = raw?.min ?? raw?.west ?? raw?.from;
  const max = raw?.max ?? raw?.east ?? raw?.to;
  if (Number.isFinite(min) && Number.isFinite(max)) return { min: Math.min(min, max), max: Math.max(min, max) };
  return null;
}

const FALLBACK_LANES = Array.from({ length: 12 }, (_, i) => ({ z: 60 + i * 5.2, y: LEVELS.platform }));
const FALLBACK_X = { min: -700, max: 420 };

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

let trains = [];
let meshes = new Map();
let markerLights = null;
let tailLights = null;
let lanes = FALLBACK_LANES;
let span = FALLBACK_X;
const _d = new THREE.Object3D();

const rand = (a, b) => a + Math.random() * (b - a);

/** Pick a platform track nobody else is standing on. */
function freeLane(exclude) {
  const taken = new Set(trains.filter((t) => t !== exclude && t.state !== 'off').map((t) => t.lane));
  const free = lanes.map((_, i) => i).filter((i) => !taken.has(i));
  const pool = free.length ? free : lanes.map((_, i) => i);
  return pool[(Math.random() * pool.length) | 0];
}

function dispatch(t) {
  t.lane = freeLane(t);
  t.dir = Math.random() < 0.5 ? 1 : -1;
  // Stop with the consist alongside the platforms under the shed.
  t.stopAt = t.dir > 0 ? 0 : -260;
  t.head = t.dir > 0 ? span.min : span.max;
  t.speed = CRUISE;
  t.state = 'inbound';
  t.timer = 0;
}

function update(dt) {
  if (!trains.length) return;

  for (const t of trains) {
    if (t.state === 'off') {
      t.timer -= dt;
      if (t.timer <= 0) dispatch(t);
      continue;
    }

    if (t.state === 'inbound') {
      const d = (t.stopAt - t.head) * t.dir;
      const want = Math.min(CRUISE, Math.sqrt(2 * DECEL * Math.max(d, 0)));
      t.speed += Math.max(-DECEL * dt, Math.min(ACCEL * dt, want - t.speed));
      if (d <= 0.5 || t.speed < 0.15) {
        t.head = t.stopAt;
        t.speed = 0;
        t.state = 'dwell';
        t.timer = rand(DWELL[0], DWELL[1]);
      }
    } else if (t.state === 'dwell') {
      t.timer -= dt;
      if (t.timer <= 0) { t.state = 'outbound'; }
    } else {
      t.speed = Math.min(CRUISE, t.speed + ACCEL * dt);
      const tail = t.head - t.dir * t.length;
      if ((t.dir > 0 && tail > span.max) || (t.dir < 0 && tail < span.min)) {
        t.state = 'off';
        t.timer = rand(2, 9);
        t.speed = 0;
      }
    }

    t.head += t.dir * t.speed * dt;

    // Lay the cars out behind the leading end along a dead-straight track.
    const lane = lanes[t.lane];
    const yaw = t.dir > 0 ? 0 : Math.PI;
    let off = 0;
    for (const car of t.cars) {
      const cx = t.head - t.dir * (off + car.len / 2);
      _d.position.set(cx, lane.y, lane.z);
      _d.rotation.set(0, yaw, 0);
      _d.scale.setScalar(1);
      _d.updateMatrix();
      car.im.setMatrixAt(car.slot, _d.matrix);
      off += car.len + 0.6;
    }

    _d.position.set(t.head - t.dir * 0.2, lane.y + 3.4, lane.z);
    _d.rotation.set(0, t.dir > 0 ? 0 : Math.PI, 0);
    _d.updateMatrix();
    markerLights.setMatrixAt(t.index, _d.matrix);
    _d.position.set(t.head - t.dir * (t.length + 0.2), lane.y + 2.2, lane.z);
    _d.rotation.set(0, t.dir > 0 ? Math.PI : 0, 0);
    _d.updateMatrix();
    tailLights.setMatrixAt(t.index, _d.matrix);
  }

  for (const im of meshes.values()) im.instanceMatrix.needsUpdate = true;
  markerLights.instanceMatrix.needsUpdate = true;
  tailLights.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

function populate(group) {
  // Not from materials.js: liveries are baked per part as vertex colours, so
  // every car of every operator shares one material and one shader program.
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.48, metalness: 0.32,
  });
  material.name = 'rolling-stock';

  const need = new Map();
  for (const slot of SLOTS) for (const c of slot.cars) need.set(c, (need.get(c) ?? 0) + 1);

  const cursor = new Map();
  for (const [id, n] of need) {
    const type = CAR_TYPES[id];
    const im = new THREE.InstancedMesh(partsGeometry(type.parts), material, n);
    im.name = `train-${id}`;
    im.frustumCulled = false;
    im.castShadow = true;      // a nine-car set is a real shadow on the platforms
    im.receiveShadow = false;
    meshes.set(id, im);
    cursor.set(id, 0);
    group.add(im);
  }

  const lampGeo = new THREE.PlaneGeometry(1.6, 0.3);
  lampGeo.rotateY(Math.PI / 2);
  markerLights = new THREE.InstancedMesh(lampGeo, M.litInterior(0xfff6e0), SLOTS.length);
  tailLights = new THREE.InstancedMesh(lampGeo.clone(), M.litInterior(0xff3a2a), SLOTS.length);
  for (const im of [markerLights, tailLights]) {
    im.frustumCulled = false;
    im.userData.nightLight = true;
    im.userData.nightOnly = true;   // timeOfDay hides these through the day
    group.add(im);
  }
  markerLights.name = 'train-markers';
  tailLights.name = 'train-tails';

  trains = SLOTS.map((slot, index) => {
    const cars = slot.cars.map((id) => {
      const k = cursor.get(id);
      cursor.set(id, k + 1);
      return { im: meshes.get(id), slot: k, len: CAR_TYPES[id].len, id };
    });
    const length = cars.reduce((n, c) => n + c.len + 0.6, -0.6);
    const t = { index, type: slot.type, cars, length, state: 'off', timer: index * 6, lane: 0, dir: 1, head: 0, speed: 0, stopAt: 0 };
    return t;
  });
  // Stagger the opening: two trains already standing, the rest on their way in.
  trains.forEach((t, i) => {
    dispatch(t);
    if (i < 2) { t.head = t.stopAt; t.speed = 0; t.state = 'dwell'; t.timer = rand(10, 60); }
    else t.head = t.dir > 0 ? span.min + i * 40 : span.max - i * 40;
  });
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) {
  const group = new THREE.Group();
  group.name = 'trains';
  trains = [];
  meshes = new Map();

  // railCorridor.js is authored in parallel. A missing or half-written sibling
  // costs us the surveyed track centres, not the trains.
  import('../world/railCorridor.js')
    .then((m) => {
      const l = normaliseLanes(m.TRACK_LANES);
      if (l.length < 3) throw new Error('TRACK_LANES unusable');
      lanes = l;
      span = normaliseX(m.CORRIDOR_X) ?? FALLBACK_X;
    })
    .catch(() => {
      lanes = FALLBACK_LANES;
      span = FALLBACK_X;
      console.info('[trains] TRACK_LANES unavailable - synthesising 12 platform tracks');
    })
    .finally(() => populate(group));

  ctx.onFrame.push(update);
  group.userData.consists = consists;

  register({
    id: 'trains', name: 'Rail traffic', kind: 'system', object: group,
    confidence: 'inferred',
    source: 'GO / VIA / UP Express consist makeup and liveries from photographic proportion',
    note: 'Diesel only - no catenary, no pantographs, no overhead wire, because this corridor is not electrified. Track centres come from railCorridor.js; if that module is unavailable a synthetic 12-track fan is used instead. Trains run dead straight through the throat - no switch geometry, no curves.',
    data: { slots: SLOTS.length, cars: SLOTS.reduce((n, s) => n + s.cars.length, 0) },
  });
  return group;
}

/** Live summary of the active consists, for the HUD and the QA harness. */
export function consists() {
  return trains.map((t) => ({
    id: `consist-${t.index}`,
    type: t.type,
    cars: t.cars.length,
    traction: 'diesel',
    track: t.lane,
    trackZ: lanes[t.lane]?.z ?? null,
    state: t.state,
    speedKph: Math.round(t.speed * 3.6),
    dwellRemaining: t.state === 'dwell' ? Math.round(t.timer) : 0,
  }));
}
