/**
 * CN Tower, 290 Bremner Boulevard (1976, John Andrews / Webb Zerafa Menkes
 * Housden / NCK Engineering). 553.33 m to the tip of the antenna mast.
 *
 * WHY THIS MODULE IS THE MOST EXPENSIVE THING TO GET WRONG: the tower is the
 * only object visible from every camera position in the scene, so its
 * silhouette is what tells a viewer where they are standing and which way they
 * are facing. The proportions that carry that read, and that this module is
 * built to hold:
 *
 *   grade  -> 553.33 m   overall height (with the mast)
 *   342-351 m            main pod, seven storeys, widest radius ~30 m
 *                        = 62 % of total height
 *   447 m                SkyPod, a much smaller ring ~9 m radius
 *                        = 81 % of total height
 *
 * Everything else is subordinate to those three numbers. In plan the shaft is a
 * HEXAGONAL post-tensioned concrete core with THREE tapered wings 120 deg
 * apart. The wings flare hard in the bottom hundred metres - that Y-shaped base
 * is what makes the tower recognisable from a block away at street level, where
 * the pod is out of frame above the camera - and then narrow away into the
 * shaft rather than stopping abruptly.
 *
 * PERFORMANCE: this thing is on screen in every frame, so no cylinder here uses
 * more than 24 radial segments and the hexagonal core uses exactly 6. The whole
 * tower is a few thousand triangles.
 *
 * Position comes from the building database, never from a constant in here, so
 * the tower follows the block if the southbank coordinates are re-surveyed. Its
 * range and true bearing from Union Station's Front Street entrance are
 * recomputed at build time through `geo.gridDirectionToBearing` and filed in the
 * registry note, which is how the database's "near 245 deg" gets checked rather
 * than repeated.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';
import { UNION_ENTRANCE_GRID, gridDirectionToBearing } from '../core/geo.js';

/** Published heights, metres above grade. Do not round these away. */
const H = Object.freeze({
  total: 553.33,
  podBottom: 336,      // white radome skirt springs from here
  glassFloor: 342,     // Glass Floor / outdoor SkyTerrace
  lookOut: 345.5,      // LookOut level, sloped glazing
  restaurant: 349.5,   // 360 The Restaurant, revolving
  podTop: 356,         // mechanical crown, mast springs from here
  skyPod: 447,
  wingTop: 310,        // wings have narrowed to nothing by here
});

/** Radii. The core tapers from ~20 m across at grade to ~8 m at the pod. */
const R = Object.freeze({
  coreBase: 10.0,
  coreMid: 6.4,
  corePod: 4.0,
  pod: 30.0,           // widest pod radius
  skyPod: 9.0,
  mastBase: 3.4,
  mastTip: 0.55,
});

const RADIAL = 24;     // pod / mast cylinders. 24 is the ceiling, deliberately.

/** Core radius at a height, used to seat the wings flush against the shaft. */
function coreRadiusAt(y) {
  const t = Math.min(1, y / H.podBottom);
  // Two-piece taper: fast in the lower third, near-parallel above it.
  return t < 0.35
    ? R.coreBase + (R.coreMid - R.coreBase) * (t / 0.35)
    : R.coreMid + (R.corePod - R.coreMid) * ((t - 0.35) / 0.65);
}

/** The hexagonal concrete shaft, in three stacked tapers. */
function buildCore() {
  const g = new THREE.Group();
  const mat = M.concrete();
  const stops = [0, 120, 240, H.podBottom];
  for (let i = 0; i < stops.length - 1; i++) {
    const y0 = stops[i];
    const y1 = stops[i + 1];
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(coreRadiusAt(y1), coreRadiusAt(y0), y1 - y0, 6, 1),
      mat
    );
    seg.position.y = (y0 + y1) / 2;
    seg.castShadow = true;
    seg.receiveShadow = true;
    g.add(seg);
  }
  return g;
}

/**
 * The three wings. Each is a vertical elevation profile extruded tangentially:
 * 30 m out from the axis at grade, merged back into the shaft by 310 m. The
 * inner edge of the profile tracks `coreRadiusAt` so the wing never floats off
 * the core or buries itself inside it.
 */
function buildWings() {
  const profile = [
    [R.coreBase, 0], [30, 0], [12, 60], [8.5, 150], [6.2, 250], [4.9, H.wingTop],
    [coreRadiusAt(H.wingTop), H.wingTop], [coreRadiusAt(250), 250],
    [coreRadiusAt(150), 150], [coreRadiusAt(60), 60],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], profile[0][1]);
  for (let i = 1; i < profile.length; i++) shape.lineTo(profile[i][0], profile[i][1]);
  shape.closePath();

  const thickness = 7.5;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  geo.computeVertexNormals();

  const wings = new THREE.InstancedMesh(geo, M.concrete(), 3);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 3; i++) wings.setMatrixAt(i, m.makeRotationY((i * Math.PI * 2) / 3));
  wings.instanceMatrix.needsUpdate = true;
  wings.castShadow = true;
  wings.receiveShadow = true;
  return wings;
}

/** One horizontal ring of the pod. `rBot`/`rTop` differ where the wall slopes. */
function podRing(rBot, rTop, y0, y1, material) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, y1 - y0, RADIAL, 1),
    material
  );
  mesh.position.y = (y0 + y1) / 2;
  mesh.castShadow = true;
  return mesh;
}

/**
 * The main pod: a seven-storey doughnut wrapped around the core, read from the
 * ground as four stacked bands. Bottom to top these are the white radome-like
 * skirt, the Glass Floor / outdoor SkyTerrace, the LookOut with its glazing
 * leaning outward at the sill so visitors can stand against it and look
 * straight down, and 360 The Restaurant.
 */
function buildMainPod() {
  const g = new THREE.Group();

  // Flared white skirt. This is the band that makes the pod read as hanging off
  // the shaft rather than sitting on it.
  g.add(podRing(R.corePod + 2, R.pod - 1.5, H.podBottom, H.glassFloor, M.steelWhite()));

  // Glass Floor / SkyTerrace - the widest point of the tower.
  g.add(podRing(R.pod, R.pod, H.glassFloor, H.lookOut, M.glassDark()));

  // LookOut. Sill sits proud of the head, so rTop < rBot: outward-leaning glass.
  g.add(podRing(R.pod, R.pod - 2.5, H.lookOut, H.restaurant, M.glassCool()));

  // 360 The Restaurant, then the mechanical crown the mast springs from.
  g.add(podRing(R.pod - 3, R.pod - 6, H.restaurant, 353, M.glassCool()));
  g.add(podRing(R.pod - 6, R.pod - 11, 353, H.podTop, M.steelWhite()));

  // Mullion ribs. Instanced: 24 of them for the price of one draw call.
  const ribH = H.restaurant - H.glassFloor;
  const ribs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, ribH, 1.2),
    M.steelWhite(),
    RADIAL
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < RADIAL; i++) {
    const a = (i / RADIAL) * Math.PI * 2;
    p.set(Math.sin(a) * (R.pod - 0.3), (H.glassFloor + H.restaurant) / 2, Math.cos(a) * (R.pod - 0.3));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    ribs.setMatrixAt(i, m.compose(p, q, s));
  }
  ribs.instanceMatrix.needsUpdate = true;
  ribs.castShadow = false;
  // Pod mullions are the only part of the tower cheap enough to drop; the
  // silhouette itself must never be LOD'd out, it is the orientation cue.
  ribs.userData.lod = { band: 'mid' };
  g.add(ribs);

  return g;
}

/** SkyPod at 447 m: the small ring, a third of the main pod's radius. */
function buildSkyPod() {
  const g = new THREE.Group();
  const y0 = H.skyPod - 4;
  const y1 = H.skyPod + 5;
  g.add(podRing(3.0, R.skyPod, y0, y0 + 2.5, M.steelWhite()));
  g.add(podRing(R.skyPod, R.skyPod, y0 + 2.5, y1 - 1.5, M.glassCool()));
  g.add(podRing(R.skyPod, R.skyPod - 3, y1 - 1.5, y1 + 1.5, M.steelWhite()));
  return g;
}

/**
 * Antenna mast: 197 m of tapering steel from the pod crown to 553.33 m, built
 * in six sections with visible joint collars, because the joints are what give
 * the mast its scale against the sky.
 */
function buildMast() {
  const g = new THREE.Group();
  const y0 = H.podTop;
  const span = H.total - y0;
  const sections = 6;
  const radiusAt = (t) => R.mastBase + (R.mastTip - R.mastBase) * t;

  for (let i = 0; i < sections; i++) {
    const t0 = i / sections;
    const t1 = (i + 1) / sections;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusAt(t1), radiusAt(t0), span / sections, 8, 1),
      M.steelWhite()
    );
    seg.position.y = y0 + span * (t0 + t1) / 2;
    seg.castShadow = true;
    g.add(seg);
  }

  // Joint collars, instanced.
  const collars = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1.4, 8, 1),
    M.steelDark(),
    sections
  );
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let i = 0; i < sections; i++) {
    const t = i / sections;
    const r = radiusAt(t) * 1.25;
    p.set(0, y0 + span * t + 1, 0);
    s.set(r, 1, r);
    collars.setMatrixAt(i, m.compose(p, q, s));
  }
  collars.instanceMatrix.needsUpdate = true;
  g.add(collars);

  return g;
}

/**
 * Aircraft warning lights. Transport Canada requires them on the mast and at
 * the pod; they are the only part of the tower that reads at night from far
 * away. Tagged `userData.nightLight` so the time-of-day system can find and
 * pulse them without knowing anything about this module.
 */
function buildWarningLights() {
  const heights = [H.glassFloor - 2, H.podTop + 6, 400, H.skyPod - 6, H.skyPod + 8, 480, 515, H.total - 4];
  const perLevel = 3;
  const lights = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1.15, 6, 4),
    M.litInterior(0xff3b30),
    heights.length * perLevel
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (const y of heights) {
    // Sit the lights just outside whatever the tower's radius is at that height.
    const r = y < H.podTop ? R.pod * 0.6 : Math.max(1.4, R.mastBase * (1 - (y - H.podTop) / (H.total - H.podTop)) * 1.6);
    for (let k = 0; k < perLevel; k++) {
      const a = (k / perLevel) * Math.PI * 2 + y * 0.017;
      lights.setMatrixAt(i++, m.makeTranslation(Math.sin(a) * r, y, Math.cos(a) * r));
    }
  }
  lights.instanceMatrix.needsUpdate = true;
  lights.castShadow = false;
  lights.userData.nightLight = true;
  return lights;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) {
  const b = getBuilding('cn-tower');
  const group = new THREE.Group();
  group.name = 'cn-tower';
  group.position.set(b.x, 0, b.z);

  const core = buildCore();
  const wings = buildWings();
  const pod = buildMainPod();
  const skyPod = buildSkyPod();
  const mast = buildMast();
  const lights = buildWarningLights();
  group.add(core, wings, pod, skyPod, mast, lights);

  // Bearing and range from the station, computed rather than asserted, so the
  // note in the QA report is checkable.
  const dx = b.x - UNION_ENTRANCE_GRID.x;
  const dz = b.z - UNION_ENTRANCE_GRID.z;
  const range = Math.round(Math.hypot(dx, dz));
  const bearing = Math.round(gridDirectionToBearing(dx, dz));

  register({
    id: 'cn-tower',
    name: 'CN Tower',
    kind: 'landmark',
    object: group,
    confidence: 'reference',
    source: 'published heights (553.33 m overall, pod 342-351 m, SkyPod 447 m); shaft and wing profile from photographic proportion',
    note:
      `Sits ${range} m from Union Station's Front Street entrance on a true bearing of ` +
      `${bearing} deg - the building database says "near 245 deg"; recomputing from the ` +
      `two grid positions through geo.gridDirectionToBearing gives ${bearing} deg, and that ` +
      'is the figure the geometry actually honours. Pod at 62% of total height, SkyPod at 81%. ' +
      'Wing plan taper and pod storey heights are proportional, not surveyed.',
    data: {
      address: b.address, height: H.total, podHeight: H.glassFloor, skyPodHeight: H.skyPod,
      rangeFromUnion: range, bearingFromUnion: bearing,
    },
  });

  register({ id: 'cnt-core', name: 'CN Tower hexagonal core', kind: 'infrastructure', object: core,
    confidence: 'inferred', note: 'Hexagonal post-tensioned concrete shaft, ~20 m across at grade tapering to ~8 m at the pod.' });
  register({ id: 'cnt-wings', name: 'CN Tower buttress wings', kind: 'infrastructure', object: wings,
    confidence: 'inferred', note: 'Three tapered wings 120 deg apart flaring to 30 m radius at grade - the Y-shaped base.' });
  register({ id: 'cnt-main-pod', name: 'CN Tower main pod', kind: 'landmark', object: pod,
    confidence: 'reference', note: 'Seven storeys, 342-351 m: radome skirt, Glass Floor / SkyTerrace, LookOut with outward-leaning glazing, 360 The Restaurant.' });
  register({ id: 'cnt-skypod', name: 'CN Tower SkyPod', kind: 'landmark', object: skyPod,
    confidence: 'reference', note: 'Observation ring at 447 m, ~9 m radius.' });
  register({ id: 'cnt-antenna', name: 'CN Tower antenna mast', kind: 'infrastructure', object: mast,
    confidence: 'reference', note: 'Tapering steel mast in six sections from the pod crown to 553.33 m.' });
  register({ id: 'cnt-warning-lights', name: 'CN Tower aircraft warning lights', kind: 'prop', object: lights,
    confidence: 'inferred', note: 'Tagged userData.nightLight for the time-of-day system.' });

  return group;
}
