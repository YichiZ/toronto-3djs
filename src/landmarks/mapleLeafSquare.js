/**
 * Maple Leaf Square, 15 York Street (2010, KPMB / Page + Steele).
 *
 * Two glass towers - west 54 storeys, east 50 - on one shared five-storey
 * podium, immediately grid-west of Scotiabank Arena. What makes the block work
 * is not the towers: it is the public square carved out of the podium facing
 * the arena, and the large outdoor screen mounted on the podium wall above it.
 * On a game night the square is the overflow room for the building across the
 * street, so the screen is modelled as an emissive surface rather than a dark
 * panel - it is a light source in the night scene.
 *
 * The podium ground floor carries the anchor tenants that give the square its
 * traffic: Real Sports Bar & Grill, Real Sports Apparel, Longo's and e11even.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { tenantsFor } from '../data/tenants.js';
import { M } from '../core/materials.js';
import { massing, storefrontBand, roofPlant, ringGeometry } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const GLASS = { glass: '#93b4c8', spandrel: '#38424b' };
/** Five storeys of podium at a generous retail/restaurant floor-to-floor. */
const PODIUM_H = 19;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Instanced run of identical boxes along one axis. */
function run({ geo, material, count, spacing, axis, at, y, cast = true }) {
  const im = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  const span = (count - 1) * spacing;
  for (let i = 0; i < count; i++) {
    const t = -span / 2 + i * spacing;
    im.setMatrixAt(i, m.makeTranslation(axis === 'x' ? t : at, y, axis === 'x' ? at : t));
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = cast;
  im.receiveShadow = cast;
  return im;
}

/** Instanced vertical stack, for slab edges and other per-floor repeats. */
function stack({ geo, material, count, spacing, y0 }) {
  const im = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) im.setMatrixAt(i, m.makeTranslation(0, y0 + i * spacing, 0));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = false;
  return im;
}

/**
 * The outdoor screen. Original abstract broadcast imagery only - no wordmark,
 * no team artwork. Emissive so the night lighting pass picks it up.
 */
function screenMaterial() {
  const c = makeCanvas(256, 144);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b1a2b';
  ctx.fillRect(0, 0, 256, 144);
  // Abstract rink: a lit ice sheet with two colour bands, painted from scratch.
  ctx.fillStyle = '#cfe4f2';
  ctx.beginPath();
  ctx.ellipse(128, 86, 104, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2f6fb5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(128, 42);
  ctx.lineTo(128, 130);
  ctx.stroke();
  ctx.fillStyle = '#b93b46';
  ctx.fillRect(0, 0, 256, 16);
  ctx.fillStyle = '#f4f2ec';
  ctx.fillRect(0, 128, 256, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.4,
    roughness: 0.4, metalness: 0.0,
  });
  mat.name = 'mls-screen';
  return mat;
}

/** Glazed residential/hotel tower with a thin banded curtain wall. */
function tower(b) {
  const g = new THREE.Group();
  g.name = b.id;
  const h = b.height - PODIUM_H;
  const shaft = massing({
    width: b.w, depth: b.d, height: h, floors: b.floors - 5, kind: 'curtain', palette: GLASS,
  });
  g.add(shaft);
  // Balcony slab edges every second floor: the one detail that separates a
  // residential tower from an office tower at 200 m.
  const levels = Math.floor((b.floors - 5) / 2);
  g.add(stack({
    geo: box(b.w + 1.1, 0.3, b.d + 1.1), material: M.concretePlain(),
    count: levels, spacing: h / levels, y0: h / levels / 2,
  }));

  const crown = new THREE.Mesh(box(b.w * 0.7, 4, b.d * 0.7), M.steelDark());
  crown.position.y = h + 2;
  crown.castShadow = true;
  g.add(crown);
  g.add(roofPlant({ width: b.w * 0.6, depth: b.d * 0.6, y: h, seed: b.floors }));
  return g;
}

/** Ground-floor frontage with one raycast volume per bay. */
function frontage({ parent, buildingId, buildingName, address, face, width, position, rotationY = 0 }) {
  const tenants = tenantsFor(buildingId, face);
  const { group, bays } = storefrontBand({ width, height: 5.0, bayWidth: width / tenants.length });
  const holder = new THREE.Group();
  holder.add(group);
  bays.forEach((bay, i) => {
    const tn = tenants[i % tenants.length];
    const hit = new THREE.Mesh(box(bay.width - 0.4, 4.2, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(bay.x, 2.2, 0.7);
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
  const west = getBuilding('maple-leaf-square-w');
  const east = getBuilding('maple-leaf-square-e');

  const root = new THREE.Group();
  root.name = 'maple-leaf-square';

  // Podium spans both tower footprints; the square is cut out of its east side,
  // which is the side facing the arena across York Street.
  const podZ = (west.z + east.z) / 2;
  const podD = (east.z + east.d / 2) - (west.z - west.d / 2) + 8;
  const podW = 54;
  const podium = new THREE.Group();
  podium.name = 'mls-podium';
  podium.position.set(west.x, 0, podZ);

  const shell = new THREE.Mesh(box(podW, PODIUM_H, podD), M.concrete());
  shell.position.y = PODIUM_H / 2;
  shell.castShadow = true;
  shell.receiveShadow = true;
  podium.add(shell);

  // Glazed upper podium band on the square side.
  const band = new THREE.Mesh(box(0.5, PODIUM_H - 7, podD - 10), M.glassCool());
  band.position.set(podW / 2 + 0.2, PODIUM_H - (PODIUM_H - 7) / 2 - 1, 0);
  podium.add(band);
  const mullGeo = box(0.3, PODIUM_H - 7, 0.24);
  podium.add(run({
    geo: mullGeo, material: M.steelWhite(), count: Math.round((podD - 10) / 3), spacing: 3,
    axis: 'z', at: podW / 2 + 0.5, y: PODIUM_H - (PODIUM_H - 7) / 2 - 1, cast: false,
  }));

  const cap = new THREE.Mesh(box(podW + 1, 0.9, podD + 1), M.concretePlain());
  cap.position.y = PODIUM_H + 0.45;
  podium.add(cap);
  root.add(podium);

  const gWest = tower(west);
  gWest.position.set(west.x, PODIUM_H, west.z);
  const gEast = tower(east);
  gEast.position.set(east.x, PODIUM_H, east.z);
  root.add(gWest, gEast);

  // --- the public square -----------------------------------------------------
  const square = new THREE.Group();
  square.name = 'mls-square';
  const squareW = 34;
  square.position.set(west.x + podW / 2 + squareW / 2, 0, podZ);

  const paving = new THREE.Mesh(box(squareW, 0.2, podD - 6), M.forecourt());
  paving.position.y = 0.1;
  paving.receiveShadow = true;
  square.add(paving);

  // Low seating walls and planters framing the crowd space.
  const seatGeo = ringGeometry(7, 3.2, 0.5, 0.5);
  square.add(run({
    geo: seatGeo, material: M.concretePlain(), count: 5, spacing: (podD - 16) / 5,
    axis: 'z', at: squareW / 2 - 5, y: 0.35, cast: false,
  }));
  const treeGeo = new THREE.ConeGeometry(2.2, 6, 7);
  square.add(run({
    geo: treeGeo, material: M.foliage(), count: 5, spacing: (podD - 16) / 5,
    axis: 'z', at: squareW / 2 - 5, y: 4.2, cast: false,
  }));
  root.add(square);

  // --- the outdoor screen ----------------------------------------------------
  // Mounted flat on the podium wall above the storefronts, angled slightly down
  // toward the square so the whole crowd can see it.
  const screen = new THREE.Group();
  screen.name = 'mls-screen';
  const panel = new THREE.Mesh(box(0.5, 9.5, 17), screenMaterial());
  panel.position.set(west.x + podW / 2 + 0.4, 13, podZ - 6);
  panel.rotation.z = -0.05;
  const surround = new THREE.Mesh(box(0.7, 10.7, 18.2), M.paintedSteel(0x14171a));
  surround.position.copy(panel.position);
  surround.position.x -= 0.2;
  screen.add(surround, panel);
  root.add(screen);

  // --- podium frontages ------------------------------------------------------
  // The named anchors are filed against the west tower's south face.
  const frontages = frontage({
    parent: podium, buildingId: 'maple-leaf-square-w', buildingName: west.name, address: west.address,
    face: 'south', width: podW - 4, position: new THREE.Vector3(0, 0, podD / 2 + 0.2),
  });

  register({
    id: 'maple-leaf-square-w', name: west.name, kind: 'landmark', object: gWest,
    confidence: 'inferred',
    source: 'footprint from the building database; tower proportion from photographic reference',
    note: 'West tower, 54 storeys, residential over the shared podium. Storey count is reference; the metric height is inferred from a 3.26 m residential floor-to-floor.',
    data: { address: west.address, height: west.height, floors: west.floors, frontages },
  });
  register({
    id: 'maple-leaf-square-e', name: east.name, kind: 'landmark', object: gEast,
    confidence: 'inferred',
    note: 'East tower, 50 storeys, hotel and residential. Shares the podium and the square with the west tower.',
    data: { address: east.address, height: east.height, floors: east.floors },
  });
  register({
    id: 'mls-podium', name: 'Maple Leaf Square podium', kind: 'building', object: podium,
    confidence: 'inferred',
    note: 'Five storeys shared by both towers. Retail and restaurant anchors occupy the ground floor around the square.',
  });
  register({
    id: 'mls-square', name: 'Maple Leaf Square (public square)', kind: 'landmark', object: square,
    confidence: 'reference',
    note: 'Paved public square facing Scotiabank Arena; used as the overflow viewing area on game nights. Furniture layout is inferred.',
  });
  register({
    id: 'mls-screen', name: 'Maple Leaf Square outdoor screen', kind: 'prop', object: screen,
    confidence: 'reference',
    note: 'Large screen on the podium wall facing the square. Emissive so it lights the square at night. The displayed image is original abstract artwork, not broadcast or team graphics.',
    data: { widthM: 17, heightM: 9.5 },
  });

  root.userData.frontages = frontages;
  return root;
}
