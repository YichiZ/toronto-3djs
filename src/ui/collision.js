/**
 * What the walker's rays test, instead of the whole scene.
 *
 * WHY. Each walking frame fires about four rays, and each one used to test the
 * entire scene. The cost was not the traversal, it was instancing: an
 * InstancedMesh's bounding sphere spans every copy it holds, city-wide, so every
 * ray passed that test and Three then tested each instance in turn - about
 * 19,000 per ray on the forecourt, 7,672 of them rail sleepers nowhere near the
 * walker. Walking cost ~3.8 ms a frame more than standing still (issue #6).
 *
 * WHAT. Built once, from the world root:
 *  - each static InstancedMesh is split into one proxy per grid cell, sharing
 *    its geometry, material and world matrix, so a proxy's bounds are local;
 *  - every mesh and proxy is hashed into a 2D grid of CELL metres;
 *  - a ray tests only what lies in the cells its segment crosses. Every walker
 *    ray is vertical or under a metre long: one cell, occasionally two.
 *
 * WHAT IT DOES NOT CHANGE. Hits come from Three's own raycast on the same
 * geometry in the same world space, sorted the same way - qa/collision-index
 * .test.mjs checks that against a brute-force scene raycast. Visibility stays
 * the caller's to check at hit time, because streaming and LOD toggle it at
 * runtime; a proxy points back at its source through userData.collisionSource.
 *
 * ponytail: built once, when the world is complete (controls install after
 * buildWorld). A module that built geometry lazily later would not be
 * collidable until rebuilt.
 */
import * as THREE from 'three';

/** Grid cell edge, metres. A block face is ~60 m; 16 keeps a cell to a few dozen objects. */
export const CELL = 16;

/**
 * @param {THREE.Object3D} root world geometry to index
 * @param {{cell?: number, skip?: (o: THREE.Object3D) => boolean}} [opts]
 *        skip(o) true drops o and its whole subtree (moving things, overlays)
 */
export function buildCollisionIndex(root, { cell = CELL, skip = () => false } = {}) {
  root.updateMatrixWorld(true);
  const grid = new Map();
  const keyOf = (ix, iz) => `${ix},${iz}`;
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const stats = { meshes: 0, instancedSplit: 0, proxies: 0, cells: 0 };

  const insert = (obj, b) => {
    const x0 = Math.floor(b.min.x / cell);
    const x1 = Math.floor(b.max.x / cell);
    const z0 = Math.floor(b.min.z / cell);
    const z1 = Math.floor(b.max.z / cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = keyOf(ix, iz);
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(obj);
      }
    }
  };

  const splitInstanced = (src) => {
    // Bucket by the cell of each instance's world position, then insert each
    // proxy by its full world box, so an instance straddling a cell edge is
    // still found from the neighbouring cell.
    const buckets = new Map();
    for (let i = 0; i < src.count; i++) {
      src.getMatrixAt(i, m);
      p.setFromMatrixPosition(m).applyMatrix4(src.matrixWorld);
      const k = keyOf(Math.floor(p.x / cell), Math.floor(p.z / cell));
      let ids = buckets.get(k);
      if (!ids) buckets.set(k, (ids = []));
      ids.push(i);
    }
    for (const ids of buckets.values()) {
      const proxy = new THREE.InstancedMesh(src.geometry, src.material, ids.length);
      ids.forEach((id, j) => { src.getMatrixAt(id, m); proxy.setMatrixAt(j, m); });
      proxy.matrixAutoUpdate = false;
      proxy.matrixWorld.copy(src.matrixWorld);
      proxy.userData.collisionSource = src;
      proxy.computeBoundingBox();
      proxy.computeBoundingSphere();
      insert(proxy, box.copy(proxy.boundingBox).applyMatrix4(proxy.matrixWorld));
      stats.proxies++;
    }
    stats.instancedSplit++;
  };

  const visit = (o) => {
    if (skip(o) || o.userData?.noCollide) return;          // the whole subtree
    if (o.isInstancedMesh) {
      if (o.count > 0) splitInstanced(o);
    } else if (o.isMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      insert(o, box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
      stats.meshes++;
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  stats.cells = grid.size;

  const a = new THREE.Vector3();
  const e = new THREE.Vector3();
  const seen = new Set();
  const candidates = [];

  /**
   * Hits along `raycaster`'s ray, nearest first - the same contract as
   * raycaster.intersectObject(scene, true), over indexed geometry only.
   */
  function intersect(raycaster) {
    const { origin, direction } = raycaster.ray;
    const far = Number.isFinite(raycaster.far) ? raycaster.far : 1e4;
    a.copy(origin);
    e.copy(direction).multiplyScalar(far).add(origin);
    const x0 = Math.floor(Math.min(a.x, e.x) / cell);
    const x1 = Math.floor(Math.max(a.x, e.x) / cell);
    const z0 = Math.floor(Math.min(a.z, e.z) / cell);
    const z1 = Math.floor(Math.max(a.z, e.z) / cell);
    if (x0 === x1 && z0 === z1) {
      const list = grid.get(keyOf(x0, z0));
      return list ? raycaster.intersectObjects(list, false) : [];
    }
    seen.clear();
    candidates.length = 0;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = grid.get(keyOf(ix, iz));
        if (!list) continue;
        for (const o of list) {
          if (seen.has(o)) continue;
          seen.add(o);
          candidates.push(o);
        }
      }
    }
    return raycaster.intersectObjects(candidates, false);
  }

  return { intersect, stats };
}
