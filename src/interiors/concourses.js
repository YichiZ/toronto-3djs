/**
 * Union Station's THREE CONCOURSES — York, Bay and VIA.
 *
 * CRITICAL DISTINCTION (a documented hallucination trap): none of these is the
 * Great Hall. The Great Hall is the 1927 ticket lobby at street level, y +0.2.
 * The concourses are separate, later, lower spaces at
 * LEVELS.unionConcourse = -3.5, reached by stairs and escalators from the hall
 * and connected below to the PATH at LEVELS.path = -6.5.
 *
 * REAL-WORLD FACTS ENCODED
 *   - YORK CONCOURSE (west end) reopened 2015 as the flagship of the
 *     revitalisation: a bright white faceted/undulating plaster ceiling, wide
 *     clear floor, retail lining the perimeter.
 *   - BAY CONCOURSE (east end) followed with the same architectural language at
 *     a slightly smaller scale.
 *
 * WHAT IS NOT HERE, AND WHY (#117). The real halls open up to THE MOAT — the
 * cut flanking the Great Hall between street and concourse, glazed over in the
 * revitalisation — and the balustrades in those rooms guard that opening. This
 * module built the railing and not the opening: the ceiling roofs the whole
 * room, so the glass stood in the middle of a sealed space guarding a floor.
 * The railing is gone until the moat exists.
 *
 * Building it is not a matter of cutting this ceiling. Union Station's wing
 * massing is a solid stone block standing on y = 0, and its underside is what
 * a visitor in York or Bay actually sees overhead — 100% of the frame, 2 m over
 * their head. This room's ceiling at HALL_CEIL = +1.9, and anything cut into
 * it, is hidden above that lid.
 *   - VIA CONCOURSE sits centre-south between them, against the train shed: it
 *     is the departures hall proper — seating, gate doors onto the platform
 *     stairs, and the departure boards passengers actually wait under.
 *   - All three are joined by a wide east-west passage running underneath the
 *     Great Hall — buildLink() below. The Great Hall floor over it is solid in
 *     this model; its own openings are not built, so do not describe them.
 */
import * as THREE from 'three';
import { LEVELS } from '../data/grid.js';
import { M } from '../core/materials.js';
import { storefrontBand } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';
import { tenantsFor } from '../data/tenants.js';
import { registerInterior } from '../world/index.js';
import { RETAIL } from './retailConcourse.js';

const FLOOR = LEVELS.unionConcourse;   // -3.5
const HALL_CEIL = FLOOR + 5.4;         // the tall revitalised halls
const LINK_CEIL = FLOOR + 3.2;         // the low passage beneath the Great Hall
const GREAT_HALL_Y = 0.2;

/** The three rooms, in grid metres. Sizes are inferred from the block geometry. */
export const ROOMS = Object.freeze([
  {
    id: 'union-york-concourse', name: 'York Concourse', short: 'york',
    x: -215, z: 46, w: 62, d: 42, face: 'west', ceiling: HALL_CEIL,
    note: 'The 2015 revitalised west concourse. Faceted white ceiling, glass balustrades, retail perimeter.',
  },
  {
    id: 'union-bay-concourse', name: 'Bay Concourse', short: 'bay',
    x: -40, z: 46, w: 48, d: 38, face: 'east', ceiling: HALL_CEIL,
    note: 'The east concourse, same architectural language as York at a slightly smaller scale.',
  },
  {
    id: 'union-via-concourse', name: 'VIA Concourse', short: 'via',
    x: -130, z: 62, w: 64, d: 24, face: 'north', ceiling: FLOOR + 4.6,
    note: 'The departures hall against the train shed: seating, gate doors, departure boards.',
  },
]);

/**
 * Where the concourse crowd walks (#70): one loop per room, as [[x, z], [x, z]]
 * segments. Each loop keeps 1.5 m or more clear of the stairs, escalators,
 * balustrades and VIA seating placed by buildRoom. The rooms are walled on all
 * four sides, so no loop crosses from one room to the next.
 */
const loop = (x0, z0, x1, z1) => [
  [[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]],
];
export const CONCOURSE_WALKS = Object.freeze([
  ...loop(-234, 34, -202, 62),   // York
  ...loop(-51, 35, -34, 61),     // Bay
  ...loop(-149, 57, -115, 68),   // VIA, between the balustrade, the seats and the stairs
]);

const matCache = new Map();
const local = (key, build) => {
  let m = matCache.get(key);
  if (!m) { m = build(); m.name = `conc:${key}`; matCache.set(key, m); }
  return m;
};

function canvas2d(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('concourses: 2d canvas context unavailable');
  return { canvas: c, ctx };
}

const DEPARTURES = [
  ['16:05', 'LAKESHORE WEST', 'ALDERSHOT', 'ON TIME'],
  ['16:12', 'UP EXPRESS', 'PEARSON T1', 'PLATFORM 3'],
  ['16:18', 'VIA 65', 'OTTAWA', 'BOARDING'],
  ['16:24', 'MILTON', 'MILTON', 'TRACK 9'],
  ['16:31', 'LAKESHORE EAST', 'OSHAWA', 'ON TIME'],
  ['16:38', 'KITCHENER', 'KITCHENER', 'TRACK 11'],
  ['16:45', 'VIA 55', 'MONTREAL', 'TRACK 4'],
  ['16:52', 'BARRIE', 'ALLANDALE WFT', 'DELAYED 5'],
];

/** Original canvas lettering — no scraped signage artwork anywhere. */
function boardTexture() {
  const { canvas, ctx } = canvas2d(1024, 512);
  ctx.fillStyle = '#080b0f';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.font = 'bold 30px "Courier New", monospace';
  ctx.fillStyle = '#e8b84b';
  ctx.fillText('DEPARTURES', 26, 46);
  ctx.fillText('DEPARTS', 250, 46);
  ctx.strokeStyle = 'rgba(140,150,160,0.4)';
  ctx.beginPath(); ctx.moveTo(20, 60); ctx.lineTo(1004, 60); ctx.stroke();
  ctx.font = '28px "Courier New", monospace';
  DEPARTURES.forEach((r, i) => {
    const y = 104 + i * 50;
    ctx.fillStyle = '#dbe7f1'; ctx.fillText(r[0], 26, y);
    ctx.fillStyle = '#a9bccb'; ctx.fillText(r[1], 150, y);
    ctx.fillStyle = '#dbe7f1'; ctx.fillText(r[2], 430, y);
    ctx.fillStyle = r[3].startsWith('DELAY') ? '#e58b6a' : r[3] === 'BOARDING' ? '#82e08d' : '#9fb3c4';
    ctx.fillText(r[3], 740, y);
  });
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const boardMaterial = () =>
  local('board', () => {
    const map = boardTexture();
    return new THREE.MeshStandardMaterial({
      map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.45,
    });
  });

const SIGNS = {
  up: '↑  Trains · Great Hall',
  path: '↓  PATH',
};

/**
 * Hanging wayfinding sign, original canvas lettering. A thin box rather than a
 * plane: its front and back faces both read the right way round.
 * @param {keyof SIGNS} kind
 * @param {number} width metres; the sign is 1 m tall
 */
function hangingSign(kind, width) {
  const mat = local(`sign:${kind}`, () => {
    const { canvas, ctx } = canvas2d(Math.round(width * 128), 128);
    ctx.fillStyle = '#12202c';
    ctx.fillRect(0, 0, canvas.width, 128);
    ctx.fillStyle = '#f4f1e8';
    ctx.font = 'bold 64px "Helvetica Neue", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(SIGNS[kind], 36, 66);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.5,
    });
  });
  return new THREE.Mesh(new THREE.BoxGeometry(width, 1.0, 0.08), mat);
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

/**
 * The revitalisation's signature: a white ceiling folded into shallow facets.
 * Built by displacing a subdivided plane and shading it flat, which costs one
 * draw call and reads correctly from below — the only place anyone sees it.
 */
function facetedCeiling(w, d, y, seed = 0) {
  const geo = new THREE.PlaneGeometry(w, d, Math.max(6, Math.round(w / 4)), Math.max(4, Math.round(d / 4)));
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w;
    const v = pos.getY(i) / d;
    const fold =
      Math.sin(u * Math.PI * 4.2 + seed) * 0.55 +
      Math.cos(v * Math.PI * 3.1 - seed * 0.7) * 0.42 +
      Math.sin((u + v) * Math.PI * 6.4) * 0.18;
    pos.setZ(i, fold);
  }
  geo.computeVertexNormals();
  geo.rotateX(Math.PI / 2);   // face down
  const mat = local('ceilingWhite', () =>
    new THREE.MeshStandardMaterial({
      color: 0xf2f1ec, roughness: 0.9, flatShading: true,
      emissive: 0xdfe3e8, emissiveIntensity: 0.42, side: THREE.DoubleSide,
    }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  return mesh;
}

/** Recessed linear light coves, instanced, doing most of the actual lighting. */
function coves(w, d, y, count) {
  const im = new THREE.InstancedMesh(
    new THREE.BoxGeometry(w * 0.82, 0.12, 0.85),
    local('cove', () => new THREE.MeshBasicMaterial({ color: 0xfdf6e6 })),
    count
  );
  for (let i = 0; i < count; i++) {
    place(im, i, 0, y - 0.35, -d / 2 + (d / (count + 1)) * (i + 1));
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}

/** Glass balustrade run along an edge; the openings up to the moat level. */
function balustrade(length, axis = 'x') {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(axis === 'x' ? length : 0.06, 1.1, axis === 'x' ? 0.06 : length),
    local('balGlass', () => new THREE.MeshPhysicalMaterial({
      color: 0xd8e6ee, roughness: 0.05, metalness: 0.0,
      transparent: true, opacity: 0.35, side: THREE.FrontSide,
    }))
  );
  glass.position.y = 0.6;
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(axis === 'x' ? length : 0.1, 0.08, axis === 'x' ? 0.1 : length),
    M.steelWhite()
  );
  rail.position.y = 1.18;
  g.add(glass, rail);
  return g;
}

/**
 * Raked ribbed slab: an escalator, cheap. Two of these plus a balustrade read
 * correctly from anywhere a visitor stands.
 */
function escalator({ rise, run, width = 1.6 }) {
  const g = new THREE.Group();
  const len = Math.hypot(rise, run);
  const angle = Math.atan2(rise, run);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, len), M.steelDark());
  slab.rotation.x = -angle;
  slab.position.set(0, rise / 2, run / 2);
  g.add(slab);

  const RIBS = Math.max(8, Math.round(len / 0.42));
  const ribs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(width - 0.24, 0.06, 0.3), M.steelWhite(), RIBS
  );
  for (let i = 0; i < RIBS; i++) {
    const t = (i + 0.5) / RIBS;
    place(ribs, i, 0, rise * t + 0.2 * Math.cos(angle), run * t, -angle);
  }
  ribs.instanceMatrix.needsUpdate = true;
  g.add(ribs);

  for (const sx of [-1, 1]) {
    const side = balustrade(len, 'x');
    side.rotation.y = Math.PI / 2;
    side.rotation.x = 0;
    const b = new THREE.Group();
    b.add(side);
    b.rotation.x = -angle;
    b.position.set((sx * width) / 2, rise / 2 + 0.2, run / 2);
    g.add(b);
  }
  return g;
}

/** Straight stair with instanced treads. */
function stair({ rise, run, width = 3.2 }) {
  const g = new THREE.Group();
  const steps = Math.max(6, Math.round(rise / 0.175));
  const treadDepth = run / steps;
  const treads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(width, 0.16, treadDepth), M.concretePlain(), steps
  );
  for (let i = 0; i < steps; i++) {
    place(treads, i, 0, (rise / steps) * (i + 1) - 0.08, treadDepth * (i + 0.5));
  }
  treads.instanceMatrix.needsUpdate = true;
  treads.receiveShadow = true;
  g.add(treads);
  for (const sx of [-1, 1]) {
    const b = balustrade(Math.hypot(rise, run), 'z');
    b.position.set((sx * width) / 2, rise / 2, run / 2);
    b.rotation.x = -Math.atan2(rise, run);
    g.add(b);
  }
  return g;
}

/** Retail frontage along one wall of a concourse, one unit per bay. */
function retailWall(room, group, { x, z, rotY, width, face }) {
  const { group: band, bays } = storefrontBand({
    width, height: 3.9, bayWidth: 7.5, glass: 0x2a3a44,
  });
  const wall = new THREE.Group();
  wall.add(band);

  const fascia = new THREE.Mesh(
    new THREE.BoxGeometry(width, 1.0, 0.5),
    local('fascia', () => new THREE.MeshStandardMaterial({
      color: 0xe9e6df, roughness: 0.8, emissive: 0xcfd4d8, emissiveIntensity: 0.3,
    }))
  );
  fascia.position.set(0, 4.4, 0.2);
  wall.add(fascia);

  const tenants = tenantsFor('union-station', face);
  bays.forEach((bay, i) => {
    const tenant = tenants[i % Math.max(1, tenants.length)];
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(bay.width - 0.5, 3.4, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(bay.x, 1.8, 0.8);
    registerInteractive(hit, {
      building: `Union Station — ${room.name}`,
      address: '65 Front Street West',
      tenant: tenant?.name ?? 'Concourse retail unit',
      category: tenant?.category ?? 'retail',
      confidence: tenant?.confidence ?? 'approximated',
      note: tenant?.note ?? 'Concourse retail turns over frequently; unit position is reconstructed, operator is not asserted.',
    });
    wall.add(hit);
  });

  wall.position.set(x, FLOOR, z);
  wall.rotation.y = rotY;
  group.add(wall);
  return bays.length;
}

function buildRoom(room) {
  const g = new THREE.Group();
  g.name = room.id;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d), M.pathFloor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.x, FLOOR, room.z);
  floor.receiveShadow = true;
  g.add(floor);

  // Stone inlay grid across the room (#77): one flat pale plane read as an
  // empty box at every hour. Bands both ways, so some always cross the view.
  // One instanced mesh (a unit slab scaled per band), 2 cm proud of the floor,
  // and never a thing to trip on.
  const BAND = 0.9;
  const BAND_EVERY = 4.5;
  const alongX = Math.floor(room.w / BAND_EVERY);
  const alongZ = Math.floor(room.d / BAND_EVERY);
  const bands = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.02, 1),
    local('floorBand', () => new THREE.MeshStandardMaterial({ color: 0x7d776b, roughness: 0.32 })),
    alongX + alongZ
  );
  for (let i = 0; i < alongX; i++) {
    place(bands, i, room.x - room.w / 2 + BAND_EVERY * (i + 0.5), FLOOR + 0.01, room.z, 0, 0, 0, BAND, 1, room.d - 2);
  }
  for (let j = 0; j < alongZ; j++) {
    place(bands, alongX + j, room.x, FLOOR + 0.012, room.z - room.d / 2 + BAND_EVERY * (j + 0.5), 0, 0, 0, room.w - 2, 1, BAND);
  }
  bands.instanceMatrix.needsUpdate = true;
  bands.receiveShadow = true;
  bands.userData.noCollide = true;
  g.add(bands);

  const ceil = facetedCeiling(room.w, room.d, room.ceiling, room.x * 0.03);
  ceil.position.x = room.x;
  ceil.position.z = room.z;
  g.add(ceil);

  const lightBar = coves(room.w, room.d, room.ceiling, 5);
  lightBar.position.set(room.x, 0, room.z);
  g.add(lightBar);

  // perimeter walls, opened where the retail band sits
  const wallMat = M.concretePlain();
  const h = room.ceiling - FLOOR;
  // VIA's south wall is also the north wall of the retail concourse one level
  // down (#120), and carries the doorway between them. Both sides read the
  // opening from RETAIL.door, so they cannot drift apart.
  const door = room.short === 'via' ? RETAIL.door : null;
  const addWall = (w, d, dx, dz) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(room.x + dx, FLOOR + h / 2, room.z + dz);
    wall.receiveShadow = true;
    g.add(wall);
  };
  for (const [w, d, dx, dz] of [
    [room.w, 0.5, 0, -room.d / 2], [room.w, 0.5, 0, room.d / 2],
    [0.5, room.d, -room.w / 2, 0], [0.5, room.d, room.w / 2, 0],
  ]) {
    const south = d < w && dz > 0;
    if (!door || !south) { addWall(w, d, dx, dz); continue; }
    for (const [from, to] of [
      [room.x - room.w / 2, door.x - door.width / 2],
      [door.x + door.width / 2, room.x + room.w / 2],
    ]) {
      if (to - from > 0.2) addWall(to - from, d, (from + to) / 2 - room.x, dz);
    }
    // and the wall above the head of the doorway
    const headY = FLOOR + 2.1;
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(door.width, room.ceiling - headY, d), wallMat
    );
    lintel.position.set(door.x, (room.ceiling + headY) / 2, room.z + dz);
    g.add(lintel);
  }

  // retail along the two long walls
  let units = 0;
  units += retailWall(room, g, {
    x: room.x, z: room.z - room.d / 2 + 0.6, rotY: 0, width: room.w - 8, face: room.face,
  });
  const southZ = room.z + room.d / 2 - 0.6;
  if (!door) {
    units += retailWall(room, g, {
      x: room.x, z: southZ, rotY: Math.PI, width: room.w - 8, face: 'north',
    });
  } else {
    // Shopfronts stop either side of the doorway down to the retail concourse;
    // a storefront across it would seal the stair behind plate glass (#120).
    for (const [from, to] of [
      [room.x - room.w / 2 + 2, door.x - door.width / 2 - 1],
      [door.x + door.width / 2 + 1, room.x + room.w / 2 - 2],
    ]) {
      if (to - from < 6) continue;
      units += retailWall(room, g, {
        x: (from + to) / 2, z: southZ, rotY: Math.PI, width: to - from, face: 'north',
      });
    }
  }

  // departure boards
  const boards = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(6.4, 3.2), boardMaterial(), room.short === 'via' ? 3 : 2
  );
  const bCount = room.short === 'via' ? 3 : 2;
  for (let i = 0; i < bCount; i++) {
    place(boards, i, room.x - (room.w / 3) + (i * room.w) / 3, FLOOR + 3.4, room.z - room.d / 2 + 1.2);
  }
  boards.instanceMatrix.needsUpdate = true;
  g.add(boards);

  // NO BALUSTRADE HERE (#117). One used to stand on the floor across the north
  // of the room, described as guarding "the void up to the moat / street level".
  // There is no void: facetedCeiling roofs the whole room, so the glass railing
  // guarded a floor. It cannot simply be given an opening either — see the moat
  // note at the top of this file. A railing goes in when the drop does.

  // vertical circulation: up to the Great Hall, down to the PATH. Each one is
  // tagged `userData.access` at its midpoint, so the nearby strip can name it
  // and a level change can arrive on it instead of inside the head house (#110).
  const access = (kind, x, z, lowY, highY, lowName, highName) =>
    ({ kind, x, z, lowY, highY, lowName, highName });
  const up = escalator({ rise: GREAT_HALL_Y - FLOOR, run: 8.0 });
  up.position.set(room.x + room.w / 2 - 7, FLOOR, room.z - 4);
  up.userData.access = access('Escalator', up.position.x, room.z, FLOOR, GREAT_HALL_Y, room.name, 'the Great Hall');
  g.add(up);
  const upStair = stair({ rise: GREAT_HALL_Y - FLOOR, run: 7.0, width: 4.0 });
  upStair.position.set(room.x + room.w / 2 - 12, FLOOR, room.z - 4);
  upStair.userData.access = access('Stairs', upStair.position.x, room.z - 0.5, FLOOR, GREAT_HALL_Y, room.name, 'the Great Hall');
  g.add(upStair);
  const down = stair({ rise: FLOOR - LEVELS.path, run: 6.0, width: 3.4 });
  down.position.set(room.x - room.w / 2 + 8, LEVELS.path, room.z + 6);
  down.userData.access = access('Stairs', down.position.x, room.z + 9, LEVELS.path, FLOOR, 'the PATH', room.name);
  g.add(down);

  // wayfinding over the stair heads (#70)
  const upSign = hangingSign('up', 6.2);
  upSign.position.set(room.x + room.w / 2 - 9.5, FLOOR + 3.4, room.z - 5);
  const downSign = hangingSign('path', 3.4);
  downSign.position.set(room.x - room.w / 2 + 8, FLOOR + 3.2, room.z + 9);
  g.add(upSign, downSign);

  if (room.short === 'via') {
    // waiting seating and the gate doors onto the platform stairs
    const SEATS = 36;
    const seats = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.5, 0.12, 0.55),
      local('seat', () => new THREE.MeshStandardMaterial({ color: 0x2f3a42, roughness: 0.6 })),
      SEATS
    );
    for (let i = 0; i < SEATS; i++) {
      const row = Math.floor(i / 12);
      place(seats, i, room.x - 12 + (i % 12) * 2.0, FLOOR + 0.46, room.z - 2 + row * 2.6);
    }
    seats.instanceMatrix.needsUpdate = true;
    g.add(seats);

    const GATES = 6;
    const gates = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3.0, 2.9, 0.16), M.paintedSteel(0x2b333a), GATES
    );
    for (let i = 0; i < GATES; i++) {
      place(gates, i, room.x - 24 + i * 9.6, FLOOR + 1.45, room.z + room.d / 2 - 0.4);
    }
    gates.instanceMatrix.needsUpdate = true;
    g.add(gates);
  }

  // one ambient + one point light per concourse; the coves do the rest
  g.add(new THREE.AmbientLight(0xe8edf2, 0.6));
  const p = new THREE.PointLight(0xf2f6fb, 34, 58, 2);
  p.position.set(room.x, room.ceiling - 1.2, room.z);
  g.add(p);

  return { group: g, units };
}

/** The wide east-west passage that ties the three rooms together under the hall. */
function buildLink() {
  const g = new THREE.Group();
  g.name = 'conc-link-passage';
  const fromX = ROOMS[0].x + ROOMS[0].w / 2;
  const toX = ROOMS[1].x - ROOMS[1].w / 2;
  const len = toX - fromX;
  const cx = (fromX + toX) / 2;
  const WIDTH = 13;
  const z = 46;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(len, WIDTH), M.pathFloor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, FLOOR, z);
  floor.receiveShadow = true;
  g.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(len, WIDTH), M.ceilingPanel());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, LINK_CEIL, z);
  g.add(ceil);

  for (const dz of [-WIDTH / 2, WIDTH / 2]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(len, LINK_CEIL - FLOOR, 0.4), M.concretePlain()
    );
    wall.position.set(cx, (FLOOR + LINK_CEIL) / 2, z + dz);
    g.add(wall);
  }

  // recessed troffers, instanced — the only light source down here
  const N = Math.round(len / 6);
  const troffers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.4, 0.08, 0.6),
    local('troffer', () => new THREE.MeshBasicMaterial({ color: 0xf6f4ea })),
    N * 2
  );
  let i = 0;
  for (let k = 0; k < N; k++) {
    for (const dz of [-3.2, 3.2]) {
      place(troffers, i++, fromX + (len / N) * (k + 0.5), LINK_CEIL - 0.12, z + dz);
    }
  }
  troffers.instanceMatrix.needsUpdate = true;
  g.add(troffers);

  // spur south to the VIA concourse
  const spurLen = ROOMS[2].z - ROOMS[2].d / 2 - (z + WIDTH / 2);
  if (spurLen > 1) {
    const spurZ = z + WIDTH / 2 + spurLen / 2;
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(12, spurLen), M.pathFloor());
    sf.rotation.x = -Math.PI / 2;
    sf.position.set(ROOMS[2].x, FLOOR, spurZ);
    g.add(sf);
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(12, spurLen), M.ceilingPanel());
    sc.rotation.x = Math.PI / 2;
    sc.position.set(ROOMS[2].x, LINK_CEIL, spurZ);
    g.add(sc);
  }

  g.add(new THREE.AmbientLight(0xdfe4ea, 0.45));
  return g;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) { // eslint-disable-line no-unused-vars
  const root = new THREE.Group();
  root.name = 'union-concourses';

  const link = buildLink();
  root.add(link);
  register({
    id: 'conc-link-passage', name: 'Union Station concourse link passage', kind: 'interior',
    object: link, confidence: 'inferred',
    source: 'connecting concourse under the Great Hall',
    note: 'Low-ceiling east-west passage under the Great Hall joining York, Bay and VIA. Width inferred.',
  });

  for (const room of ROOMS) {
    const { group, units } = buildRoom(room);
    root.add(group);

    register({
      id: room.id, name: `Union Station ${room.name}`, kind: 'interior', object: group,
      confidence: 'inferred',
      source: 'revitalisation-era concourse geometry from published plans and photography',
      note: `${room.note} NOT the Great Hall: this floor is at ${FLOOR} m, the Great Hall is at +0.2 m.`,
      data: { floorY: FLOOR, width: room.w, depth: room.d, retailUnits: units },
    });

    registerInterior({
      id: room.id, group,
      centre: { x: room.x, y: FLOOR + 2, z: room.z },
      radius: 70,
    });
  }

  register({
    id: 'conc-vertical-circulation', name: 'Union Station concourse stairs and escalators',
    kind: 'infrastructure', confidence: 'approximated',
    source: 'escalator and stair positions inferred from concourse layout',
    note: 'Each concourse gets one escalator and one stair up to the Great Hall (y +0.2) and one stair down to the PATH (y -6.5). Exact positions are approximated.',
  });

  // The link passage is registered for streaming with the room cluster it serves,
  // so the corridor never pops in isolation ahead of the rooms at either end.
  registerInterior({
    id: 'conc-link-passage', group: link,
    centre: { x: (ROOMS[0].x + ROOMS[1].x) / 2, y: FLOOR + 1.5, z: 46 },
    radius: 110,
  });

  return root;
}
