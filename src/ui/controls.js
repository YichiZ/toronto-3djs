/**
 * Camera modes: walk, orbit, cinematic.
 *
 * WHY WALKING IS GROUNDED BY RAYCAST rather than by a height function: this
 * city is layered. The PATH runs at -6.5, the concourses at -3.5, the street at
 * 0, the viaduct deck at 6.5 and the SkyWalk at 9. A single ground height would
 * be a lie on five of those levels, so the walker fires a ray downward from
 * just above the level it believes it is on and lands on whatever surface is
 * actually there — stairs, forecourt, PATH floor or SkyWalk deck.
 *
 * WHY THERE IS NO JUMP: vertical movement is a level change (Q/E, PageUp/Down),
 * because the vertical layering is the subject of this reconstruction.
 */
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LEVELS } from '../data/grid.js';
import { VIEWPOINTS, getViewpoint } from '../data/references.js';

const EYE = 1.7;
const WALK_SPEED = 3.4;   // m/s, an unhurried commuter
const RUN_SPEED = 7.5;
const ACCEL = 12;          // m/s^2 toward the desired velocity
const STEP_UP = 1.2;       // largest step the walker will climb in one go
const PROBE_ABOVE = 2.4;   // ray origin height above the believed level
const PROBE_BELOW = 9.0;
const BODY_RADIUS = 0.55;  // horizontal clearance kept from walls

/** Walkable levels, low to high. Q/E steps through these. */
const LEVEL_ORDER = [
  { name: 'PATH', y: LEVELS.path },
  { name: 'concourse', y: LEVELS.unionConcourse },
  { name: 'street', y: LEVELS.street },
  { name: 'viaduct deck', y: LEVELS.viaductDeck },
  { name: 'SkyWalk', y: LEVELS.skywalk },
  { name: 'Gardiner deck', y: LEVELS.gardinerDeck },
];
const STREET_LEVEL = LEVEL_ORDER.findIndex((l) => l.name === 'street');

const nearestLevelIndex = (y) => {
  let best = STREET_LEVEL;
  let bestD = Infinity;
  for (let i = 0; i < LEVEL_ORDER.length; i++) {
    const d = Math.abs(LEVEL_ORDER[i].y - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
};

const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);

/** @param {import('../core/context.js').Context} ctx */
export function install(ctx) {
  const { camera, scene, renderer } = ctx;
  const dom = renderer.domElement;

  let mode = 'walk';
  let levelIndex = STREET_LEVEL;

  // --- walk rig -----------------------------------------------------------
  const pointer = new PointerLockControls(camera, dom);
  // PointerLockControls binds its own listeners; we only ask for the lock on a
  // deliberate click so the HUD stays clickable.
  const velocity = new THREE.Vector3();
  const keys = new Set();

  const down = new THREE.Raycaster();
  down.far = PROBE_ABOVE + PROBE_BELOW;
  const forward = new THREE.Raycaster();
  forward.far = BODY_RADIUS + 0.35;

  const DOWN_VEC = new THREE.Vector3(0, -1, 0);
  const tmpOrigin = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const wish = new THREE.Vector3();

  // --- orbit rig ----------------------------------------------------------
  const orbit = new OrbitControls(camera, dom);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.maxPolarAngle = Math.PI * 0.495; // never under the pavement
  orbit.minDistance = 8;
  orbit.maxDistance = 2400;
  orbit.target.set(-128, 20, 46);
  orbit.enabled = false;

  // --- touch --------------------------------------------------------------
  const touch = { active: false, moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
  let joystickEl = null;
  if (isTouchDevice()) joystickEl = installTouch();

  function installTouch() {
    const root = document.createElement('div');
    root.className = 'touch-controls';
    root.innerHTML = '<div class="stick"><i></i></div><div class="look-pad"></div>';
    document.body.appendChild(root);
    const stick = root.querySelector('.stick');
    const knob = root.querySelector('.stick i');
    const pad = root.querySelector('.look-pad');

    let stickId = null;
    const centre = { x: 0, y: 0 };
    const RADIUS = 52;

    stick.addEventListener('pointerdown', (e) => {
      stickId = e.pointerId;
      const r = stick.getBoundingClientRect();
      centre.x = r.left + r.width / 2;
      centre.y = r.top + r.height / 2;
      stick.setPointerCapture(e.pointerId);
      touch.active = true;
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      const dx = Math.max(-RADIUS, Math.min(RADIUS, e.clientX - centre.x));
      const dy = Math.max(-RADIUS, Math.min(RADIUS, e.clientY - centre.y));
      touch.moveX = dx / RADIUS;
      touch.moveY = -dy / RADIUS;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const release = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      touch.moveX = 0; touch.moveY = 0;
      knob.style.transform = 'translate(0,0)';
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    let lookId = null;
    let lastX = 0;
    let lastY = 0;
    pad.addEventListener('pointerdown', (e) => {
      lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
      pad.setPointerCapture(e.pointerId);
      touch.active = true;
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      touch.lookX += (e.clientX - lastX) * 0.0035;
      touch.lookY += (e.clientY - lastY) * 0.0035;
      lastX = e.clientX; lastY = e.clientY;
    });
    const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; };
    pad.addEventListener('pointerup', lookEnd);
    pad.addEventListener('pointercancel', lookEnd);
    return root;
  }

  // --- keyboard -----------------------------------------------------------
  const typingInField = (e) => {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
  };

  function onKeyDown(e) {
    if (typingInField(e)) return;
    keys.add(e.code);
    if (e.code === 'KeyE' || e.code === 'PageUp') changeLevel(1);
    if (e.code === 'KeyQ' || e.code === 'PageDown') changeLevel(-1);
    // Space is deliberately not a jump; swallow it so the page does not scroll.
    if (e.code === 'Space') e.preventDefault();
  }
  const onKeyUp = (e) => keys.delete(e.code);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function onCanvasClick() {
    if (mode === 'walk' && !isTouchDevice() && !pointer.isLocked) {
      try { pointer.lock(); } catch { /* lock can be refused; walking still works via touch/keys */ }
    }
  }
  dom.addEventListener('click', onCanvasClick);

  function changeLevel(delta) {
    const next = Math.max(0, Math.min(LEVEL_ORDER.length - 1, levelIndex + delta));
    if (next === levelIndex) return;
    levelIndex = next;
    camera.position.y = LEVEL_ORDER[levelIndex].y + EYE;
    velocity.set(0, 0, 0);
  }

/**
 * A hit the walker must ignore.
 *
 * Three's raycaster does NOT skip invisible objects, so hidden overlays - the
 * reference-mode section planes, a streamed-out interior, an LOD group switched
 * off - would otherwise be solid ground you cannot see. Visibility and the
 * `noCollide` flag are both inherited, so this walks the ancestry rather than
 * testing the leaf alone.
 */
function ignoreHit(hit) {
  if (!hit.face) return true;              // lines, sprites, helpers
  for (let o = hit.object; o; o = o.parent) {
    if (o.visible === false || o.userData?.noCollide) return true;
  }
  return false;
}

  /** Snap to whatever floor is actually under the walker on the current level. */
  function ground() {
    const believedFloor = LEVEL_ORDER[levelIndex].y;
    tmpOrigin.set(camera.position.x, believedFloor + PROBE_ABOVE, camera.position.z);
    down.set(tmpOrigin, DOWN_VEC);
    // ponytail: brute-force scene raycast, one ray a frame. Swap for a
    // dedicated collision layer if the draw list grows past a few thousand.
    const hits = down.intersectObject(scene, true);
    for (const hit of hits) {
      if (ignoreHit(hit)) continue;
      const targetY = hit.point.y + EYE;
      if (targetY - camera.position.y > STEP_UP + PROBE_ABOVE) continue;
      camera.position.y += (targetY - camera.position.y) * 0.35;
      return hit.point.y;
    }
    // Nothing underfoot (a gap, or the module that builds this floor failed):
    // hold the nominal level rather than falling through the world.
    camera.position.y += (believedFloor + EYE - camera.position.y) * 0.15;
    return believedFloor;
  }

  /** Cheap wall test: one ray along the intended movement direction. */
  function blocked(dirX, dirZ) {
    tmpDir.set(dirX, 0, dirZ);
    if (tmpDir.lengthSq() < 1e-6) return false;
    tmpDir.normalize();
    tmpOrigin.copy(camera.position).setY(camera.position.y - 0.6);
    forward.set(tmpOrigin, tmpDir);
    const hits = forward.intersectObject(scene, true);
    for (const hit of hits) {
      if (ignoreHit(hit)) continue;
      if (hit.distance < BODY_RADIUS) return true;
      return false;
    }
    return false;
  }

  function updateWalk(dt) {
    if (touch.lookX || touch.lookY) {
      // PointerLockControls exposes the same yaw/pitch path used by the mouse.
      const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(camera.quaternion);
      euler.y -= touch.lookX;
      euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, euler.x - touch.lookY));
      camera.quaternion.setFromEuler(euler);
      touch.lookX = 0; touch.lookY = 0;
    }

    let ax = 0;
    let az = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) az += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) az -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1;
    ax += touch.moveX;
    az += touch.moveY;

    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;

    camera.getWorldDirection(tmpDir);
    tmpDir.y = 0;
    if (tmpDir.lengthSq() < 1e-8) tmpDir.set(0, 0, -1);
    tmpDir.normalize();
    tmpRight.set(tmpDir.z, 0, -tmpDir.x); // note: right-hand of a -Z forward

    wish.set(0, 0, 0)
      .addScaledVector(tmpDir, az)
      .addScaledVector(tmpRight, -ax);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);

    velocity.x += (wish.x - velocity.x) * Math.min(1, ACCEL * dt);
    velocity.z += (wish.z - velocity.z) * Math.min(1, ACCEL * dt);

    const dx = velocity.x * dt;
    const dz = velocity.z * dt;
    // Axis-separated so sliding along a wall still works.
    if (Math.abs(dx) > 1e-5 && !blocked(Math.sign(dx), 0)) camera.position.x += dx;
    else velocity.x = 0;
    if (Math.abs(dz) > 1e-5 && !blocked(0, Math.sign(dz))) camera.position.z += dz;
    else velocity.z = 0;

    ground();
  }

  function update(dt) {
    if (mode === 'walk') updateWalk(dt);
    else if (mode === 'orbit') orbit.update();
    // cinematic: tour.js owns the camera this frame.
  }
  ctx.onFrame.push(update);

  function setMode(name) {
    if (!['walk', 'orbit', 'cinematic'].includes(name)) {
      throw new RangeError(`setMode: unknown mode "${name}"`);
    }
    if (name === mode) return mode;
    mode = name;
    orbit.enabled = name === 'orbit';
    if (name !== 'walk' && pointer.isLocked) pointer.unlock();
    if (name === 'orbit') orbit.target.set(
      camera.position.x + 0, Math.max(camera.position.y - 10, 4), camera.position.z - 60
    );
    if (name === 'walk') {
      levelIndex = nearestLevelIndex(camera.position.y - EYE);
      velocity.set(0, 0, 0);
    }
    if (joystickEl) joystickEl.style.display = name === 'walk' ? '' : 'none';
    return mode;
  }

  function teleport(name) {
    const vp = typeof name === 'string' ? getViewpoint(name) : name;
    if (!vp) {
      console.warn(`[controls] teleport: no viewpoint "${name}"`);
      return null;
    }
    camera.position.set(vp.position.x, vp.position.y, vp.position.z);
    if (vp.mode === 'orbit') {
      setMode('orbit');
      orbit.target.set(vp.lookAt.x, vp.lookAt.y, vp.lookAt.z);
      orbit.update();
    } else {
      setMode('walk');
      levelIndex = nearestLevelIndex(vp.position.y - EYE);
      camera.lookAt(vp.lookAt.x, vp.lookAt.y, vp.lookAt.z);
      velocity.set(0, 0, 0);
    }
    return vp;
  }

  const position = () => camera.position.clone();

  return {
    get mode() { return mode; },
    get level() { return LEVEL_ORDER[levelIndex].name; },
    setMode,
    teleport,
    update,
    position,
    viewpoints: VIEWPOINTS,
    orbitControls: orbit,
    pointerLock: pointer,
    setLevelByY: (y) => { levelIndex = nearestLevelIndex(y); return LEVEL_ORDER[levelIndex].name; },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('click', onCanvasClick);
      joystickEl?.remove();
      orbit.dispose();
      pointer.disconnect?.();
    },
  };
}
