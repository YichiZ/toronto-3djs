/**
 * John Street Roundhouse, 255 Bremner Boulevard (1929, Canadian Pacific).
 *
 * A roundhouse is not a building with a curved wall - it is a machine whose
 * plan is dictated by a turntable. Every stall points at the turntable's
 * centre, every track radiates from it, and the arc of bays is exactly as long
 * as the number of stalls times the angle a locomotive needs. So this module is
 * built the same way round: the turntable centre is the origin, and the 32
 * bays, their doors, and the radiating tracks are all placed as functions of an
 * angle about it. Get the centre right and everything else falls into place.
 *
 * Real figures encoded here:
 *   32 stalls in a segmental arc, roughly a third of a circle
 *   the surviving turntable in the pit at the centre of that arc, to the NORTH
 *   red brick with steel-sash windows and tall arched engine-door openings
 *   1929 CPR; designated 1990; reopened as Roundhouse Park in 1997
 *
 * The building is now three tenancies - Steam Whistle Brewing at the west end,
 * the Toronto Railway Museum, and The Rec Room - which is why the frontages
 * face inward onto the park and the turntable rather than out onto Bremner.
 *
 * The turntable bridge turns. It is driven from ctx.onFrame at a speed a real
 * one would use: about two and a half minutes per revolution.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { tenantsFor } from '../data/tenants.js';
import { M } from '../core/materials.js';
import { register, registerInteractive } from '../core/registry.js';

const BAYS = 32;
const ARC = (120 * Math.PI) / 180;   // a third of a circle
const STALL_DEPTH = 24;              // radial length of a stall
const BAY_H = 9.5;                   // eaves; the clerestory sits above this
const TURNTABLE_R = 27;
const BRIDGE_RPM = 0.042;            // rad/s: ~2.5 minutes per revolution

/** Angle of bay `i`, measured from due grid-south (+Z), the arc's bisector. */
const bayAngle = (i) => -ARC / 2 + (ARC * (i + 0.5)) / BAYS;

/** Place an instance at (radius, angle) facing the turntable centre. */
function radial(m, p, q, s, r, a, y, up) {
  p.set(Math.sin(a) * r, y, Math.cos(a) * r);
  q.setFromAxisAngle(up, a);
  return m.compose(p, q, s);
}

/**
 * The 32 bays. Each is a plain radial box; adjacent boxes are sized to close at
 * the OUTER arc and overlap at the inner one, because an overlap disappears
 * inside the masonry while a gap shows as a slot of daylight.
 */
function buildBays(rIn, rOut) {
  const g = new THREE.Group();
  const rMid = (rIn + rOut) / 2;
  const tangential = (ARC / BAYS) * rOut;

  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);

  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(tangential, BAY_H, STALL_DEPTH), M.brick(), BAYS);
  const clerestory = new THREE.InstancedMesh(
    new THREE.BoxGeometry(tangential * 0.92, 2.5, STALL_DEPTH * 0.55), M.paintedSteel(0x3a4048), BAYS);
  // Arched engine door: a recessed opening plus its semicircular head.
  const doorLeaf = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.8, 6.4, 0.5), M.paintedSteel(0x2a2622), BAYS);
  const doorHead = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1.9, 1.9, 0.5, 10, 1, false, 0, Math.PI), M.paintedSteel(0x2a2622), BAYS);
  // Steel-sash window on the outer arc of each stall.
  const sash = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.6, 2.2, 0.3), M.glassDark(), BAYS);

  for (let i = 0; i < BAYS; i++) {
    const a = bayAngle(i);
    walls.setMatrixAt(i, radial(m, p, q, s, rMid, a, BAY_H / 2, up));
    clerestory.setMatrixAt(i, radial(m, p, q, s, rMid + 2, a, BAY_H + 1.25, up));
    doorLeaf.setMatrixAt(i, radial(m, p, q, s, rIn + 0.2, a, 3.2, up));
    sash.setMatrixAt(i, radial(m, p, q, s, rOut - 0.1, a, 6.4, up));

    // The door head is a half-cylinder lying on its side, axis radial.
    p.set(Math.sin(a) * (rIn + 0.2), 6.4, Math.cos(a) * (rIn + 0.2));
    q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, a, 'YXZ'));
    doorHead.setMatrixAt(i, m.compose(p, q, s));
  }
  for (const im of [walls, clerestory, doorLeaf, doorHead, sash]) {
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }
  walls.castShadow = true;
  walls.receiveShadow = true;
  clerestory.castShadow = true;
  return g;
}

/** Radiating tracks: two rails and a run of ties per stall, all instanced. */
function buildTracks(rIn) {
  const g = new THREE.Group();
  const r0 = TURNTABLE_R + 1;
  const len = rIn - r0;
  const tiesPerTrack = 7;

  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);

  const rails = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, 0.18, len), M.steelDark(), BAYS * 2);
  const ties = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.4, 0.16, 0.24), M.bark(), BAYS * tiesPerTrack);

  let ri = 0;
  let ti = 0;
  for (let i = 0; i < BAYS; i++) {
    const a = bayAngle(i);
    const cx = Math.sin(a);
    const cz = Math.cos(a);
    const mid = r0 + len / 2;
    for (const off of [-0.72, 0.72]) {
      // Offset perpendicular to the track direction, i.e. along the tangent.
      p.set(cx * mid + cz * off, 0.24, cz * mid - cx * off);
      q.setFromAxisAngle(up, a);
      rails.setMatrixAt(ri++, m.compose(p, q, s));
    }
    for (let k = 0; k < tiesPerTrack; k++) {
      const r = r0 + (len * (k + 0.5)) / tiesPerTrack;
      ties.setMatrixAt(ti++, radial(m, p, q, s, r, a, 0.1, up));
    }
  }
  rails.instanceMatrix.needsUpdate = true;
  ties.instanceMatrix.needsUpdate = true;
  g.add(ties, rails);
  return g;
}

/** Turntable: sunken pit, rim wall, and the girder bridge that spans it. */
function buildTurntable() {
  const g = new THREE.Group();

  const floor = new THREE.Mesh(new THREE.CircleGeometry(TURNTABLE_R, 32), M.concretePlain());
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.6;
  floor.receiveShadow = true;

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(TURNTABLE_R, TURNTABLE_R, 2.6, 32, 1, true), M.concrete());
  rim.position.y = -1.3;
  rim.material.side = THREE.BackSide;

  const bridge = new THREE.Group();
  bridge.name = 'roundhouse-turntable-bridge';
  const girder = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.8, TURNTABLE_R * 2), M.steelDark());
  girder.position.y = -0.6;
  girder.castShadow = true;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, TURNTABLE_R * 2), M.paintedSteel(0x4a4640));
  deck.position.y = 0.35;

  // Truss diagonals along the girder, instanced.
  const count = 12;
  const diagonals = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.2, 2.4, 0.2), M.steelDark(), count * 2);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const zAxis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < count; i++) {
    const z = -TURNTABLE_R + (TURNTABLE_R * 2 * (i + 0.5)) / count;
    for (const side of [-1.7, 1.7]) {
      p.set(side, -0.6, z);
      q.setFromAxisAngle(zAxis, (i % 2 ? 1 : -1) * 0.5);
      diagonals.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m.compose(p, q, s));
    }
  }
  diagonals.instanceMatrix.needsUpdate = true;

  // Rails on the bridge deck, so it lines up with the radiating tracks.
  const bridgeRails = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, 0.18, TURNTABLE_R * 2), M.steelDark(), 2);
  bridgeRails.setMatrixAt(0, m.makeTranslation(-0.72, 0.58, 0));
  bridgeRails.setMatrixAt(1, m.makeTranslation(0.72, 0.58, 0));
  bridgeRails.instanceMatrix.needsUpdate = true;

  bridge.add(girder, deck, diagonals, bridgeRails);
  g.add(floor, rim, bridge);
  g.userData.bridge = bridge;
  return g;
}

/**
 * Roundhouse Park: lawn, paved paths, and the preserved rolling stock on
 * display track. The hulks are simple massing on purpose - they are 20 m props
 * seen past a 550 m tower. All coordinates are local to the turntable centre.
 */
function buildPark() {
  const g = new THREE.Group();

  // Park bounds in local metres (origin = turntable centre). Held clear of the
  // Bremner roadway to the north and of the Rogers Centre drum to the west.
  const LAWN = { x: 2, z: 49, w: 160, d: 94 };

  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(LAWN.w, LAWN.d), M.grass());
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(LAWN.x, 0.02, LAWN.z);
  lawn.receiveShadow = true;

  const pathN = new THREE.Mesh(new THREE.BoxGeometry(LAWN.w - 10, 0.08, 6), M.sidewalk());
  pathN.position.set(LAWN.x, 0.06, LAWN.z - LAWN.d / 2 + 4);
  // Half a ring only: the northern half would pave over Bremner Boulevard.
  const pathArc = new THREE.Mesh(
    new THREE.RingGeometry(TURNTABLE_R + 4, TURNTABLE_R + 10, 24, 1, Math.PI, Math.PI), M.sidewalk());
  pathArc.rotation.x = -Math.PI / 2;
  pathArc.position.y = 0.06;
  g.add(lawn, pathN, pathArc);

  // Display track west of the arc, in the wedge the bays do not reach, and
  // clear of the Rogers Centre drum beyond it.
  const TRACK = { x: -68, z: 22, len: 48 };
  const track = new THREE.Mesh(new THREE.BoxGeometry(TRACK.len, 0.2, 2.6), M.bark());
  track.position.set(TRACK.x, 0.12, TRACK.z);
  g.add(track);

  // Three pieces of rolling stock, one geometry scaled per piece.
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.paintedSteel(0x4a2f28), 3);
  const trucks = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.9, 2.2), M.steelDark(), 6);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const stock = [
    { dx: -17, len: 16, h: 4.2 },   // steam locomotive and tender
    { dx: 0, len: 13, h: 4.0 },     // boxcar
    { dx: 16, len: 10, h: 3.8 },    // caboose
  ];
  stock.forEach((car, i) => {
    p.set(TRACK.x + car.dx, 1.2 + car.h / 2, TRACK.z);
    s.set(car.len, car.h, 3.1);
    bodies.setMatrixAt(i, m.compose(p, q, s));
    s.set(1, 1, 1);
    for (const end of [-1, 1]) {
      p.set(TRACK.x + car.dx + (end * car.len) / 3, 0.75, TRACK.z);
      trucks.setMatrixAt(i * 2 + (end > 0 ? 1 : 0), m.compose(p, q, s));
    }
  });
  bodies.instanceMatrix.needsUpdate = true;
  trucks.instanceMatrix.needsUpdate = true;
  bodies.castShadow = true;
  g.add(bodies, trucks);

  return { group: g, stock: bodies };
}

/** Tenant frontages on the inner arc, facing the turntable and the park. */
function buildFrontages(b, rIn) {
  const g = new THREE.Group();
  const tenants = tenantsFor('john-st-roundhouse', 'north');
  const up = new THREE.Vector3(0, 1, 0);

  tenants.forEach((tenant, i) => {
    // Spread the three tenancies evenly across the arc; Steam Whistle really is
    // at the west end, so the first entry lands at the west (-X) end of it.
    const a = -ARC / 2 + (ARC * (i + 0.5)) / tenants.length;
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(10, 4, 0.8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(Math.sin(a) * (rIn - 1.2), 2.1, Math.cos(a) * (rIn - 1.2));
    hit.quaternion.setFromAxisAngle(up, a);
    registerInteractive(hit, {
      building: b.name, address: b.address,
      tenant: tenant.name, category: tenant.category,
      confidence: tenant.confidence, note: tenant.note ?? '',
    });
    g.add(hit);
  });
  return g;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) {
  const b = getBuilding('john-st-roundhouse');
  if (!b) throw new Error('roundhouse: building record "john-st-roundhouse" is missing');

  // Fit the arc to the recorded footprint rather than to a guessed radius: the
  // chord of a 120 deg arc is 2*R*sin(60), so the width pins the outer radius.
  const rOut = b.w / (2 * Math.sin(ARC / 2));
  const rIn = rOut - STALL_DEPTH;
  const bandDepth = rOut - rIn * Math.cos(ARC / 2);
  // Turntable centre, north of the building, derived so the band of bays lands
  // centred inside the recorded depth.
  const zc = b.z - b.d / 2 + (b.d - bandDepth) / 2 - rIn * Math.cos(ARC / 2);

  if (rIn <= TURNTABLE_R + 4) {
    throw new Error(`roundhouse: inner radius ${rIn.toFixed(1)} m leaves no room for the turntable pit`);
  }

  const group = new THREE.Group();
  group.name = 'john-st-roundhouse';
  group.position.set(b.x, 0, zc);   // origin at the turntable centre

  const park = buildPark();
  const bays = buildBays(rIn, rOut);
  const tracks = buildTracks(rIn);
  const turntable = buildTurntable();
  const frontages = buildFrontages(b, rIn);
  frontages.userData.lod = { band: 'near' };
  // 64 rails and 224 ties are invisible past a block; the bays are not.
  tracks.userData.lod = { band: 'mid' };

  group.add(park.group, tracks, turntable, bays, frontages);

  const bridge = turntable.userData.bridge;
  ctx.onFrame.push((dt) => {
    bridge.rotation.y += BRIDGE_RPM * dt;
  });

  register({
    id: 'john-st-roundhouse', name: 'John Street Roundhouse', kind: 'landmark', object: group,
    confidence: 'reference',
    source: '1929 CPR roundhouse; 32 stalls in a segmental arc about the surviving turntable',
    note:
      `32 bays across a 120 deg arc, outer radius ${rOut.toFixed(1)} m and stalls ${STALL_DEPTH} m deep, ` +
      "fitted to the database footprint's width. Stall count and the turntable's position at the arc " +
      'centre are documented; the exact arc angle, stall depth and clerestory height are proportional. ' +
      'Group origin is the turntable centre, not the footprint centroid. ' +
      'CONFLICT TO RESOLVE: a 120 deg arc of this width places the turntable centre at z=' +
      `${zc.toFixed(0)}, so a ${TURNTABLE_R} m pit reaches z=${(zc - TURNTABLE_R).toFixed(0)} - north of ` +
      'the Bremner Boulevard centreline at z=250. The park geometry is held clear of the roadway, but ' +
      'the pit cannot be: either the roundhouse record moves south or Bremner moves north.',
    data: {
      address: b.address, bays: BAYS, arcDegrees: 120, outerRadius: rOut, innerRadius: rIn,
      turntableRadius: TURNTABLE_R, turntableCentre: { x: b.x, z: zc },
    },
  });
  register({
    id: 'roundhouse-turntable', name: 'John Street Roundhouse turntable', kind: 'infrastructure',
    object: turntable, confidence: 'reference',
    note: `Surviving pit and girder bridge north of the roundhouse; ${TURNTABLE_R} m radius, rotating at about 2.5 minutes per revolution.`,
  });
  register({
    id: 'roundhouse-park', name: 'Roundhouse Park', kind: 'street', object: park.group,
    confidence: 'inferred',
    note: 'Lawn, paved paths and preserved rolling stock on display track. Park boundary is approximated from the block.',
  });
  register({ id: 'rh-bays', name: 'Roundhouse engine bays', kind: 'building', object: bays,
    confidence: 'inferred', note: 'Brick stalls with arched engine doors on the inner arc, steel-sash windows on the outer, clerestory above.' });
  register({ id: 'rh-tracks', name: 'Roundhouse radiating tracks', kind: 'infrastructure', object: tracks,
    confidence: 'inferred', note: 'Two rails and seven ties per stall, instanced from the turntable rim to the bay doors.' });
  register({ id: 'rh-rolling-stock', name: 'Roundhouse Park rolling stock', kind: 'prop', object: park.stock,
    confidence: 'approximated', note: 'Three pieces of preserved equipment as simple massing; individual locomotives not identified.' });
  register({ id: 'rh-frontages', name: 'Roundhouse tenant frontages', kind: 'frontage', object: frontages,
    confidence: 'reference', note: 'Steam Whistle Brewing, Toronto Railway Museum and The Rec Room, facing the park and turntable.' });

  return group;
}
