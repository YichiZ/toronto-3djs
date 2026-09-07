/**
 * Where the camera lands when the mode changes.
 *
 * Both directions used to jump. Orbit -> walk kept the orbit camera's x/z, so
 * from 300 m out you arrived 300 m from the thing you were studying, on
 * whatever roof happened to be under the orbit altitude. Walk -> orbit put the
 * orbit target 60 m grid-north of the camera, so the view swung to face north
 * no matter where you had been looking.
 *
 * These two helpers are the arithmetic of the fix, kept out of controls.js so
 * they can be tested without a WebGL context or the DOM-only Three addons.
 */

/** How far ahead of the walker the orbit target is planted. */
export const ORBIT_PULLBACK = 60;

/** The orbit target should not sit under the pavement. */
const MIN_TARGET_Y = 0.5;

/**
 * The point the orbit rig should pivot around, given where the camera is and
 * which way it is looking.
 *
 * Placing it straight down the view direction means the switch does not rotate
 * the view: the camera already looks at this point. Two corrections keep
 * OrbitControls from shoving the camera the instant it takes over:
 *
 * - Looking DOWN, the ray is shortened rather than tilted, so the target stops
 *   just above the pavement instead of burying itself. Shortening keeps the
 *   direction, and so keeps the view, exactly.
 * - Looking LEVEL, the target would sit at the camera's own height, which is a
 *   polar angle of exactly 90 degrees - outside `maxPolarAngle`, so orbit's
 *   first update() rotated the camera ~1 m sideways to satisfy the limit. The
 *   target is dropped just far enough to land inside the limit; at 60 m that is
 *   under a degree of tilt, and nothing is nudged. A view angled UP is dropped
 *   the same way: orbit simply cannot pivot around a point above its camera
 *   while `maxPolarAngle` keeps it off its back, so the steepest legal tilt is
 *   the honest answer rather than letting OrbitControls snap it there itself.
 *
 * @param {{x:number,y:number,z:number}} position camera position
 * @param {{x:number,y:number,z:number}} direction unit view direction
 * @param {{distance?:number, minDistance?:number, maxPolarAngle?:number}} [opts]
 * @returns {{x:number,y:number,z:number}}
 */
export function orbitTargetFrom(position, direction, opts = {}) {
  const { distance = ORBIT_PULLBACK, minDistance = 8, maxPolarAngle = Math.PI / 2 } = opts;
  let d = distance;
  if (direction.y < -1e-6) {
    const toFloor = (position.y - MIN_TARGET_Y) / -direction.y;
    d = Math.min(d, Math.max(minDistance, toFloor));
  }
  const y = position.y + direction.y * d;
  // cot, not cos: the drop lengthens the ray, so the angle must be taken
  // against the resulting hypotenuse or it lands a hair outside the limit.
  const minDrop = d / Math.tan(maxPolarAngle);
  return {
    x: position.x + direction.x * d,
    y: Math.min(y, position.y - minDrop),
    z: position.z + direction.z * d,
  };
}

/**
 * Which walkable level the orbit target implies.
 *
 * The old code took the nearest level to the CAMERA's height, which from
 * altitude is always the topmost one - hence landing on the Gardiner deck and
 * then dropping onto a roof. The target is the subject you were looking at, so
 * it is the honest source: adopt its level when it really is on one, and
 * otherwise assume street, because a target hovering at 20 m over downtown is
 * a framing device, not a floor.
 *
 * @param {number} targetY
 * @param {number[]} levelHeights low to high
 * @param {number} streetIndex fallback
 * @param {number} tolerance how close counts as "on that level"
 */
export function walkLevelForTarget(targetY, levelHeights, streetIndex, tolerance) {
  let best = streetIndex;
  let bestD = Infinity;
  for (let i = 0; i < levelHeights.length; i++) {
    const d = Math.abs(levelHeights[i] - targetY);
    if (d < bestD) { bestD = d; best = i; }
  }
  return bestD <= tolerance ? best : streetIndex;
}
