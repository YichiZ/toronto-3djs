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
 * JUMPING is a short hop (Space, ~0.9 m) for clearing a bollard or a planter.
 * It is deliberately lower than STEP_UP, so it never becomes the way you change
 * floors: Q/E and PageUp/Down still own the vertical layering, which is the
 * subject of this reconstruction. Mid-air the level is frozen rather than re-read
 * each frame - see src/ui/jump.js for why.
 */
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LEVELS } from '../data/grid.js';
import { VIEWPOINTS, getViewpoint } from '../data/references.js';
import { orbitTargetFrom, walkLevelForTarget, ORBIT_PULLBACK } from './modeTransition.js';
import { ballistic, hasLanded, JUMP_SPEED, MAX_FALL } from './jump.js';
import { probeHeights } from './probes.js';

const EYE = 1.7;
const WALK_SPEED = 3.4;   // m/s, an unhurried commuter
const RUN_SPEED = 7.5;
const ACCEL = 12;          // m/s^2 toward the desired velocity
const STEP_UP = 1.2;       // largest step the walker will climb in one go
const PROBE_ABOVE = 2.4;   // ray origin height above the believed level
const PROBE_BELOW = 9.0;
/**
 * How far a surface may sit from a level's nominal height and still count as it.
 * Every real floor in the model lands within 0.2 m of nominal; 1.5 keeps them all
 * and excludes near misses like the SkyWalk's roof crown, which sits 1.6 m under
 * the Gardiner deck's height and is not a floor.
 */
const LEVEL_TOLERANCE = 1.5;
const BODY_RADIUS = 0.55;  // horizontal clearance kept from walls

/**
 * Exponential settle rates, per second rather than per frame.
 *
 * A fixed per-frame factor made the walk feel different at 30 fps and 144 fps -
 * the camera visibly lagged the forecourt stairs on a slow machine and was glued
 * to them on a fast one. These are time constants; `settle` converts one into
 * the fraction to move this frame.
 */
const GROUND_SETTLE = 12;    // 1/s, lands on a real floor in ~120 ms
const FALLBACK_SETTLE = 4;   // 1/s, softer hold when nothing is underfoot
const settle = (rate, dt) => 1 - Math.exp(-rate * Math.max(dt, 0));

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
  /** Mid-jump: gravity owns camera.y, and the level is frozen until landing. */
  let airborne = false;
  /** Floor height the current jump left from, for the give-up guard. */
  let takeoffFloorY = 0;

  // --- walk rig -----------------------------------------------------------
  const pointer = new PointerLockControls(camera, dom);
  // PointerLockControls binds its own listeners; we only ask for the lock on a
  // deliberate click so the HUD stays clickable.
  const velocity = new THREE.Vector3();
  const keys = new Set();

  // THREE.Sprite.raycast dereferences `raycaster.camera` unconditionally, and a
  // Raycaster built by hand has it as null - so a single sprite anywhere in the
  // scene (reference mode's labels are added at install, before the first frame)
  // makes every walker ray throw. The frame loop swallows the exception per
  // callback, so the only symptom was that walking silently did nothing.
  const down = new THREE.Raycaster();
  down.far = PROBE_ABOVE + PROBE_BELOW;
  down.camera = camera;
  const forward = new THREE.Raycaster();
  forward.far = BODY_RADIUS + 0.35;
  forward.camera = camera;
  // The jump arc needs to see much further down than the grounded probe: you can
  // hop off the SkyWalk and the street is 9 m below.
  const fall = new THREE.Raycaster();
  fall.far = EYE + MAX_FALL;
  fall.camera = camera;

  // Last surface ground() actually found. The low collision ray is hung off
  // this rather than off the eye, because the camera eases toward the floor and
  // lags it by up to 0.6 m on a run up the forecourt stairs - see probes.js.
  // It is one substep stale when blockingNormal reads it, which is at most a
  // few centimetres of travel and never a step's worth of height.
  let floorUnderfoot = LEVEL_ORDER[STREET_LEVEL].y;

  const DOWN_VEC = new THREE.Vector3(0, -1, 0);
  const hitNormal = new THREE.Vector3();
  const step = new THREE.Vector3();
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
    // Swallow Space so the page does not scroll, and hop on the press rather
    // than on the auto-repeat - holding the key must not pogo.
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) jump();
    }
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

  /**
   * Is there a walkable floor at this level, here?
   *
   * Probes downward from just above the level and accepts a surface within a
   * storey of it. Used to skip levels that do not exist at the walker's position.
   */
  function hasFloorAt(index) {
    const y = LEVEL_ORDER[index].y;
    tmpOrigin.set(camera.position.x, y + PROBE_ABOVE, camera.position.z);
    down.set(tmpOrigin, DOWN_VEC);
    // Scan for a surface near the level rather than judging the first hit.
    // Judging only the first, anything standing on the pavement shadowed it: a
    // planter top at 1.51 m or a passing vehicle roof at 1.58 m is outside the
    // tolerance, so street level read as floorless and Q/E skipped it - and
    // because traffic moves, the same key gave different answers second to
    // second.
    for (const hit of down.intersectObject(scene, true)) {
      if (ignoreHit(hit)) continue;
      if (Math.abs(hit.point.y - y) <= LEVEL_TOLERANCE) return true;
      if (hit.point.y < y - LEVEL_TOLERANCE) return false;   // sorted: past the level
    }
    return false;
  }

  /**
   * Step to the next level in `delta` that actually has a floor here.
   *
   * The naive one-step version stranded the walker: descend to the PATH from
   * Front Street, press E, and the intended concourse does not exist at that
   * spot, so grounding pulled you straight back down to the PATH - there was no
   * way out below grade except by finding a modelled stair. Skipping empty
   * levels makes Q/E mean "next surface up/down", which is what the layering is
   * for. If nothing in that direction has a floor, fall back to the immediate
   * neighbour so the key is never simply dead.
   */
  function changeLevel(delta) {
    // Not mid-hop: the level is what the walker is standing on, and mid-air it
    // is not standing on anything yet.
    if (airborne) return;
    let next = -1;
    for (let i = levelIndex + delta; i >= 0 && i < LEVEL_ORDER.length; i += delta) {
      if (hasFloorAt(i)) { next = i; break; }
    }
    if (next === -1) next = Math.max(0, Math.min(LEVEL_ORDER.length - 1, levelIndex + delta));
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

  /**
   * Start a hop, if the walker is on the ground and actually walking.
   *
   * There is no double jump and no jump queueing: a second press mid-air is
   * ignored rather than buffered, because a hop this short buffers into a pogo.
   */
  function jump() {
    if (mode !== 'walk' || airborne) return;
    airborne = true;
    takeoffFloorY = camera.position.y - EYE;
    velocity.y = JUMP_SPEED;
  }

  /**
   * Height of the nearest floor below the walker, or null.
   *
   * Unlike hasFloorAt(), this does not care which level the surface belongs to -
   * a jump can cross levels on the way down, and what you land on is whatever is
   * physically there.
   */
  function floorBelow() {
    fall.set(camera.position, DOWN_VEC);
    for (const hit of fall.intersectObject(scene, true)) {
      if (ignoreHit(hit)) continue;
      return hit.point.y;
    }
    return null;
  }

  /**
   * Advance the jump arc by one step, and land if this step crossed a floor.
   *
   * Landing is tested as a CROSSING of the step rather than as proximity, so a
   * fast descent cannot tunnel through a floor between two frames the way a
   * distance check would.
   */
  function fly(dt) {
    const feetY = camera.position.y - EYE;
    const next = ballistic(camera.position.y, velocity.y, dt);
    velocity.y = next.vy;

    // No floor found means this spot has none modelled - the walker was being
    // held at the nominal level by ground()'s fallback before it jumped. Land it
    // back on that same nominal floor, so a hop over a gap behaves exactly like
    // a hop anywhere else instead of dropping 40 m and snapping back.
    const floorY = floorBelow() ?? takeoffFloorY;
    if (hasLanded(feetY, next.y - EYE, floorY, velocity.y)) {
      camera.position.y = floorY + EYE;
      velocity.y = 0;
      airborne = false;
      // Read the level ONCE, from the floor actually landed on. Hopping off the
      // viaduct deck onto Front Street really is a level change.
      levelIndex = nearestLevelIndex(floorY);
      // The knee ray reads this before ground() next runs; a hop off a ledge
      // must not leave it hung off the floor that was left behind.
      floorUnderfoot = floorY;
      return;
    }

    // Nothing modelled underneath - the same guard grounded walking uses, rather
    // than letting the walker fall out of the world.
    if (next.y - EYE < takeoffFloorY - MAX_FALL) {
      camera.position.y = LEVEL_ORDER[levelIndex].y + EYE;
      velocity.y = 0;
      airborne = false;
      return;
    }
    camera.position.y = next.y;
  }

  /** Snap to whatever floor is actually under the walker on the current level. */
  function ground(dt) {
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
      camera.position.y += (targetY - camera.position.y) * settle(GROUND_SETTLE, dt);
      floorUnderfoot = hit.point.y;
      return hit.point.y;
    }
    // Nothing underfoot (a gap, or the module that builds this floor failed):
    // hold the nominal level rather than falling through the world.
    camera.position.y += (believedFloor + EYE - camera.position.y) * settle(FALLBACK_SETTLE, dt);
    floorUnderfoot = believedFloor;
    return believedFloor;
  }

  /**
   * First blocking surface along a movement direction, or null.
   *
   * Returns the world-space normal so the caller can slide along it. Testing
   * each world axis separately instead only looks like sliding: walk straight
   * into a bollard with no lateral input and both the blocked axis and the
   * (zero) free axis stop, and the walker is stuck against a 20 cm post forever.
   * Downtown is full of posts.
   *
   * TWO rays, chest and knee - see probes.js for the heights and why. A single
   * chest-high ray sailed over every post, bench and planter in the model. The
   * low one is only cast when the high one is clear, so an obstructed step
   * still costs one ray and a clear one costs two.
   *
   * @returns {THREE.Vector3|null} unit normal of the blocking face
   */
  function blockingNormal(dirX, dirZ) {
    tmpDir.set(dirX, 0, dirZ);
    if (tmpDir.lengthSq() < 1e-6) return null;
    tmpDir.normalize();
    // Mid-hop, the floor that matters is under the feet, not the one left at
    // take-off: ground() does not run while airborne, so floorUnderfoot keeps
    // the take-off reading and the knee ray stayed pinned 0.75 m over the
    // pavement. Measured against three bollards: the walker froze dead in
    // mid-air on the post (0.00 m/s, every run) until the arc rose far enough
    // for probeHeights to drop the knee ray as stale, then carried on over. Hung
    // off the feet, it never falls below ~0.6 m/s.
    const floorForProbe = airborne ? camera.position.y - EYE : floorUnderfoot;
    const { high, low } = probeHeights(camera.position.y, floorForProbe);
    return castBlocker(high) ?? (low === null ? null : castBlocker(low));
  }

  /** One forward ray at `originY`; the world normal of what it hits, or null. */
  function castBlocker(originY) {
    tmpOrigin.copy(camera.position).setY(originY);
    forward.set(tmpOrigin, tmpDir);
    const hits = forward.intersectObject(scene, true);
    for (const hit of hits) {
      if (ignoreHit(hit)) continue;
      if (hit.distance >= BODY_RADIUS) return null;
      // Face normals are in object space; take them to world space, flatten to
      // the ground plane, and point them back at the walker.
      hitNormal.copy(hit.face.normal)
        .transformDirection(hit.object.matrixWorld)
        .setY(0);
      // A floor or a stair tread is not a wall - skip it and keep looking, rather
      // than reporting clear air and letting it hide the riser right behind it.
      if (hitNormal.lengthSq() < 1e-6) continue;
      hitNormal.normalize();
      if (hitNormal.dot(tmpDir) > 0) hitNormal.negate();
      return hitNormal;
    }
    return null;
  }

  /**
   * Largest distance the walker may move in one collision test.
   *
   * The forward ray only reaches BODY_RADIUS + 0.35, so a step longer than that
   * can jump clean through a wall before anything is tested. context.js clamps
   * dt to 0.1 s, which keeps a run step under the limit today - but collision
   * correctness should not depend on a constant in another module, so long
   * frames are substepped instead.
   */
  const MAX_STEP = BODY_RADIUS * 0.8;

  /**
   * Longest step the jump arc is integrated over.
   *
   * Semi-implicit Euler is stable at any step, but the walker only ever EXISTS
   * at the sampled positions - so a coarse step means the arc's real peak is
   * lower than its nominal one. At 30 fps a 0.9 m hop topped out at 0.81 m,
   * which clears a bollard on a fast machine and clips it on a slow one. Four
   * substeps at 30 fps bring that inside a centimetre.
   */
  const MAX_AIR_DT = 1 / 120;

  function updateWalk(dt) {
    // Substep long frames rather than trusting the caller's dt clamp.
    //
    // The bound is the speed the walker could REACH this frame, not the speed it
    // currently has: acceleration saturates (`min(1, ACCEL * dt)`) for any dt at
    // or above 1/12 s, so a walker starting from a dead stop jumps to full speed
    // within the same frame. Reading the stale velocity here said "span 0, no
    // substep needed" and then took a 1.7 m step at dt 0.5 s - exactly the
    // tunnelling this guard exists to prevent.
    const attainable = Math.max(Math.hypot(velocity.x, velocity.z), RUN_SPEED);
    const span = attainable * dt;
    const parts = Math.min(16, Math.max(
      span > MAX_STEP ? Math.ceil(span / MAX_STEP) : 1,
      airborne ? Math.ceil(dt / MAX_AIR_DT) : 1,
    ));
    if (parts > 1) {
      for (let i = 0; i < parts; i++) walkStep(dt / parts);
      return;
    }
    walkStep(dt);
  }

  function walkStep(dt) {
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

    // Move, and if something is in the way slide along it rather than stopping.
    // Two passes: the first slide can put the walker into a second surface (an
    // inside corner), and the second resolves it. A third would buy nothing -
    // if two surfaces still block, the walker is genuinely wedged.
    // The blocking test is carried between passes instead of being repeated at
    // the end. Walking is the hot path - each call raycasts the whole scene, and
    // re-testing cost about a third of the frame on the forecourt - so the
    // unobstructed case, which is nearly every frame, now costs one ray.
    step.set(velocity.x * dt, 0, velocity.z * dt);
    let blocker = step.lengthSq() > 1e-10 ? blockingNormal(step.x, step.z) : null;
    for (let pass = 0; pass < 2 && blocker; pass++) {
      // Project the step onto the surface plane, and drop the velocity the same
      // way so the walker does not build up speed into a wall.
      step.addScaledVector(blocker, -step.dot(blocker));
      velocity.addScaledVector(blocker, -velocity.dot(blocker));
      blocker = step.lengthSq() > 1e-10 ? blockingNormal(step.x, step.z) : null;
    }
    if (step.lengthSq() <= 1e-10) {
      // Horizontal only. Zeroing the whole vector here killed the jump's
      // vertical velocity on every frame the walker was not also moving, so a
      // standing hop rose a centimetre and then hung there, airborne forever.
      velocity.x = 0;
      velocity.z = 0;
    } else if (!blocker) {
      camera.position.x += step.x;
      camera.position.z += step.z;
    }

    // Mid-hop, gravity owns the height and the level is frozen until landing.
    if (airborne) {
      fly(dt);
      return;
    }

    // Adopt the level of the floor actually underfoot. Q/E set an INTENTION;
    // ground() decides what is really there. Without this the two disagree - press
    // E on Front Street, where no viaduct deck or SkyWalk exists overhead, and the
    // walker correctly settles back onto the pavement while the HUD keeps
    // announcing "SkyWalk".
    const floorY = ground(dt);
    if (Number.isFinite(floorY)) {
      const actual = nearestLevelIndex(floorY);
      if (actual !== levelIndex) levelIndex = actual;
    }
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
    const previous = mode;
    mode = name;
    orbit.enabled = name === 'orbit';
    if (name !== 'walk' && pointer.isLocked) pointer.unlock();
    if (name === 'orbit') {
      // Pivot around what the camera is already looking at, so the switch
      // changes the controls and nothing else.
      camera.getWorldDirection(tmpDir);
      const t = orbitTargetFrom(camera.position, tmpDir, {
        distance: ORBIT_PULLBACK,
        minDistance: orbit.minDistance,
        maxPolarAngle: orbit.maxPolarAngle,
      });
      orbit.target.set(t.x, t.y, t.z);
    }
    if (name === 'walk') {
      if (previous === 'orbit') {
        // Land at the subject, not under the orbit camera. Cinematic -> walk is
        // left alone: the tour has just placed the camera somewhere deliberate,
        // and the orbit target is stale.
        levelIndex = walkLevelForTarget(
          orbit.target.y, LEVEL_ORDER.map((l) => l.y), STREET_LEVEL, LEVEL_TOLERANCE
        );
        camera.position.set(orbit.target.x, LEVEL_ORDER[levelIndex].y + EYE, orbit.target.z);
        // Keep the yaw, drop the pitch: arriving at eye height staring at the
        // pavement only to have the first mouse move snap the view level was
        // half the jump.
        const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(camera.quaternion);
        euler.x = 0;
        euler.z = 0;
        camera.quaternion.setFromEuler(euler);
      } else {
        levelIndex = nearestLevelIndex(camera.position.y - EYE);
      }
      velocity.set(0, 0, 0);
      airborne = false;
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
    // The mode switch is made FIRST and the position second: setMode now moves
    // the camera itself on an orbit -> walk switch, which would otherwise
    // overwrite the viewpoint we were asked to teleport to.
    if (vp.mode === 'orbit') {
      setMode('orbit');
      camera.position.set(vp.position.x, vp.position.y, vp.position.z);
      orbit.target.set(vp.lookAt.x, vp.lookAt.y, vp.lookAt.z);
      orbit.update();
    } else {
      setMode('walk');
      camera.position.set(vp.position.x, vp.position.y, vp.position.z);
      levelIndex = nearestLevelIndex(vp.position.y - EYE);
      camera.lookAt(vp.lookAt.x, vp.lookAt.y, vp.lookAt.z);
      velocity.set(0, 0, 0);
      airborne = false;
    }
    return vp;
  }

  const position = () => camera.position.clone();

  return {
    get mode() { return mode; },
    get level() { return LEVEL_ORDER[levelIndex].name; },
    get airborne() { return airborne; },
    jump,
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
