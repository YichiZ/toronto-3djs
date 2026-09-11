/**
 * Camera modes: walk, orbit, cinematic.
 *
 * WHY WALKING IS GROUNDED BY RAYCAST rather than by a height function: this
 * city is layered. The PATH runs at -6.5, the concourses at -3.5, the street at
 * 0, the viaduct deck at 6.5, the platforms at 7, the SkyWalk at 9 and the
 * Gardiner deck at 12. A single ground height would be a lie on six of those
 * seven, so the walker fires a ray downward from just above the level it
 * believes it is on and lands on whatever surface is actually there — stairs,
 * forecourt, PATH floor or SkyWalk deck.
 *
 * JUMPING is a short hop (Space, ~0.9 m) for clearing a bollard or a planter.
 * It is deliberately lower than STEP_UP, so it never becomes the way you change
 * floors: Q/E and PageUp/Down still own the vertical layering, which is the
 * subject of this reconstruction. Mid-air the level is frozen rather than re-read
 * each frame - see src/ui/jump.js for why.
 *
 * RUNNING (Shift) is told by a small FOV widening and a head bob keyed to the
 * distance walked - see src/ui/runFeel.js. Without them 7.5 m/s framed exactly
 * like 3.4 m/s, and the run may as well not have been there.
 *
 * A LEVEL CHANGE eases rather than cutting, and while it is in flight it owns
 * camera.y the way a jump does - see src/ui/levelChange.js.
 */
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { isTyping } from './typing.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VIEWPOINTS, getViewpoint } from '../data/references.js';
import { orbitTargetFrom, walkLevelForTarget, ORBIT_PULLBACK } from './modeTransition.js';
import { ballistic, hasLanded, underCeiling, JUMP_SPEED, MAX_FALL, HEAD_CLEARANCE } from './jump.js';
import { probeHeights } from './probes.js';
import { stepAtEdge } from './edge.js';
import { buildCollisionIndex } from './collision.js';
import { LEVEL_ORDER, STREET_LEVEL, nearestLevel, floorAtLevel, substeps, slide } from './walkMath.js';
import { push as vehiclePush, AHEAD, CLEARANCE, PUSH_RATE } from '../systems/vehiclePush.js';
import { TOUCH_LOOK_RATE, browserStorage, loadLookSpeed, saveLookSpeed, clampLookSpeed } from './lookSpeed.js';
import {
  settle, easeTo, runFraction, bobGain, bobHeight,
  RUN_FOV_GAIN, FOV_SETTLE, BOB_SETTLE,
} from './runFeel.js';
import {
  pickLevel, levelTolerances, openHeading, LEVEL_SETTLE, LEVEL_ARRIVED, MAX_LEVEL_TOLERANCE,
} from './levelChange.js';

const EYE = 1.7;
const WALK_SPEED = 3.4;   // m/s, an unhurried commuter
const RUN_SPEED = 7.5;
const ACCEL = 12;          // m/s^2 toward the desired velocity
const STEP_UP = 1.2;       // largest step the walker will climb in one go
const PROBE_ABOVE = 2.4;   // ray origin height above the believed level
const PROBE_BELOW = 9.0;
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

/**
 * How far a surface may sit from a level's nominal height and still count as it.
 * Every real floor in the model lands within 0.2 m of nominal, and the default
 * 1.5 keeps them all while excluding near misses like the SkyWalk's roof crown,
 * which sits 1.6 m under the Gardiner deck's height and is not a floor. The
 * platform level, half a metre over the viaduct deck, needs a tighter one - see
 * levelTolerances().
 */
const LEVEL_TOLERANCE = levelTolerances(LEVEL_ORDER);

const nearestLevelIndex = (y) => nearestLevel(y, LEVEL_ORDER, STREET_LEVEL);


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
  /**
   * Did the current jump leave from a REAL floor, or from a stretch the walker
   * was only held at by ground()'s nominal-level fallback?
   */
  let takeoffOnFloor = false;

  // --- run feel -----------------------------------------------------------
  /** The FOV the camera was built with. The run kick is measured from this. */
  const REST_FOV = camera.fov;
  /** Metres of ground actually covered on foot; the bob's phase is a function of it. */
  let bobDistance = 0;
  /** Eased strength, so take-off and landing fade the bob instead of popping it. */
  let bobStrength = 0;
  /** The offset currently added to camera.position.y, peeled off before ground()/fly() run. */
  let bobY = 0;
  /**
   * Eye height a level change is easing toward, or null when none is running.
   *
   * While it is set, the easing owns camera.y - exactly as gravity owns it mid
   * jump. Letting ground() run alongside would have the two fight for the same
   * number every frame: grounding reads the floor the walker is still standing
   * over and drags it back down, so a descent to the PATH would stall a metre
   * below the pavement.
   */
  let levelChangeTo = null;

  // --- walk rig -----------------------------------------------------------
  const pointer = new PointerLockControls(camera, dom);
  // One look speed for touch drags and the mouse, remembered (#14).
  let lookSpeed = loadLookSpeed(browserStorage());
  pointer.pointerSpeed = lookSpeed;
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
  // A rising hop looks up, so the head stops at a ceiling (see underCeiling).
  const up = new THREE.Raycaster();
  up.camera = camera;
  const UP_VEC = new THREE.Vector3(0, 1, 0);

  // What the walker's rays test: the world's static geometry, gridded, with
  // instanced sets split into local proxies - see src/ui/collision.js. Built
  // once; controls install after buildWorld, so the world is complete here.
  // Moving things are left out, as issue #6 asked: a car or a crowd is not a
  // floor to stand on or a wall to slide along.
  const MOVING = new Set(['pedestrians', 'vehicles', 'trains']);
  const collision = buildCollisionIndex(scene.getObjectByName('downtown-toronto') ?? scene, {
    skip: (o) => MOVING.has(o.name),
  });

  // ...which left traffic driving straight through the walker. Instead of
  // indexing the fleet, ask it each frame for the handful of cars in reach and
  // do a flat 2D test - see src/systems/vehiclePush.js. The system publishes
  // this on its group's userData, the same route main.js reads count() by.
  const nearbyVehicles = scene.getObjectByName('vehicles')?.userData?.nearby;
  /** Search radius round the walker: the push window plus the body. nearby() adds the car's own half length. */
  const PUSH_REACH = AHEAD + CLEARANCE + BODY_RADIUS;
  /** This frame's shove from traffic, summed over cars and capped at PUSH_RATE. */
  const framePush = { x: 0, z: 0 };
  const here = { cx: 0, cz: 0 };
  const addPush = (car) => {
    const p = vehiclePush(car, here, framePushDt);
    framePush.x += p.x;
    framePush.z += p.z;
  };
  let framePushDt = 0;

  /**
   * Traffic does not stop for anyone: any car whose footprint has reached the
   * walker shoves them sideways. Once per frame, not per substep - the cars
   * move ~0.2 m a frame - and only at street level, since every lane is at
   * y = 0 and a car under the viaduct deck or over the PATH is nowhere near.
   * The per-car cap in push() is not a total, so the sum is capped here.
   */
  function trafficPush(dt) {
    framePush.x = 0;
    framePush.z = 0;
    if (!nearbyVehicles || airborne || levelIndex !== STREET_LEVEL) return;
    here.cx = camera.position.x;
    here.cz = camera.position.z;
    framePushDt = dt;
    nearbyVehicles(here.cx, here.cz, PUSH_REACH, addPush);
    const mag = Math.hypot(framePush.x, framePush.z);
    const cap = PUSH_RATE * dt;
    if (mag > cap) {
      framePush.x *= cap / mag;
      framePush.z *= cap / mag;
    }
  }

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
  /**
   * Touch or mouse is decided by the pointer actually used, not by what the
   * hardware could do. Checked once at install, a touchscreen laptop driven by
   * a mouse got the joystick for good and could never capture the pointer
   * (#14). Now the touch controls arrive with the first touch, and a mouse puts
   * them away again.
   */
  let lastPointer = 'mouse';
  const showTouch = () => {
    if (joystickEl) joystickEl.style.display = lastPointer === 'touch' && mode === 'walk' ? '' : 'none';
  };
  function onAnyPointerDown(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'mouse') return;   // pens keep whatever is showing
    lastPointer = e.pointerType;
    if (lastPointer === 'touch') joystickEl ??= installTouch();
    else { touch.moveX = 0; touch.moveY = 0; }   // no drifting on a stick that is gone
    showTouch();
  }
  window.addEventListener('pointerdown', onAnyPointerDown, true);

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
      touch.lookX += (e.clientX - lastX) * TOUCH_LOOK_RATE * lookSpeed;
      touch.lookY += (e.clientY - lastY) * TOUCH_LOOK_RATE * lookSpeed;
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
    return isTyping(t);
  };

  function onKeyDown(e) {
    if (typingInField(e)) return;
    keys.add(e.code);
    // Level keys act on the press only. Under auto-repeat, holding E ran the
    // walker from the PATH to the Gardiner deck in well under a second, which
    // is not a journey through six floors - it is a glitch.
    if (!e.repeat) {
      if (e.code === 'KeyE' || e.code === 'PageUp') changeLevel(1);
      if (e.code === 'KeyQ' || e.code === 'PageDown') changeLevel(-1);
    }
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

  function onCanvasClick(e) {
    // A tap is not a request to capture a pointer; a mouse click is, touchscreen or not.
    if (mode === 'walk' && e.pointerType !== 'touch' && !pointer.isLocked) {
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
    // Every surface down the probe, not only the first - see floorAtLevel().
    const ys = [];
    for (const hit of collision.intersect(down)) if (!ignoreHit(hit)) ys.push(hit.point.y);
    return floorAtLevel(ys, y, LEVEL_TOLERANCE[index]);
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
    // Only while walking, and not mid-hop: the level is what the walker is
    // standing on, and mid-air it is not standing on anything yet. In orbit the
    // rig owns the camera outright, so a level change there moved nothing and
    // now would pop a toast about it.
    if (mode !== 'walk' || airborne) return;
    const { index, outcome } = pickLevel(levelIndex, delta, LEVEL_ORDER.length, hasFloorAt);
    // The HUD says what happened, including when nothing did. Silence was the
    // whole of the old feedback: the chip kept showing the level you were
    // already on and the key read as broken.
    window.dispatchEvent(new CustomEvent('twin:level', {
      detail: { name: LEVEL_ORDER[index].name, outcome, delta },
    }));
    if (index === levelIndex) return;
    levelIndex = index;
    levelChangeTo = LEVEL_ORDER[levelIndex].y + EYE;
    velocity.set(0, 0, 0);
    clearBob();
  }

  /** Headings sampled on arrival, and how far each looks. */
  const FACE_SAMPLES = 16;
  const faceRay = new THREE.Raycaster();
  faceRay.far = 30;
  faceRay.camera = camera;   // sprites throw without it

  /**
   * On arriving at a new level, turn to face somewhere walkable (#72). A level
   * change is a lift or a drop on the spot, so the walker kept facing whatever
   * they faced below - often a wall up here. Looking level, at chest height, in
   * FACE_SAMPLES directions; see openHeading() for which one wins.
   */
  function faceOpen() {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(camera.quaternion);
    const clear = [];
    for (let i = 0; i < FACE_SAMPLES; i++) {
      const yaw = euler.y + (i * 2 * Math.PI) / FACE_SAMPLES;
      tmpDir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      tmpOrigin.copy(camera.position).setY(camera.position.y - 0.5);
      faceRay.set(tmpOrigin, tmpDir);
      const hit = collision.intersect(faceRay).find((h) => !ignoreHit(h));
      clear.push(hit ? hit.distance : faceRay.far);
    }
    const i = openHeading(clear);
    if (i === 0) return;
    euler.y += (i * 2 * Math.PI) / FACE_SAMPLES;
    euler.x = 0;
    euler.z = 0;
    camera.quaternion.setFromEuler(euler);
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
  // An instanced proxy from the collision index is not in the scene graph; its
  // source is, and that is whose visibility streaming and LOD toggle.
  for (let o = hit.object.userData.collisionSource ?? hit.object; o; o = o.parent) {
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
    // jump() runs from a key handler, between frames, when the head bob is
    // still laid on top of the height - so take it off. From held ground the
    // hop lands back at exactly this height, and a running bob is up to 4 cm.
    takeoffFloorY = camera.position.y - bobY - EYE;
    takeoffOnFloor = onFloor;
    levelChangeTo = null;   // gravity takes the height from here
    velocity.y = JUMP_SPEED;
  }

  /**
   * Height of the nearest floor below the walker, or null.
   *
   * Unlike hasFloorAt(), this does not care which level the surface belongs to -
   * a jump can cross levels on the way down, and what you land on is whatever is
   * physically there.
   */
  /** Underside of the first solid thing within `reach` above the eye, or null. */
  function ceilingAbove(reach) {
    up.set(camera.position, UP_VEC);
    up.far = Math.max(0, reach);
    for (const hit of collision.intersect(up)) {
      if (ignoreHit(hit)) continue;
      return hit.point.y;
    }
    return null;
  }

  function floorBelow() {
    fall.set(camera.position, DOWN_VEC);
    for (const hit of collision.intersect(fall)) {
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
    // Rising, the head stops at a ceiling instead of passing through it (#13).
    if (next.vy > 0) {
      const reach = next.y - camera.position.y + HEAD_CLEARANCE;
      Object.assign(next, underCeiling(camera.position.y, next.y, next.vy, ceilingAbove(reach)));
    }
    velocity.y = next.vy;

    // A hop from a stretch the walker was only HELD at - no floor mesh, ground()'s
    // nominal-level fallback - lands back at that height, whatever is modelled
    // further down. Walking there holds you up; hopping must not quietly drop
    // you 9 m to the street instead. This is the same line src/ui/edge.js draws
    // for walking: "stepped off a floor" and "was never on one" are different.
    // From a real floor, land on whatever is physically below; if nothing is
    // modelled below either, the take-off height is the same fallback.
    const floorY = takeoffOnFloor ? (floorBelow() ?? takeoffFloorY) : takeoffFloorY;
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

  /** Floor height under a point on the current level, or null when there is none. */
  function floorUnder(x, z) {
    tmpOrigin.set(x, LEVEL_ORDER[levelIndex].y + PROBE_ABOVE, z);
    down.set(tmpOrigin, DOWN_VEC);
    for (const hit of collision.intersect(down)) {
      if (ignoreHit(hit)) continue;
      // A surface more than a step above the feet is not the floor: it is a
      // ledge, a slab or an overhead the probe started below. This compared
      // against STEP_UP + PROBE_ABOVE, 3.6 m - more than the probe can ever see
      // above the feet - so it rejected nothing, and a walker on Front Street
      // stepped 2 m straight up onto the Bay Concourse's ceiling slab (#13).
      if (hit.point.y + EYE - camera.position.y > STEP_UP) continue;
      // What the floor is, for footsteps.js (#12); an instanced proxy stands in
      // for its source, which is the one in the scene graph.
      floorObject = hit.object.userData.collisionSource ?? hit.object;
      return hit.point.y;
    }
    return null;
  }

  /**
   * Was there a real floor under the walker last time it was grounded?
   *
   * The edge guard needs to tell "stepped off a floor" from "was never on one":
   * see src/ui/edge.js. Read a frame late, which costs nothing - a walker that
   * has just left a floor is still within a body radius of it.
   */
  let onFloor = false;
  /** The mesh the last floor probe landed on, or null. */
  let floorObject = null;

  /** Snap to whatever floor is actually under the walker on the current level. */
  function ground(dt) {
    const believedFloor = LEVEL_ORDER[levelIndex].y;
    const floorY = floorUnder(camera.position.x, camera.position.z);
    onFloor = floorY !== null;
    if (onFloor) {
      camera.position.y += (floorY + EYE - camera.position.y) * settle(GROUND_SETTLE, dt);
      floorUnderfoot = floorY;
      return floorY;
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
    const hits = collision.intersect(forward);
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

  /**
   * Forget the bob offset after something has written camera.position.y wholesale.
   *
   * ground() and fly() own that value, so the bob is an offset laid on top and
   * peeled off again each frame. Anything that ASSIGNS the height instead - a
   * level change, a teleport, a mode switch - has already discarded the offset,
   * and leaving bobY claiming it is still there makes the next frame subtract a
   * few centimetres that are not in the number.
   */
  function clearBob() {
    bobY = 0;
    bobStrength = 0;
  }

  /**
   * Advance the bob and lay it back on top of the height ground()/fly() chose.
   *
   * The strength is eased rather than applied raw so that going airborne - where
   * the bob must be off, because a bobbing jump looks broken - fades the head
   * back instead of dropping it 4 cm in a single frame.
   */
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  function applyBob(dt) {
    const speed = Math.hypot(velocity.x, velocity.z);
    // prefers-reduced-motion: no bob at all (#12). Footsteps still keep time -
    // they count bobDistance, which moves regardless.
    const gain = reduceMotion?.matches ? 0 : bobGain(speed, WALK_SPEED, airborne);
    bobStrength = easeTo(bobStrength, gain, BOB_SETTLE, dt);
    bobY = bobHeight(bobDistance, bobStrength);
    camera.position.y += bobY;
  }

  /**
   * Widen the frame while running, and let it back down when not.
   *
   * Runs in every mode rather than only in walk, so leaving walk mid-sprint does
   * not strand the orbit and cinematic cameras on a wide lens.
   */
  function updateFov(dt) {
    const speed = mode === 'walk' ? Math.hypot(velocity.x, velocity.z) : 0;
    const target = REST_FOV + RUN_FOV_GAIN * runFraction(speed, WALK_SPEED, RUN_SPEED);
    // An exponential ease never quite arrives, so it is snapped once inside a
    // thousandth of a degree. Without that the projection matrix would be
    // rebuilt every frame of a session that is mostly spent standing still.
    if (camera.fov === target) return;
    camera.fov = Math.abs(camera.fov - target) < 1e-3
      ? target
      : easeTo(camera.fov, target, FOV_SETTLE, dt);
    camera.updateProjectionMatrix();
  }

  function updateWalk(dt) {
    // Work in the walker's true eye height: ground() eases toward the floor and
    // fly() integrates the arc, and neither can see a bob baked into the value.
    camera.position.y -= bobY;
    // Substep long frames rather than trusting the caller's dt clamp, bounded by
    // the speed the walker could reach this frame, not the speed it has - see
    // substeps() for the tunnelling that distinction prevents.
    // The shove from traffic is part of this frame's motion, so it counts
    // toward the bound too - otherwise a long frame with a car in reach could
    // step further than the wall probe looks.
    trafficPush(dt);
    const pushSpeed = Math.hypot(framePush.x, framePush.z) / dt;
    const parts = substeps(Math.hypot(velocity.x, velocity.z) + pushSpeed, dt, {
      runSpeed: RUN_SPEED, maxStep: MAX_STEP, airborne, maxAirDt: MAX_AIR_DT,
    });
    for (let i = 0; i < parts; i++) walkStep(dt / parts, framePush.x / parts, framePush.z / parts);
    applyBob(dt);
  }

  function walkStep(dt, pushX, pushZ) {
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

    // Move, and if something is in the way slide along it rather than stopping:
    // two passes, for inside corners - see slide(). It hands back x and z only,
    // so a jump's vertical velocity is never touched.
    //
    // This substep's share of the traffic shove (see trafficPush) is added to
    // the step, not the velocity, so a clip adds no momentum of its own. It is
    // probed and slid with the rest of the step: beside a building the walker
    // goes along the wall; wedged in an inside corner the step is dropped and
    // the car passes through. slide() does still project velocity against
    // whatever the combined step runs into, as it always has.
    const slid = slide({ x: velocity.x * dt + pushX, z: velocity.z * dt + pushZ }, velocity, blockingNormal);
    step.set(slid.step.x, 0, slid.step.z);
    velocity.x = slid.velocity.x;
    velocity.z = slid.velocity.z;
    const blocker = slid.blocker;
    if (step.lengthSq() <= 1e-10) {
      // Horizontal only. Zeroing the whole vector here killed the jump's
      // vertical velocity on every frame the walker was not also moving, so a
      // standing hop rose a centimetre and then hung there, airborne forever.
      velocity.x = 0;
      velocity.z = 0;
    } else if (!blocker) {
      // An edge is a wall you can see over: refuse the part of the step that
      // would leave a real floor for thin air (issue #13). One extra downward
      // ray in the common case; up to three only at an edge.
      // Grounded only. onFloor is written by ground(), which does not run
      // mid-air, so it stays true for the whole of a hop taken from a roof -
      // and the guard stopped the walker dead in the air at the parapet line,
      // an invisible wall. Hopping off a real ledge is a deliberate act.
      const edged = stepAtEdge(step, onFloor && !airborne, BODY_RADIUS,
        (dx, dz) => floorUnder(camera.position.x + dx, camera.position.z + dz) !== null);
      // Drop the velocity that was refused, so the walker does not press into
      // the edge at full speed and shoot off it the moment it turns away.
      if (edged.x === 0) velocity.x = 0;
      if (edged.z === 0) velocity.z = 0;
      camera.position.x += edged.x;
      camera.position.z += edged.z;
      // Ground actually COVERED, not intended: walking face-first into a wall
      // slides to a stop, and the head has to stop bobbing with it rather than
      // marching on the spot. So the EDGED step - the edge guard can refuse
      // part or all of `step`, and refused ground was never covered.
      bobDistance += Math.hypot(edged.x, edged.z);
    }

    // Mid-hop, gravity owns the height and the level is frozen until landing.
    if (airborne) {
      fly(dt);
      return;
    }

    // A level change in flight owns the height until it arrives, and the level
    // it is heading for is the intention - not whatever is under the walker on
    // the way. Arrival is by distance rather than by a timer, so retargeting
    // mid-flight (pressing E twice) just moves the destination.
    if (levelChangeTo !== null) {
      camera.position.y += (levelChangeTo - camera.position.y) * settle(LEVEL_SETTLE, dt);
      if (Math.abs(levelChangeTo - camera.position.y) < LEVEL_ARRIVED) {
        levelChangeTo = null;
        faceOpen();
      }
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
    updateFov(dt);
  }
  ctx.onFrame.push(update);

  /**
   * Where the walk left off when orbit began, and where the pivot was put.
   *
   * Entering orbit pivots ORBIT_PULLBACK ahead along the view, so from the
   * forecourt, facing the portico, the pivot sits some 60 m inside the station.
   * Landing back at an untouched pivot put the walker in a white void against
   * the viaduct (#84). Turning and zooming never move the pivot; only a pan -
   * choosing a new subject - does.
   * @type {{x:number, y:number, z:number, pivot:THREE.Vector3} | null}
   */
  let walkReturn = null;

  function setMode(name) {
    if (!['walk', 'orbit', 'cinematic'].includes(name)) {
      throw new RangeError(`setMode: unknown mode "${name}"`);
    }
    if (name === mode) return mode;
    const previous = mode;
    // Hand the next mode the walker's true eye height, not one with a few
    // centimetres of bob still baked into it.
    if (previous === 'walk') {
      camera.position.y -= bobY;
      clearBob();
    }
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
      walkReturn = previous === 'walk'
        ? { x: camera.position.x, y: camera.position.y, z: camera.position.z, pivot: orbit.target.clone() }
        : null;
    }
    if (name === 'walk') {
      if (previous === 'orbit' && walkReturn && orbit.target.distanceTo(walkReturn.pivot) < 1) {
        // Only turned and zoomed: walk on from where the walk left off.
        camera.position.set(walkReturn.x, walkReturn.y, walkReturn.z);
        levelIndex = nearestLevelIndex(walkReturn.y - EYE);
      } else if (previous === 'orbit') {
        // A new subject was chosen (a pan, or an orbit viewpoint): land at it,
        // not under the orbit camera. Cinematic -> walk is left alone: the tour
        // has just placed the camera somewhere deliberate, and the orbit target
        // is stale.
        levelIndex = walkLevelForTarget(
          orbit.target.y, LEVEL_ORDER.map((l) => l.y), STREET_LEVEL, MAX_LEVEL_TOLERANCE
        );
        camera.position.set(orbit.target.x, LEVEL_ORDER[levelIndex].y + EYE, orbit.target.z);
      }
      if (previous === 'orbit') {
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
      levelChangeTo = null;
    }
    showTouch();
    return mode;
  }

  /** The viewpoint last teleported to: what a shared link names (#31). */
  let lastViewpoint = null;

  function teleport(name) {
    const vp = typeof name === 'string' ? getViewpoint(name) : name;
    if (!vp) {
      console.warn(`[controls] teleport: no viewpoint "${name}"`);
      return null;
    }
    lastViewpoint = vp.id ?? null;
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
      clearBob();
      levelChangeTo = null;
    }
    return vp;
  }

  const position = () => camera.position.clone();

  return {
    get mode() { return mode; },
    get viewpoint() { return lastViewpoint; },
    /** The floor mesh underfoot, and metres walked: what footsteps.js keys on (#12). */
    get floorObject() { return floorObject; },
    get strideDistance() { return bobDistance; },
    get level() { return LEVEL_ORDER[levelIndex].name; },
    get airborne() { return airborne; },
    get lookSpeed() { return lookSpeed; },
    /** Set the look speed for touch and mouse alike, and remember it. */
    setLookSpeed(v) {
      lookSpeed = clampLookSpeed(v);
      pointer.pointerSpeed = lookSpeed;
      saveLookSpeed(browserStorage(), lookSpeed);
      return lookSpeed;
    },
    /** The head-bob offset currently added to the camera height. For qa/modes.e2e.mjs. */
    get bobOffset() { return bobY; },
    get changingLevel() { return levelChangeTo !== null; },
    jump,
    setMode,
    teleport,
    update,
    position,
    viewpoints: VIEWPOINTS,
    orbitControls: orbit,
    pointerLock: pointer,
    // The collision index, so the HUD's aim probe can test occlusion without
    // raycasting the whole scene - see src/ui/aim.js.
    collision,
    setLevelByY: (y) => {
      levelIndex = nearestLevelIndex(y);
      levelChangeTo = null;
      return LEVEL_ORDER[levelIndex].name;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('click', onCanvasClick);
      window.removeEventListener('pointerdown', onAnyPointerDown, true);
      joystickEl?.remove();
      orbit.dispose();
      pointer.disconnect?.();
    },
  };
}
