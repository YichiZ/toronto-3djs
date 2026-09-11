/**
 * The SkyWalk: the enclosed elevated pedestrian corridor from Union Station west
 * to the Metro Toronto Convention Centre North Building, the CN Tower and the
 * Rogers Centre.
 *
 * REAL-WORLD FACTS ENCODED HERE
 *  - It is a glazed tube, not an open bridge, and it flies ABOVE the rail
 *    corridor's north edge rather than beside it: the route sits at z = 62,
 *    inside CORRIDOR.north (48), so from Front Street you read glass crossing
 *    over live track. Deck level is LEVELS.skywalk (+9.0), between the rail
 *    deck (+6.5) and the Gardiner (+12.0).
 *  - It has to work from both sides. From outside it is a continuous glass tube
 *    on a rhythm of steel ribs; from inside (reference viewpoint 19) it is a
 *    lit, floored, handrailed corridor. Both are modelled.
 *  - Vertical connections: a stair/escalator enclosure at the station end and
 *    another at the MTCC end. Between them the tube is uninterrupted.
 *
 * SKYWALK_PATH is exported so the pedestrian system routes walkers along the
 * same centreline the floor slab is laid on.
 */
import * as THREE from 'three';
import { LEVELS } from '../data/grid.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';

const EAST_X = -250;   // the station's west end
const WEST_X = -640;   // MTCC North Building
const Z = 62;
const LENGTH = EAST_X - WEST_X;
const MID_X = (EAST_X + WEST_X) / 2;

const FLOOR_Y = LEVELS.skywalk;   // 9.0, the walking surface
const SLAB = 0.6;
const SPRING_Y = 12.2;            // where the glazing stops and the roof springs
const RISE = 1.2;                 // shallow crown over a 9 m span
const HALF = 4.5;
/** Deck width, for the minimap's plan. */
export const SKYWALK_WIDTH = HALF * 2;

// Circle through the two springings and the crown.
const ARC_R = (HALF * HALF + RISE * RISE) / (2 * RISE);
const ARC_CY = SPRING_Y + RISE - ARC_R;
const ARC_TH = Math.asin(HALF / ARC_R);

const UP = new THREE.Vector3(0, 1, 0);
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Deck centreline, east (station) to west (MTCC), sampled for the pedestrian
 * router. The real corridor is straight on this stretch.
 * @type {ReadonlyArray<{x:number, z:number}>}
 */
export const SKYWALK_PATH = Object.freeze(
  Array.from({ length: 7 }, (_, i) =>
    Object.freeze({ x: EAST_X - (LENGTH / 6) * i, z: Z }))
);

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

/** Curved roof shell, thick enough that the inside face reads as a ceiling. */
function roofShellGeometry() {
  const N = 18;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= N; i++) {
    const t = -ARC_TH + (2 * ARC_TH * i) / N;
    outer.push([(ARC_R + 0.16) * Math.sin(t), ARC_CY + (ARC_R + 0.16) * Math.cos(t)]);
    inner.push([ARC_R * Math.sin(t), ARC_CY + ARC_R * Math.cos(t)]);
  }
  const s = new THREE.Shape();
  s.moveTo(outer[0][0], outer[0][1]);
  for (const [u, v] of outer.slice(1)) s.lineTo(u, v);
  for (let i = inner.length - 1; i >= 0; i--) s.lineTo(inner[i][0], inner[i][1]);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: LENGTH, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); // section is drawn in XY; the run belongs on X
  geo.translate(WEST_X, 0, Z);
  return geo;
}

function buildTube() {
  const g = new THREE.Group();
  g.name = 'skywalk-tube';

  const floor = new THREE.Mesh(new THREE.BoxGeometry(LENGTH, SLAB, HALF * 2), M.pathFloor());
  floor.position.set(MID_X, FLOOR_Y - SLAB / 2, Z);
  floor.castShadow = true;
  floor.receiveShadow = true;
  g.add(floor);

  // Continuous glazing both sides, plus the spandrel/dado panel it sits on.
  const glassGeo = new THREE.PlaneGeometry(LENGTH, SPRING_Y - FLOOR_Y - 0.45);
  const dados = instanced(UNIT, M.steelWhite(), 2);
  for (const [k, side] of [-1, 1].entries()) {
    const pane = new THREE.Mesh(glassGeo, M.glazingClear());
    pane.rotation.y = Math.PI / 2;
    pane.position.set(MID_X, (FLOOR_Y + 0.45 + SPRING_Y) / 2, Z + side * HALF);
    g.add(pane);
    put(dados, k, MID_X, FLOOR_Y + 0.22, Z + side * (HALF - 0.06), LENGTH, 0.45, 0.16);
  }
  dados.instanceMatrix.needsUpdate = true;
  g.add(dados);

  const roof = new THREE.Mesh(roofShellGeometry(), M.steelWhite());
  roof.castShadow = true;
  g.add(roof);

  // Structural ribs on a 4.5 m bay: two mullion posts and the arch above them.
  const RIB_PITCH = 4.5;
  const ribs = Math.floor(LENGTH / RIB_PITCH) + 1;
  const posts = instanced(UNIT, M.steelDark(), ribs * 2);
  const archGeo = new THREE.TorusGeometry(ARC_R, 0.09, 6, 22, 2 * ARC_TH);
  archGeo.rotateZ(Math.PI / 2 - ARC_TH);
  archGeo.rotateY(Math.PI / 2);
  archGeo.translate(0, ARC_CY, 0);
  const arches = instanced(archGeo, M.steelDark(), ribs);
  let pi = 0;
  for (let i = 0; i < ribs; i++) {
    const x = WEST_X + i * RIB_PITCH;
    for (const side of [-1, 1]) {
      put(posts, pi++, x, (FLOOR_Y + SPRING_Y) / 2, Z + side * HALF, 0.2, SPRING_Y - FLOOR_Y, 0.28);
    }
    _q.identity();
    arches.setMatrixAt(i, _m.compose(_p.set(x, 0, Z), _q, _s.set(1, 1, 1)));
  }
  posts.instanceMatrix.needsUpdate = true;
  arches.instanceMatrix.needsUpdate = true;
  g.add(posts, arches);

  // --- interior: viewpoint 19 stands in here ---
  const RAIL_PITCH = 3;
  const balusterCount = Math.floor(LENGTH / RAIL_PITCH) + 1;
  const balusters = instanced(UNIT, M.steelWhite(), balusterCount * 2);
  const rails = instanced(new THREE.CylinderGeometry(0.045, 0.045, LENGTH, 8), M.steelWhite(), 2);
  let bi = 0;
  for (let i = 0; i < balusterCount; i++) {
    const x = WEST_X + i * RAIL_PITCH;
    for (const side of [-1, 1]) {
      put(balusters, bi++, x, FLOOR_Y + 0.5, Z + side * (HALF - 0.42), 0.05, 1.0, 0.05);
    }
  }
  for (const [k, side] of [-1, 1].entries()) {
    _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    rails.setMatrixAt(k, _m.compose(
      _p.set(MID_X, FLOOR_Y + 1.0, Z + side * (HALF - 0.42)), _q, _s.set(1, 1, 1)));
  }
  balusters.instanceMatrix.needsUpdate = true;
  rails.instanceMatrix.needsUpdate = true;
  g.add(balusters, rails);

  // Two continuous light strips run the length of the ceiling.
  const STRIP = 4;
  const stripPitch = 6;
  const stripCount = Math.floor(LENGTH / stripPitch);
  const strips = instanced(UNIT, M.litInterior(0xfff2dc), stripCount * 2);
  let si = 0;
  for (let i = 0; i < stripCount; i++) {
    for (const side of [-1, 1]) {
      put(strips, si++, WEST_X + stripPitch * (i + 0.5), SPRING_Y + 0.35, Z + side * 2.1, STRIP, 0.1, 0.34);
    }
  }
  strips.instanceMatrix.needsUpdate = true;
  g.add(strips);

  return g;
}

function buildSupports() {
  const g = new THREE.Group();
  g.name = 'skywalk-supports';
  const PITCH = 26;
  const count = Math.floor(LENGTH / PITCH) + 1;
  // Columns run all the way to grade. Over the corridor they are buried in the
  // viaduct fill, which is where they really bear; at the York and Lower Simcoe
  // portals they are visible standing in the underpass.
  const columns = instanced(UNIT, M.concrete(), count, { shadow: true });
  const heads = instanced(UNIT, M.concrete(), count);
  for (let i = 0; i < count; i++) {
    const x = WEST_X + i * PITCH;
    put(columns, i, x, (FLOOR_Y - SLAB) / 2, Z, 0.9, FLOOR_Y - SLAB, 0.9);
    put(heads, i, x, FLOOR_Y - SLAB - 0.25, Z, 1.5, 0.5, 6.0);
  }
  columns.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  g.add(columns, heads);
  return g;
}

/** Glazed stair + escalator enclosure dropping from the tube to grade. */
function buildVerticalCore(x, facing) {
  const g = new THREE.Group();
  const W = 11;
  const D = 13;
  const H = FLOOR_Y + 1.2;

  const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), M.glazingClear());
  shell.position.set(x, H / 2, Z + facing * 2);
  g.add(shell);

  const frameGeo = new THREE.BoxGeometry(0.3, H, 0.3);
  const frame = instanced(frameGeo, M.steelDark(), 4);
  let fi = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      _q.identity();
      frame.setMatrixAt(fi++, _m.compose(
        _p.set(x + (sx * W) / 2, H / 2, Z + facing * 2 + (sz * D) / 2), _q, _s.set(1, 1, 1)));
    }
  }
  frame.instanceMatrix.needsUpdate = true;
  g.add(frame);

  const landing = new THREE.Mesh(new THREE.BoxGeometry(W - 1, 0.4, D - 1), M.pathFloor());
  landing.position.set(x, 0.2, Z + facing * 2);
  g.add(landing);

  // Escalator truss beside a straight run of stair, both on the same rise.
  const run = D - 3;
  const slope = Math.atan2(FLOOR_Y, run);
  const esc = new THREE.Mesh(
    new THREE.BoxGeometry(Math.hypot(run, FLOOR_Y), 0.9, 3.2), M.steelDark());
  esc.rotation.z = facing * slope;
  esc.position.set(x - 3, FLOOR_Y / 2, Z + facing * 2);
  esc.rotation.y = Math.PI / 2;
  g.add(esc);

  const TREADS = 22;
  const treads = instanced(UNIT, M.concretePlain(), TREADS);
  for (let i = 0; i < TREADS; i++) {
    const t = (i + 0.5) / TREADS;
    put(treads, i, x + 3, FLOOR_Y * t, Z + facing * (2 + D / 2 - 1.5 - run * t), 3.0, 0.16, run / TREADS + 0.3);
  }
  treads.instanceMatrix.needsUpdate = true;
  g.add(treads);

  return g;
}

/** @param {import('../core/context.js').Context} _ctx */
export function build(_ctx) {
  const group = new THREE.Group();
  group.name = 'skywalk';

  const tube = buildTube();
  group.add(tube);
  register({
    // An enclosed room you walk inside, so 'interior': as 'infrastructure' the
    // HUD named the Metro Toronto Convention Centre beside it instead (#69).
    id: 'skywalk-tube', name: 'SkyWalk pedestrian corridor', kind: 'interior',
    object: tube, confidence: 'reference',
    source: 'Enclosed SkyWalk, Union Station to MTCC North / CN Tower / Rogers Centre',
    note: 'Route is modelled straight at z=62 above the rail corridor. Section (9 m wide, shallow curved roof) is proportioned from imagery.',
    data: { east: EAST_X, west: WEST_X, z: Z, level: FLOOR_Y, width: HALF * 2 },
  });

  const supports = buildSupports();
  group.add(supports);
  register({
    id: 'skywalk-supports', name: 'SkyWalk support columns', kind: 'infrastructure',
    object: supports, confidence: 'inferred',
    source: 'Column bays inferred from span depth and rib rhythm',
    note: 'Columns pass through the viaduct fill where the tube crosses the corridor; only the portal bays are visible.',
  });

  const east = buildVerticalCore(EAST_X, -1);
  group.add(east);
  register({
    id: 'skywalk-core-union', name: 'SkyWalk east vertical connection', kind: 'infrastructure',
    object: east, confidence: 'approximated',
    source: 'Stair and escalator enclosure toward the Union Station west end',
    note: 'Enclosure footprint is approximate; the real connection threads into the station concourse level.',
  });

  const west = buildVerticalCore(WEST_X, 1);
  group.add(west);
  register({
    id: 'skywalk-core-mtcc', name: 'SkyWalk MTCC vertical connection', kind: 'infrastructure',
    object: west, confidence: 'approximated',
    source: 'Stair and escalator enclosure at the Convention Centre North Building',
    note: 'Enclosure footprint is approximate.',
  });

  return group;
}
