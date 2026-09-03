/**
 * Rogers Centre, 1 Blue Jays Way (1989, Rod Robbie / Michael Allen, as SkyDome).
 *
 * The point of this building is the roof, so the roof is what this module
 * models honestly. It is FOUR panels, not a dome that "opens":
 *
 *   panel 1  fixed, the domed north end
 *   panel 2  arch, largest moving radius
 *   panel 3  arch, smaller radius - nests inside panel 2
 *   panel 4  arch plus the south end cap, smallest radius; it rotates 180 deg
 *            around the perimeter so its cap ends up tucked under panel 1
 *
 * The decreasing radii are not decoration - they are the entire reason the
 * three moving panels can park stacked over the north side when open. Panels 2
 * and 3 travel on straight north-south rails; panel 4 travels on a circular
 * perimeter track. This module reproduces that motion (translate, translate,
 * translate + rotate) rather than faking it with a dissolve.
 *
 * Every panel is a BAND OF ONE SPHERE whose poles point north and south, and
 * every motion is a rotation of that sphere onto itself: panels 2 and 3 turn
 * about the horizontal east-west axis (which is what a track running "north-
 * south" over an arched roof actually is), and panel 4 turns 180 deg about the
 * vertical axis, which maps its south band exactly onto the north one. Because
 * every motion is a symmetry of the sphere, no panel can ever leave the roof
 * surface or swing out over the street - which a set of straight-sliding barrel
 * arches, the obvious first model, does at both ends of its travel.
 *
 * The dome is flattened by a single scale on the roof group, so the apex lands
 * at the published 86 m instead of the ~130 m a true hemisphere over this span
 * would reach. Keeping the squash on the parent means the panels stay on one
 * common ellipsoid however far through the cycle they are.
 *
 * Every radius here is derived from the footprint in the building database, so
 * the stadium keeps fitting its block if that record is re-surveyed.
 *
 * `setRoof(t)`, t = 0 fully open to t = 1 fully closed, is exported and also
 * hung on the returned group's userData so the tour can drive it. The panels
 * ease toward the target rather than snapping, because a real roof takes twenty
 * minutes to cycle and an instant jump reads as a glitch.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { tenantsFor } from '../data/tenants.js';
import { M } from '../core/materials.js';
import { storefrontBand } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';

const SPRING_Y = 40;   // height the roof springs from the top of the bowl
const SEG = 28;        // radial segments; the bowl is huge but never close

const Q = Math.PI / 4;   // each panel covers a quarter of the dome's arc

/**
 * The three moving panels, closed-position first. `theta` is the band's
 * position measured from the south springing (0) to the north springing (PI).
 * `inset` shrinks the radius so a panel nests inside the one north of it -
 * the whole reason three panels can park stacked over the fixed one.
 * `shift` is how far the band travels to reach its parked station; panel 4
 * reaches its by turning about the vertical axis instead.
 */
const PANELS = Object.freeze([
  { id: 'rc-roof-panel-2', inset: 2, theta: 2 * Q, shift: Q },
  { id: 'rc-roof-panel-3', inset: 5, theta: Q, shift: 2 * Q },
  { id: 'rc-roof-panel-4', inset: 8, theta: 0, spin: Math.PI },
]);

/** Module state, so the exported setter can reach the panels after build(). */
let pivots = [];
let target = 0.35;   // partly open: the state the stadium spends most days in
let current = 0.35;

/**
 * Drive the retractable roof.
 * @param {number} t 0 = fully open (panels parked over the north side), 1 = closed
 * @returns {number} the clamped target
 */
export function setRoof(t) {
  if (!Number.isFinite(t)) throw new TypeError(`setRoof: expected a finite number, received ${t}`);
  target = Math.min(1, Math.max(0, t));
  return target;
}

/** Current roof position, 0 open to 1 closed. */
export const roofState = () => current;

function applyRoof(t) {
  for (let i = 0; i < pivots.length; i++) {
    const p = PANELS[i];
    // Negative X rotation carries a band north, toward the parked stack.
    if (p.spin) pivots[i].rotation.y = p.spin * (1 - t);
    else pivots[i].rotation.x = -p.shift * (1 - t);
  }
  current = t;
}

/**
 * One roof panel: a band of the dome between two polar angles, measured from a
 * pole that points grid-south. `rotateX` swings three.js's +Y pole round to +Z;
 * phi [pi, 2pi] is then the half of the sphere that ends up above ground.
 */
function domeBand(radius, theta0, theta1) {
  const geo = new THREE.SphereGeometry(radius, SEG, 4, Math.PI, Math.PI, theta0, theta1 - theta0);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, M.steelWhite());
  mesh.castShadow = true;
  return mesh;
}

/** Concrete bowl: outer and inner drums, banded precast, corner ramp towers. */
function buildBowl(bowlR, roofR) {
  const g = new THREE.Group();
  const h = SPRING_Y;
  const m = new THREE.Matrix4();

  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(bowlR, bowlR, h, SEG, 1, true), M.concrete());
  outer.position.y = h / 2;
  outer.castShadow = true;
  outer.receiveShadow = true;

  const cap = new THREE.Mesh(new THREE.RingGeometry(roofR, bowlR, SEG), M.concretePlain());
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = h;
  cap.receiveShadow = true;

  // Banded precast: the horizontal shadow lines that stop 40 m of drum reading
  // as a blank cylinder. Instanced - five bands, one draw call.
  const bandGeo = new THREE.CylinderGeometry(bowlR + 0.6, bowlR + 0.6, 1.8, SEG, 1, true);
  const bands = new THREE.InstancedMesh(bandGeo, M.concretePlain(), 5);
  for (let i = 0; i < 5; i++) bands.setMatrixAt(i, m.makeTranslation(0, 6 + i * 7.5, 0));
  bands.instanceMatrix.needsUpdate = true;

  // Circulation / ramp towers on the quadrant corners.
  const towerGeo = new THREE.CylinderGeometry(11, 11, h + 6, 12, 1);
  const towers = new THREE.InstancedMesh(towerGeo, M.concrete(), 4);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    towers.setMatrixAt(i, m.makeTranslation(Math.sin(a) * bowlR, (h + 6) / 2, Math.cos(a) * bowlR));
  }
  towers.instanceMatrix.needsUpdate = true;
  towers.castShadow = true;

  g.add(outer, cap, bands, towers);
  return g;
}

/** Field: turf, skinned infield, mound. Seen from above and from the stands. */
function buildField(roofR) {
  const g = new THREE.Group();
  const turf = new THREE.Mesh(new THREE.CircleGeometry(roofR * 0.82, SEG), M.grass());
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0.05;
  turf.receiveShadow = true;

  // Home plate sits toward the north-west in reality; the diamond here is
  // nominal - it is a 30 m detail inside a 190 m bowl.
  const dirt = new THREE.Mesh(
    new THREE.CircleGeometry(roofR * 0.32, 20, Math.PI * 0.75, Math.PI * 0.5), M.brick());
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(0, 0.1, roofR * 0.28);

  const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.2, 0.5, 12), M.brick());
  mound.position.set(0, 0.25, roofR * 0.13);

  g.add(turf, dirt, mound);
  return g;
}

/**
 * Seating: stepped annular decks in two colours. Each deck is one instanced
 * tread ring plus one instanced riser, scaled per tier - two geometries and
 * four draw calls for the whole bowl interior.
 */
function buildSeating(roofR) {
  const g = new THREE.Group();
  const treadGeo = new THREE.RingGeometry(0.88, 1.0, SEG);
  treadGeo.rotateX(-Math.PI / 2);
  const riserGeo = new THREE.CylinderGeometry(1, 1, 1, SEG, 1, true);

  const deck = (tiers, r0, r1, y0, y1, colour) => {
    const mat = M.paintedSteel(colour);
    const treads = new THREE.InstancedMesh(treadGeo, mat, tiers);
    const risers = new THREE.InstancedMesh(riserGeo, mat, tiers);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const step = (y1 - y0) / tiers;
    for (let i = 0; i < tiers; i++) {
      const f = tiers > 1 ? i / (tiers - 1) : 0;
      const r = r0 + (r1 - r0) * f;
      const y = y0 + step * i;
      p.set(0, y, 0);
      s.set(r, 1, r);
      treads.setMatrixAt(i, m.compose(p, q, s));
      p.set(0, y - step / 2, 0);
      s.set(r * 0.9, step, r * 0.9);
      risers.setMatrixAt(i, m.compose(p, q, s));
    }
    treads.instanceMatrix.needsUpdate = true;
    risers.instanceMatrix.needsUpdate = true;
    treads.receiveShadow = true;
    g.add(treads, risers);
  };

  deck(12, roofR * 0.94, roofR * 0.70, 2, 16, 0x2b4a7a);   // 100 level, Jays blue
  deck(10, roofR * 1.02, roofR * 0.90, 22, 38, 0x555a60);  // 500 level, grey
  return g;
}

/** Floodlight arrays on the bowl rim, instanced and night-lit. */
function buildFloodlights(roofR) {
  const lights = new THREE.InstancedMesh(
    new THREE.BoxGeometry(9, 2.2, 3), M.litInterior(0xf6f2df), 6);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.set(Math.sin(a) * (roofR - 6), SPRING_Y + 2, Math.cos(a) * (roofR - 6));
    q.setFromAxisAngle(up, a);
    lights.setMatrixAt(i, m.compose(p, q, s));
  }
  lights.instanceMatrix.needsUpdate = true;
  lights.userData.nightLight = true;
  return lights;
}

/** Ground-floor gates on the Bremner (north) side, with interaction volumes. */
function buildGates(b, bowlR) {
  const g = new THREE.Group();
  const tenants = tenantsFor('rogers-centre', 'north');
  const { group: band, bays } = storefrontBand({ width: 56, height: 5.4, bayWidth: 8 });
  band.position.set(0, 0, -bowlR + 1);
  band.rotation.y = Math.PI;
  g.add(band);

  bays.forEach((bay, i) => {
    const tenant = tenants[i % tenants.length];
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(bay.width - 0.5, 4.4, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    // The band is rotated 180 deg, so a bay at local +x lands at -x in the group.
    hit.position.set(-bay.x, 2.3, -bowlR - 0.4);
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
  const b = getBuilding('rogers-centre');
  if (!b) throw new Error('rogersCentre: building record "rogers-centre" is missing');

  const bowlR = Math.min(b.w, b.d) / 2;
  const roofR = bowlR - 7;
  // The crown belongs to panel 2, not to the full-radius fixed panel, so the
  // squash is set from panel 2's radius: that is what puts the real apex at the
  // published height rather than a metre under it.
  const flatY = (b.height - SPRING_Y) / (roofR - PANELS[0].inset);

  const group = new THREE.Group();
  group.name = 'rogers-centre';
  group.position.set(b.x, 0, b.z);

  const bowl = buildBowl(bowlR, roofR);
  const field = buildField(roofR);
  const seating = buildSeating(roofR);
  // Bowl interior is only readable from close by or from the tower's LookOut.
  seating.userData.lod = { band: 'mid' };
  const floodlights = buildFloodlights(roofR);
  const gates = buildGates(b, bowlR);
  gates.userData.lod = { band: 'near' };

  // The vertical squash lives on this group, so every panel below stays a rigid
  // circular arc and can be moved with a plain translation.
  const roof = new THREE.Group();
  roof.name = 'rc-roof';
  roof.position.y = SPRING_Y;
  roof.scale.set(1, flatY, 1);

  // Panel 1: the fixed north quarter. Everything else parks underneath it.
  roof.add(domeBand(roofR, 3 * Q, 4 * Q));

  pivots = PANELS.map((p) => {
    const pivot = new THREE.Group();
    pivot.name = p.id;
    pivot.add(domeBand(roofR - p.inset, p.theta, p.theta + Q));
    roof.add(pivot);
    return pivot;
  });
  applyRoof(current);

  group.add(bowl, field, seating, floodlights, gates, roof);

  // Ease toward whatever setRoof() last asked for: a few seconds of travel, so
  // the motion reads as machinery instead of a cut.
  ctx.onFrame.push((dt) => {
    if (Math.abs(current - target) < 1e-4) {
      if (current !== target) applyRoof(target);
      return;
    }
    applyRoof(current + (target - current) * Math.min(1, dt * 0.75));
  });

  group.userData.setRoof = setRoof;
  group.userData.roofState = roofState;

  register({
    id: 'rogers-centre', name: 'Rogers Centre', kind: 'landmark', object: group,
    confidence: 'reference',
    source: 'published roof height and footprint; four-panel roof configuration from the 1989 design',
    note:
      'Roof is four panels - one fixed over the north end plus three of decreasing radius that park ' +
      'stacked over the north side when open. Panels 2 and 3 translate on straight rails; panel 4 ' +
      'rotates 180 deg on the perimeter track, carrying the south end cap with it. Modelled as a ' +
      'flattened dome; the real roof is trussed arch segments, not a smooth shell. Seating tier radii ' +
      'and the diamond orientation are approximated. Default state is 35% closed; ' +
      'group.userData.setRoof(t) or the module\'s setRoof export drives it.',
    data: {
      address: b.address, height: b.height, roofPanels: 4, movingPanels: 3,
      bowlRadius: bowlR, defaultRoof: current,
    },
  });
  register({ id: 'rc-bowl', name: 'Rogers Centre bowl', kind: 'infrastructure', object: bowl,
    confidence: 'inferred', note: `Banded precast drum, ${bowlR.toFixed(0)} m radius, with four corner circulation towers.` });
  register({ id: 'rc-roof', name: 'Rogers Centre retractable roof', kind: 'infrastructure', object: roof,
    confidence: 'reference', note: 'Four panels; the parent record carries the motion model.' });
  register({ id: 'rc-field', name: 'Rogers Centre playing field', kind: 'prop', object: field,
    confidence: 'approximated', note: 'Simplified turf and skinned infield; diamond orientation is nominal.' });
  register({ id: 'rc-seating', name: 'Rogers Centre seating decks', kind: 'prop', object: seating,
    confidence: 'approximated', note: 'Two instanced tiered decks standing in for five real seating levels.' });
  register({ id: 'rc-gates', name: 'Rogers Centre north gates', kind: 'frontage', object: gates,
    confidence: 'inferred', note: 'Gate 5 and the Blue Jays Shop front the north side toward Bremner.' });

  return group;
}
