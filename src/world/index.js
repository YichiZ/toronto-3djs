/**
 * World assembly.
 *
 * Modules are listed, not hard-wired: each entry names a loader and a label, and
 * a failure in one module is reported and skipped rather than taking the whole
 * city down. Interiors are registered with a trigger volume and stay hidden
 * until the camera is near them, which is what keeps the draw-call budget
 * survivable with four full interiors in the scene.
 */
import * as THREE from 'three';

/** @type {Array<{name:string, load:() => Promise<{build:Function}>}>} */
const MODULES = [
  { name: 'streets', load: () => import('./streets.js') },
  { name: 'railCorridor', load: () => import('./railCorridor.js') },
  { name: 'gardiner', load: () => import('./gardiner.js') },
  { name: 'skywalk', load: () => import('./skywalk.js') },
  { name: 'buildings', load: () => import('./buildings.js') },

  { name: 'unionStation', load: () => import('../landmarks/unionStation.js') },
  { name: 'royalYork', load: () => import('../landmarks/royalYork.js') },
  { name: 'royalBankPlaza', load: () => import('../landmarks/royalBankPlaza.js') },
  { name: 'brookfield', load: () => import('../landmarks/brookfield.js') },
  { name: 'hockeyHallOfFame', load: () => import('../landmarks/hockeyHallOfFame.js') },
  { name: 'meridianHall', load: () => import('../landmarks/meridianHall.js') },
  { name: 'flatiron', load: () => import('../landmarks/flatiron.js') },
  { name: 'scotiabankArena', load: () => import('../landmarks/scotiabankArena.js') },
  { name: 'cibcSquare', load: () => import('../landmarks/cibcSquare.js') },
  { name: 'mapleLeafSquare', load: () => import('../landmarks/mapleLeafSquare.js') },
  { name: 'cnTower', load: () => import('../landmarks/cnTower.js') },
  { name: 'rogersCentre', load: () => import('../landmarks/rogersCentre.js') },
  { name: 'aquarium', load: () => import('../landmarks/aquarium.js') },
  { name: 'roundhouse', load: () => import('../landmarks/roundhouse.js') },
  { name: 'mtcc', load: () => import('../landmarks/mtcc.js') },

  { name: 'forecourt', load: () => import('./forecourt.js') },
  { name: 'streetFurniture', load: () => import('../systems/streetFurniture.js') },
  { name: 'vegetation', load: () => import('../systems/vegetation.js') },
  { name: 'signage', load: () => import('../systems/signage.js') },

  { name: 'greatHall', load: () => import('../interiors/greatHall.js') },
  { name: 'concourses', load: () => import('../interiors/concourses.js') },
  { name: 'galleria', load: () => import('../interiors/galleria.js') },
  { name: 'path', load: () => import('../interiors/path.js') },
  { name: 'hhofInterior', load: () => import('../interiors/hhofInterior.js') },

  { name: 'pedestrians', load: () => import('../systems/pedestrians.js') },
  { name: 'vehicles', load: () => import('../systems/vehicles.js') },
  { name: 'trains', load: () => import('../systems/trains.js') },
];

/** Interiors registered for proximity streaming. */
const interiors = [];

/**
 * Metres from ANY part of an interior at which it streams in, on top of the
 * radius around its centre.
 *
 * The centre rule alone left geometry you were standing in unstreamed: PATH
 * corridors join the cluster nearest their midpoint, so the Union-to-arena
 * corridor belongs to 'path-cluster-south', centred 112 m from its Union end -
 * and there it was neither drawn nor solid (issue #13). Four metres is two
 * checks' travel at a run (7.5 m/s, every 0.25 s), and it keeps the street 4.6 m
 * above that corridor out: measured across all 24 viewpoints the busiest frame
 * stays at 1469 draw calls, one viewpoint rising 1330 -> 1435 for a PATH stair
 * that really is beside it.
 */
const CONTACT = 4;

/**
 * Register an interior volume. The group is hidden until the camera enters the
 * radius, then faded in by simple visibility (no per-material fade: an opaque
 * pop at 40 m behind a wall is invisible, and cross-fading four interiors costs
 * more than it buys).
 */
export function registerInterior({ id, group, centre, radius = 70 }) {
  group.visible = false;
  interiors.push({ id, group, centre, radius });
  return group;
}

export const interiorStates = () => interiors.map((i) => ({ id: i.id, visible: i.group.visible }));

/** An interior's ambient lights, each with the box of the room that holds it. */
const ambientsOf = (group) => {
  const out = [];
  group.traverse((o) => {
    if (o.isAmbientLight) out.push({ light: o, box: new THREE.Box3().setFromObject(o.parent).expandByScalar(0.5) });
  });
  return out;
};

export async function buildWorld(ctx, onProgress = () => {}) {
  const root = new THREE.Group();
  root.name = 'downtown-toronto';
  ctx.scene.add(root);

  const failures = [];
  for (let i = 0; i < MODULES.length; i++) {
    const mod = MODULES[i];
    onProgress(mod.name, i / MODULES.length);
    try {
      const m = await mod.load();
      if (typeof m.build !== 'function') throw new Error(`${mod.name} does not export build()`);
      const obj = await m.build(ctx);
      if (obj) {
        obj.name ||= mod.name;
        root.add(obj);
      }
    } catch (err) {
      console.error(`[world] module "${mod.name}" failed:`, err);
      failures.push({ module: mod.name, error: String(err?.message ?? err) });
    }
    // Yield so the loading UI can paint between modules.
    await new Promise((r) => setTimeout(r, 0));
  }

  /**
   * The interiors' point lights, lifted out of the groups that stream.
   *
   * WHY. three.js keys its shader program cache on the NUMBER OF VISIBLE LIGHTS,
   * so streaming a room in or out changed that number and every material drawn
   * in that frame needed a program it had never compiled: two frozen frames of
   * 283-316 ms per sprint across downtown, 43-44 programs each, the cache keys
   * differing in exactly one field - the point-light count, 9 against 3. Dimming
   * a light to zero is worth 0.25 ms a frame (measured, 5.66 -> 5.91 ms at street
   * level); hiding it is worth a third of a second, once per room, mid-run.
   *
   * attach() keeps each light where it was in world space, and zero intensity
   * lights nothing, so the picture is unchanged either way.
   */
  root.updateMatrixWorld(true);
  const streamedLights = [];
  for (const it of interiors) {
    const found = [];
    it.group.traverse((o) => { if (o.isPointLight) found.push(o); });
    for (const light of found) {
      streamedLights.push({ light, interior: it, intensity: light.intensity });
      root.attach(light);
      // Rooms stream in hidden, so start dark rather than lighting the city for
      // the quarter second before the first streaming tick.
      if (!it.group.visible) light.intensity = 0;
    }
  }

  // Proximity streaming for interiors, checked a few times a second rather than
  // every frame - the camera cannot cross a 70 m radius in 250 ms on foot.
  let accum = 0;
  const tmp = new THREE.Vector3();
  ctx.onFrame.push((dt) => {
    accum += dt;
    if (accum < 0.25) return;
    accum = 0;
    for (const it of interiors) {
      // Groups are static once built; their box is taken on the first check.
      it.box ??= new THREE.Box3().setFromObject(it.group);
      tmp.set(it.centre.x, it.centre.y ?? 0, it.centre.z);
      const near = ctx.camera.position.distanceTo(tmp) < it.radius
        || it.box.distanceToPoint(ctx.camera.position) < CONTACT;
      if (near !== it.group.visible) it.group.visible = near;
    }
    for (const s of streamedLights) {
      s.light.intensity = s.interior.group.visible ? s.intensity : 0;
    }
    lightIndoors(ctx.camera.position);
  });

  /**
   * Interior ambient light is for indoors only (#27). three.js ambient light is
   * global, so an interior's AmbientLight lit the whole city whenever that
   * interior streamed in: the forecourt stood under the Great Hall's and two
   * concourses' ambient at midnight, mean luminance 131 against 10 without it,
   * while the aerial - out of streaming range - was correctly dark. Now every
   * streamed interior's ambient is on only while the camera is inside a room
   * that carries one. Indoors nothing changes: rooms still share each other's.
   *
   * ponytail: one indoors flag off bounding boxes, on the 0.25 s streaming tick,
   * so the light steps at a doorway rather than fading; per-room fades if that
   * step ever reads as a pop.
   */
  function lightIndoors(cam) {
    let indoors = false;
    for (const it of interiors) {
      if (!it.group.visible) continue;
      it.ambients ??= ambientsOf(it.group);
      if (it.ambients.some((a) => a.box.containsPoint(cam))) indoors = true;
    }
    for (const it of interiors) for (const a of it.ambients ?? []) a.light.visible = indoors;
  }

  // Detail streaming must be installed after every module has contributed its
  // geometry, so it sees the whole tagged set in one traversal.
  const { install: installLod } = await import('../systems/lod.js');
  const lod = installLod(ctx, root);

  onProgress('ready', 1);
  root.userData.failures = failures;
  return { root, failures, lod };
}
