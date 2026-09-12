/**
 * Street-level and PATH pedestrian crowd.
 *
 * REAL-WORLD FACTS ENCODED
 *   - Union Station moves ~300 000 people a day; the Front Street forecourt
 *     between York and Bay is the densest pedestrian ground in Canada, which is
 *     why that one sidewalk segment carries the heaviest edge weight here.
 *   - Bay Street north of Front is the second heaviest: the Union-to-financial
 *     -district commute walks it twice a day.
 *   - Lake Shore Boulevard under the Gardiner is a traffic sewer with almost no
 *     footfall; it gets a tenth of the forecourt's density.
 *   - The PATH concourse carries its own crowd one level down (LEVELS.path),
 *     and each of Union's three concourses its own (LEVELS.unionConcourse).
 *
 * WHY IT IS BUILT THIS WAY
 *   Every agent is one instance in one of five InstancedMeshes, so a 700-strong
 *   crowd costs five draw calls rather than seven hundred. Nobody is skinned:
 *   at eye height a walker reads from its heading, its bob and its silhouette,
 *   and a skeletal solve for 700 figures would eat the whole frame budget.
 *   Routing is a weighted random walk over a sidewalk graph derived from
 *   data/grid.js rather than a path search - the visible result (crowds thick
 *   where the weights are thick, thin where they are thin) is identical and it
 *   costs a single weighted pick per agent per intersection.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STREETS, LEVELS } from '../data/grid.js';
import { register } from '../core/registry.js';
import { clearance, SIDE_RATE } from './crowdPush.js';
import { buildStreetGraph } from './streetGraph.js';

const STREET_AGENTS = 720;
const PATH_AGENTS = 180;
const CONCOURSE_AGENTS = 90;

// Muted, high-value clothing tints. They multiply the baked part shading, so a
// bright tint yields a mid-tone coat and leaves the face plausible.
const CLOTHING = [
  0xf2e9dc, 0xd8e0ea, 0xe6d3d0, 0xdfe3d0, 0xe9dcc0, 0xc9d6e2,
  0xefe2ea, 0xd6cfc2, 0xf6f4f0, 0xe2c9a0, 0xcfd8d2, 0xe8dede,
];

const SKIN = 0xe8c9a8;
const TORSO = 0x8a8f96;
const LEG = 0x4a4e55;
const ARM = 0x7c8189;
const BAG = 0x6b5744;
const BIKE = 0x2a2d31;

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

/** Flat per-part colours baked into the mesh; the instance tint multiplies them. */
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

/** A ~1.78 m figure facing +Z: torso, head, two legs, two arms, plus extras. */
function figure({ scale = 1, coat = false, bag = false, bike = false } = {}) {
  const p = [];
  const torsoH = coat ? 0.88 : 0.62;
  const torsoY = coat ? 1.01 : 1.15;
  p.push([coat ? 0.46 : 0.42, torsoH, coat ? 0.28 : 0.24, 0, torsoY, 0, TORSO]);
  p.push([0.20, 0.24, 0.20, 0, 1.60, 0, SKIN]);
  p.push([0.15, 0.78, 0.17, -0.11, 0.39, 0, LEG]);
  p.push([0.15, 0.78, 0.17, 0.11, 0.39, 0, LEG]);
  p.push([0.11, 0.55, 0.12, -0.27, 1.15, 0, ARM]);
  p.push([0.11, 0.55, 0.12, 0.27, 1.15, 0, ARM]);
  if (bag) p.push([0.26, 0.30, 0.14, 0.30, 0.96, 0.02, BAG]);
  if (bike) {
    // Walked alongside, so the frame lies in the agent's own YZ plane.
    p.push([0.05, 0.66, 0.66, 0.78, 0.34, -0.5, BIKE]);
    p.push([0.05, 0.66, 0.66, 0.78, 0.34, 0.5, BIKE]);
    p.push([0.06, 0.42, 1.05, 0.78, 0.62, 0, BIKE]);
    p.push([0.34, 0.05, 0.06, 0.78, 0.95, 0.46, BIKE]);
  }
  if (scale === 1) return p;
  return p.map(([w, h, d, x, y, z, c]) =>
    [w * scale, h * scale, d * scale, x * scale, y * scale, z * scale, c]);
}

const ARCHETYPES = [
  { id: 'adult', share: 0.38, speed: [1.15, 1.5], opts: {} },
  { id: 'adult-bag', share: 0.22, speed: [1.1, 1.4], opts: { bag: true } },
  { id: 'coat', share: 0.18, speed: [1.05, 1.35], opts: { coat: true } },
  { id: 'child', share: 0.11, speed: [0.8, 1.1], opts: { scale: 0.72 } },
  { id: 'cyclist-walking', share: 0.11, speed: [0.9, 1.2], opts: { bike: true } },
];

/** Snap-and-link an arbitrary segment list (the PATH, a concourse) into the same structure. */
function buildSegmentGraph(segments, y = LEVELS.path + 0.05) {
  const byKey = new Map();
  const nodes = [];
  const edges = [];
  const node = (x, z) => {
    const key = `${Math.round(x / 2)},${Math.round(z / 2)}`;
    let n = byKey.get(key);
    if (!n) { n = { x, z, edges: [] }; byKey.set(key, n); nodes.push(n); }
    return n;
  };
  for (const s of segments) {
    const a = node(s.ax, s.az);
    const b = node(s.bx, s.bz);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1) continue;
    const e = { a, b, w: 1, cross: false, len, y };
    a.edges.push(e); b.edges.push(e); edges.push(e);
  }
  return { nodes, edges: edges.filter((e) => e.a.edges.length > 1 || e.b.edges.length > 1) };
}

/** PATH_SEGMENTS is authored by a sibling module; accept the obvious shapes. */
function normaliseSegments(raw) {
  const out = [];
  for (const s of raw ?? []) {
    const a = Array.isArray(s) ? s[0] : (s.a ?? s.from ?? s);
    const b = Array.isArray(s) ? s[1] : (s.b ?? s.to ?? s);
    const ax = Array.isArray(a) ? a[0] : (a?.x ?? s.x1);
    const az = Array.isArray(a) ? a[1] : (a?.z ?? s.z1);
    const bx = Array.isArray(b) ? b[0] : (b?.x ?? s.x2);
    const bz = Array.isArray(b) ? b[1] : (b?.z ?? s.z2);
    if ([ax, az, bx, bz].every(Number.isFinite)) out.push({ ax, az, bx, bz });
  }
  return out;
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

/** @type {Array<object>} */
let agents = [];
/** @type {THREE.InstancedMesh[]} */
let meshes = [];
let density = 1;
let bodyMaterial = null;
const _d = new THREE.Object3D();

function pickWeighted(list, weightOf, rnd) {
  let total = 0;
  for (const it of list) total += weightOf(it);
  let r = rnd * total;
  for (const it of list) { r -= weightOf(it); if (r <= 0) return it; }
  return list[list.length - 1];
}

/**
 * How far off the centreline a walker may take its lane, by the width of the
 * space. Everyone walked the centreline exactly, so a path produced a column
 * rather than a crowd (#112).
 */
const STREET_LANES = 1.1;   // sidewalks and the crossings
const BELOW_LANES = 2.0;    // PATH corridors and the concourse loops

function spawn(edges, im, slot, arch, lanes = STREET_LANES) {
  const e = pickWeighted(edges, (x) => x.w * x.len, Math.random());
  const rev = Math.random() < 0.5;
  return {
    im, slot,
    edge: e, rev, s: Math.random() * e.len,
    // Per walker as well as per archetype: one rate per type marched a whole
    // type in step down the same edge (#112).
    speed: (arch.speed[0] + Math.random() * (arch.speed[1] - arch.speed[0])) * (0.86 + Math.random() * 0.28),
    height: 0.94 + Math.random() * 0.12,
    phase: Math.random() * Math.PI * 2,
    wait: 0,
    side: 0,                      // metres off its line, sidestepping the walker (#38)
    // The part of the walkway this one keeps to, for the whole of its life, on
    // the side its direction of travel would keep to (#112).
    lane: (rev ? -1 : 1) * (0.15 + Math.random() * 0.85) * lanes,
  };
}

/** Walker eye height over the floor, to tell whether it is on this agent's level. */
const WALKER_EYE = 1.7;

/** @param {THREE.Vector3} [walker] the camera, to sidestep */
function stepAgent(a, dt, walker) {
  const e = a.edge;
  if (a.wait > 0) { a.wait -= dt; } else { a.s += a.speed * dt; a.phase += dt * a.speed * 5.2; }

  if (a.s >= e.len) {
    const arrived = a.rev ? e.a : e.b;
    const back = a.rev ? e.b : e.a;
    const options = arrived.edges.length > 1
      ? arrived.edges.filter((x) => x !== e)
      : arrived.edges;
    const next = pickWeighted(options, (x) => x.w, Math.random());
    a.edge = next;
    a.rev = next.b === arrived;
    a.s = 0;
    // Wait for the walk signal before stepping off the curb.
    if (next.cross) a.wait = 1.5 + Math.random() * 7;
    else if (arrived === back) a.wait = 0;
  }

  const f = a.edge.len > 0 ? a.s / a.edge.len : 0;
  const from = a.rev ? a.edge.b : a.edge.a;
  const to = a.rev ? a.edge.a : a.edge.b;
  let x = from.x + (to.x - from.x) * f;
  let z = from.z + (to.z - from.z) * f;
  const bob = a.wait > 0 ? 0 : Math.sin(a.phase) * 0.035;

  // Sidestep the walker when it is on this floor; ease back once past.
  const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  const dx = (to.x - from.x) / len;
  const dz = (to.z - from.z) / len;
  // Its own lane first, then the sidestep on top: the walker is dodged from
  // where this one actually walks, not from the centreline (#112, #38).
  const lx = x - dz * a.lane;
  const lz = z + dx * a.lane;
  const onFloor = walker && Math.abs(walker.y - WALKER_EYE - a.edge.y) < 1.5;
  const target = onFloor
    ? clearance({ px: lx, pz: lz }, { dx, dz }, { cx: walker.x, cz: walker.z }, a.slot % 2 ? 1 : -1)
    : 0;
  a.side += (target - a.side) * Math.min(1, dt * SIDE_RATE);
  x = lx - dz * a.side;
  z = lz + dx * a.side;

  _d.position.set(x, a.edge.y + bob, z);
  _d.rotation.set(0, Math.atan2(to.x - from.x, to.z - from.z), 0);
  _d.scale.setScalar(a.height);
  _d.updateMatrix();
  a.im.setMatrixAt(a.slot, _d.matrix);
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

function makeMeshes(group, counts, tag) {
  const out = [];
  ARCHETYPES.forEach((arch, i) => {
    const n = counts[i];
    if (!n) { out.push(null); return; }
    const im = new THREE.InstancedMesh(partsGeometry(figure(arch.opts)), bodyMaterial, n);
    im.name = `${tag}-${arch.id}`;
    im.frustumCulled = false;      // instances move every frame
    im.castShadow = false;         // 900 shadow casters is not in the budget
    im.receiveShadow = false;
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) im.setColorAt(k, c.setHex(CLOTHING[(Math.random() * CLOTHING.length) | 0]));
    im.instanceColor.needsUpdate = true;
    // The crowd does not collide with the player. Agents are instanced and
    // non-reactive: they walk through the camera, cannot step aside, and give no
    // feedback, so a solid crowd just stalls the walker at random - a measured
    // 14 s walk down the Union promenade covered 18 m one run and 40 m the next
    // purely on who happened to be standing there.
    im.userData.noCollide = true;
    group.add(im);
    out.push(im);
  });
  return out;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) {
  const group = new THREE.Group();
  group.name = 'pedestrians';

  // Not from materials.js: nothing there is vertex-coloured, and the crowd
  // needs per-part shading multiplied by a per-instance clothing tint.
  bodyMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.86, metalness: 0.0,
  });
  bodyMaterial.name = 'pedestrian-body';

  agents = [];
  const street = buildStreetGraph();

  const counts = ARCHETYPES.map((a) => Math.round(STREET_AGENTS * a.share));
  meshes = makeMeshes(group, counts, 'ped');
  ARCHETYPES.forEach((arch, i) => {
    for (let k = 0; k < counts[i]; k++) agents.push(spawn(street.edges, meshes[i], k, arch));
  });

  // The PATH module is authored in parallel; a missing or half-written sibling
  // must cost us the underground crowd, not the whole build.
  import('../interiors/path.js')
    .then((m) => {
      const segs = normaliseSegments(m.PATH_SEGMENTS);
      if (!segs.length) throw new Error('no usable PATH_SEGMENTS');
      const g = buildSegmentGraph(segs);
      if (!g.edges.length) throw new Error('PATH segments do not connect');
      const pathCounts = ARCHETYPES.map((a, i) => (i < 3 ? Math.round(PATH_AGENTS * a.share * 1.3) : 0));
      const pathMeshes = makeMeshes(group, pathCounts, 'ped-path');
      meshes = meshes.concat(pathMeshes.filter(Boolean));
      ARCHETYPES.forEach((arch, i) => {
        for (let k = 0; k < pathCounts[i]; k++) agents.push(spawn(g.edges, pathMeshes[i], k, arch, BELOW_LANES));
      });
    })
    .catch(() => console.info('[pedestrians] PATH_SEGMENTS unavailable - skipping the concourse crowd'));

  // Union's concourses were empty rooms (#70): one walking loop per room.
  import('../interiors/concourses.js')
    .then((m) => {
      const g = buildSegmentGraph(normaliseSegments(m.CONCOURSE_WALKS), LEVELS.unionConcourse + 0.05);
      if (!g.edges.length) throw new Error('no usable CONCOURSE_WALKS');
      const counts = ARCHETYPES.map((a, i) => (i < 3 ? Math.round(CONCOURSE_AGENTS * a.share * 1.3) : 0));
      const concMeshes = makeMeshes(group, counts, 'ped-concourse');
      meshes = meshes.concat(concMeshes.filter(Boolean));
      ARCHETYPES.forEach((arch, i) => {
        for (let k = 0; k < counts[i]; k++) agents.push(spawn(g.edges, concMeshes[i], k, arch, BELOW_LANES));
      });
    })
    .catch(() => console.info('[pedestrians] CONCOURSE_WALKS unavailable - skipping the Union concourse crowd'));

  ctx.onFrame.push((dt) => {
    for (const a of agents) {
      if (a.slot >= a.im.count) continue;   // trimmed away by setDensity
      stepAgent(a, dt, ctx.camera.position);
    }
    for (const im of meshes) if (im) im.instanceMatrix.needsUpdate = true;
  });

  group.userData.setDensity = setDensity;
  group.userData.population = population;
  /** The live agent list, for qa/crowd.e2e.mjs. */
  group.userData.agents = () => agents;
  // The HUD broadcasts its crowd slider rather than reaching into the module.
  if (typeof window !== 'undefined') {
    window.addEventListener('twin:crowd-density', (e) => setDensity(e.detail));
  }

  register({
    id: 'pedestrians', name: 'Pedestrian crowd', kind: 'system', object: group,
    confidence: 'inferred',
    source: 'sidewalk graph derived from data/grid.js; densities from observed footfall patterns',
    note: 'Procedural walk cycle only - agents bob and turn, they are not skinned. Crossing waits are random, not tied to the vehicle signal phase.',
    data: { streetAgents: STREET_AGENTS, drawCalls: meshes.filter(Boolean).length },
  });
  return group;
}

/** Scale the crowd for the HUD. 0 empties the streets, 1 is the authored density. */
export function setDensity(multiplier) {
  density = Math.max(0, Math.min(3, Number(multiplier) || 0));
  for (const im of meshes) {
    if (!im) continue;
    const max = im.instanceMatrix.count;
    im.count = Math.min(max, Math.round(max * density));
  }
  return density;
}

/** Agents currently being simulated and drawn. */
export function population() {
  let n = 0;
  for (const a of agents) if (a.slot < a.im.count) n++;
  return n;
}
