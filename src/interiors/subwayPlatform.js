/**
 * UNION's LINE 1 PLATFORM — the Yonge-University subway under the station.
 *
 * REAL-WORLD FACTS ENCODED
 *   - Line 1 runs UNDER FRONT STREET here, east-west, and Union is the bottom of
 *     the U: trains come down University, round through Union, and go back up
 *     Yonge. The platform is below the PATH, reached from the fare-paid
 *     mezzanine in interiors/path.js.
 *   - The original 1954 island platform is what this builds. The second (side)
 *     platform added in the 2010s to split boarding and alighting is NOT
 *     modelled — see the registry note; do not describe it as if it were.
 *   - No catenary: the subway is third rail, and the mainline corridor above is
 *     diesel. Nothing here is strung overhead.
 *
 * WHERE IT IS. Directly under the mezzanine's stairwell (path.js `STAIRWELL`),
 * which lands at -8.3 and used to be shuttered there because nothing was built
 * below it (#118). That flight now carries on down to this floor.
 *
 * The 0.5 m under the streetcar loop is deliberate: the loop's shell bottoms out
 * at -6.9 and this room's ceiling is -7.4. They overlap in plan and must not in
 * section.
 */
import * as THREE from 'three';
import { LEVELS } from '../data/grid.js';
import { M } from '../core/materials.js';
import { register, registerInteractive } from '../core/registry.js';
import { registerInterior } from '../world/index.js';
import { STAIRWELL } from './path.js';

const FLOOR = LEVELS.subwayPlatform;   // -11.0
const CEIL = -7.4;                     // 3.6 m clear, 0.5 m under the streetcar loop
const TRACK_Y = FLOOR - 0.9;           // rail top below platform level, as it is

/**
 * The room, in grid metres. The stair from the mezzanine lands on it, so its
 * north edge is derived from `STAIRWELL` rather than typed twice.
 */
export const PLATFORM = Object.freeze({
  id: 'union-line1-platform',
  // Island x -10..40, z 14..28. The depth is what puts the whole of the arriving
  // flight over platform rather than over the northern trackbed, which a 10 m
  // island did by a metre.
  x: 15, z: 21, w: 50, d: 14,
  floorY: FLOOR,
  ceilingY: CEIL,
  /** Where the flight from the mezzanine arrives. */
  arrival: Object.freeze({ x: (STAIRWELL.minX + STAIRWELL.maxX) / 2, z: STAIRWELL.maxZ + 3.2 }),
  trackY: TRACK_Y,
});

const matCache = new Map();
const local = (key, build) => {
  let m = matCache.get(key);
  if (!m) { m = build(); m.name = `line1:${key}`; matCache.set(key, m); }
  return m;
};

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const place = (im, i, x, y, z, sx = 1, sy = 1, sz = 1) =>
  im.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sz)));

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) { // eslint-disable-line no-unused-vars
  const g = new THREE.Group();
  g.name = PLATFORM.id;
  const { x: cx, z: cz, w, d } = PLATFORM;
  const minX = cx - w / 2;
  const maxX = cx + w / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.concretePlain());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, FLOOR, cz);
  floor.receiveShadow = true;
  g.add(floor);

  // The tunnel box: one vault over platform and both tracks, ends left open so
  // the tunnel reads as continuing rather than as a sealed room.
  const SPAN = d + 16;                 // island plus a track either side
  // Cut for the stair from the mezzanine: without the hole the flight comes
  // down THROUGH the ceiling and a walker on it stands on the slab instead.
  const slab = new THREE.Shape();
  slab.moveTo(-w / 2, -SPAN / 2);
  slab.lineTo(w / 2, -SPAN / 2);
  slab.lineTo(w / 2, SPAN / 2);
  slab.lineTo(-w / 2, SPAN / 2);
  slab.closePath();
  const { x: ax, z: az } = PLATFORM.arrival;
  const HALF_W = 2.6;                  // the flight is 4.4 m wide, plus a margin
  const HALF_D = 3.0;
  // ShapeGeometry is laid out in local XY and the plane is turned, so local +y
  // reads as +z here (rotation.x = +90 maps local y to world z).
  const lz = (z) => z - cz;
  const hole = new THREE.Path();
  hole.moveTo(ax - cx - HALF_W, lz(az - HALF_D));
  hole.lineTo(ax - cx + HALF_W, lz(az - HALF_D));
  hole.lineTo(ax - cx + HALF_W, lz(az + HALF_D));
  hole.lineTo(ax - cx - HALF_W, lz(az + HALF_D));
  hole.closePath();
  slab.holes.push(hole);

  const ceil = new THREE.Mesh(new THREE.ShapeGeometry(slab), M.concretePlain());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, CEIL, cz);
  g.add(ceil);
  for (const sz of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w, CEIL - TRACK_Y, 0.5), M.concretePlain()
    );
    wall.position.set(cx, (CEIL + TRACK_Y) / 2, cz + sz * SPAN / 2);
    wall.receiveShadow = true;
    g.add(wall);
  }

  // Trackbeds either side of the island, and the rails on them.
  const RAIL_GAUGE = 1.495;            // TTC gauge, as on the streetcar loop
  for (const sz of [-1, 1]) {
    const trackZ = cz + sz * (d / 2 + 4);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 7), M.concretePlain());
    bed.position.set(cx, TRACK_Y - 0.25, trackZ);
    g.add(bed);
    const rails = new THREE.InstancedMesh(
      new THREE.BoxGeometry(w, 0.16, 0.12), M.steelDark(), 2
    );
    for (let i = 0; i < 2; i++) {
      place(rails, i, cx, TRACK_Y + 0.08, trackZ + (i ? RAIL_GAUGE / 2 : -RAIL_GAUGE / 2));
    }
    rails.instanceMatrix.needsUpdate = true;
    g.add(rails);
  }

  // Platform edge: the tiled face down to track level, and the tactile strip.
  for (const sz of [-1, 1]) {
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(w, FLOOR - TRACK_Y, 0.3), M.concretePlain()
    );
    face.position.set(cx, (FLOOR + TRACK_Y) / 2, cz + sz * (d / 2));
    g.add(face);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.04, 0.8),
      local('tactile', () => new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.85 }))
    );
    strip.position.set(cx, FLOOR + 0.02, cz + sz * (d / 2 - 0.6));
    strip.userData.noCollide = true;
    g.add(strip);
  }

  // Each end is closed except where the two bores go through it. Without this
  // the room is open at both ends and a walker on the platform looks straight
  // out into the city from eleven metres under it.
  const BORE_W = 7;
  const bores = [-1, 1].map((sz) => cz + sz * (d / 2 + 4));
  const edges = [cz - SPAN / 2, ...bores.flatMap((b) => [b - BORE_W / 2, b + BORE_W / 2]), cz + SPAN / 2];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < edges.length - 1; k += 2) {          // the gaps between bores
      const from = edges[k];
      const to = edges[k + 1];
      if (to - from < 0.2) continue;
      const piece = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, CEIL - TRACK_Y, to - from), M.concretePlain()
      );
      piece.position.set(sx < 0 ? minX : maxX, (CEIL + TRACK_Y) / 2, (from + to) / 2);
      g.add(piece);
    }
  }

  // Tunnel mouths: a dark plane in each bore, so the tunnel reads as going
  // somewhere instead of stopping at a wall.
  const mouth = local('bore', () => new THREE.MeshBasicMaterial({ color: 0x05070a }));
  for (const bz of bores) {
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(BORE_W, CEIL - TRACK_Y), mouth);
      m.position.set(sx < 0 ? minX : maxX, (CEIL + TRACK_Y) / 2, bz);
      m.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(m);
    }
  }

  // Columns down the middle of the island, as the 1954 station has.
  const COLS = Math.max(3, Math.round(w / 8));
  const cols = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.6, CEIL - FLOOR, 0.6), M.paintedSteel(0x9aa3ab), COLS
  );
  for (let i = 0; i < COLS; i++) {
    place(cols, i, minX + (w / (COLS + 1)) * (i + 1), (FLOOR + CEIL) / 2, cz);
  }
  cols.instanceMatrix.needsUpdate = true;
  cols.castShadow = true;
  g.add(cols);

  // Lighting: a continuous trough each side of the columns, skipping the stair
  // opening — a fitting hung in the middle of it is both wrong to look at and,
  // until it was marked, something the walker's floor ray stood on at -7.47.
  const LIGHTS = 10;
  const lamps = [];
  for (const sz of [-1, 1]) {
    for (let k = 0; k < LIGHTS; k++) {
      const lx = minX + (w / (LIGHTS + 1)) * (k + 1);
      const lzPos = cz + sz * 2.6;
      if (Math.abs(lx - ax) < HALF_W + 0.5 && Math.abs(lzPos - az) < HALF_D + 0.5) continue;
      lamps.push([lx, lzPos]);
    }
  }
  const troughs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(w * 0.9 / LIGHTS, 0.1, 0.6),
    local('trough', () => new THREE.MeshBasicMaterial({ color: 0xf6f1e2 })),
    lamps.length
  );
  lamps.forEach(([lx, lzPos], k) => place(troughs, k, lx, CEIL - 0.12, lzPos));
  troughs.instanceMatrix.needsUpdate = true;
  troughs.userData.noCollide = true;
  g.add(troughs);
  g.add(new THREE.AmbientLight(0xdfe6ec, 0.45));

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(16, 2.6, 3), new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(cx, FLOOR + 1.3, cz);
  registerInteractive(hit, {
    building: 'Union Subway Station',
    address: 'Line 1 Yonge-University, under Front Street',
    tenant: 'Union — Line 1 platform',
    category: 'transit',
    confidence: 'inferred',
    note: 'The island platform under the station, reached from the fare-paid mezzanine. '
      + 'Third rail, no catenary. The second platform added in the 2010s is not modelled.',
  });
  g.add(hit);

  register({
    id: PLATFORM.id, name: 'Union Station Line 1 platform', kind: 'interior', object: g,
    confidence: 'inferred',
    source: 'platform depth and island arrangement inferred from the station section',
    note: `Line 1 island platform at ${FLOOR} m, under the PATH at -6.5 and the fare-paid `
      + 'mezzanine. One island, two tracks; the later side platform is not built.',
    data: { floorY: FLOOR, width: w, depth: d },
  });

  registerInterior({
    id: PLATFORM.id, group: g,
    centre: { x: cx, y: FLOOR + 2, z: cz },
    radius: 80,
  });

  return g;
}
