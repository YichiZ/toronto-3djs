/**
 * Reusable architectural primitives.
 *
 * Landmark modules and the generic building builder both draw from this kit, so
 * a cornice on the Royal York and a cornice on an anonymous Front Street infill
 * block are built the same way and share materials. Every helper returns a fresh
 * Object3D positioned in its own local space with the origin at the ground
 * centre of the footprint, unless documented otherwise.
 */
import * as THREE from 'three';
import { M, facadeMaterial } from '../core/materials.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/**
 * Extruded prism from a 2D footprint given in grid metres (x, z pairs).
 * @param {Array<[number, number]>} points closed or open ring, CCW
 * @param {number} height
 */
export function prism(points, height) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 12 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Rectangular massing volume with a façade map whose UV repeat matches the real
 * floor count, so storey lines land at plausible heights instead of stretching.
 */
export function massing({ width, depth, height, floors, kind = 'punched', palette = {}, material }) {
  const storeys = floors ?? Math.max(1, Math.round(height / 3.6));
  const mat =
    material ??
    facadeMaterial(kind, {
      floors: storeys,
      baysAcross: Math.max(4, Math.round(width / 3.2)),
      ...palette,
    });
  const mesh = new THREE.Mesh(box(width, height, depth), mat);
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Projecting cornice / entablature band wrapping a rectangular volume. */
export function cornice({ width, depth, y, thickness = 1.1, overhang = 0.7, material = M.limestone() }) {
  const mesh = new THREE.Mesh(box(width + overhang * 2, thickness, depth + overhang * 2), material);
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Continuous base course / plinth. */
export function plinth({ width, depth, height = 1.2, material = M.limestone() }) {
  const mesh = new THREE.Mesh(box(width + 0.5, height, depth + 0.5), material);
  mesh.position.y = height / 2;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A run of columns, instanced.
 *
 * @param {object} o
 * @param {number} o.count number of columns
 * @param {number} o.spacing centre-to-centre, metres
 * @param {number} o.height shaft height including capital
 * @param {number} o.diameter shaft diameter at the base
 * @param {'tuscan'|'doric'|'plain'} [o.order]
 * @param {'x'|'z'} [o.axis] direction the run marches along
 */
export function colonnade({ count, spacing, height, diameter, order = 'tuscan', axis = 'x', material = M.limestone() }) {
  const group = new THREE.Group();
  const r = diameter / 2;
  // Roman Tuscan: unfluted shaft with a slight entasis, simple echinus + abacus.
  const shaftGeo = new THREE.CylinderGeometry(r * 0.86, r, height * 0.88, 20, 3);
  const shafts = new THREE.InstancedMesh(shaftGeo, material, count);
  const echinusGeo = new THREE.CylinderGeometry(r * 1.18, r * 0.9, height * 0.05, 20);
  const echinus = new THREE.InstancedMesh(echinusGeo, material, count);
  const abacusGeo = box(diameter * 2.5 * 0.55, height * 0.045, diameter * 2.5 * 0.55);
  const abacus = new THREE.InstancedMesh(abacusGeo, material, count);
  const baseGeo = new THREE.CylinderGeometry(r * 1.16, r * 1.24, height * 0.06, 20);
  const base = new THREE.InstancedMesh(baseGeo, material, count);

  const m = new THREE.Matrix4();
  const span = (count - 1) * spacing;
  for (let i = 0; i < count; i++) {
    const t = -span / 2 + i * spacing;
    const px = axis === 'x' ? t : 0;
    const pz = axis === 'z' ? t : 0;
    base.setMatrixAt(i, m.makeTranslation(px, height * 0.03, pz));
    shafts.setMatrixAt(i, m.makeTranslation(px, height * 0.06 + (height * 0.88) / 2, pz));
    echinus.setMatrixAt(i, m.makeTranslation(px, height * 0.955, pz));
    abacus.setMatrixAt(i, m.makeTranslation(px, height * 0.9825, pz));
  }
  for (const im of [base, shafts, echinus, abacus]) {
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  }
  group.userData.order = order;
  group.userData.count = count;
  return group;
}

/**
 * Ground-floor retail band: glazed bays with mullions, transoms and a sill.
 * Returns a group plus the per-bay frontage anchors so the tenant layer can
 * attach signage and interaction volumes.
 *
 * @returns {{group: THREE.Group, bays: Array<{x:number, width:number}>}}
 */
export function storefrontBand({ width, height = 4.2, bayWidth = 5.5, depth = 0.35, glass = 0x2b3a42 }) {
  const group = new THREE.Group();
  const count = Math.max(1, Math.round(width / bayWidth));
  const actual = width / count;
  const frameMat = M.paintedSteel(0x24282d);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: glass, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.72,
  });

  const glassGeo = box(actual - 0.35, height - 0.9, 0.06);
  const glassMesh = new THREE.InstancedMesh(glassGeo, glassMat, count);
  const mullionGeo = box(0.18, height, 0.3);
  const mullions = new THREE.InstancedMesh(mullionGeo, frameMat, count + 1);
  const m = new THREE.Matrix4();
  const bays = [];

  for (let i = 0; i < count; i++) {
    const cx = -width / 2 + actual * (i + 0.5);
    glassMesh.setMatrixAt(i, m.makeTranslation(cx, height / 2 - 0.15, depth * 0.5));
    bays.push({ x: cx, width: actual });
  }
  for (let i = 0; i <= count; i++) {
    mullions.setMatrixAt(i, m.makeTranslation(-width / 2 + actual * i, height / 2, depth * 0.5));
  }
  glassMesh.instanceMatrix.needsUpdate = true;
  mullions.instanceMatrix.needsUpdate = true;

  // continuous transom above and stone sill below
  const transom = new THREE.Mesh(box(width, 0.45, depth + 0.2), frameMat);
  transom.position.set(0, height - 0.2, depth * 0.5);
  const sill = new THREE.Mesh(box(width, 0.35, depth + 0.3), M.limestonePlain());
  sill.position.set(0, 0.17, depth * 0.5);

  group.add(glassMesh, mullions, transom, sill);
  group.castShadow = true;
  return { group, bays };
}

/** Flat canvas awning over a storefront bay. */
export function awning({ width, depth = 1.5, color = 0x7a2b30, y = 3.4 }) {
  const g = new THREE.Group();
  const canvasMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
  const shape = new THREE.Mesh(box(width, 0.08, depth), canvasMat);
  shape.rotation.x = -0.22;
  shape.position.set(0, y, depth / 2);
  const valance = new THREE.Mesh(box(width, 0.32, 0.06), canvasMat);
  valance.position.set(0, y - 0.32, depth);
  g.add(shape, valance);
  g.castShadow = true;
  return g;
}

/** Recessed entrance doorway with a header. */
export function doorway({ width = 2.4, height = 3.0, recess = 0.5 }) {
  const g = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1c262c, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.8 });
  const leaf = new THREE.Mesh(box(width - 0.2, height - 0.2, 0.08), glassMat);
  leaf.position.set(0, height / 2, -recess);
  const frame = new THREE.Mesh(box(width, height, 0.12), M.paintedSteel(0x1e2226));
  frame.position.set(0, height / 2, -recess + 0.08);
  const jambL = new THREE.Mesh(box(0.25, height, recess), M.limestonePlain());
  jambL.position.set(-width / 2, height / 2, -recess / 2);
  const jambR = jambL.clone();
  jambR.position.x = width / 2;
  g.add(leaf, frame, jambL, jambR);
  return g;
}

/** Regular grid of punched window reveals, instanced, for masonry façades. */
export function windowGrid({ width, floors, floorHeight = 3.6, baseY = 0, bayWidth = 3.2, winW = 1.5, winH = 2.0, depth = 0.18 }) {
  const cols = Math.max(1, Math.floor(width / bayWidth));
  const total = cols * floors;
  const geo = box(winW, winH, depth);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f3c45, roughness: 0.18, metalness: 0.5 });
  const im = new THREE.InstancedMesh(geo, mat, total);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const x = -width / 2 + (width / cols) * (c + 0.5);
      const y = baseY + f * floorHeight + floorHeight * 0.55;
      im.setMatrixAt(i++, m.makeTranslation(x, y, 0));
    }
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = false;
  return im;
}

/** Rooftop mechanical penthouse plus a few units, so no roof reads as bare. */
export function roofPlant({ width, depth, y, seed = 0 }) {
  const g = new THREE.Group();
  const mat = M.concretePlain();
  const ph = new THREE.Mesh(box(width * 0.34, 3.4, depth * 0.34), mat);
  ph.position.set(width * 0.06, y + 1.7, -depth * 0.05);
  ph.castShadow = true;
  g.add(ph);
  const unitMat = M.steelDark();
  const count = 3 + (seed % 3);
  for (let i = 0; i < count; i++) {
    const w = 1.6 + ((seed + i * 7) % 5) * 0.4;
    const u = new THREE.Mesh(box(w, 1.1, w * 0.7), unitMat);
    u.position.set(
      (((seed + i * 13) % 10) / 10 - 0.5) * width * 0.7,
      y + 0.55,
      (((seed + i * 29) % 10) / 10 - 0.5) * depth * 0.7
    );
    u.castShadow = true;
    g.add(u);
  }
  const parapet = new THREE.Mesh(box(width + 0.3, 1.0, depth + 0.3), M.concretePlain());
  parapet.position.y = y + 0.5;
  const inner = new THREE.Mesh(box(width - 0.9, 1.2, depth - 0.9), M.concretePlain());
  inner.position.y = y + 0.5;
  // cheap hollow parapet: draw the ring only
  parapet.geometry = ringGeometry(width + 0.3, depth + 0.3, 0.45, 1.0);
  inner.visible = false;
  g.add(parapet);
  return g;
}

/** Hollow rectangular ring, used for parapets and planter walls. */
export function ringGeometry(width, depth, thickness, height) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  const hole = new THREE.Path();
  const iw = width / 2 - thickness;
  const id = depth / 2 - thickness;
  hole.moveTo(-iw, -id);
  hole.lineTo(-iw, id);
  hole.lineTo(iw, id);
  hole.lineTo(iw, -id);
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  // Same handedness fix as prism(): rotateX(+PI/2) preserves the footprint and
  // puts the extrusion in [-height, 0], which the half-height lift centres.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

/** Setback tower: a stack of progressively smaller slabs. */
export function setbackTower({ width, depth, floors, floorHeight = 3.8, setbacks = [], kind = 'curtain', palette = {} }) {
  const g = new THREE.Group();
  let y = 0;
  let w = width;
  let d = depth;
  let remaining = floors;
  const stages = setbacks.length ? setbacks : [{ floors, inset: 0 }];
  for (let i = 0; i < stages.length && remaining > 0; i++) {
    const f = Math.min(stages[i].floors, remaining);
    const h = f * floorHeight;
    w -= (stages[i].inset ?? 0) * 2;
    d -= (stages[i].inset ?? 0) * 2;
    const slab = massing({ width: w, depth: d, height: h, floors: f, kind, palette });
    slab.position.y = y + h / 2;
    g.add(slab);
    y += h;
    remaining -= f;
  }
  g.userData.topY = y;
  return g;
}
