/**
 * Fairmont Royal York — 100 Front Street West.
 *
 * Facts the geometry encodes:
 *  - It sits on the NORTH side of Front, directly across from Union Station's
 *    portico. Its south elevation and the station's colonnade face each other
 *    across the widest stretch of Front Street West.
 *  - Château style, 1929, Ross & Macdonald: a wide limestone-and-ochre-brick
 *    base block, an arcaded ground storey, a strong cornice at the top of the
 *    base, a slab tower rising out of the middle of it, and a steeply pitched
 *    GREEN COPPER roof crowned with dormers. Copper-roofed pavilions cap the
 *    corners of the base block.
 *  - 124 m to the roof, 28 storeys: nine in the base, nineteen in the shaft.
 *    It was the tallest building in the British Empire when it opened.
 *  - The porte-cochère is on Front (south, +Z); Front Street retail flanks it.
 *
 * The wordmark band is drawn as original canvas lettering at signage scale —
 * a discreet band on the base, not a billboard, and no scraped brand artwork.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { M, facadeMaterial } from '../core/materials.js';
import { massing, cornice, plinth, storefrontBand, awning, doorway } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';
import { tenantsFor } from '../data/tenants.js';

// --- Elevation schedule, metres --------------------------------------------
const BASE_TOP = 34;      // nine storeys of base block
const SHOULDER_TOP = 76;  // flanking wings, half way up the shaft
const SHAFT_TOP = 106;    // eaves of the château roof
const ROOF_TOP = 124;     // building DB height
const TOWER_W = 72;
const TOWER_D = 54;
const ARCADE_H = 7.5;     // the arched ground storey

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Ochre brick-and-stone shaft treatment, shared through the material cache. */
const shaftFacade = (floors, width) =>
  facadeMaterial('punched', {
    floors,
    baysAcross: Math.max(4, Math.round(width / 3.4)),
    wall: '#c3b193',
    glass: '#3b464f',
  });

/**
 * Rectangular steep pyramid, the château roof primitive.
 * A 4-sided cylinder rotated 45 deg gives an axis-aligned square whose half-side
 * is r/sqrt(2); scaling by sqrt(2) * half-extent lands it on the exact footprint.
 */
function hipRoof(width, depth, height, material = M.copper()) {
  const geo = new THREE.CylinderGeometry(0.001, 1, height, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.scale((width / 2) * Math.SQRT2, 1, (depth / 2) * Math.SQRT2);
  geo.translate(0, height / 2, 0);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** One round-arched window opening, extruded, for instancing along the arcade. */
function archedWindowGeometry(width, height, depth = 0.3) {
  const r = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(-r, height - r);
  shape.absarc(0, height - r, r, Math.PI, 0, true);
  shape.lineTo(r, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Arcade rhythm across one elevation: instanced arched openings. */
function arcade({ length, count, sillY = 1.6, width = 3.0, height = 5.2 }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x33404a, roughness: 0.2, metalness: 0.45 });
  const im = new THREE.InstancedMesh(archedWindowGeometry(width, height), mat, count);
  const m = new THREE.Matrix4();
  const span = length - width * 1.6;
  for (let i = 0; i < count; i++) {
    const t = -span / 2 + (span / (count - 1)) * i;
    im.setMatrixAt(i, m.makeTranslation(t, sillY, 0));
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = false;
  return im;
}

/** Copper-roofed dormers ringing the base of the château roof, instanced. */
function dormers({ width, depth, y, perSide = 5 }) {
  const g = new THREE.Group();
  const total = perSide * 2;
  const bodyGeo = box(2.2, 2.6, 1.6);
  const bodies = new THREE.InstancedMesh(bodyGeo, M.limestonePlain(), total);
  const capGeo = new THREE.CylinderGeometry(0.001, 1, 1.4, 4, 1);
  capGeo.rotateY(Math.PI / 4);
  capGeo.scale(1.3 * Math.SQRT2, 1, 1.0 * Math.SQRT2);
  capGeo.translate(0, 0.7, 0);
  const caps = new THREE.InstancedMesh(capGeo, M.copper(), total);

  const m = new THREE.Matrix4();
  let i = 0;
  for (const sign of [-1, 1]) {
    for (let k = 0; k < perSide; k++) {
      const x = (-0.5 + (k + 0.5) / perSide) * (width - 8);
      const z = sign * (depth / 2 - 2.2);
      bodies.setMatrixAt(i, m.makeTranslation(x, y + 1.3, z));
      caps.setMatrixAt(i, m.makeTranslation(x, y + 2.6, z));
      i++;
    }
  }
  bodies.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  bodies.castShadow = true;
  g.add(bodies, caps);
  return g;
}

/** Discreet wordmark band: bronze letters on a dark stone panel. */
function wordmarkTexture(text) {
  const w = 1024;
  const h = 128;
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('royalYork: 2d context unavailable for the wordmark');
  ctx.fillStyle = '#2a2721';
  ctx.fillRect(0, 0, w, h);
  ctx.font = '500 52px Georgia, "Times New Roman", serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#00000055';
  ctx.fillText(text, w / 2 + 2, h / 2 + 3);
  ctx.fillStyle = '#c9a86a';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Canopy on four posts over the Front Street arrivals drive. */
function porteCochere({ width = 30, projection = 6.5, y = 6.0 }) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(box(width, 0.7, projection), M.limestonePlain());
  deck.position.set(0, y, projection / 2);
  deck.castShadow = true;
  g.add(deck);
  const trim = new THREE.Mesh(box(width + 0.8, 0.5, projection + 0.8), M.copper());
  trim.position.set(0, y + 0.6, projection / 2);
  g.add(trim);

  const postGeo = new THREE.CylinderGeometry(0.42, 0.5, y, 12);
  const posts = new THREE.InstancedMesh(postGeo, M.limestone(), 4);
  const m = new THREE.Matrix4();
  let i = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [0.32, 0.92]) {
      posts.setMatrixAt(i++, m.makeTranslation(sx * (width / 2 - 1.6), y / 2, projection * sz));
    }
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.castShadow = true;
  g.add(posts);
  return g;
}

export function build() {
  const b = getBuilding('royal-york');
  if (!b) throw new Error('royalYork: building record "royal-york" is missing');

  const root = new THREE.Group();
  root.name = 'royal-york';
  root.position.set(b.x, 0, b.z);

  const halfW = b.w / 2;
  const halfD = b.d / 2;
  const southZ = halfD; // Front Street elevation

  // --- Base block ---------------------------------------------------------
  const base = new THREE.Group();
  const baseMass = new THREE.Mesh(
    box(b.w, BASE_TOP, b.d),
    shaftFacade(9, b.w)
  );
  baseMass.position.y = BASE_TOP / 2;
  baseMass.castShadow = true;
  baseMass.receiveShadow = true;
  base.add(baseMass);
  base.add(plinth({ width: b.w, depth: b.d, height: ARCADE_H * 0.22, material: M.limestone() }));
  // Strong cornice separating base from shaft — the château profile depends on it.
  base.add(cornice({ width: b.w, depth: b.d, y: BASE_TOP + 0.6, thickness: 1.4, overhang: 1.1 }));
  root.add(base);

  // --- Arcaded ground storey ---------------------------------------------
  const arcades = new THREE.Group();
  const southArcade = arcade({ length: b.w - 6, count: 21, sillY: 5.2, width: 3.0, height: 5.0 });
  southArcade.position.set(0, 0, southZ + 0.16);
  arcades.add(southArcade);
  for (const [sign, rot] of [[1, Math.PI / 2], [-1, -Math.PI / 2]]) {
    const side = arcade({ length: b.d - 6, count: 15, sillY: 5.2, width: 3.0, height: 5.0 });
    side.position.set(sign * (halfW + 0.16), 0, 0);
    side.rotation.y = rot;
    arcades.add(side);
  }
  root.add(arcades);

  // --- Corner pavilions on the base block --------------------------------
  const pavilions = new THREE.Group();
  const pavGeo = box(15, 11, 15);
  const pavBodies = new THREE.InstancedMesh(pavGeo, M.limestone(), 4);
  const m4 = new THREE.Matrix4();
  const corners = [];
  let ci = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = sx * (halfW - 8);
      const pz = sz * (halfD - 8);
      corners.push([px, pz]);
      pavBodies.setMatrixAt(ci++, m4.makeTranslation(px, BASE_TOP + 5.5, pz));
    }
  }
  pavBodies.instanceMatrix.needsUpdate = true;
  pavBodies.castShadow = true;
  pavilions.add(pavBodies);
  const pavRoofGeo = new THREE.CylinderGeometry(0.001, 1, 9, 4, 1);
  pavRoofGeo.rotateY(Math.PI / 4);
  pavRoofGeo.scale(7.5 * Math.SQRT2, 1, 7.5 * Math.SQRT2);
  pavRoofGeo.translate(0, 4.5, 0);
  const pavRoofs = new THREE.InstancedMesh(pavRoofGeo, M.copper(), 4);
  corners.forEach(([px, pz], i) => pavRoofs.setMatrixAt(i, m4.makeTranslation(px, BASE_TOP + 11, pz)));
  pavRoofs.instanceMatrix.needsUpdate = true;
  pavRoofs.castShadow = true;
  pavilions.add(pavRoofs);
  root.add(pavilions);

  // --- Shoulder wings and the main shaft ---------------------------------
  const tower = new THREE.Group();
  for (const sign of [-1, 1]) {
    const shoulder = massing({
      width: 26, depth: 44, height: SHOULDER_TOP - BASE_TOP, floors: 11,
      material: shaftFacade(11, 26),
    });
    shoulder.position.set(sign * (TOWER_W / 2 + 13), BASE_TOP + (SHOULDER_TOP - BASE_TOP) / 2, -4);
    tower.add(shoulder);
    const cap = hipRoof(27, 45, 7);
    cap.position.set(shoulder.position.x, SHOULDER_TOP, -4);
    tower.add(cap);
  }
  const shaft = massing({
    width: TOWER_W, depth: TOWER_D, height: SHAFT_TOP - BASE_TOP, floors: 19,
    material: shaftFacade(19, TOWER_W),
  });
  shaft.position.y = BASE_TOP + (SHAFT_TOP - BASE_TOP) / 2;
  tower.add(shaft);
  tower.add(cornice({ width: TOWER_W, depth: TOWER_D, y: SHAFT_TOP + 0.5, thickness: 1.2, overhang: 1.0 }));
  root.add(tower);

  // --- Château roof -------------------------------------------------------
  const roofGroup = new THREE.Group();
  const chateau = hipRoof(TOWER_W + 2, TOWER_D + 2, ROOF_TOP - SHAFT_TOP - 1.1);
  chateau.position.y = SHAFT_TOP + 1.1;
  roofGroup.add(chateau);
  roofGroup.add(dormers({ width: TOWER_W, depth: TOWER_D, y: SHAFT_TOP + 1.1, perSide: 6 }));
  root.add(roofGroup);

  // --- Porte-cochère on Front --------------------------------------------
  const porte = porteCochere({ width: 30, projection: 6.5, y: 6.0 });
  porte.position.set(0, 0, southZ);
  root.add(porte);
  // Added to root, not to `porte`: the canopy group is already offset to southZ.
  const mainDoor = doorway({ width: 4.0, height: 4.6, recess: 1.0 });
  mainDoor.position.set(0, 0, southZ + 0.05);
  root.add(mainDoor);

  // --- Wordmark band ------------------------------------------------------
  const signMat = new THREE.MeshStandardMaterial({
    map: wordmarkTexture('FAIRMONT ROYAL YORK'),
    roughness: 0.45, metalness: 0.3,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.0), signMat);
  sign.position.set(0, 9.4, southZ + 0.22);
  root.add(sign);

  // --- Front Street retail frontage --------------------------------------
  const frontage = new THREE.Group();
  const { group: band, bays } = storefrontBand({ width: b.w - 12, height: 4.6, bayWidth: 7.5 });
  frontage.add(band);
  const tenants = tenantsFor('royal-york', 'south');
  bays.forEach((bay, i) => {
    // The porte-cochère occupies the centre of the elevation; retail flanks it.
    if (Math.abs(bay.x) < 17) return;
    if (i % 2 === 0) {
      const a = awning({ width: bay.width - 1.2, color: 0x2f3f33, y: 3.8 });
      a.position.x = bay.x;
      frontage.add(a);
    }
    const tenant = tenants[i % tenants.length] ?? null;
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(bay.width - 0.4, 4.0, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(bay.x, 2.1, 0.7);
    registerInteractive(hit, {
      building: b.name, address: b.address,
      tenant: tenant?.name ?? 'Vacant unit',
      category: tenant?.category ?? 'vacant',
      confidence: tenant?.confidence ?? 'approximated',
      note: tenant?.note ?? '',
    });
    frontage.add(hit);
  });
  frontage.position.set(0, 0, southZ + 0.08);
  root.add(frontage);

  // --- Registration -------------------------------------------------------
  register({
    id: 'royal-york', name: b.name, kind: 'landmark', object: root,
    confidence: 'reference',
    source: 'Ross & Macdonald with Sproatt & Rolph, 1929; massing and storey split from published elevations',
    note: b.note,
    data: { address: b.address, height: ROOF_TOP, floors: b.floors, baseFloors: 9, shaftFloors: 19 },
  });
  register({
    id: 'ry-base-block', name: 'Royal York base block', kind: 'landmark', object: base,
    confidence: 'reference', source: 'nine-storey base with the cornice at 34 m',
  });
  register({
    id: 'ry-arcade', name: 'Royal York ground-storey arcade', kind: 'landmark', object: arcades,
    confidence: 'inferred', source: 'round-arched openings on Front, Bay and York elevations',
    note: 'Arch count is a rhythm match to photographs, not a measured bay-by-bay survey.',
  });
  register({
    id: 'ry-corner-pavilions', name: 'Royal York corner pavilions', kind: 'landmark', object: pavilions,
    confidence: 'inferred', source: 'copper-roofed pavilions capping the base block corners',
  });
  register({
    id: 'ry-tower', name: 'Royal York tower shaft and shoulder wings', kind: 'landmark', object: tower,
    confidence: 'reference', source: 'nineteen-storey shaft rising from the middle of the base block',
  });
  register({
    id: 'ry-chateau-roof', name: 'Royal York château roof', kind: 'landmark', object: roofGroup,
    confidence: 'reference',
    source: 'steeply pitched green copper patina roof with dormers, 106-124 m',
    note: 'Dormer count and spacing are inferred; the roof profile and copper patina are documented.',
  });
  register({
    id: 'ry-porte-cochere', name: 'Royal York porte-cochère', kind: 'landmark', object: porte,
    confidence: 'reference', source: 'Front Street arrivals canopy',
  });
  register({
    id: 'ry-signage', name: 'Fairmont Royal York signage band', kind: 'prop', object: sign,
    confidence: 'inferred',
    source: 'original canvas lettering drawn to photographic proportion; no scraped brand artwork',
  });
  register({
    id: 'ry-front-frontage', name: 'Royal York Front Street frontage', kind: 'frontage', object: frontage,
    confidence: 'inferred', source: 'ground-floor restaurant and retail bays flanking the porte-cochère',
    data: { bays: bays.length },
  });

  return root;
}
