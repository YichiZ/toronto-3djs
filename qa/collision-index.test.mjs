/**
 * The collision index returns exactly what a brute-force scene raycast did.
 * `npm test`
 *
 * Issue #6 replaced "raycast the whole scene" with a grid over indexed
 * geometry, splitting instanced meshes into per-cell proxies. That is only safe
 * if the walker cannot tell: same surfaces, same points, same distances, same
 * face normals, same order. Checked here on a synthetic city against Three's own
 * intersectObject(root, true); the real scene is checked by comparing walked
 * trajectories before and after.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildCollisionIndex } from '../src/ui/collision.js';

/** Deterministic PRNG, so a failure reproduces. */
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticCity() {
  const rand = mulberry32(6);
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const ground = new THREE.Mesh(new THREE.BoxGeometry(400, 0.2, 400), mat);
  ground.position.y = -0.1;
  root.add(ground);
  // Buildings, some rotated, inside a transformed parent.
  const block = new THREE.Group();
  block.position.set(12, 0, -8);
  block.rotation.y = 0.3;
  root.add(block);
  for (let i = 0; i < 40; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(8 + rand() * 20, 5 + rand() * 40, 8 + rand() * 20), mat);
    b.position.set(rand() * 360 - 180, 10, rand() * 360 - 180);
    b.rotation.y = rand() * Math.PI;
    block.add(b);
  }
  // A city-wide instanced set: posts everywhere, like the street furniture.
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 1, 8), mat, 1500);
  const m = new THREE.Matrix4();
  for (let i = 0; i < posts.count; i++) {
    m.makeRotationY(rand() * Math.PI).setPosition(rand() * 380 - 190, 0.5, rand() * 380 - 190);
    posts.setMatrixAt(i, m);
  }
  root.add(posts);
  // A deck overhead, and stairs - instanced treads in a rotated group.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(300, 0.4, 12), mat);
  deck.position.set(0, 6.5, 30);
  root.add(deck);
  const stair = new THREE.Group();
  stair.position.set(-40, 0, 10);
  stair.rotation.y = -0.7;
  const treads = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 0.3, 0.32), mat, 20);
  for (let i = 0; i < 20; i++) treads.setMatrixAt(i, m.makeTranslation(0, -0.3 * (i + 0.5), 0.32 * i));
  stair.add(treads);
  root.add(stair);
  // Things the index must leave out, and a hidden thing it must keep.
  const crowd = new THREE.Group();
  crowd.name = 'pedestrians';
  crowd.add(new THREE.Mesh(new THREE.BoxGeometry(400, 3, 400), mat));
  root.add(crowd);
  const volume = new THREE.Mesh(new THREE.BoxGeometry(400, 3, 400), mat);
  volume.userData.noCollide = true;
  root.add(volume);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mat);
  hidden.position.set(5, 5, 5);
  hidden.visible = false;               // visibility is checked at hit time, not at build
  root.add(hidden);
  root.updateMatrixWorld(true);
  return { root, rand };
}

const skip = (o) => o.name === 'pedestrians';
const excluded = (hitObject) => {
  for (let o = hitObject; o; o = o.parent) if (o.name === 'pedestrians' || o.userData?.noCollide) return true;
  return false;
};
const sourceOf = (o) => o.userData?.collisionSource ?? o;
const signature = (h) => ({
  object: sourceOf(h.object).uuid,
  distance: +h.distance.toFixed(9),
  point: h.point.toArray().map((v) => +v.toFixed(9)),
  normal: h.face.normal.toArray().map((v) => +v.toFixed(9)),
});

test('every ray the walker fires gets the same hits from the index as from the scene', () => {
  const { root, rand } = syntheticCity();
  const index = buildCollisionIndex(root, { skip });
  const rc = new THREE.Raycaster();
  const dirs = [];
  let checked = 0;
  for (let i = 0; i < 3000; i++) {
    const x = rand() * 380 - 190;
    const z = rand() * 380 - 190;
    const kind = i % 3;
    if (kind === 0) {                                    // ground probe: down, 11.4 m
      rc.set(new THREE.Vector3(x, 2.4 + rand() * 8, z), new THREE.Vector3(0, -1, 0));
      rc.far = 11.4;
    } else if (kind === 1) {                             // forward probe: flat, 0.9 m
      const a = rand() * Math.PI * 2;
      rc.set(new THREE.Vector3(x, 0.2 + rand() * 1.5, z), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      rc.far = 0.9;
    } else {                                             // fall probe: down, 41.7 m
      rc.set(new THREE.Vector3(x, 20 * rand(), z), new THREE.Vector3(0, -1, 0));
      rc.far = 41.7;
    }
    const brute = rc.intersectObject(root, true).filter((h) => !excluded(h.object)).map(signature);
    const fast = index.intersect(rc).map(signature);
    assert.deepEqual(fast, brute, `ray ${i} (${['down', 'forward', 'fall'][kind]}) at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    checked += brute.length;
    dirs.push(kind);
  }
  assert.ok(checked > 1000, `the rays must actually hit things to prove anything (${checked} hits)`);
});

test('instanced meshes are split into local proxies, and excluded subtrees are left out', () => {
  const { root } = syntheticCity();
  const { stats } = buildCollisionIndex(root, { skip });
  assert.ok(stats.proxies > 2, `the city-wide posts should become many proxies, got ${stats.proxies}`);
  assert.equal(stats.instancedSplit, 2, 'posts and treads');
  // ground + 40 buildings + deck + the hidden box; not the crowd, not the volume
  assert.equal(stats.meshes, 43);
});

test('a proxy hit points back at the mesh it came from, for the visibility check', () => {
  const { root } = syntheticCity();
  const index = buildCollisionIndex(root, { skip });
  const rc = new THREE.Raycaster(new THREE.Vector3(-40, 1, 10), new THREE.Vector3(0, -1, 0), 0, 20);
  const hit = index.intersect(rc).find((h) => h.object.userData.collisionSource);
  assert.ok(hit, 'a tread under the stair head');
  assert.ok(hit.object.userData.collisionSource.isInstancedMesh);
  assert.equal(hit.object.userData.collisionSource.parent.parent, root);
});
