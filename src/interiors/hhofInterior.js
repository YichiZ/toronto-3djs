/**
 * Hockey Hall of Fame interiors — two distinct and separated spaces.
 *
 * REAL-WORLD FACTS ENCODED
 *   - The ESSO GREAT HALL occupies the 1885 Bank of Montreal banking hall at the
 *     north-west corner of Front and Yonge (building DB 'hockey-hall-of-fame',
 *     x 155, z -32). Gilded plaster, marble columns, and a STAINED-GLASS DOME
 *     overhead. THE DOME IS INTERIOR ONLY: from the street the roofline reads as
 *     a plain skylight enclosure over carved Ohio freestone, which is why the
 *     exterior module builds no dome. The Stanley Cup stands under it.
 *   - The MAIN MUSEUM is somewhere else entirely: down and behind, in the
 *     Brookfield Place concourse, roughly x 120..175 / z -60..-100, below street
 *     level. About 50,000 sq ft in reality. Reconstructed here as a sequence of
 *     six gallery volumes rather than the whole floor plate — the sequence is
 *     what a visitor remembers, not the exact partition plan.
 *   - Visitors ENTER from the galleria (see src/interiors/galleria.js), not from
 *     the Yonge Street bank building.
 */
import * as THREE from 'three';
import { LEVELS } from '../data/grid.js';
import { getBuilding } from '../data/buildings.js';
import { M } from '../core/materials.js';
import { colonnade } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';
import { registerInterior } from '../world/index.js';

const BANK = getBuilding('hockey-hall-of-fame') ?? { x: 155, z: -32, w: 32, d: 30, height: 19 };
const HALL_FLOOR = 0.3;
const DOME_R = 9.5;
const DOME_SPRING = HALL_FLOOR + 9.2;

/** Museum galleries, in grid metres. Floor sits between the PATH and concourse levels. */
const MUSEUM_FLOOR = LEVELS.path;          // -6.5
const MUSEUM_CEIL = LEVELS.unionConcourse + 0.4;  // -3.1, a 3.4 m clear gallery

const GALLERIES = Object.freeze([
  { id: 'hhofi-gallery-entry', name: 'Museum entry and orientation', x: 128, z: -64, w: 18, d: 14 },
  { id: 'hhofi-gallery-origins', name: 'Origins of the game', x: 128, z: -80, w: 18, d: 16 },
  { id: 'hhofi-gallery-dressing-room', name: 'Replica NHL dressing room', x: 128, z: -96, w: 18, d: 14 },
  { id: 'hhofi-gallery-trophies', name: 'Trophy and silverware gallery', x: 152, z: -96, w: 22, d: 14 },
  { id: 'hhofi-gallery-honoured', name: 'Honoured Members gallery', x: 152, z: -80, w: 22, d: 16 },
  { id: 'hhofi-gallery-world', name: 'World of hockey', x: 152, z: -64, w: 22, d: 14 },
]);

const matCache = new Map();
const local = (key, build) => {
  let m = matCache.get(key);
  if (!m) { m = build(); m.name = `hhofi:${key}`; matCache.set(key, m); }
  return m;
};

function canvas2d(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('hhofInterior: 2d canvas context unavailable');
  return { canvas: c, ctx };
}

const texFrom = (canvas) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
};

/**
 * The stained-glass oculus, drawn as original radial vector tracery. Rich,
 * saturated and emissive — it is the only warm light source in the banking hall
 * and the thing every photograph of the room is actually of.
 */
function oculusTexture() {
  const S = 512;
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#1a1206';
  ctx.fillRect(0, 0, S, S);
  const cx = S / 2;
  const cy = S / 2;
  const palette = ['#c8342c', '#d9a12b', '#2f6fb0', '#3f8f5c', '#8b3f9c', '#e0c14a'];
  const RINGS = 4;
  const SPOKES = 16;
  for (let r = RINGS; r >= 1; r--) {
    const rad = (S / 2 - 8) * (r / RINGS);
    for (let k = 0; k < SPOKES; k++) {
      const a0 = (k / SPOKES) * Math.PI * 2;
      const a1 = ((k + 1) / SPOKES) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rad, a0, a1);
      ctx.closePath();
      ctx.fillStyle = palette[(k + r * 3) % palette.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(24,18,8,0.85)';   // the lead cames
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fillStyle = '#f0dfa0';
  ctx.fill();
  ctx.strokeStyle = 'rgba(24,18,8,0.9)';
  ctx.lineWidth = 8;
  ctx.stroke();
  return texFrom(canvas);
}

function bannerTexture(label) {
  const { canvas, ctx } = canvas2d(256, 512);
  ctx.fillStyle = '#12233f';
  ctx.fillRect(0, 0, 256, 512);
  ctx.strokeStyle = '#c8b06a';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 228, 484);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0ece2';
  ctx.font = 'bold 46px Georgia, serif';
  ctx.fillText(label, 128, 240);
  ctx.font = '26px Georgia, serif';
  ctx.fillStyle = '#c8b06a';
  ctx.fillText('HONOURED', 128, 292);
  ctx.textAlign = 'left';
  return texFrom(canvas);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
function place(im, i, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  im.setMatrixAt(i, _m.compose(_p.set(px, py, pz), _q.setFromEuler(_e), _s.set(sx, sy, sz)));
}

const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
/** Lay a flat panel tangent to a sphere, normal pointing inward. */
function placeOnDome(im, i, cx, cy, cz, r, azimuth, polar, scale) {
  _n.set(
    Math.sin(polar) * Math.cos(azimuth),
    Math.cos(polar),
    Math.sin(polar) * Math.sin(azimuth)
  );
  _p.copy(_n).multiplyScalar(r).add(_s.set(cx, cy, cz));
  im.setMatrixAt(i, _m.compose(_p, _q.setFromUnitVectors(UP, _n.negate()), _s.set(scale, 1, scale)));
}

// -----------------------------------------------------------------------------
// ESSO GREAT HALL
// -----------------------------------------------------------------------------

function buildEssoGreatHall() {
  const g = new THREE.Group();
  g.name = 'hhof-esso-great-hall';
  const cx = BANK.x;
  const cz = BANK.z;
  const w = BANK.w - 5;
  const d = BANK.d - 5;

  const marble = local('marble', () => new THREE.MeshStandardMaterial({
    color: 0xcfc4ad, roughness: 0.24, metalness: 0.05,
  }));
  const gilded = local('gilded', () => new THREE.MeshStandardMaterial({
    color: 0xb99442, roughness: 0.3, metalness: 0.7,
    emissive: 0x3a2c10, emissiveIntensity: 0.5,
  }));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), marble);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, HALL_FLOOR, cz);
  floor.receiveShadow = true;
  g.add(floor);

  // walls up to the entablature the dome springs from
  for (const [bw, bd, dx, dz] of [[w, 0.6, 0, -d / 2], [w, 0.6, 0, d / 2], [0.6, d, -w / 2, 0], [0.6, d, w / 2, 0]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, DOME_SPRING - HALL_FLOOR, bd), marble);
    wall.position.set(cx + dx, HALL_FLOOR + (DOME_SPRING - HALL_FLOOR) / 2, cz + dz);
    wall.receiveShadow = true;
    g.add(wall);
  }
  const entablature = new THREE.Mesh(
    new THREE.BoxGeometry(w + 1.2, 1.0, d + 1.2), gilded
  );
  entablature.position.set(cx, DOME_SPRING - 0.5, cz);
  g.add(entablature);

  // marble columns on the two long walls
  for (const dz of [-d / 2 + 1.6, d / 2 - 1.6]) {
    const run = colonnade({ count: 5, spacing: 5.0, height: 8.4, diameter: 1.0, axis: 'x', material: marble });
    run.position.set(cx, HALL_FLOOR, cz + dz);
    g.add(run);
  }

  // THE DOME — interior only. Shell, meridian ribs, coffers, stained-glass oculus.
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    local('domeShell', () => new THREE.MeshStandardMaterial({
      color: 0xe6dcc4, roughness: 0.7, side: THREE.BackSide,
      emissive: 0x3a3222, emissiveIntensity: 0.4,
    }))
  );
  shell.position.set(cx, DOME_SPRING, cz);
  g.add(shell);

  const RIBS = 12;
  const ribs = new THREE.InstancedMesh(
    new THREE.TorusGeometry(DOME_R - 0.12, 0.16, 6, 28, Math.PI), gilded, RIBS
  );
  for (let i = 0; i < RIBS; i++) {
    place(ribs, i, cx, DOME_SPRING, cz, 0, (i / RIBS) * Math.PI);
  }
  ribs.instanceMatrix.needsUpdate = true;
  g.add(ribs);

  const ROWS = 4;
  const COLS = 16;
  const coffers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.5, 0.22, 1.5),
    local('coffer', () => new THREE.MeshStandardMaterial({
      color: 0xd8cdb2, roughness: 0.72, emissive: 0x2e2718, emissiveIntensity: 0.35,
    })),
    ROWS * COLS
  );
  let ci = 0;
  for (let r = 0; r < ROWS; r++) {
    const polar = (Math.PI / 2) * (0.24 + (r / ROWS) * 0.66);
    const scale = 0.6 + Math.sin(polar) * 0.7;
    for (let c = 0; c < COLS; c++) {
      placeOnDome(coffers, ci++, cx, DOME_SPRING, cz, DOME_R - 0.35, (c / COLS) * Math.PI * 2, polar, scale);
    }
  }
  coffers.instanceMatrix.needsUpdate = true;
  g.add(coffers);

  const oculus = new THREE.Mesh(
    new THREE.CircleGeometry(3.1, 40),
    local('oculus', () => {
      const map = oculusTexture();
      return new THREE.MeshStandardMaterial({
        map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 2.4,
        roughness: 0.35, side: THREE.DoubleSide,
      });
    })
  );
  oculus.rotation.x = Math.PI / 2;
  oculus.position.set(cx, DOME_SPRING + DOME_R - 0.5, cz);
  g.add(oculus);

  // THE STANLEY CUP, on its plinth, dead centre under the dome.
  const cup = new THREE.Group();
  cup.name = 'hhofi-stanley-cup';
  const silver = local('silver', () => new THREE.MeshStandardMaterial({
    color: 0xd7d9dc, roughness: 0.14, metalness: 0.95,
    emissive: 0x2a2d31, emissiveIntensity: 0.4,
  }));
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.0, 20), M.limestonePlain());
  plinth.position.set(cx, HALL_FLOOR + 0.5, cz);
  cup.add(plinth);
  // bowl over five tapering barrel bands — the Cup's actual profile
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.24, 0.44, 20), silver);
  bowl.position.set(cx, HALL_FLOOR + 1.0 + 0.9 + 0.22, cz);
  cup.add(bowl);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.16, 20), silver);
  collar.position.set(cx, HALL_FLOOR + 1.0 + 0.82, cz);
  cup.add(collar);
  const BANDS = 5;
  const bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 20), silver, BANDS);
  for (let i = 0; i < BANDS; i++) {
    place(bands, i, cx, HALL_FLOOR + 1.0 + 0.08 + i * 0.155, cz, 0, 0, 0, 1 - i * 0.07, 1, 1 - i * 0.07);
  }
  bands.instanceMatrix.needsUpdate = true;
  cup.add(bands);
  g.add(cup);

  const cupHit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3.4), new THREE.MeshBasicMaterial({ visible: false }));
  cupHit.position.set(cx, HALL_FLOOR + 1.3, cz);
  registerInteractive(cupHit, {
    building: 'Hockey Hall of Fame — Esso Great Hall',
    address: '30 Yonge Street',
    tenant: 'Stanley Cup',
    category: 'museum',
    confidence: 'reference',
    note: 'The Cup stands at the centre of the Esso Great Hall, beneath the stained-glass dome. The dome is interior only.',
  });
  g.add(cupHit);

  // trophy cases around the perimeter, instanced glass over a dark base
  const CASES = 16;
  const caseGlass = local('caseGlass', () => new THREE.MeshPhysicalMaterial({
    color: 0xdce8ee, roughness: 0.04, transmission: 0.8, thickness: 0.04,
    transparent: true, opacity: 0.3, side: THREE.DoubleSide,
  }));
  const cases = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 2.1, 0.9), caseGlass, CASES);
  const bases = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.6, 0.85, 1.0),
    local('caseBase', () => new THREE.MeshStandardMaterial({ color: 0x2b2419, roughness: 0.5 })),
    CASES
  );
  const halfW = w / 2 - 1.4;
  const halfD = d / 2 - 1.4;
  for (let i = 0; i < CASES; i++) {
    const t = i / CASES;
    const side = Math.floor(t * 4);
    const u = (t * 4 - side) * 2 - 1;
    const px = side === 0 ? cx + u * halfW : side === 1 ? cx + halfW : side === 2 ? cx - u * halfW : cx - halfW;
    const pz = side === 0 ? cz - halfD : side === 1 ? cz + u * halfD : side === 2 ? cz + halfD : cz - u * halfD;
    const ry = (side % 2) * Math.PI / 2;
    place(cases, i, px, HALL_FLOOR + 0.85 + 1.05, pz, 0, ry);
    place(bases, i, px, HALL_FLOOR + 0.42, pz, 0, ry);
  }
  cases.instanceMatrix.needsUpdate = true;
  bases.instanceMatrix.needsUpdate = true;
  g.add(cases, bases);

  g.add(new THREE.AmbientLight(0xf0e2c6, 0.5));
  const p = new THREE.PointLight(0xffd9a0, 40, 34, 2);
  p.position.set(cx, DOME_SPRING + 3, cz);
  g.add(p);

  return g;
}

// -----------------------------------------------------------------------------
// MAIN MUSEUM, in the Brookfield Place concourse
// -----------------------------------------------------------------------------

function buildGallery(spec, index) {
  const g = new THREE.Group();
  g.name = spec.id;
  const h = MUSEUM_CEIL - MUSEUM_FLOOR;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.w, spec.d),
    local('galleryFloor', () => new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.45 }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(spec.x, MUSEUM_FLOOR, spec.z);
  floor.receiveShadow = true;
  g.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.d), M.ceilingPanel());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(spec.x, MUSEUM_CEIL, spec.z);
  g.add(ceil);

  // three walls only, so the galleries read as one continuous sequence
  const wallMat = local('galleryWall', () => new THREE.MeshStandardMaterial({
    color: 0x1e242b, roughness: 0.85, emissive: 0x0e1218, emissiveIntensity: 0.6,
  }));
  for (const [bw, bd, dx, dz] of [[spec.w, 0.3, 0, -spec.d / 2], [0.3, spec.d, -spec.w / 2, 0], [0.3, spec.d, spec.w / 2, 0]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), wallMat);
    wall.position.set(spec.x + dx, MUSEUM_FLOOR + h / 2, spec.z + dz);
    g.add(wall);
  }

  // display cases, instanced, plus their lit interiors
  const CASES = 8;
  const cases = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.8, 2.0, 0.8),
    local('exhibitGlass', () => new THREE.MeshPhysicalMaterial({
      color: 0xd2e0e8, roughness: 0.05, transmission: 0.8, thickness: 0.04,
      transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    })),
    CASES
  );
  const glows = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.6, 0.06, 0.6),
    local('caseLight', () => new THREE.MeshBasicMaterial({ color: 0xfff0cf })),
    CASES
  );
  for (let i = 0; i < CASES; i++) {
    const side = i < CASES / 2 ? -1 : 1;
    const k = i % (CASES / 2);
    const px = spec.x + side * (spec.w / 2 - 1.4);
    const pz = spec.z - spec.d / 2 + (spec.d / (CASES / 2 + 1)) * (k + 1);
    place(cases, i, px, MUSEUM_FLOOR + 1.0, pz, 0, Math.PI / 2);
    place(glows, i, px, MUSEUM_FLOOR + 1.94, pz, 0, Math.PI / 2);
  }
  cases.instanceMatrix.needsUpdate = true;
  glows.instanceMatrix.needsUpdate = true;
  g.add(cases, glows);

  // hanging banners
  const BANNERS = 4;
  const banners = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.2, 2.4),
    local(`banner:${index % 3}`, () => {
      const map = bannerTexture(['1917', '1967', '1993'][index % 3]);
      return new THREE.MeshStandardMaterial({
        map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.5,
        roughness: 0.9, side: THREE.DoubleSide,
      });
    }),
    BANNERS
  );
  for (let i = 0; i < BANNERS; i++) {
    place(banners, i, spec.x - spec.w / 2 + (spec.w / (BANNERS + 1)) * (i + 1), MUSEUM_CEIL - 1.5, spec.z);
  }
  banners.instanceMatrix.needsUpdate = true;
  g.add(banners);

  if (spec.id === 'hhofi-gallery-dressing-room') {
    // replica dressing room: stalls around three sides with a bench run
    const STALLS = 10;
    const stalls = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.4, 2.2, 0.7),
      local('stall', () => new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.7 })),
      STALLS
    );
    const benches = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.4, 0.12, 0.55),
      local('benchWood', () => new THREE.MeshStandardMaterial({ color: 0x6a4c2c, roughness: 0.6 })),
      STALLS
    );
    for (let i = 0; i < STALLS; i++) {
      const side = i < STALLS / 2 ? -1 : 1;
      const k = i % (STALLS / 2);
      const px = spec.x + side * (spec.w / 2 - 2.6);
      const pz = spec.z - spec.d / 2 + (spec.d / (STALLS / 2 + 1)) * (k + 1);
      place(stalls, i, px, MUSEUM_FLOOR + 1.1, pz, 0, Math.PI / 2);
      place(benches, i, px + side * 0.5, MUSEUM_FLOOR + 0.48, pz, 0, Math.PI / 2);
    }
    stalls.instanceMatrix.needsUpdate = true;
    benches.instanceMatrix.needsUpdate = true;
    g.add(stalls, benches);
  }

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(spec.w - 2, 2.4, spec.d - 2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(spec.x, MUSEUM_FLOOR + 1.2, spec.z);
  registerInteractive(hit, {
    building: 'Hockey Hall of Fame — museum',
    address: 'Brookfield Place concourse, 30 Yonge Street',
    tenant: spec.name,
    category: 'museum',
    confidence: 'inferred',
    note: 'Gallery sequence reconstructed; the real museum is about 50,000 sq ft and its partition plan is not asserted here.',
  });
  g.add(hit);

  return g;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) { // eslint-disable-line no-unused-vars
  const root = new THREE.Group();
  root.name = 'hhof-interiors';

  const hall = buildEssoGreatHall();
  root.add(hall);

  const museum = new THREE.Group();
  museum.name = 'hhof-museum';
  GALLERIES.forEach((spec, i) => museum.add(buildGallery(spec, i)));
  museum.add(new THREE.AmbientLight(0xbcc8d4, 0.4));
  const p = new THREE.PointLight(0xdfe8f2, 26, 60, 2);
  p.position.set(140, MUSEUM_CEIL - 0.8, -80);
  museum.add(p);
  root.add(museum);

  register({
    id: 'hhof-esso-great-hall',
    name: 'Hockey Hall of Fame — Esso Great Hall',
    kind: 'interior',
    object: hall,
    confidence: 'reference',
    source: '1885 Bank of Montreal banking hall, Front and Yonge',
    note:
      'The STAINED-GLASS DOME is INTERIOR ONLY and is the reason the exterior carries no dome — from the street the roofline is a plain skylight enclosure over carved Ohio freestone. Dome radius and coffer count are approximated from photographic proportion. Only the Great Hall is in this building; the museum proper is behind and below in the Brookfield concourse.',
    data: { floorY: HALL_FLOOR, domeRadius: DOME_R, domeSpringY: DOME_SPRING, trophyCases: 16 },
  });
  register({
    id: 'hhofi-stained-glass-dome', name: 'Esso Great Hall stained-glass dome', kind: 'interior',
    confidence: 'reference', source: 'interior dome of the former banking hall',
    note: 'INTERIOR ONLY. Never build this on the exterior roofline.',
  });
  register({
    id: 'hhofi-stanley-cup', name: 'Stanley Cup', kind: 'prop',
    confidence: 'reference', source: 'centre of the Esso Great Hall',
    note: 'Profile is a reconstruction of the bowl-and-barrel silhouette, not a scan.',
  });
  register({
    id: 'hhof-museum',
    name: 'Hockey Hall of Fame — main museum',
    kind: 'interior',
    object: museum,
    confidence: 'inferred',
    source: 'Brookfield Place concourse level, behind and below the Yonge Street bank building',
    note:
      `Six gallery volumes standing in for roughly 50,000 sq ft. Floor at ${MUSEUM_FLOOR} m. Visitors enter from the Allen Lambert Galleria, not from the Yonge Street building. Partition layout is not asserted.`,
    data: { galleries: GALLERIES.map((g) => g.id), floorY: MUSEUM_FLOOR },
  });

  registerInterior({
    id: 'hhof-esso-great-hall', group: hall,
    centre: { x: BANK.x, y: HALL_FLOOR + 6, z: BANK.z },
    radius: 70,
  });
  registerInterior({
    id: 'hhof-museum', group: museum,
    centre: { x: 140, y: MUSEUM_FLOOR + 2, z: -80 },
    radius: 70,
  });

  return root;
}
