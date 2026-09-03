/**
 * The Gooderham Building (Flatiron), 49 Wellington Street East, 1892 (David
 * Roberts Jr.), plus Berczy Park on the same wedge.
 *
 * Facts encoded here:
 *   - A WEDGE plan filling the convergence of Front, Wellington and Church, with
 *     a ROUNDED west prow - not a sharp point like New York's Flatiron. The
 *     rounded prow is the reason the building photographs the way it does, so
 *     the footprint is built as a polygon with a semicircular west end rather
 *     than approximated with a box.
 *   - Red brick with stone banding, round-arched windows, a heavy bracketed
 *     cornice, and a conical copper-roofed turret rising from the prow.
 *   - Five storeys, 21 m to the main roof; the turret rises above that.
 *   - Berczy Park occupies the rest of the wedge, with the dog fountain as a
 *     tiered circular basin. Trees are planted by systems/vegetation.js.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { prism, plinth } from '../world/buildingKit.js';
import { M } from '../core/materials.js';
import { register, registerInteractive } from '../core/registry.js';
import { tenantsFor } from '../data/tenants.js';

const b = getBuilding('gooderham-flatiron');

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

const PROW_R = 5.0;
const PROW_CX = -b.w / 2 + PROW_R + 1;   // arc centre, one metre in from the west face
const EAST_X = b.w / 2;
const HALF_D = b.d / 2;

/** Wedge footprint: flat east end, tapering west to a semicircular prow. */
function wedgeFootprint() {
  const pts = [[EAST_X, -HALF_D], [EAST_X, HALF_D], [PROW_CX, PROW_R]];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / steps; // 90 deg round to 270 deg
    pts.push([PROW_CX + Math.cos(a) * PROW_R, Math.sin(a) * PROW_R]);
  }
  pts.push([PROW_CX, -PROW_R]);
  return pts;
}

/** Scale a footprint about the origin, for banding courses and the cornice. */
const swell = (pts, k) => pts.map(([x, z]) => [x * k, z * k]);

/** Round-headed window, extruded once, instanced across the tapering elevations. */
function archedWindow(width, height, depth) {
  const r = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, height - r);
  s.absarc(0, height - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 });
}

/**
 * Window and bracket placements along one tapering flank. The flank is not
 * axis-aligned, so every instance carries the edge's own outward normal.
 */
function flank(sign) {
  const ax = EAST_X;
  const az = HALF_D * sign;
  const bx = PROW_CX;
  const bz = PROW_R * sign;
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  // Outward normal of a segment, flipped to point away from the wedge centreline.
  let nx = dz / len;
  let nz = -dx / len;
  if (nz * sign < 0) { nx = -nx; nz = -nz; }
  const ry = Math.atan2(nx, nz);
  return { ax, az, dx, dz, len, nx, nz, ry };
}

function building() {
  const root = new THREE.Group();
  root.name = 'gooderham-flatiron';
  root.position.set(b.x, 0, b.z);

  const pts = wedgeFootprint();
  root.add(footprintMesh(pts, b.height, M.brick()));
  root.add(plinth({ width: b.w * 0.7, depth: b.d * 0.7, height: 1.2, material: M.limestonePlain() }));

  // Stone banding at the storey lines: the same footprint, swollen a touch so
  // the course stands proud of the brick and catches a shadow.
  const floorH = b.height / b.floors;
  const bandGeo = prism(swell(pts, 1.012), 0.55);
  const bands = [];
  for (let f = 1; f < b.floors; f++) bands.push({ y: f * floorH - 0.55 });
  root.add(instanced(bandGeo, M.limestonePlain(), bands));

  // Windows: four storeys of round-headed openings on each tapering flank.
  const winGeo = archedWindow(1.5, 2.6, 0.4);
  const bracketGeo = new THREE.BoxGeometry(0.4, 0.85, 1.1);
  const windows = [];
  const brackets = [];
  for (const sign of [-1, 1]) {
    const f = flank(sign);
    const bays = 11;
    for (let i = 0; i < bays; i++) {
      const t = (i + 0.5) / bays;
      const px = f.ax + f.dx * t + f.nx * 0.06;
      const pz = f.az + f.dz * t + f.nz * 0.06;
      for (let s = 1; s < b.floors; s++) {
        windows.push({ x: px, y: s * floorH + 0.7, z: pz, ry: f.ry });
      }
    }
    for (let i = 0; i <= bays * 2; i++) {
      const t = i / (bays * 2);
      brackets.push({
        x: f.ax + f.dx * t + f.nx * 0.75,
        y: b.height - 1.5,
        z: f.az + f.dz * t + f.nz * 0.75,
        ry: f.ry,
      });
    }
  }
  root.add(instanced(winGeo, M.glassDark(), windows));
  root.add(instanced(bracketGeo, M.limestonePlain(), brackets));

  // Heavy bracketed cornice: a projecting course following the whole wedge.
  const corniceMesh = footprintMesh(swell(pts, 1.055), 1.4, M.limestonePlain());
  corniceMesh.position.y = b.height - 1.4;
  root.add(corniceMesh);

  // ---- prow turret ---------------------------------------------------------
  const turret = new THREE.Group();
  turret.name = 'fi-turret';
  turret.position.set(PROW_CX, 0, 0);
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(PROW_R * 0.92, PROW_R * 0.92, 4.2, 20), M.brick()
  );
  drum.position.y = b.height + 2.1;
  drum.castShadow = true;
  const cornice = new THREE.Mesh(
    new THREE.CylinderGeometry(PROW_R * 1.05, PROW_R * 1.0, 0.7, 20), M.limestonePlain()
  );
  cornice.position.y = b.height + 4.5;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(PROW_R * 1.02, 9.5, 20), M.copper());
  cone.position.y = b.height + 9.6;
  cone.castShadow = true;
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.0, 8), M.copper());
  finial.position.y = b.height + 15.3;
  turret.add(drum, cornice, cone, finial);
  root.add(turret);

  // Ground-floor frontage on the south (Front Street) flank.
  const tenants = tenantsFor('gooderham-flatiron', 'south');
  const f = flank(1);
  tenants.slice(0, 2).forEach((tenant, i) => {
    const t = 0.25 + i * 0.3;
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(f.len * 0.24, 3.4, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(f.ax + f.dx * t + f.nx * 0.8, 1.8, f.az + f.dz * t + f.nz * 0.8);
    hit.rotation.y = f.ry;
    registerInteractive(hit, {
      building: b.name,
      address: b.address,
      tenant: tenant.name,
      category: tenant.category,
      confidence: tenant.confidence,
      note: tenant.note ?? '',
    });
    root.add(hit);
  });

  root.userData.turret = turret;
  root.userData.cornice = corniceMesh;
  return root;
}

/**
 * Berczy Park. Paved triangular surface, low seat walls, and the dog fountain
 * read as a tiered circular basin. Kept deliberately sparse - the fountain's
 * twenty-seven cast-iron dogs are not modelled and are not claimed.
 */
function berczyPark() {
  const g = new THREE.Group();
  g.name = 'berczy-park';
  const W = 44;
  const D = 40;
  g.position.set(340, 0, -116);

  const paving = footprintMesh([[-W / 2, D / 2], [W / 2, D / 2], [W / 2 - 6, -D / 2]], 0.16, M.forecourt());
  paving.castShadow = false;
  g.add(paving);

  const grassPatch = new THREE.Mesh(new THREE.CircleGeometry(9, 24), M.grass());
  grassPatch.rotation.x = -Math.PI / 2;
  grassPatch.position.set(-6, 0.18, 4);
  grassPatch.receiveShadow = true;
  g.add(grassPatch);

  // Low seat walls along the two long edges.
  const wallGeo = new THREE.BoxGeometry(6.0, 0.5, 0.6);
  const walls = [];
  for (let i = 0; i < 6; i++) walls.push({ x: -W / 2 + 4 + i * 6.4, y: 0.35, z: D / 2 - 1.2 });
  for (let i = 0; i < 5; i++) walls.push({ x: W / 2 - 3.5, y: 0.35, z: -D / 2 + 5 + i * 7.2, ry: Math.PI / 2 });
  g.add(instanced(wallGeo, M.limestonePlain(), walls));

  // Dog fountain: tiered circular basin.
  const fountain = new THREE.Group();
  fountain.name = 'fi-dog-fountain';
  fountain.position.set(6, 0, -2);
  const basinWall = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.4, 0.9, 32), M.limestonePlain());
  basinWall.position.y = 0.45;
  basinWall.castShadow = true;
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(5.9, 5.9, 0.7, 32), M.water());
  pool.position.y = 0.5;
  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.45, 24), M.limestonePlain());
  tier1.position.y = 1.6;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 2.2, 16), M.limestonePlain());
  stem.position.y = 1.1;
  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.35, 20), M.limestonePlain());
  tier2.position.y = 2.9;
  const upperStem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.3, 12), M.limestonePlain());
  upperStem.position.y = 2.4;
  const spill1 = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.12, 24), M.water());
  spill1.position.y = 1.84;
  fountain.add(basinWall, pool, stem, tier1, upperStem, tier2, spill1);
  g.add(fountain);

  g.userData.fountain = fountain;
  return g;
}

export function build() {
  const root = new THREE.Group();
  root.name = 'flatiron-and-berczy';

  const gooderham = building();
  const park = berczyPark();
  root.add(gooderham, park);

  register({
    id: 'gooderham-flatiron', name: b.name, kind: 'landmark', object: gooderham,
    confidence: 'reference', source: '1892 David Roberts Jr.; wedge plan and rounded prow from survey imagery',
    note: b.note,
    data: { address: b.address, year: 1892, floors: b.floors, height: b.height, materials: ['red brick', 'stone banding', 'copper turret roof'] },
  });
  register({
    id: 'fi-turret', name: 'Gooderham Building prow turret', kind: 'prop', object: gooderham.userData.turret,
    confidence: 'reference', source: 'photographic proportion',
    note: 'Conical copper roof over the rounded west prow. Height above the main cornice is estimated at 15 m.',
    data: { material: 'copper', apexY: b.height + 16 },
  });
  register({
    id: 'fi-cornice', name: 'Bracketed cornice', kind: 'prop', object: gooderham.userData.cornice,
    confidence: 'inferred', source: 'proportional reconstruction',
    note: 'Bracket spacing is proportional; the real modillion count was not counted from elevation drawings.',
    data: {},
  });
  register({
    id: 'berczy-park', name: 'Berczy Park', kind: 'landmark', object: park,
    confidence: 'approximated', source: 'block geometry of the Front / Wellington / Church wedge',
    note: 'PLACEMENT CAVEAT: the real park fills the wedge immediately east of the Gooderham Building, but the database footprint for the building leaves no room there, so the park is placed just north-east of it inside the same wedge. Trees are planted by systems/vegetation.js, not here.',
    data: { area: 'approx 1760 m2', features: ['paved plaza', 'seat walls', 'dog fountain'] },
  });
  register({
    id: 'fi-dog-fountain', name: 'Berczy Park dog fountain', kind: 'prop', object: park.userData.fountain,
    confidence: 'inferred', source: '2017 Claude Cormier + Associes redesign',
    note: 'Read as a tiered circular basin only. The twenty-seven cast-iron dogs and the bone finial are NOT modelled and are not claimed.',
    data: { tiers: 3 },
  });

  return root;
}
