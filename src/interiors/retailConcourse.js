/**
 * Union Station's LOWER RETAIL CONCOURSE — the excavated level under the shed.
 *
 * REAL-WORLD FACTS ENCODED
 *   - The revitalisation dug several metres below the old floor to win two new
 *     transit concourses AND a retail concourse under the tracks. It is a
 *     station space, one level down from York / Bay / VIA, reached from them.
 *   - It is NOT the PATH (#120). The PATH is the city's pedestrian network,
 *     which passes through Union on its way between towers; this belongs to the
 *     station. They sit at different depths and are entered differently, and the
 *     model used to collapse the two into one.
 *
 * WHERE IT IS. Under the train shed, west of the PATH's Scotiabank Arena run
 * (that corridor holds x -119..-104 from z 22 south, and this room stops at
 * -125 to stay out of it). Its north wall is the VIA Concourse's south wall, so
 * the two share a doorway and no vestibule is needed between them: buildRoom in
 * concourses.js opens VIA's south wall for it and nothing else.
 *
 * The floor is LEVELS.unionRetail = -5.0, between the concourses at -3.5 and the
 * PATH at -6.5 — which is why LEVEL_ORDER gains an entry rather than this room
 * borrowing one: Q and E stop here now.
 */
import * as THREE from 'three';
import { LEVELS } from '../data/grid.js';
import { M } from '../core/materials.js';
import { storefrontBand } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';
import { registerInterior } from '../world/index.js';

const FLOOR = LEVELS.unionRetail;        // -5.0
const CEIL = -1.2;                       // 3.8 m clear, all of it below grade
const VIA_FLOOR = LEVELS.unionConcourse; // -3.5, the level the doorway opens onto

/**
 * The room, in grid metres. The north edge is the VIA Concourse's south wall
 * (z 74); `door` is shared with it, so the two openings line up by construction.
 *
 * Exported so the regression test measures the geometry and not a copy of it.
 */
export const RETAIL = Object.freeze({
  id: 'union-retail-concourse',
  x: -157.5, z: 93, w: 65, d: 38,        // x -190..-125, z 74..112
  floorY: FLOOR,
  ceilingY: CEIL,
  /** Shared with the VIA Concourse's south wall; see concourses.js. */
  door: Object.freeze({ x: -140, width: 6, sillY: VIA_FLOOR }),
});

const matCache = new Map();
const local = (key, build) => {
  let m = matCache.get(key);
  if (!m) { m = build(); m.name = `retail:${key}`; matCache.set(key, m); }
  return m;
};

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const place = (im, i, x, y, z) => im.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.identity(), _s.set(1, 1, 1)));

/** Steps down from the doorway landing to the shop floor. */
function stair({ rise, run, width }) {
  const g = new THREE.Group();
  const steps = Math.max(6, Math.round(rise / 0.175));
  const tread = run / steps;
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(width, 0.16, tread), M.concretePlain(), steps);
  for (let i = 0; i < steps; i++) place(im, i, 0, (rise / steps) * (i + 1) - 0.08, tread * (i + 0.5));
  im.instanceMatrix.needsUpdate = true;
  im.receiveShadow = true;
  g.add(im);
  return g;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) { // eslint-disable-line no-unused-vars
  const g = new THREE.Group();
  g.name = RETAIL.id;
  const { x: cx, z: cz, w, d } = RETAIL;
  const minX = cx - w / 2;
  const maxX = cx + w / 2;
  const minZ = cz - d / 2;
  const height = CEIL - FLOOR;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.pathFloor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, FLOOR, cz);
  floor.receiveShadow = true;
  g.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.ceilingPanel());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, CEIL, cz);
  g.add(ceil);

  // Walls. The north one carries the doorway through to VIA, so it is built in
  // two pieces with the opening between them; the other three are solid.
  const wallMat = M.concretePlain();
  const solid = (bw, bd, x, z) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, height, bd), wallMat);
    wall.position.set(x, FLOOR + height / 2, z);
    wall.receiveShadow = true;
    g.add(wall);
  };
  solid(w, 0.5, cx, cz + d / 2);                     // south
  solid(0.5, d, minX, cz);                           // west
  solid(0.5, d, maxX, cz);                           // east
  for (const [from, to] of [
    [minX, RETAIL.door.x - RETAIL.door.width / 2],
    [RETAIL.door.x + RETAIL.door.width / 2, maxX],
  ]) {
    if (to - from > 0.2) solid(to - from, 0.5, (from + to) / 2, minZ);
  }
  // Over the opening: the doorway is 2.1 m tall from VIA's floor, and the wall
  // closes again above its head.
  const headY = RETAIL.door.sillY + 2.1;
  if (CEIL > headY) {
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(RETAIL.door.width, CEIL - headY, 0.5), wallMat
    );
    lintel.position.set(RETAIL.door.x, (CEIL + headY) / 2, minZ);
    g.add(lintel);
  }

  // The doorway sits at VIA's floor, 1.5 m above this one: a landing inside the
  // wall, then steps down to the shop floor.
  const landing = new THREE.Mesh(
    new THREE.BoxGeometry(RETAIL.door.width + 1.0, 0.3, 2.4), M.concretePlain()
  );
  landing.position.set(RETAIL.door.x, RETAIL.door.sillY - 0.15, minZ + 1.2);
  landing.receiveShadow = true;
  g.add(landing);
  const down = stair({ rise: RETAIL.door.sillY - FLOOR, run: 3.2, width: RETAIL.door.width });
  down.position.set(RETAIL.door.x, FLOOR, minZ + 2.4 + 3.2);
  down.rotation.y = Math.PI;      // the helper climbs toward +z; this descends that way
  g.add(down);

  // Shopfronts down both long walls — the reason the level exists.
  let units = 0;
  for (const [z, rotY] of [[minZ + 0.55, 0], [cz + d / 2 - 0.55, Math.PI]]) {
    const { group: band, bays } = storefrontBand({
      width: w - 14, height: height - 0.6, bayWidth: 6.0, glass: 0x2a3a44,
    });
    band.position.set(cx, FLOOR, z);
    band.rotation.y = rotY;
    g.add(band);
    units += bays.length;
  }

  // Linear ceiling troffers, the only light down here.
  const LIGHTS = 8;
  const troffers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(w * 0.7, 0.1, 0.8),
    local('troffer', () => new THREE.MeshBasicMaterial({ color: 0xfbf4e4 })),
    LIGHTS
  );
  for (let i = 0; i < LIGHTS; i++) {
    place(troffers, i, cx, CEIL - 0.1, minZ + (d / (LIGHTS + 1)) * (i + 1));
  }
  troffers.instanceMatrix.needsUpdate = true;
  g.add(troffers);
  g.add(new THREE.AmbientLight(0xe8eef2, 0.45));

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(14, 2.6, 3), new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(cx, FLOOR + 1.3, cz);
  registerInteractive(hit, {
    building: 'Union Station',
    address: '65 Front Street West, lower retail concourse',
    tenant: 'Union Station retail concourse',
    category: 'retail',
    confidence: 'inferred',
    note: 'The excavated retail level under the train shed, one level below the York, Bay '
      + 'and VIA concourses. Part of the station — not the PATH, which runs deeper.',
  });
  g.add(hit);

  register({
    id: RETAIL.id, name: 'Union Station retail concourse', kind: 'interior', object: g,
    confidence: 'inferred',
    source: 'revitalisation excavation described in published accounts; extent inferred',
    note: `Floor at ${FLOOR} m, one level under the concourses at ${VIA_FLOOR} m and above the `
      + 'PATH at -6.5 m. Entered through the VIA Concourse\'s south wall. Extent inferred.',
    data: { floorY: FLOOR, width: w, depth: d, retailUnits: units },
  });

  registerInterior({
    id: RETAIL.id, group: g,
    centre: { x: cx, y: FLOOR + 2, z: cz },
    radius: 80,
  });

  return g;
}
