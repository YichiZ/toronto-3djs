/**
 * The aim rule shared by clicks, the walk-mode hint and the F key - issue #9.
 * `npm test`
 *
 * The occlusion rule had no test before it moved out of hud.js; these pin what
 * it has always meant, on a synthetic storefront.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { aimAt, registryRoot } from '../src/ui/aim.js';

function storefront() {
  const scene = new THREE.Scene();
  const mat = new THREE.MeshBasicMaterial();
  const shop = new THREE.Group();
  shop.userData.registryId = 'shop';
  scene.add(shop);
  // The interaction volume, as registerInteractive leaves it.
  const volume = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  volume.position.set(0, 1.5, 0);
  Object.assign(volume.userData, { interactive: true, noCollide: true, payload: { tenant: 'Test Café' } });
  shop.add(volume);
  // Its own glazing, a few centimetres in front of it - must never occlude it.
  const glazing = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.05), mat);
  glazing.position.set(0, 1.5, 0.35);
  shop.add(glazing);
  // A label sprite nearby: Sprite.raycast dereferences raycaster.camera.
  scene.add(new THREE.Sprite(new THREE.SpriteMaterial()));
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.15, 12000);
  return { scene, volume, camera, mat };
}

function aim({ scene, camera }, from, range = 40) {
  camera.position.set(...from);
  camera.lookAt(0, 1.5, 0);
  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [];
  scene.traverse((o) => { if (o.userData.interactive) targets.push(o); });
  return aimAt(rc, targets, scene, range);
}

test('facing a storefront in clear view aims at it, through its own glazing', () => {
  const s = storefront();
  const hit = aim(s, [0, 1.5, 10]);
  assert.equal(hit?.node, s.volume);
  assert.equal(hit.node.userData.payload.tenant, 'Test Café');
  assert.ok(Math.abs(hit.distance - 9.7) < 0.01, `distance ${hit.distance}`);
});

test("another entity's wall in front hides it", () => {
  const s = storefront();
  const wallOwner = new THREE.Group();
  wallOwner.userData.registryId = 'building-across-the-street';
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 0.5), s.mat);
  wall.position.set(0, 1.5, 5);
  wallOwner.add(wall);
  s.scene.add(wallOwner);
  assert.equal(aim(s, [0, 1.5, 10]), null);
});

test('invisible and non-colliding things in front do not hide it', () => {
  const s = storefront();
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 0.5), s.mat);
  hidden.position.set(0, 1.5, 5);
  hidden.visible = false;
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 0.5), s.mat);
  ghost.position.set(0, 1.5, 6);
  ghost.userData.noCollide = true;
  s.scene.add(hidden, ghost);
  assert.equal(aim(s, [0, 1.5, 10])?.node, s.volume);
});

test('beyond range, or aiming at nothing, is null', () => {
  const s = storefront();
  assert.equal(aim(s, [0, 1.5, 60], 40), null, '60 m off with a 40 m reach');
  const rc = new THREE.Raycaster(new THREE.Vector3(0, 1.5, 10), new THREE.Vector3(0, 0, 1));
  rc.camera = s.camera;
  assert.equal(aimAt(rc, [s.volume], s.scene, 40), null, 'looking away');
  assert.equal(aimAt(rc, [], s.scene, 40), null, 'no targets at all');
});

test('registryRoot finds the entity a mesh belongs to', () => {
  const s = storefront();
  assert.equal(registryRoot(s.volume).userData.registryId, 'shop');
  assert.equal(registryRoot(new THREE.Mesh()), null);
});
