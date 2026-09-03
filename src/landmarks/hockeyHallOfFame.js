/**
 * Hockey Hall of Fame - the 1885 Bank of Montreal building, 30 Yonge Street,
 * north-west corner of Front and Yonge.
 *
 * Facts encoded here:
 *   - Carved OHIO FREESTONE, warm and pinkish. Deliberately NOT the grey
 *     Bedford limestone of Union Station one block west; the two buildings must
 *     not read as the same stone.
 *   - Beaux-Arts / Second Empire bank front: rusticated base, engaged pilasters,
 *     richly carved window heads, heavy bracketed cornice, and figural relief in
 *     the pediment over the corner entrance.
 *   - The entrance is on the CHAMFERED Front/Yonge corner, up a short flight of
 *     steps. In grid terms Front is south of the building and Yonge is east, so
 *     the chamfer is the +X / +Z corner.
 *   - TRAP: the famous stained-glass dome is INTERIOR. From the street the roof
 *     shows only a plain glazed skylight enclosure over the façades. No exterior
 *     dome is modelled here, and none should be added.
 *   - Only the Esso Great Hall occupies this building. The museum's visitor
 *     entrance is in the Brookfield Place concourse behind and below.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { prism, cornice } from '../world/buildingKit.js';
import { M } from '../core/materials.js';
import { register, registerInteractive } from '../core/registry.js';
import { tenantsFor } from '../data/tenants.js';

const b = getBuilding('hockey-hall-of-fame');
const CHAMFER = 7.5;

/** See royalBankPlaza.js - extruded footprint on the Y=0 datum. */
function footprintMesh(points, height, material) {
  const mesh = new THREE.Mesh(prism(points, height), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function instanced(geo, mat, transforms, shadow = false) {
  const im = new THREE.InstancedMesh(geo, mat, transforms.length);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(1, 1, 1);
  transforms.forEach((t, i) => {
    p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    e.set(0, t.ry ?? 0, 0);
    q.setFromEuler(e);
    im.setMatrixAt(i, m.compose(p, q, s));
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = shadow;
  return im;
}

/** Footprint with the Front/Yonge corner cut back for the entrance. */
function chamferedFootprint(w, d, c) {
  const hw = w / 2;
  const hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd - c], [hw - c, hd], [-hw, hd]];
}

/** Round-headed window with a carved keystone band, extruded once, instanced. */
function carvedWindow(width, height, depth) {
  const r = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, height - r);
  s.absarc(0, height - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
}

/** Engaged pilasters + two storeys of carved openings on one street elevation. */
function elevation({ length, bays, faceOffset, axis, baseY, storeyHeights }) {
  const out = [];
  const place = (u, y, extra = 0) =>
    axis === 'z'
      ? { x: faceOffset + extra, y, z: u, ry: Math.PI / 2 }
      : { x: u, y, z: faceOffset + extra, ry: 0 };
  const pilasters = [];
  const windows = [];
  for (let i = 0; i <= bays; i++) pilasters.push(place(-length / 2 + (length / bays) * i, baseY + 5.6));
  for (let i = 0; i < bays; i++) {
    const u = -length / 2 + (length / bays) * (i + 0.5);
    for (const y of storeyHeights) windows.push(place(u, y, 0.06));
  }
  out.push({ pilasters, windows });
  return out[0];
}

export function build() {
  const root = new THREE.Group();
  root.name = 'hockey-hall-of-fame';
  root.position.set(b.x, 0, b.z);

  const shellPts = chamferedFootprint(b.w, b.d, CHAMFER);
  const shell = footprintMesh(shellPts, b.height, M.freestone());
  root.add(shell);

  // Rusticated base: a slightly proud, deeply coursed band around the plinth.
  const base = footprintMesh(shellPts.map(([x, z]) => [x * 1.02, z * 1.02]), 4.4, M.freestone());
  base.receiveShadow = true;
  root.add(base);

  const south = elevation({
    length: b.w - CHAMFER, bays: 4, faceOffset: b.d / 2, axis: 'x',
    baseY: 4.4, storeyHeights: [5.4, 11.6],
  });
  const east = elevation({
    length: b.d - CHAMFER, bays: 4, faceOffset: b.w / 2, axis: 'z',
    baseY: 4.4, storeyHeights: [5.4, 11.6],
  });

  const pilasterGeo = new THREE.BoxGeometry(1.1, 11.2, 0.6);
  const windowGeo = carvedWindow(1.9, 3.4, 0.55);
  root.add(instanced(pilasterGeo, M.freestone(), [...south.pilasters, ...east.pilasters], true));
  root.add(instanced(windowGeo, M.glassDark(), [...south.windows, ...east.windows]));

  // Carved window heads: a projecting hood over each opening, same instance set
  // shape scaled flat - cheaper than modelling each console.
  const hoodGeo = new THREE.BoxGeometry(2.6, 0.45, 0.7);
  root.add(instanced(hoodGeo, M.freestone(),
    [...south.windows, ...east.windows].map((t) => ({ ...t, y: t.y + 3.6 }))));

  root.add(cornice({ width: b.w, depth: b.d, y: b.height - 0.9, thickness: 1.5, overhang: 1.2, material: M.freestone() }));

  // Bracketed modillions under the cornice, one run per street elevation.
  const bracketGeo = new THREE.BoxGeometry(0.4, 0.9, 1.3);
  const brackets = [];
  for (let i = 0; i < 18; i++) {
    brackets.push({ x: -b.w / 2 + (b.w / 17) * i, y: b.height - 2.1, z: b.d / 2 + 0.5, ry: 0 });
    brackets.push({ x: b.w / 2 + 0.5, y: b.height - 2.1, z: -b.d / 2 + (b.d / 17) * i, ry: Math.PI / 2 });
  }
  root.add(instanced(bracketGeo, M.freestone(), brackets));

  // ---- chamfered corner entrance -------------------------------------------
  const corner = new THREE.Group();
  corner.name = 'hhof-ext-corner-entrance';
  const cx = b.w / 2 - CHAMFER / 2;
  const cz = b.d / 2 - CHAMFER / 2;
  corner.position.set(cx, 0, cz);
  corner.rotation.y = -Math.PI / 4; // faces the Front & Yonge intersection

  const chamferWidth = CHAMFER * Math.SQRT2;
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(chamferWidth * 0.55 + i * 0.8, 0.22, 0.9 + i * 0.7), M.freestone());
    step.position.set(0, 0.11 + (2 - i) * 0.22, 2.0 + (2 - i) * 0.35);
    step.receiveShadow = true;
    corner.add(step);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.6, 0.3), M.glassDark());
  door.position.set(0, 3.0, 1.9);
  corner.add(door);
  const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.56, 6.6, 14), M.freestone(), 2);
  const mm = new THREE.Matrix4();
  columns.setMatrixAt(0, mm.makeTranslation(-2.7, 3.3, 2.1));
  columns.setMatrixAt(1, mm.makeTranslation(2.7, 3.3, 2.1));
  columns.instanceMatrix.needsUpdate = true;
  columns.castShadow = true;
  corner.add(columns);

  // Pediment with figural relief. The carving is read as a recessed tympanum
  // panel and three raised figures - enough to catch a shadow at street scale.
  const pedShape = new THREE.Shape();
  pedShape.moveTo(-4.4, 0);
  pedShape.lineTo(4.4, 0);
  pedShape.lineTo(0, 2.6);
  pedShape.closePath();
  const pediment = new THREE.Mesh(
    new THREE.ExtrudeGeometry(pedShape, { depth: 1.0, bevelEnabled: false }), M.freestone()
  );
  pediment.position.set(0, 7.0, 1.6);
  pediment.castShadow = true;
  corner.add(pediment);
  const figures = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1.5, 0.35), M.freestone(), 3);
  [-1.6, 0, 1.6].forEach((fx, i) => figures.setMatrixAt(i, mm.makeTranslation(fx, 7.8, 2.5)));
  figures.instanceMatrix.needsUpdate = true;
  corner.add(figures);
  root.add(corner);

  // ---- roofline -------------------------------------------------------------
  // TRAP GUARD: a LOW GLAZED BOX, not a dome. The stained-glass dome is inside.
  const skylight = new THREE.Group();
  skylight.name = 'hhof-ext-skylight';
  const curb = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.5, 1.1, b.d * 0.5), M.freestone());
  curb.position.y = b.height + 0.55;
  const glazing = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.47, 1.8, b.d * 0.47), M.glazingClear());
  glazing.position.y = b.height + 2.0;
  skylight.add(curb, glazing);
  root.add(skylight);

  // ---- frontage -------------------------------------------------------------
  const tenants = tenantsFor('hockey-hall-of-fame', 'south');
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(b.w - CHAMFER - 2, 4.2, 0.6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(-CHAMFER / 2, 2.2, b.d / 2 + 0.7);
  registerInteractive(hit, {
    building: b.name,
    address: b.address,
    tenant: tenants[0]?.name ?? 'Hockey Hall of Fame - Esso Great Hall',
    category: tenants[0]?.category ?? 'museum',
    confidence: tenants[0]?.confidence ?? 'reference',
    note: 'Esso Great Hall only. The museum visitor entrance is NOT on this façade - it is in the Brookfield Place concourse behind and below.',
  });
  root.add(hit);

  register({
    id: 'hockey-hall-of-fame', name: b.name, kind: 'landmark', object: root,
    confidence: 'reference', source: '1885 Bank of Montreal, Darling & Curry; Ohio freestone',
    note: b.note,
    data: { address: b.address, year: 1885, stone: 'Ohio freestone', floors: b.floors },
  });
  register({
    id: 'hhof-ext-corner-entrance', name: 'Chamfered Front/Yonge corner entrance', kind: 'frontage', object: corner,
    confidence: 'reference', source: 'photographic proportion',
    note: 'Steps, paired columns and the carved pediment relief. Figure count and subject are approximated.',
    data: { faces: 'Front & Yonge intersection' },
  });
  register({
    id: 'hhof-ext-skylight', name: 'Roof skylight enclosure', kind: 'prop', object: skylight,
    confidence: 'reference', source: 'street-level roofline',
    note: 'DELIBERATELY a plain low glazed box. The stained-glass dome is interior and is built by interiors/hhofInterior.js; no exterior dome exists on this building.',
    data: {},
  });
  register({
    id: 'hhof-ext-entry-note', name: 'Hockey Hall of Fame visitor entrance', kind: 'frontage', object: hit,
    confidence: 'reference', source: 'museum wayfinding',
    note: 'The visitor entrance is in the Brookfield Place concourse (Allen Lambert Galleria, below grade), not in this heritage building. Only the Esso Great Hall is here.',
    data: { entranceBuilding: 'allen-lambert-galleria' },
  });

  return root;
}
