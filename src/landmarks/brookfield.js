/**
 * Brookfield Place exteriors - the block bounded by Bay, Front, Yonge and
 * Wellington. The Galleria INTERIOR is a separate module; this file builds only
 * the shell, so the two must agree on where the floor and roof are: see
 * {@link GALLERIA_BOUNDS}.
 *
 * Facts encoded here:
 *   - 161 Bay (TD Canada Trust Tower, 1990) is the SOUTHERN and TALLER tower at
 *     261 m / 53 storeys; 181 Bay (Bay Wellington Tower, 1992) is the northern
 *     one at 208 m / 47. Bay Street addresses rise northward from the lake, so
 *     the lower number is the southern building.
 *   - 161 Bay is dark granite and glass with strongly vertical bays and
 *     chamfered corners; 181 Bay is the lighter, paler-spandrel tower.
 *   - The Allen Lambert Galleria (Santiago Calatrava, 1992) runs EAST-WEST from
 *     the towers to Yonge: eight PAIRS of white parabolic steel trees springing
 *     from the floor and branching to carry a glazed free-form roof six storeys
 *     up.
 *   - Its Yonge-end wall incorporates the reassembled façades of the Commercial
 *     Bank of the Midland District (1845) and its neighbours - real dismantled
 *     19th-century stone, rebuilt, not a replica screen.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { prism, plinth, cornice, roofPlant } from '../world/buildingKit.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';

const g = getBuilding('allen-lambert-galleria');

/**
 * Shared datum for the Galleria shell and its interior fit-out. The interior
 * module aligns to this rather than re-deriving the volume, so the two never
 * drift apart.
 */
export const GALLERIA_BOUNDS = Object.freeze({
  minX: g.x - g.w / 2, maxX: g.x + g.w / 2,
  minZ: g.z - g.d / 2, maxZ: g.z + g.d / 2,
  floorY: 0, roofY: g.height,
});

/** Springing line of the barrel vault: the trees carry the glass from here up. */
const VAULT_RADIUS = g.d / 2;
const SPRING_Y = GALLERIA_BOUNDS.roofY - VAULT_RADIUS;

/** See royalBankPlaza.js - extruded footprint on the Y=0 datum. */
function footprintMesh(points, height, material) {
  const mesh = new THREE.Mesh(prism(points, height), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function instanced(geo, mat, transforms, { shadow = false } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, transforms.length);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  transforms.forEach((t, i) => {
    p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    q.setFromEuler(e);
    s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    im.setMatrixAt(i, m.compose(p, q, s));
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = shadow;
  return im;
}

const chamferedRect = (w, d, c) => {
  const hw = w / 2;
  const hd = d / 2;
  return [
    [-hw + c, -hd], [hw - c, -hd], [hw, -hd + c], [hw, hd - c],
    [hw - c, hd], [-hw + c, hd], [-hw, hd - c], [-hw, -hd + c],
  ];
};

/**
 * Full-height mullion fins on all four elevations. One InstancedMesh for the
 * whole tower; this is what gives 161 Bay its vertical granite reading.
 */
function verticalBays(b, chamfer, finMat, spacing = 3.3) {
  const fin = new THREE.BoxGeometry(0.55, b.height, 1.0);
  const t = [];
  const run = (length, across, ry) => {
    const n = Math.max(2, Math.floor(length / spacing));
    for (let i = 0; i <= n; i++) {
      const u = -length / 2 + (length / n) * i;
      const [x, z] = ry === 0 ? [u, across] : [across, u];
      t.push({ x, y: b.height / 2, z, ry });
    }
  };
  // Fin centres sit ON the cladding plane so half of each mullion projects.
  run(b.w - chamfer * 2, -b.d / 2, 0);
  run(b.w - chamfer * 2, b.d / 2, 0);
  run(b.d - chamfer * 2, -b.w / 2, Math.PI / 2);
  run(b.d - chamfer * 2, b.w / 2, Math.PI / 2);
  return instanced(fin, finMat, t);
}

function tower(id, { shellMat, finMat, chamfer }) {
  const b = getBuilding(id);
  const grp = new THREE.Group();
  grp.name = id;
  grp.position.set(b.x, 0, b.z);
  grp.add(footprintMesh(chamferedRect(b.w, b.d, chamfer), b.height, shellMat));
  grp.add(verticalBays(b, chamfer, finMat));
  grp.add(plinth({ width: b.w, depth: b.d, height: 7.5, material: M.steelDark() }));
  grp.add(cornice({ width: b.w - chamfer, depth: b.d - chamfer, y: b.height + 1.0, thickness: 1.6, overhang: 0.4, material: finMat }));
  grp.add(roofPlant({ width: b.w * 0.55, depth: b.d * 0.55, y: b.height + 1.8, seed: b.floors }));
  return { b, grp };
}

/**
 * One Calatrava tree: a trunk that splits into branches following x = k*y^2, so
 * each branch leaves the trunk near-vertical and leans out only as it rises to
 * meet the roof. Returned as a geometry pair so both can be instanced.
 */
function treeGeometries(trunkTop, branchRise, branchReach) {
  const trunk = new THREE.CylinderGeometry(0.42, 0.75, trunkTop, 10);
  trunk.translate(0, trunkTop / 2, 0);

  const pts = [];
  const segments = 10;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Parabolic branch: lateral offset grows with the square of the rise.
    pts.push(new THREE.Vector3(branchReach * t * t, branchRise * t, 0));
  }
  const branch = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.3, 6, false);
  branch.translate(0, trunkTop, 0);
  return { trunk, branch };
}

function galleria() {
  const grp = new THREE.Group();
  grp.name = 'allen-lambert-galleria';
  grp.position.set(g.x, 0, g.z);

  const trunkTop = 7.5;
  const { trunk, branch } = treeGeometries(trunkTop, SPRING_Y - trunkTop, VAULT_RADIUS * 0.72);
  const white = M.steelWhite();

  const PAIRS = 8;
  const halfSpan = g.w / 2 - 6;
  const zOff = VAULT_RADIUS - 1.2;
  const trunks = [];
  const branches = [];
  for (let i = 0; i < PAIRS; i++) {
    const x = -halfSpan + (halfSpan * 2 * (PAIRS === 1 ? 0 : i / (PAIRS - 1)));
    for (const side of [-1, 1]) {
      trunks.push({ x, z: zOff * side });
      // Four branches fanned about the trunk. A branch's local +X maps to world
      // (cos ry, -sin ry), so the base angle points every branch INWARD over the
      // aisle and the spread only fans them along the galleria's length; nothing
      // reaches back out through the glazed side wall.
      const base = side < 0 ? -Math.PI / 2 : Math.PI / 2;
      for (const spread of [-1.0, -0.35, 0.35, 1.0]) {
        branches.push({ x, z: zOff * side, ry: base + spread });
      }
    }
  }
  grp.add(instanced(trunk, white, trunks, { shadow: true }));
  grp.add(instanced(branch, white, branches, { shadow: true }));

  // Glazed barrel over the trees. Half a cylinder laid along X: local +Y becomes
  // world +X, and theta [-PI, 0] is the half that ends up above the springing.
  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(VAULT_RADIUS, VAULT_RADIUS, g.w, 28, 1, true, -Math.PI, Math.PI),
    M.glazingClear()
  );
  vault.rotation.z = -Math.PI / 2;
  vault.position.y = SPRING_Y;
  grp.add(vault);

  const ribGeo = new THREE.TorusGeometry(VAULT_RADIUS, 0.16, 5, 20, Math.PI);
  const ribs = [];
  const ribCount = 17;
  for (let i = 0; i < ribCount; i++) {
    ribs.push({ x: -g.w / 2 + (g.w / (ribCount - 1)) * i, y: SPRING_Y, ry: Math.PI / 2 });
  }
  grp.add(instanced(ribGeo, white, ribs));
  grp.userData.vault = vault;

  // Glazed side walls below the springing line, set just inside the trees.
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(g.w, SPRING_Y), M.glazingClear());
    wall.position.set(0, SPRING_Y / 2, VAULT_RADIUS * side);
    wall.rotation.y = side < 0 ? 0 : Math.PI;
    grp.add(wall);
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(g.w, g.d), M.pathFloor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  grp.add(floor);
  return grp;
}

/** Round-headed opening, extruded once and instanced across a façade. */
function archedOpening(width, height, depth) {
  const r = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, height - r);
  s.absarc(0, height - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 });
}

/** The rebuilt 1845 bank fronts, carved stone, facing Yonge at the Galleria end. */
function heritageFacades() {
  const b = getBuilding('brookfield-heritage-facades');
  const grp = new THREE.Group();
  grp.name = b.id;
  grp.position.set(b.x, 0, b.z);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.height, b.d), M.freestone());
  wall.position.y = b.height / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  grp.add(wall);
  grp.add(plinth({ width: b.w, depth: b.d, height: 1.4, material: M.freestone() }));
  grp.add(cornice({ width: b.w, depth: b.d, y: b.height - 0.6, thickness: 1.3, overhang: 0.9, material: M.freestone() }));

  // The carved elevation is the 34 m grid-east run facing back toward the
  // Galleria and the Yonge corner, not the 12 m return.
  const faceZ = b.d / 2;
  const bays = 7;
  const pilaster = new THREE.BoxGeometry(0.9, b.height - 2.6, 0.55);
  const pilasters = [];
  const openings = [];
  for (let i = 0; i <= bays; i++) {
    const x = -b.w / 2 + (b.w / bays) * i;
    pilasters.push({ x, y: 1.4 + (b.height - 2.6) / 2, z: faceZ });
  }
  const opening = archedOpening(2.0, 3.4, 0.5);
  for (let i = 0; i < bays; i++) {
    const x = -b.w / 2 + (b.w / bays) * (i + 0.5);
    for (const y of [2.2, 8.4]) openings.push({ x, y, z: faceZ + 0.05 });
  }
  const carvedCornice = cornice({ width: b.w, depth: b.d + 1.2, y: b.height + 0.9, thickness: 0.9, overhang: 1.4, material: M.freestone() });
  grp.add(instanced(pilaster, M.freestone(), pilasters, { shadow: true }));
  grp.add(instanced(opening, M.glassDark(), openings));
  grp.add(carvedCornice);
  grp.userData.faceZ = faceZ;
  grp.userData.cornice = carvedCornice;
  return grp;
}

export function build() {
  const root = new THREE.Group();
  root.name = 'brookfield-place';

  const td = tower('td-canada-trust-tower', {
    shellMat: M.glassDark(), finMat: M.steelDark(), chamfer: 5.5,
  });
  const bw = tower('bay-wellington-tower', {
    shellMat: M.glassCool(), finMat: M.limestonePlain(), chamfer: 4.0,
  });
  const gal = galleria();
  const heritage = heritageFacades();
  root.add(td.grp, bw.grp, gal, heritage);

  register({
    id: td.b.id, name: td.b.name, kind: 'landmark', object: td.grp,
    confidence: 'reference', source: 'published height and storey count',
    note: td.b.note,
    data: { address: td.b.address, height: td.b.height, floors: td.b.floors, cladding: 'dark granite and glass' },
  });
  register({
    id: bw.b.id, name: bw.b.name, kind: 'landmark', object: bw.grp,
    confidence: 'reference', source: 'published height and storey count',
    note: bw.b.note,
    data: { address: bw.b.address, height: bw.b.height, floors: bw.b.floors, cladding: 'light granite spandrels' },
  });
  register({
    id: 'allen-lambert-galleria', name: g.name, kind: 'landmark', object: gal,
    confidence: 'reference', source: 'Calatrava scheme: eight tree pairs, six-storey glazed roof',
    note: 'Exterior shell only - the interior fit-out is built by interiors/galleria.js against GALLERIA_BOUNDS. The real roof is a free-form surface; reconstructed here as a constant-radius barrel.',
    data: { address: g.address, trees: 16, bounds: GALLERIA_BOUNDS, architect: 'Santiago Calatrava' },
  });
  register({
    id: 'bfp-galleria-vault', name: 'Allen Lambert Galleria glazed vault', kind: 'infrastructure', object: gal.userData.vault,
    confidence: 'inferred', source: 'photographic proportion',
    note: 'Springing line at y=19 m derived from the database height and the 16 m galleria width.',
    data: { radius: VAULT_RADIUS, springY: SPRING_Y },
  });
  register({
    id: 'brookfield-heritage-facades', name: getBuilding('brookfield-heritage-facades').name,
    kind: 'landmark', object: heritage,
    confidence: 'inferred', source: 'Commercial Bank of the Midland District, 1845, dismantled and rebuilt',
    note: 'Bay count and window rhythm are proportional, not measured. Real stone, reassembled - not a replica screen.',
    data: { address: 'Brookfield Place, Yonge Street', year: 1845, bays: 7 },
  });
  register({
    id: 'bfp-heritage-cornice', name: 'Heritage façade cornice', kind: 'prop', object: heritage.userData.cornice,
    confidence: 'approximated', source: 'proportional reconstruction',
    note: 'Projecting stone cornice above the reassembled bank fronts; profile simplified to a single band.',
    data: {},
  });

  return root;
}
