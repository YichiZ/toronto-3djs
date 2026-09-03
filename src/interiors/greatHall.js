/**
 * Union Station GREAT HALL — the ticket lobby behind the Front Street colonnade.
 *
 * REAL-WORLD FACTS ENCODED
 *   - Ross & Macdonald / Hugh Jones / John Lyle, opened 1927. The hall is about
 *     76 m long, 26 m wide and 27 m from the Tennessee-marble floor to the crown
 *     of the vault — the vault is a segmental Guastavino tile barrel, not a
 *     semicircle, which is why the crown sits ~11 m above the springing of a
 *     26 m span rather than 13 m.
 *   - Great arched lunette clerestory windows close each end of the vault; they
 *     are the hall's only daylight and the reason the room reads as bright.
 *   - Above the piers runs the carved stone frieze of CANADIAN DESTINATIONS
 *     served by the railways. THIS IS INTERIOR ONLY. The exterior entablature on
 *     Front Street carries incised RAILWAY names and is built by the Union
 *     Station exterior module — the two must never be swapped. See the registry
 *     note on 'union-great-hall'.
 *   - Street level: the hall floor sits at y = +0.2, one level above the York /
 *     Bay / VIA concourses at LEVELS.unionConcourse (-3.5).
 *
 * WHY THE FOOTPRINT IS SMALLER THAN THE ENVELOPE: the head house spans
 * x -241..-12, and the brief's central volume x -190..-70 is 120 m — but the
 * Great Hall itself is only 76 m long. It is built centred in that envelope
 * (x -168..-92); the remainder of the head house is other rooms and is not ours.
 */
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { colonnade, doorway } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';
import { registerInterior } from '../world/index.js';

// --- room envelope, grid metres ------------------------------------------------
const FLOOR_Y = 0.2;
const CX = -130;          // long-axis centre
const CZ = 45;            // cross-axis centre
const LENGTH = 76;        // east-west, the long axis the vault runs along
const HALF_SPAN = 13;     // 26 m clear width
const PIER_TOP = 12.2;
const FRIEZE_BOTTOM = 13.0;
const FRIEZE_HEIGHT = 2.4;
const SPRING_Y = 16.29;   // where the vault leaves the cornice
const CROWN_Y = 27.2;
const VAULT_R = 13.2;                       // segmental: R > half-span
const VAULT_CY = CROWN_Y - VAULT_R;         // circle centre height
const ARC_HALF = Math.asin(HALF_SPAN / VAULT_R);

const WEST_X = CX - LENGTH / 2;
const EAST_X = CX + LENGTH / 2;

/**
 * The frieze. Twenty real Canadian destinations served from Union Station,
 * distributed around the four faces of the entablature the way the carving runs
 * continuously around the room.
 */
const DESTINATIONS = Object.freeze({
  north: ['HALIFAX', 'SAINT JOHN', 'QUEBEC', 'MONTREAL', 'OTTAWA', 'NORTH BAY', 'SUDBURY'],
  south: ['WINNIPEG', 'REGINA', 'SASKATOON', 'EDMONTON', 'CALGARY', 'VANCOUVER', 'VICTORIA'],
  west: ['PRINCE RUPERT', 'FORT WILLIAM', 'WINDSOR'],
  east: ['TORONTO', 'HAMILTON', 'LONDON'],
});

const matCache = new Map();
/** Local materials that have no shared equivalent in the M library. */
const local = (key, build) => {
  let m = matCache.get(key);
  if (!m) { m = build(); m.name = `gh:${key}`; matCache.set(key, m); }
  return m;
};

function canvas2d(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('greatHall: 2d canvas context unavailable');
  return { canvas: c, ctx };
}

function texFrom(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Letterspaced small caps, drawn glyph by glyph so the tracking is explicit
 * rather than relying on ctx.letterSpacing, which is not universally supported.
 * @returns {number} advance width
 */
function tracked(ctx, text, x, y, capPx, tracking, paint) {
  let cursor = x;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') { cursor += capPx * 0.45 + tracking; continue; }
    // small caps: the initial keeps the full cap height, the rest sit at 0.78
    ctx.font = `${i === 0 ? capPx : Math.round(capPx * 0.78)}px Georgia, "Times New Roman", serif`;
    paint(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
  return cursor - x;
}

function measureTracked(ctx, text, capPx, tracking) {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') { w += capPx * 0.45 + tracking; continue; }
    ctx.font = `${i === 0 ? capPx : Math.round(capPx * 0.78)}px Georgia, "Times New Roman", serif`;
    w += ctx.measureText(text[i]).width + tracking;
  }
  return w;
}

/**
 * Incised lettering: the cut reads as a dark core with a lit lower-right lip,
 * which is what makes carved stone legible in raking light. No external art.
 */
function friezeTexture(names, pxPerMetre = 54, metres = LENGTH) {
  const w = Math.min(4096, Math.max(1024, Math.round(metres * pxPerMetre)));
  const h = 256;
  const { canvas, ctx } = canvas2d(w, h);

  // The band is 76 m long and 2.4 m tall, so a canvas with a usable letter
  // height is wildly anisotropic: ~54 px per metre across, ~107 px per metre up.
  // Laying the text out in vertical-pixel space and squashing horizontally by
  // that ratio is what keeps the carving square instead of six times too wide -
  // without it every name overruns its bay and the frieze reads as gibberish.
  const pxPerMetreX = w / metres;
  const pxPerMetreY = h / FRIEZE_HEIGHT;
  const squash = pxPerMetreX / pxPerMetreY;
  const layoutWidth = w / squash;

  ctx.fillStyle = '#cdc5b2';
  ctx.fillRect(0, 0, w, h);
  // faint course joints so the band still reads as ashlar between the names
  ctx.strokeStyle = 'rgba(120,112,96,0.30)';
  ctx.lineWidth = 2;
  for (const y of [10, h - 10]) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  ctx.save();
  ctx.scale(squash, 1);

  const capPx = Math.round(0.62 * pxPerMetreY);   // ~0.62 m cap height, carved
  const baseline = h / 2 + capPx * 0.36;
  const slot = layoutWidth / names.length;
  ctx.textBaseline = 'alphabetic';

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    // Tracking is widened until the name fills its bay, then pulled back if the
    // widest name would still overrun - the carving is spaced to the bay.
    let tracking = capPx * 0.14;
    const target = slot * 0.78;
    for (let k = 0; k < 40 && measureTracked(ctx, name, capPx, tracking) < target; k++) {
      tracking += capPx * 0.03;
    }
    while (tracking > 0 && measureTracked(ctx, name, capPx, tracking) > slot * 0.94) {
      tracking -= capPx * 0.02;
    }
    const width = measureTracked(ctx, name, capPx, tracking);
    const x = slot * i + Math.max(0, (slot - width) / 2);
    tracked(ctx, name, x, baseline, capPx, tracking, (ch, cx, cy) => {
      ctx.fillStyle = 'rgba(255,252,244,0.75)';
      ctx.fillText(ch, cx + 2, cy + 2);      // lit lip below the cut
      ctx.fillStyle = 'rgba(58,52,42,0.92)';
      ctx.fillText(ch, cx, cy);              // the cut itself
    });
  }
  ctx.restore();

  return texFrom(canvas);
}

function boardTexture(rows) {
  const { canvas, ctx } = canvas2d(1024, 512);
  ctx.fillStyle = '#0b0e12';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.font = 'bold 34px "Courier New", monospace';
  ctx.fillStyle = '#e6b34a';
  ctx.fillText('DEPARTURES  /  DEPARTS', 28, 56);
  ctx.font = '30px "Courier New", monospace';
  rows.forEach((r, i) => {
    const y = 120 + i * 46;
    ctx.fillStyle = '#d8e6f0';
    ctx.fillText(r[0], 28, y);
    ctx.fillText(r[1], 250, y);
    ctx.fillStyle = i === 0 ? '#7fe08a' : '#8fa6b8';
    ctx.fillText(r[2], 760, y);
  });
  return texFrom(canvas);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
/** Compose one instance matrix without allocating. */
function place(im, i, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  im.setMatrixAt(i, _m.compose(_p.set(px, py, pz), _q.setFromEuler(_e), _s.set(sx, sy, sz)));
}

/** The Guastavino barrel, built as an extruded arc so it has real thickness. */
function vaultShell() {
  const shape = new THREE.Shape();
  const a0 = Math.PI / 2 - ARC_HALF;
  const a1 = Math.PI / 2 + ARC_HALF;
  shape.absarc(0, 0, VAULT_R, a0, a1, false);
  shape.absarc(0, 0, VAULT_R + 0.6, a1, a0, true);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: LENGTH, bevelEnabled: false, curveSegments: 48 });
  geo.rotateY(Math.PI / 2);            // extrusion now runs along the long axis
  geo.translate(WEST_X, VAULT_CY, CZ);
  geo.computeVertexNormals();
  return geo;
}

/** The lunette opening cross-section, reused for glazing at both ends. */
function lunetteShape() {
  const cy = VAULT_CY - SPRING_Y;      // circle centre relative to the springing
  const a0 = Math.atan2(-cy, HALF_SPAN);
  const shape = new THREE.Shape();
  shape.moveTo(-HALF_SPAN, 0);
  shape.lineTo(HALF_SPAN, 0);
  shape.absarc(0, cy, VAULT_R, a0, Math.PI - a0, false);
  shape.closePath();
  return shape;
}

function buildFloor(g) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH, HALF_SPAN * 2), M.terrazzo());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, FLOOR_Y, CZ);
  floor.receiveShadow = true;
  g.add(floor);

  // Tennessee-marble banding: darker inlay strips crossing the short axis.
  const bandMat = local('marbleBand', () =>
    new THREE.MeshStandardMaterial({ color: 0x8d8271, roughness: 0.3, metalness: 0.04 }));
  const count = 15;
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 0.03, HALF_SPAN * 2), bandMat, count);
  for (let i = 0; i < count; i++) {
    place(bands, i, WEST_X + (LENGTH / count) * (i + 0.5), FLOOR_Y + 0.02, CZ);
  }
  bands.instanceMatrix.needsUpdate = true;
  bands.receiveShadow = true;
  g.add(bands);
}

function buildPiersAndWalls(g) {
  const PIERS_PER_SIDE = 9;
  const pierGeo = new THREE.BoxGeometry(2.2, PIER_TOP - FLOOR_Y, 2.2);
  const piers = new THREE.InstancedMesh(pierGeo, M.limestone(), PIERS_PER_SIDE * 2);
  const step = LENGTH / PIERS_PER_SIDE;
  let i = 0;
  for (const z of [CZ - HALF_SPAN + 1.2, CZ + HALF_SPAN - 1.2]) {
    for (let k = 0; k < PIERS_PER_SIDE; k++) {
      place(piers, i++, WEST_X + step * (k + 0.5), FLOOR_Y + (PIER_TOP - FLOOR_Y) / 2, z);
    }
  }
  piers.instanceMatrix.needsUpdate = true;
  piers.castShadow = true;
  piers.receiveShadow = true;
  g.add(piers);

  // long walls behind the piers, and the entablature they carry
  const wallMat = M.limestonePlain();
  for (const z of [CZ - HALF_SPAN - 0.3, CZ + HALF_SPAN + 0.3]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(LENGTH, SPRING_Y - FLOOR_Y, 0.6), wallMat);
    wall.position.set(CX, FLOOR_Y + (SPRING_Y - FLOOR_Y) / 2, z);
    wall.receiveShadow = true;
    g.add(wall);

    const arch = new THREE.Mesh(new THREE.BoxGeometry(LENGTH, 0.8, 1.6), M.limestone());
    arch.position.set(CX, PIER_TOP + 0.4, z + (z < CZ ? 0.5 : -0.5));
    g.add(arch);

    const cornice = new THREE.Mesh(new THREE.BoxGeometry(LENGTH, 0.9, 2.0), M.limestone());
    cornice.position.set(CX, FRIEZE_BOTTOM + FRIEZE_HEIGHT + 0.45, z + (z < CZ ? 0.6 : -0.6));
    cornice.castShadow = true;
    g.add(cornice);
  }
  return PIERS_PER_SIDE * 2;
}

/** THE FRIEZE — carved Canadian destinations, interior only. */
function buildFrieze(g) {
  const friezeMat = (names, metres) =>
    new THREE.MeshStandardMaterial({
      map: friezeTexture(names, 26, metres),
      roughness: 0.78,
      metalness: 0.0,
      emissive: 0x2a2620,
      emissiveIntensity: 0.35,   // interiors carry their own low-cost fill
    });

  const band = new THREE.Group();
  band.name = 'gh-frieze';

  for (const [side, names] of [['north', DESTINATIONS.north], ['south', DESTINATIONS.south]]) {
    const z = side === 'north' ? CZ - HALF_SPAN + 0.05 : CZ + HALF_SPAN - 0.05;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(LENGTH, FRIEZE_HEIGHT),
      friezeMat(names, LENGTH)
    );
    mesh.position.set(CX, FRIEZE_BOTTOM + FRIEZE_HEIGHT / 2, z);
    mesh.rotation.y = side === 'north' ? 0 : Math.PI;
    band.add(mesh);
  }
  for (const [side, names] of [['west', DESTINATIONS.west], ['east', DESTINATIONS.east]]) {
    const x = side === 'west' ? WEST_X + 0.05 : EAST_X - 0.05;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_SPAN * 2, FRIEZE_HEIGHT),
      friezeMat(names, HALF_SPAN * 2)
    );
    mesh.position.set(x, FRIEZE_BOTTOM + FRIEZE_HEIGHT / 2, CZ);
    mesh.rotation.y = side === 'west' ? Math.PI / 2 : -Math.PI / 2;
    band.add(mesh);
  }
  g.add(band);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(LENGTH, FRIEZE_HEIGHT, 0.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(CX, FRIEZE_BOTTOM + FRIEZE_HEIGHT / 2, CZ - HALF_SPAN + 0.4);
  registerInteractive(hit, {
    building: 'Union Station',
    address: '65 Front Street West',
    tenant: 'Great Hall destination frieze',
    category: 'heritage',
    confidence: 'reference',
    note: 'Carved names of Canadian destinations served by the railways. Interior only — the Front Street entablature outside carries railway names instead.',
  });
  g.add(hit);
  return band;
}

function buildVault(g) {
  const vault = new THREE.Mesh(vaultShell(), M.guastavinoTile());
  vault.castShadow = false;
  vault.receiveShadow = true;
  g.add(vault);

  // Coffering: recessed panels following the arc, one instanced mesh.
  const ROWS = 9;
  const BAYS = 17;
  const coffers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(LENGTH / BAYS - 0.9, 0.34, 2.0),
    local('coffer', () => new THREE.MeshStandardMaterial({ color: 0xc6bda6, roughness: 0.75 })),
    ROWS * BAYS
  );
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    const a = -ARC_HALF * 0.86 + (2 * ARC_HALF * 0.86 * r) / (ROWS - 1);
    const rr = VAULT_R - 0.18;
    const y = VAULT_CY + rr * Math.cos(a);
    const z = CZ + rr * Math.sin(a);
    for (let b = 0; b < BAYS; b++) {
      place(coffers, i++, WEST_X + (LENGTH / BAYS) * (b + 0.5), y, z, a);
    }
  }
  coffers.instanceMatrix.needsUpdate = true;
  g.add(coffers);
  return vault;
}

/** Arched clerestory lunettes — the hall's daylight, one at each end. */
function buildClerestory(g) {
  const glassMat = local('lunette', () =>
    new THREE.MeshStandardMaterial({
      color: 0xdfeaf2, roughness: 0.15, metalness: 0.0,
      emissive: 0xbcd6ea, emissiveIntensity: 1.5, side: THREE.DoubleSide,
    }));
  const group = new THREE.Group();
  const shape = lunetteShape();

  for (const [x, sign] of [[WEST_X + 0.2, 1], [EAST_X - 0.2, -1]]) {
    const geo = new THREE.ShapeGeometry(shape, 40);
    geo.rotateY(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, glassMat);
    mesh.position.set(x, SPRING_Y, CZ);
    group.add(mesh);

    // radiating mullions, instanced
    const bars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.2, VAULT_R - 1.0, 0.2),
      M.paintedSteel(0x2a2f34), 9
    );
    for (let k = 0; k < 9; k++) {
      const a = -ARC_HALF * 0.9 + (2 * ARC_HALF * 0.9 * k) / 8;
      const rMid = (VAULT_R - 1.0) / 2;
      bars.setMatrixAt(k, _m.compose(
        _p.set(x + sign * 0.25, VAULT_CY + Math.cos(a) * rMid, CZ + Math.sin(a) * rMid),
        _q.setFromEuler(_e.set(a, 0, 0)),
        _s.set(1, 1, 1)
      ));
    }
    bars.instanceMatrix.needsUpdate = true;
    group.add(bars);

    // the masonry below the springing, with the doorway heads punched through
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, SPRING_Y - FLOOR_Y - 4.4, HALF_SPAN * 2),
      M.limestonePlain()
    );
    wall.position.set(x, FLOOR_Y + 4.4 + (SPRING_Y - FLOOR_Y - 4.4) / 2, CZ);
    group.add(wall);

    // openings down to the concourses at each end
    for (const dz of [-6, 0, 6]) {
      const d = doorway({ width: 3.0, height: 4.2, recess: 0.6 });
      d.position.set(x, FLOOR_Y, CZ + dz);
      d.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(d);
    }
  }
  g.add(group);
  return group;
}

/** Front Street doors — aligned to the exterior colonnade bays on the north wall. */
function buildNorthDoors(g) {
  const z = CZ - HALF_SPAN - 0.1;
  const doors = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const d = doorway({ width: 2.8, height: 4.4, recess: 0.7 });
    d.position.set(CX - 24 + i * 12, FLOOR_Y, z);
    d.rotation.y = Math.PI;
    doors.add(d);
  }
  g.add(doors);
  return doors;
}

function buildTicketCounters(g) {
  const counters = new THREE.Group();
  counters.name = 'gh-ticket-counters';
  const z = CZ - HALF_SPAN + 2.6;
  const woodMat = local('counterWood', () =>
    new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.55 }));

  const desk = new THREE.Mesh(new THREE.BoxGeometry(46, 1.25, 2.0), woodMat);
  desk.position.set(CX, FLOOR_Y + 0.62, z);
  desk.castShadow = true;
  counters.add(desk);

  const top = new THREE.Mesh(new THREE.BoxGeometry(46.6, 0.12, 2.4), M.limestonePlain());
  top.position.set(CX, FLOOR_Y + 1.3, z);
  counters.add(top);

  // brass wicket screens, instanced
  const WICKETS = 12;
  const screens = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.6, 2.4, 0.1),
    local('brass', () => new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.35, metalness: 0.75 })),
    WICKETS
  );
  for (let i = 0; i < WICKETS; i++) {
    place(screens, i, CX - 21 + i * 3.8, FLOOR_Y + 2.6, z - 0.1);
  }
  screens.instanceMatrix.needsUpdate = true;
  counters.add(screens);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(46, 3.0, 1.0),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(CX, FLOOR_Y + 1.5, z + 1.6);
  registerInteractive(hit, {
    building: 'Union Station',
    address: '65 Front Street West',
    tenant: 'Great Hall ticket counters',
    category: 'transit',
    confidence: 'inferred',
    note: 'The original ticket lobby wickets on the north wall; current use is information and GO/VIA service counters.',
  });
  counters.add(hit);

  g.add(counters);
  return counters;
}

function buildBoards(g) {
  const rows = [
    ['16:05', 'LAKESHORE WEST  ALDERSHOT', 'ON TIME'],
    ['16:13', 'STOUFFVILLE  MOUNT JOY', 'TRACK 7'],
    ['16:20', 'VIA 65  OTTAWA', 'BOARDING'],
    ['16:28', 'BARRIE  ALLANDALE WATERFRONT', 'TRACK 12'],
    ['16:35', 'UP EXPRESS  PEARSON', 'PLATFORM 3'],
    ['16:42', 'LAKESHORE EAST  OSHAWA', 'ON TIME'],
    ['16:50', 'VIA 55  MONTREAL', 'TRACK 4'],
  ];
  const mat = local('board', () => {
    const map = boardTexture(rows);   // one canvas, used as both colour and glow
    return new THREE.MeshStandardMaterial({
      map, emissiveMap: map, color: 0xffffff, emissive: 0xffffff,
      emissiveIntensity: 0.9, roughness: 0.4,
    });
  });
  const boards = new THREE.Group();
  for (const [x, ry] of [[CX - 26, 0], [CX + 26, 0]]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.6), mat);
    b.position.set(x, FLOOR_Y + 6.2, CZ - HALF_SPAN + 0.9);
    b.rotation.y = ry;
    boards.add(b);
  }
  g.add(boards);
  return boards;
}

function buildFixtures(g) {
  // Four great pendant fixtures on the vault axis, instanced, plus their glow.
  const COUNT = 4;
  const bodies = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1.5, 1.9, 1.6, 16),
    local('fixtureGlow', () => new THREE.MeshStandardMaterial({
      color: 0xf3e2bd, emissive: 0xffd9a0, emissiveIntensity: 2.1, roughness: 0.5,
    })),
    COUNT
  );
  const rods = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.08, 0.08, 7.5, 6),
    M.paintedSteel(0x30261a), COUNT
  );
  for (let i = 0; i < COUNT; i++) {
    const x = WEST_X + (LENGTH / COUNT) * (i + 0.5);
    place(bodies, i, x, 17.0, CZ);
    place(rods, i, x, 21.5, CZ);
  }
  bodies.instanceMatrix.needsUpdate = true;
  rods.instanceMatrix.needsUpdate = true;
  g.add(bodies, rods);

  // Benches — the long oak benches down the centre of the hall.
  const BENCHES = 10;
  const benches = new THREE.InstancedMesh(
    new THREE.BoxGeometry(5.4, 0.5, 1.4),
    local('oak', () => new THREE.MeshStandardMaterial({ color: 0x5b4128, roughness: 0.6 })),
    BENCHES
  );
  for (let i = 0; i < BENCHES; i++) {
    place(benches, i, WEST_X + 8 + (i % 5) * 13, FLOOR_Y + 0.45, CZ + (i < 5 ? -3.4 : 3.4));
  }
  benches.instanceMatrix.needsUpdate = true;
  benches.castShadow = false;
  g.add(benches);

  // Free-standing kiosks.
  const KIOSKS = 4;
  const kiosks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.2, 2.6, 3.2), M.paintedSteel(0x38424a), KIOSKS
  );
  const canopies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.8, 0.18, 3.8), M.signWhite(), KIOSKS
  );
  for (let i = 0; i < KIOSKS; i++) {
    const x = WEST_X + 12 + i * 17;
    place(kiosks, i, x, FLOOR_Y + 1.3, CZ + 8.2);
    place(canopies, i, x, FLOOR_Y + 2.75, CZ + 8.2);
  }
  kiosks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  g.add(kiosks, canopies);
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) { // eslint-disable-line no-unused-vars
  const group = new THREE.Group();
  group.name = 'union-great-hall';

  buildFloor(group);
  const pierCount = buildPiersAndWalls(group);
  buildFrieze(group);
  buildVault(group);
  buildClerestory(group);
  buildNorthDoors(group);
  buildTicketCounters(group);
  buildBoards(group);
  buildFixtures(group);

  // Tuscan order at the west end of the lobby, matching the exterior order.
  const cols = colonnade({ count: 4, spacing: 6.0, height: 11.5, diameter: 1.3, axis: 'z' });
  cols.position.set(WEST_X + 5, FLOOR_Y, CZ);
  group.add(cols);

  // Two cheap lights only; the room is carried by emissive lunettes and pendants.
  const ambient = new THREE.AmbientLight(0xdfe6ee, 0.55);
  group.add(ambient);
  for (const x of [CX - 20, CX + 20]) {
    const p = new THREE.PointLight(0xffe6bd, 46, 62, 2);
    p.position.set(x, 15.5, CZ);
    group.add(p);
  }

  register({
    id: 'union-great-hall',
    name: 'Union Station Great Hall',
    kind: 'interior',
    object: group,
    confidence: 'reference',
    source: 'published dimensions (76 x 26 x 27 m) and photographic proportion',
    note:
      'The carved frieze of CANADIAN DESTINATION cities (HALIFAX ... VICTORIA) is INTERIOR ONLY, on the stone band above the piers. The exterior Front Street entablature carries incised RAILWAY names and belongs to the Union Station exterior module. Do not swap them. The Great Hall is at street level (y +0.2) and is NOT one of the three concourses, which sit at -3.5.',
    data: {
      length: LENGTH, width: HALF_SPAN * 2, crownHeight: CROWN_Y - FLOOR_Y,
      piers: pierCount,
      friezeNames: [...DESTINATIONS.north, ...DESTINATIONS.south, ...DESTINATIONS.west, ...DESTINATIONS.east],
    },
  });

  register({
    id: 'gh-guastavino-vault', name: 'Great Hall Guastavino barrel vault', kind: 'interior',
    confidence: 'reference',
    source: 'Guastavino tile segmental vault, 26 m span, crown 27 m above the floor',
    note: 'Segmental, not semicircular — a 26 m semicircle would crown 13 m above the springing; the real vault rises about 11 m.',
  });
  register({
    id: 'gh-destination-frieze', name: 'Great Hall destination frieze', kind: 'frontage',
    confidence: 'reference', source: 'carved stone frieze, interior entablature',
    note: 'Twenty Canadian destinations carved in incised small caps. INTERIOR ONLY.',
    data: { names: [...DESTINATIONS.north, ...DESTINATIONS.south, ...DESTINATIONS.west, ...DESTINATIONS.east] },
  });
  register({
    id: 'gh-clerestory-lunettes', name: 'Great Hall clerestory lunettes', kind: 'interior',
    confidence: 'reference', source: 'arched end windows under the vault',
    note: 'One large lunette at each end, east and west; the hall has no other daylight.',
  });
  register({
    id: 'gh-ticket-lobby', name: 'Great Hall ticket counters', kind: 'frontage',
    confidence: 'inferred', source: 'north wall wicket line',
    note: 'Counter line length approximated; wicket rhythm follows the pier bays.',
  });

  registerInterior({
    id: 'union-great-hall',
    group,
    centre: { x: CX, y: 8, z: CZ },
    radius: 90,
  });

  return group;
}
