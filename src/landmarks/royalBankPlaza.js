/**
 * Royal Bank Plaza, 200 Bay Street (WZMH / Boris Zerafa, 1976 and 1979).
 *
 * Facts encoded here:
 *   - Two TRIANGULAR towers on the north-west corner of Front and Bay, south
 *     tower 41 storeys / 180 m, north tower 26 storeys / 114 m.
 *   - Both faces are serrated: the triangular plan is stepped into narrow
 *     vertical bays so each elevation is a sawtooth of small facets rather than
 *     a flat plane. This is what makes the towers flash gold at grazing angles
 *     instead of reading as a yellow slab, so the serration is modelled in the
 *     footprint itself and not faked with a texture.
 *   - The curtain wall carries roughly 71 kg of gold fused into the glazing.
 *     M.goldGlass() is a warm metal, not a paint colour.
 *   - The open plaza/atrium BETWEEN the two towers was built over in the 1990s
 *     with a glazed banking hall, so the gap is not empty at street level.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { prism, plinth, roofPlant } from '../world/buildingKit.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';

/** Extruded footprint standing on the Y=0 datum, shadow-enabled. */
function footprintMesh(points, height, material) {
  const mesh = new THREE.Mesh(prism(points, height), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Equilateral triangle of circumradius `r`, each edge broken into `teeth`
 * vertical bays that step out by `tooth` metres. Returned as grid (x, z) pairs.
 */
function serratedTriangle(r, teeth, tooth, rotation = 0) {
  const corner = (i) => {
    const a = rotation + (i * 2 * Math.PI) / 3;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const pts = [];
  for (let e = 0; e < 3; e++) {
    const [ax, az] = corner(e);
    const [bx, bz] = corner(e + 1);
    for (let k = 0; k < teeth; k++) {
      const t0 = k / teeth;
      const t1 = (k + 0.5) / teeth;
      pts.push([ax + (bx - ax) * t0, az + (bz - az) * t0]);
      // Raised point pushed along the outward radial, which for an equilateral
      // triangle centred on the origin is simply the normalised midpoint.
      const mx = ax + (bx - ax) * t1;
      const mz = az + (bz - az) * t1;
      const len = Math.hypot(mx, mz) || 1;
      pts.push([mx + (mx / len) * tooth, mz + (mz / len) * tooth]);
    }
  }
  return pts;
}

/** Storey bands: one InstancedMesh for the whole tower keeps 41 floors at one draw call. */
function storeyBands(points, floors, floorHeight, material) {
  const swell = 1.008; // ride just proud of the shell so the line reads in silhouette
  const band = prism(points.map(([x, z]) => [x * swell, z * swell]), 0.32);
  const im = new THREE.InstancedMesh(band, material, floors);
  const m = new THREE.Matrix4();
  for (let f = 0; f < floors; f++) im.setMatrixAt(f, m.makeTranslation(0, (f + 1) * floorHeight - 0.32, 0));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = false;
  return im;
}

/** One faceted gold tower, positioned in world space by its database record. */
function tower(b, { circumradius, teeth }) {
  const g = new THREE.Group();
  g.name = b.id;
  g.position.set(b.x, 0, b.z);

  // Rotation 0 puts a vertex grid-east and the opposite flat face toward Bay.
  const ring = serratedTriangle(circumradius, teeth, 1.3);
  g.add(footprintMesh(ring, b.height, M.goldGlass()));
  g.add(storeyBands(ring, b.floors, b.height / b.floors, M.steelDark()));
  g.add(plinth({ width: b.w * 0.94, depth: b.d * 0.94, height: 5.5, material: M.steelDark() }));
  g.add(roofPlant({ width: b.w * 0.5, depth: b.d * 0.5, y: b.height, seed: b.floors }));
  return g;
}

/** The 1990s infill banking hall that closed the gap between the two towers. */
function bankingHall(southZ, northZ, x) {
  const g = new THREE.Group();
  g.name = 'rbp-atrium';
  const width = 40;
  const depth = southZ - northZ;
  const height = 15.6; // four storeys at ~3.9 m
  g.position.set(x, 0, (southZ + northZ) / 2);

  const shell = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), M.glazingClear());
  shell.position.y = height / 2;
  g.add(shell);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 0.8, depth + 1.2), M.steelWhite());
  roof.position.y = height + 0.4;
  roof.castShadow = true;
  g.add(roof);

  // Mullion grid on the two long (grid east/west) elevations, one instance set.
  const bays = 11;
  const mullion = new THREE.BoxGeometry(0.22, height, 0.22);
  const im = new THREE.InstancedMesh(mullion, M.steelWhite(), bays * 2);
  const m = new THREE.Matrix4();
  for (let i = 0; i < bays; i++) {
    const z = -depth / 2 + (depth / (bays - 1)) * i;
    im.setMatrixAt(i, m.makeTranslation(-width / 2, height / 2, z));
    im.setMatrixAt(i + bays, m.makeTranslation(width / 2, height / 2, z));
  }
  im.instanceMatrix.needsUpdate = true;
  g.add(im);
  return g;
}

export function build() {
  const root = new THREE.Group();
  root.name = 'royal-bank-plaza';

  const south = getBuilding('royal-bank-plaza-s');
  const north = getBuilding('royal-bank-plaza-n');
  if (!south || !north) throw new Error('royalBankPlaza: building records missing');

  // Circumradius chosen so the triangle fits the database footprint square:
  // an equilateral triangle of radius R spans sqrt(3)R across its flat face.
  const sTower = tower(south, { circumradius: south.w / Math.sqrt(3), teeth: 7 });
  const nTower = tower(north, { circumradius: north.w / Math.sqrt(3), teeth: 6 });
  const atrium = bankingHall(south.z - south.d / 2, north.z + north.d / 2, south.x);

  root.add(sTower, nTower, atrium);

  register({
    id: south.id, name: south.name, kind: 'landmark', object: sTower,
    confidence: 'reference', source: 'published height/storey count; triangular plan from survey imagery',
    note: 'Serration modelled as seven stepped bays per triangular face; the real bay count was not counted from survey drawings.',
    data: { address: south.address, height: south.height, floors: south.floors, cladding: 'gold-fused glazing' },
  });
  register({
    id: north.id, name: north.name, kind: 'landmark', object: nTower,
    confidence: 'reference', source: 'published height/storey count',
    note: 'Six stepped bays per face, approximated from the south tower rhythm.',
    data: { address: north.address, height: north.height, floors: north.floors },
  });
  register({
    id: 'rbp-atrium', name: 'Royal Bank Plaza banking hall', kind: 'landmark', object: atrium,
    confidence: 'inferred', source: 'block geometry between the two tower footprints',
    note: 'The 1990s glazed infill over the original open plaza. Extent taken from the gap between the two database footprints, not from drawings.',
    data: { storeys: 4, address: '200 Bay Street' },
  });

  return root;
}
