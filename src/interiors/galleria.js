/**
 * Interior of the ALLEN LAMBERT GALLERIA at Brookfield Place.
 *
 * REAL-WORLD FACTS ENCODED
 *   - Santiago Calatrava, completed 1992. A 116 m pedestrian street between the
 *     TD Canada Trust Tower (161 Bay) and Bay Wellington Tower (181 Bay), six
 *     storeys / about 27 m to the glazed roof.
 *   - EIGHT PAIRS of white steel parabolic "trees" carry the roof. Each tree
 *     springs from a single point at the floor and branches upward and outward,
 *     asymmetrically, so the two halves of a pair meet high above the centre
 *     line. The view UP is the memorable one; this module is built for it.
 *   - Mezzanine balconies with glass balustrades line both long walls.
 *   - The HOCKEY HALL OF FAME visitor entrance is off the galleria's east end,
 *     in the Brookfield Place concourse — NOT the Yonge Street bank building,
 *     which holds only the Esso Great Hall.
 *
 * The exterior shell belongs to src/landmarks/brookfield.js. Its
 * GALLERIA_BOUNDS export is the single source of truth for the envelope; it is
 * imported dynamically so that a missing or failing shell module degrades to a
 * documented fallback instead of taking the interior down with it. That is why
 * build() is async — src/world/index.js already awaits it.
 */
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { storefrontBand, doorway } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';
import { tenantsFor } from '../data/tenants.js';
import { registerInterior } from '../world/index.js';

/**
 * Fallback envelope, used only if src/landmarks/brookfield.js is absent or does
 * not export GALLERIA_BOUNDS. Matches the building database record
 * 'allen-lambert-galleria' (x 105, z -88, w 116, d 16, height 27).
 */
const FALLBACK_BOUNDS = Object.freeze({
  minX: 47, maxX: 163, minZ: -96, maxZ: -80, floorY: 0, roofY: 27,
});

const matCache = new Map();
const local = (key, build) => {
  let m = matCache.get(key);
  if (!m) { m = build(); m.name = `gal:${key}`; matCache.set(key, m); }
  return m;
};

function canvas2d(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('galleria: 2d canvas context unavailable');
  return { canvas: c, ctx };
}

/**
 * The glazing pattern. Calatrava's roof is a dense web of glazing bars, and it
 * is that web — not the glass — that puts moving shadow bands on the floor all
 * day. Painting it into the map is far cheaper than shadow-casting the frame.
 */
function glazingTexture() {
  const { canvas, ctx } = canvas2d(512, 512);
  ctx.fillStyle = 'rgba(226,238,246,0.55)';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(236,236,232,0.95)';
  ctx.lineWidth = 7;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo((i * 512) / 8, 0); ctx.lineTo((i * 512) / 8, 512); ctx.stroke();
  }
  ctx.lineWidth = 4;
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath(); ctx.moveTo(0, (i * 512) / 16); ctx.lineTo(512, (i * 512) / 16); ctx.stroke();
  }
  // diagonal bracing, which is what breaks the shadow grid into a dapple
  ctx.strokeStyle = 'rgba(240,240,236,0.6)';
  ctx.lineWidth = 3;
  for (let i = -8; i <= 16; i++) {
    ctx.beginPath(); ctx.moveTo((i * 512) / 8, 0); ctx.lineTo((i * 512) / 8 + 512, 512); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function signTexture(text, sub) {
  const { canvas, ctx } = canvas2d(1024, 256);
  ctx.fillStyle = '#101418';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2ede1';
  ctx.font = 'bold 88px Georgia, serif';
  ctx.fillText(text, 512, 118);
  ctx.font = '40px Georgia, serif';
  ctx.fillStyle = '#c8b98f';
  ctx.fillText(sub, 512, 186);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
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
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
/** Orient a unit cylinder (height 1, along +Y) onto the segment a -> b. */
function strutMatrix(a, b, radius, out = new THREE.Matrix4()) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  _dir.divideScalar(len || 1);
  _mid.addVectors(a, b).multiplyScalar(0.5);
  return out.compose(_mid, _q.setFromUnitVectors(UP, _dir), _s.set(radius, len, radius));
}

/**
 * One parabolic tree: a leaning trunk that forks twice, each fork wider and
 * shallower than the last so the branch tips arrive at the roof plane nearly
 * horizontal. Asymmetry is deliberate — Calatrava's trees are not mirrored.
 * @returns {Array<{a:THREE.Vector3, b:THREE.Vector3, r:number}>}
 */
function treeStruts(x, zBase, zInward, floorY, roofY) {
  const out = [];
  const seg = (ax, ay, az, bx, by, bz, r) =>
    out.push({ a: new THREE.Vector3(ax, ay, az), b: new THREE.Vector3(bx, by, bz), r });

  const inward = Math.sign(zInward - zBase);
  const trunkTopY = floorY + (roofY - floorY) * 0.34;
  const trunkTopZ = zBase + inward * 1.1;

  seg(x, floorY, zBase, x, trunkTopY, trunkTopZ, 0.42);

  // first fork: one branch reaches along the galleria, one climbs inward
  const forkY = floorY + (roofY - floorY) * 0.66;
  const b1 = [x - 3.2, forkY, trunkTopZ + inward * 2.0];
  const b2 = [x + 3.9, forkY, trunkTopZ + inward * 1.4];
  seg(x, trunkTopY, trunkTopZ, ...b1, 0.3);
  seg(x, trunkTopY, trunkTopZ, ...b2, 0.3);

  // second fork: four tips arriving at the roof, deliberately uneven
  const tipY = roofY - 1.4;
  const tips = [
    [b1, [b1[0] - 3.0, tipY, b1[2] + inward * 2.6]],
    [b1, [b1[0] + 1.6, tipY, b1[2] + inward * 3.4]],
    [b2, [b2[0] + 2.4, tipY, b2[2] + inward * 2.2]],
    [b2, [b2[0] - 1.1, tipY, b2[2] + inward * 3.6]],
  ];
  for (const [from, to] of tips) seg(from[0], from[1], from[2], to[0], to[1], to[2], 0.2);
  return out;
}

function buildTrees(g, B) {
  const PAIRS = 8;
  const length = B.maxX - B.minX;
  const struts = [];
  for (let i = 0; i < PAIRS; i++) {
    const x = B.minX + (length / PAIRS) * (i + 0.5);
    struts.push(...treeStruts(x, B.minZ + 1.4, B.maxZ, B.floorY, B.roofY));
    struts.push(...treeStruts(x, B.maxZ - 1.4, B.minZ, B.floorY, B.roofY));
  }
  const im = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 10, 1),
    M.steelWhite(),
    struts.length
  );
  struts.forEach((s, i) => im.setMatrixAt(i, strutMatrix(s.a, s.b, s.r)));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = true;
  g.add(im);
  return { pairs: PAIRS, struts: struts.length };
}

function buildRoof(g, B) {
  const length = B.maxX - B.minX;
  const width = B.maxZ - B.minZ;
  const mat = local('glazing', () =>
    new THREE.MeshPhysicalMaterial({
      map: glazingTexture(), color: 0xffffff, roughness: 0.08, metalness: 0.0,
      transmission: 0.55, thickness: 0.05, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, emissive: 0xdce9f2, emissiveIntensity: 0.55,
    }));
  // shallow gable: two panes meeting on the centre line
  for (const side of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(length, width / 2 + 1.2, 24, 4), mat);
    pane.rotation.x = -Math.PI / 2 + side * 0.22;
    pane.position.set(
      (B.minX + B.maxX) / 2,
      B.roofY - 0.6,
      (B.minZ + B.maxZ) / 2 + (side * width) / 4
    );
    g.add(pane);
  }
  const ridge = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.5, 0.6), M.steelWhite()
  );
  ridge.position.set((B.minX + B.maxX) / 2, B.roofY + 0.9, (B.minZ + B.maxZ) / 2);
  g.add(ridge);
}

function buildFloor(g, B) {
  const length = B.maxX - B.minX;
  const width = B.maxZ - B.minZ;
  const cx = (B.minX + B.maxX) / 2;
  const cz = (B.minZ + B.maxZ) / 2;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    local('paleStone', () => new THREE.MeshStandardMaterial({
      color: 0xd6d0c4, roughness: 0.28, metalness: 0.03,
    }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, B.floorY + 0.01, cz);
  floor.receiveShadow = true;
  g.add(floor);

  // banded inlay across the 116 m run, one band per tree bay
  const BANDS = 24;
  const bands = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.1, 0.03, width),
    local('darkStone', () => new THREE.MeshStandardMaterial({ color: 0x8e8779, roughness: 0.3 })),
    BANDS
  );
  for (let i = 0; i < BANDS; i++) {
    place(bands, i, B.minX + (length / BANDS) * (i + 0.5), B.floorY + 0.03, cz);
  }
  bands.instanceMatrix.needsUpdate = true;
  bands.receiveShadow = true;
  g.add(bands);
}

/** Mezzanine balconies with glass balustrades on both long walls. */
function buildBalconies(g, B) {
  const length = B.maxX - B.minX;
  const cx = (B.minX + B.maxX) / 2;
  const slabMat = M.concretePlain();
  const glassMat = local('balGlass', () => new THREE.MeshPhysicalMaterial({
    color: 0xd9e7ef, roughness: 0.05, transmission: 0.75, thickness: 0.05,
    transparent: true, opacity: 0.34, side: THREE.DoubleSide,
  }));

  for (const y of [B.floorY + 8.2, B.floorY + 14.6, B.floorY + 20.4]) {
    // the balustrade stands on the inboard edge of each slab, both sides
    for (const [z, inward] of [[B.minZ + 1.8, 1], [B.maxZ - 1.8, -1]]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(length - 6, 0.5, 3.4), slabMat);
      slab.position.set(cx, y, z);
      slab.castShadow = true;
      g.add(slab);

      const railZ = z + inward * 1.6;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length - 6, 1.15, 0.06), glassMat);
      rail.position.set(cx, y + 0.83, railZ);
      g.add(rail);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(length - 6, 0.08, 0.12), M.steelWhite());
      cap.position.set(cx, y + 1.42, railZ);
      g.add(cap);
    }
  }
}

function buildRetail(g, B) {
  const length = B.maxX - B.minX;
  const cx = (B.minX + B.maxX) / 2;
  const tenants = tenantsFor('allen-lambert-galleria', 'south');
  let units = 0;

  for (const [z, rotY] of [[B.maxZ - 0.4, Math.PI], [B.minZ + 0.4, 0]]) {
    const { group: band, bays } = storefrontBand({
      width: length - 24, height: 4.6, bayWidth: 9.0, glass: 0x27363f,
    });
    const wall = new THREE.Group();
    wall.add(band);
    bays.forEach((bay, i) => {
      const tenant = tenants[(i + (rotY ? 0 : 2)) % Math.max(1, tenants.length)];
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(bay.width - 0.6, 4.0, 0.7),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.set(bay.x, 2.1, 0.9);
      registerInteractive(hit, {
        building: 'Brookfield Place — Allen Lambert Galleria',
        address: '181 Bay Street',
        tenant: tenant?.name ?? 'Galleria retail unit',
        category: tenant?.category ?? 'retail',
        confidence: tenant?.confidence ?? 'approximated',
        note: tenant?.note ?? 'Concourse retail; unit position reconstructed, operator not asserted.',
      });
      wall.add(hit);
      units++;
    });
    wall.position.set(cx, B.floorY, z);
    wall.rotation.y = rotY;
    g.add(wall);
  }
  return units;
}

/** The Hockey Hall of Fame visitor entrance, off the galleria's east end. */
function buildHhofEntrance(g, B) {
  const grp = new THREE.Group();
  grp.name = 'gal-hhof-entrance';
  const x = B.maxX - 4.0;
  const z = (B.minZ + B.maxZ) / 2;

  const portal = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 6.4, 11.0),
    local('portal', () => new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.5 }))
  );
  portal.position.set(x + 0.6, B.floorY + 3.2, z);
  grp.add(portal);

  for (const dz of [-2.6, 0, 2.6]) {
    const d = doorway({ width: 2.2, height: 3.2, recess: 0.6 });
    d.position.set(x, B.floorY, z + dz);
    d.rotation.y = -Math.PI / 2;
    grp.add(d);
  }

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 2.1),
    local('hhofSign', () => {
      const map = signTexture('HOCKEY HALL OF FAME', 'VISITOR ENTRANCE — BROOKFIELD PLACE CONCOURSE');
      return new THREE.MeshStandardMaterial({
        map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.5,
      });
    })
  );
  sign.position.set(x - 0.1, B.floorY + 5.1, z);
  sign.rotation.y = -Math.PI / 2;
  grp.add(sign);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 4.0, 10.0),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(x - 1.2, B.floorY + 2.0, z);
  registerInteractive(hit, {
    building: 'Brookfield Place — Allen Lambert Galleria',
    address: '30 Yonge Street (museum entrance via Brookfield Place)',
    tenant: 'Hockey Hall of Fame visitor entrance',
    category: 'museum',
    confidence: 'reference',
    note: 'The museum is entered HERE, from the Brookfield Place concourse — not from the Yonge Street bank building, which contains only the Esso Great Hall.',
  });
  grp.add(hit);
  g.add(grp);
  return grp;
}

/** @param {import('../core/context.js').Context} ctx */
export async function build(ctx) { // eslint-disable-line no-unused-vars
  let B = FALLBACK_BOUNDS;
  let boundsSource = 'src/landmarks/brookfield.js GALLERIA_BOUNDS';
  try {
    const shell = await import('../landmarks/brookfield.js');
    if (shell?.GALLERIA_BOUNDS && Number.isFinite(shell.GALLERIA_BOUNDS.minX)) {
      B = { ...FALLBACK_BOUNDS, ...shell.GALLERIA_BOUNDS };
    } else {
      boundsSource = 'fallback envelope (brookfield.js exported no usable GALLERIA_BOUNDS)';
    }
  } catch {
    // FALLBACK: the exterior shell module is unavailable. Envelope matches the
    // building database record for 'allen-lambert-galleria'.
    boundsSource = 'fallback envelope (src/landmarks/brookfield.js unavailable)';
  }

  const group = new THREE.Group();
  group.name = 'galleria-interior';

  buildFloor(group, B);
  const trees = buildTrees(group, B);
  buildRoof(group, B);
  buildBalconies(group, B);
  const units = buildRetail(group, B);
  buildHhofEntrance(group, B);

  const cx = (B.minX + B.maxX) / 2;
  const cz = (B.minZ + B.maxZ) / 2;

  // Daylight through the roof does the work; two point lights keep the floor
  // and the underside of the trees from going flat after dark.
  group.add(new THREE.AmbientLight(0xe9eff4, 0.7));
  for (const dx of [-28, 28]) {
    const p = new THREE.PointLight(0xf4f8fc, 40, 70, 2);
    p.position.set(cx + dx, B.floorY + 16, cz);
    group.add(p);
  }

  register({
    id: 'galleria-interior',
    name: 'Allen Lambert Galleria interior',
    kind: 'interior',
    object: group,
    confidence: 'reference',
    source: `Calatrava tree structure and 116 m length; envelope from ${boundsSource}`,
    note:
      `Eight pairs of parabolic white steel trees, ${trees.struts} struts in one instanced mesh. Envelope source: ${boundsSource}. The Hockey Hall of Fame visitor entrance is at the east end of this galleria, not at the Yonge Street bank building.`,
    data: {
      bounds: B, treePairs: trees.pairs, struts: trees.struts, retailUnits: units,
      length: B.maxX - B.minX,
    },
  });
  register({
    id: 'gal-calatrava-trees', name: 'Allen Lambert Galleria tree structure', kind: 'infrastructure',
    confidence: 'reference', source: 'Santiago Calatrava, 1992',
    note: 'Eight pairs; branching is asymmetric by design. Individual strut angles are approximated from photographic proportion.',
  });
  register({
    id: 'gal-hhof-entrance', name: 'Hockey Hall of Fame visitor entrance', kind: 'frontage',
    confidence: 'reference', source: 'Brookfield Place concourse, galleria east end',
    note: 'Correct museum entrance. The 1885 Bank of Montreal building on Yonge holds the Esso Great Hall only.',
  });
  register({
    id: 'gal-mezzanines', name: 'Allen Lambert Galleria mezzanine balconies', kind: 'interior',
    confidence: 'inferred', source: 'upper-level balconies along both long walls',
    note: 'Three balcony levels reconstructed; real floor-to-floor spacing approximated.',
  });

  registerInterior({
    id: 'galleria-interior', group,
    centre: { x: cx, y: B.floorY + 10, z: cz },
    radius: 110,
  });

  return group;
}
