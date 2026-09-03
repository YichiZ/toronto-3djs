/**
 * Scotiabank Arena, 40 Bay Street (1999, HOK Sport / Brisbin Brook Beynon).
 *
 * The trap this module exists to avoid: the arena is NOT a freestanding bowl.
 * It was built inside and behind the 1941 Toronto Postal Delivery Building
 * (Charles B. Dolphin), and the Art Deco buff-limestone elevations were kept on
 * BOTH street frontages - Bay Street to the grid east (+X) and Lake Shore
 * Boulevard to the grid south (+Z). Those two elevations therefore read as a
 * separate, lower, load-bearing-looking heritage block: strong vertical piers,
 * recessed spandrels, a flat parapet with no cornice, and the Louis Temporale
 * bas-relief panels carved between the piers at the upper level. The modern
 * arena mass - dark metal panel and glass, rounded corners - sits above and
 * behind it and only touches the ground on the two non-heritage sides.
 *
 * The rail corridor is immediately north (-Z); that elevation is the everyday
 * public one, with the Gate 1 entrance, box office and glazed concourse.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { tenantsFor } from '../data/tenants.js';
import { M } from '../core/materials.js';
import { storefrontBand, doorway, roofPlant, cornice } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';

/** Postal building parapet height. Four storeys of a monumental 1941 section. */
const HERITAGE_H = 20.5;
/** Depth of the retained façade zone; the real one is a full structural bay. */
const HERITAGE_T = 3.0;
const PIER_SPACING = 6.0;
const BOWL_H = 40;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function makeCanvas(size) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * Louis Temporale's relief panels are figurative allegories of the mail. We do
 * not reproduce them - we paint an original shallow-carve pattern of the same
 * rhythm so the panels read as carved stone rather than as blank limestone.
 */
let reliefMat = null;
function basReliefMaterial() {
  if (reliefMat) return reliefMat;
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8c0ad';
  ctx.fillRect(0, 0, size, size);
  // Three standing figures in profile, blocked out as overlapping arcs and
  // shafts - the deco convention, drawn from scratch.
  for (let i = 0; i < 3; i++) {
    const cx = size * (0.2 + i * 0.3);
    ctx.fillStyle = i % 2 ? '#b8b09d' : '#d4ccb9';
    ctx.beginPath();
    ctx.arc(cx, size * 0.34, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - size * 0.06, size * 0.42, size * 0.12, size * 0.4);
    ctx.fillStyle = '#bdb5a2';
    ctx.fillRect(cx - size * 0.11, size * 0.46, size * 0.22, size * 0.05);
  }
  ctx.strokeStyle = '#b2aa97';
  ctx.lineWidth = 2;
  for (let y = size * 0.86; y < size; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  reliefMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0.0 });
  reliefMat.name = 'sba-basrelief';
  return reliefMat;
}

/** Original canvas lettering for the gate marquee - never scraped artwork. */
function marqueeMaterial(text) {
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#101418';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#f2ede2';
  ctx.font = 'bold 92px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex });
}

/** Instanced run of identical boxes along one axis. */
function run({ geo, material, count, spacing, at, axis = 'x', y }) {
  const im = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  const span = (count - 1) * spacing;
  for (let i = 0; i < count; i++) {
    const t = -span / 2 + i * spacing;
    im.setMatrixAt(i, m.makeTranslation(axis === 'x' ? t : at, y, axis === 'x' ? at : t));
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

/**
 * One retained Art Deco elevation.
 * @param {'east'|'south'} side which street the elevation faces
 * @param {number} length elevation length in metres
 * @param {number} at signed offset of the wall plane from the block centre
 */
function heritageElevation(side, length, at) {
  const g = new THREE.Group();
  g.name = `sba-heritage-${side}`;
  const axis = side === 'east' ? 'z' : 'x';
  const stone = M.limestone();

  // Wall plane behind the piers, so the recesses read as depth, not as holes.
  const wall = new THREE.Mesh(
    axis === 'z' ? box(HERITAGE_T, HERITAGE_H, length) : box(length, HERITAGE_H, HERITAGE_T),
    stone
  );
  wall.position.set(axis === 'z' ? at : 0, HERITAGE_H / 2, axis === 'z' ? 0 : at);
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  const count = Math.floor(length / PIER_SPACING);
  const face = at > 0 ? 1 : -1;
  const pierOut = at + face * (HERITAGE_T / 2 + 0.55);

  // Piers run unbroken from the base course to the parapet - the single move
  // that makes a 1941 deco elevation read as deco and not as a warehouse.
  const pierGeo = axis === 'z' ? box(1.2, HERITAGE_H - 2.2, 1.7) : box(1.7, HERITAGE_H - 2.2, 1.2);
  g.add(run({
    geo: pierGeo, material: stone, count, spacing: PIER_SPACING,
    at: pierOut, axis: axis === 'z' ? 'z' : 'x', y: 1.1 + (HERITAGE_H - 2.2) / 2,
  }));

  // Recessed spandrel glazing, three bands between the piers.
  const winGeo = axis === 'z' ? box(0.3, 2.6, PIER_SPACING - 2.2) : box(PIER_SPACING - 2.2, 2.6, 0.3);
  const glass = M.glassDark();
  const bands = [5.2, 9.4, 13.6];
  const total = count * bands.length;
  const win = new THREE.InstancedMesh(winGeo, glass, total);
  const m = new THREE.Matrix4();
  const span = (count - 1) * PIER_SPACING;
  let i = 0;
  for (const y of bands) {
    for (let k = 0; k < count; k++) {
      const t = -span / 2 + k * PIER_SPACING;
      const off = at + face * (HERITAGE_T / 2 - 0.3);
      win.setMatrixAt(i++, m.makeTranslation(axis === 'z' ? off : t, y, axis === 'z' ? t : off));
    }
  }
  win.instanceMatrix.needsUpdate = true;
  g.add(win);

  // Temporale bas-reliefs: shallow carved panels in the upper bay, above the
  // top spandrel and below the parapet.
  const reliefGeo = axis === 'z' ? box(0.35, 2.8, PIER_SPACING - 2.4) : box(PIER_SPACING - 2.4, 2.8, 0.35);
  // Kept in their own group so the reliefs carry their own registry identity
  // rather than sharing the elevation's.
  const reliefs = new THREE.Group();
  reliefs.name = `sba-basreliefs-${side}`;
  reliefs.add(run({
    geo: reliefGeo, material: basReliefMaterial(), count, spacing: PIER_SPACING,
    at: at + face * (HERITAGE_T / 2 + 0.1), axis: axis === 'z' ? 'z' : 'x', y: 17.4,
  }));
  g.add(reliefs);
  g.userData.reliefs = reliefs;

  // Flat parapet. The postal building has no projecting cornice.
  const parapet = new THREE.Mesh(
    axis === 'z' ? box(HERITAGE_T + 1.6, 1.8, length) : box(length, 1.8, HERITAGE_T + 1.6),
    M.limestonePlain()
  );
  parapet.position.set(axis === 'z' ? at + face * 0.4 : 0, HERITAGE_H + 0.9, axis === 'z' ? 0 : at + face * 0.4);
  parapet.castShadow = true;
  g.add(parapet);

  return g;
}

/** Rounded-corner plan ring, as the bowl has no square corners at any level. */
function bowlSlab(w, d, r, height, material) {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  shape.closePath();
  // Extrude in +Z then lay it down; buildingKit.prism() offsets the result by a
  // full height, which is wrong for a volume that must start at its own base.
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 8 });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Ground-floor frontage with raycast volumes, one per storefront bay. */
function frontage({ parent, buildingId, buildingName, address, face, width, position, rotationY = 0 }) {
  const tenants = tenantsFor(buildingId, face);
  const { group, bays } = storefrontBand({ width, height: 4.6, bayWidth: 7.5 });
  const holder = new THREE.Group();
  holder.add(group);
  bays.forEach((bay, i) => {
    const tn = tenants[i % tenants.length];
    const hit = new THREE.Mesh(box(bay.width - 0.4, 4.0, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(bay.x, 2.1, 0.7);
    registerInteractive(hit, {
      building: buildingName, address, tenant: tn.name, category: tn.category,
      confidence: tn.confidence, note: tn.note ?? '',
    });
    holder.add(hit);
  });
  holder.position.copy(position);
  holder.rotation.y = rotationY;
  parent.add(holder);
  return bays.length;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) {
  const b = getBuilding('scotiabank-arena');
  const group = new THREE.Group();
  group.name = 'scotiabank-arena';
  group.position.set(b.x, 0, b.z);

  const hw = b.w / 2;
  const hd = b.d / 2;

  // --- modern bowl -----------------------------------------------------------
  // Pulled back from the two heritage streets so the retained elevations stand
  // clear in silhouette, as they do in life.
  const bowlW = b.w - 14;
  const bowlD = b.d - 12;
  const bowlCx = -5;
  const bowlCz = -4;
  const bowl = new THREE.Group();
  bowl.name = 'sba-bowl';
  bowl.position.set(bowlCx, 0, bowlCz);
  const base = bowlSlab(bowlW, bowlD, 20, 23, M.steelDark());
  const band = bowlSlab(bowlW - 1.4, bowlD - 1.4, 19.4, 10, M.glassDark());
  band.position.y = 23;
  const crown = bowlSlab(bowlW - 0.6, bowlD - 0.6, 19.7, BOWL_H - 33, M.steelDark());
  crown.position.y = 33;
  bowl.add(base, band, crown);
  bowl.add(roofPlant({ width: bowlW * 0.6, depth: bowlD * 0.6, y: BOWL_H, seed: 11 }));
  group.add(bowl);

  // --- retained 1941 elevations ---------------------------------------------
  const east = heritageElevation('east', b.d, hw - HERITAGE_T / 2);
  const south = heritageElevation('south', b.w, hd - HERITAGE_T / 2);
  group.add(east, south);

  // --- north elevation: the everyday public face, facing the rail corridor ---
  const north = new THREE.Group();
  north.name = 'sba-gate1';
  const concourse = new THREE.Mesh(box(96, 17, 7), M.glassCool());
  concourse.position.set(-8, 8.5, -hd + 3.5);
  concourse.castShadow = true;
  north.add(concourse);

  const canopy = new THREE.Mesh(box(100, 0.9, 11), M.steelDark());
  canopy.position.set(-8, 9.4, -hd - 1.5);
  canopy.castShadow = true;
  north.add(canopy);
  north.add(cornice({ width: 96, depth: 7, y: 17.6, thickness: 0.8, overhang: 0.5, material: M.steelDark() }));

  // Six paired entry gates under the canopy.
  for (let i = 0; i < 6; i++) {
    const d = doorway({ width: 3.4, height: 4.2, recess: 0.7 });
    d.position.set(-8 + (i - 2.5) * 13, 0, -hd - 0.1);
    d.rotation.y = Math.PI;
    north.add(d);
  }

  const marquee = new THREE.Mesh(box(9, 3.2, 0.4), marqueeMaterial('GATE 1'));
  marquee.position.set(-8, 12.6, -hd - 2.2);
  north.add(marquee);
  group.add(north);

  // --- frontages -------------------------------------------------------------
  let frontages = 0;
  frontages += frontage({
    parent: group, buildingId: b.id, buildingName: b.name, address: b.address, face: 'north',
    width: 88, position: new THREE.Vector3(-8, 0, -hd - 0.2), rotationY: Math.PI,
  });
  frontages += frontage({
    parent: group, buildingId: b.id, buildingName: b.name, address: b.address, face: 'east',
    width: b.d - 20, position: new THREE.Vector3(hw + 0.2, 0, 0), rotationY: Math.PI / 2,
  });
  frontages += frontage({
    parent: group, buildingId: b.id, buildingName: b.name, address: b.address, face: 'south',
    width: b.w - 24, position: new THREE.Vector3(0, 0, hd + 0.2),
  });

  register({
    id: 'scotiabank-arena', name: b.name, kind: 'landmark', object: group,
    confidence: 'reference',
    source: 'massing from the building database; elevation proportion from photographic reference',
    note: b.note,
    data: { address: b.address, height: b.height, frontages, opened: 1999, heritageYear: 1941 },
  });
  register({
    id: 'sba-heritage-bay', name: 'Toronto Postal Delivery Building - Bay Street elevation',
    kind: 'landmark', object: east, confidence: 'reference',
    note: 'Retained 1941 Art Deco elevation, buff limestone, unbroken piers to a flat parapet. Not a replica facade: the wall is structural and predates the arena by 58 years.',
    data: { architect: 'Charles B. Dolphin', year: 1941 },
  });
  register({
    id: 'sba-heritage-lakeshore', name: 'Toronto Postal Delivery Building - Lake Shore elevation',
    kind: 'landmark', object: south, confidence: 'reference',
    note: 'The second retained elevation. Commonly missed - many reconstructions keep only the Bay Street frontage.',
    data: { year: 1941 },
  });
  register({
    id: 'sba-basreliefs', name: 'Louis Temporale bas-relief panels', kind: 'prop',
    object: east.userData.reliefs, confidence: 'inferred',
    note: 'Panel positions and rhythm are reconstructed; the carved subjects are original geometry, not a reproduction of Temporale\'s allegories of the mail.',
    data: { sculptor: 'Louis Temporale Sr.' },
  });
  register({
    id: 'sba-bowl', name: 'Scotiabank Arena bowl', kind: 'landmark', object: bowl,
    confidence: 'inferred',
    note: 'Dark metal panel and glass, rounded corners, set back from both heritage elevations. Seating bowl interior is not modelled.',
    data: { capacity: 'approx. 19,800 (hockey)' },
  });
  register({
    id: 'sba-gate-1', name: 'Scotiabank Arena Gate 1', kind: 'frontage', object: north,
    confidence: 'reference',
    note: 'North elevation faces the rail corridor and the Union Station walkway, which is how most of the crowd actually arrives.',
  });

  return group;
}
