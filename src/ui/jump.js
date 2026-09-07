/**
 * The walker's vertical motion while airborne.
 *
 * Kept out of controls.js so the arithmetic can be tested without WebGL or the
 * DOM-only Three addons, the same arrangement as modeTransition.js.
 *
 * WHY THE LEVEL IS NOT READ MID-AIR: on the ground, `levelIndex` is adopted
 * every frame from whatever floor the ray finds, which is what keeps the HUD
 * honest when you walk down the forecourt stairs. Mid-jump that same rule would
 * reassign your level to whatever happens to pass under the arc - a canopy, a
 * bus roof, the SkyWalk soffit. So the level is frozen at take-off and re-read
 * once, on landing, from the floor actually landed on.
 */

/**
 * Metres per second squared. Not 9.81: real gravity makes a 0.9 m hop hang for
 * most of a second, which reads as low-gravity floating in first person. Games
 * have used roughly double for decades for exactly this reason, and the arc
 * here lasts ~0.63 s, which feels like a person and not like the Moon.
 */
export const GRAVITY = 18;

/**
 * Apex of a standing jump, in metres.
 *
 * Deliberately below STEP_UP (1.2 m): steps, curbs and stair treads are already
 * walked up, so the jump is for clearing a bollard or a planter, not for
 * reaching ledges the level system owns.
 */
export const JUMP_HEIGHT = 0.9;

/** Take-off speed that reaches exactly JUMP_HEIGHT under GRAVITY. */
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);

/**
 * How far below take-off the walker may fall before the arc is abandoned.
 *
 * A spot with no floor modelled is handled before this: controls.js lands the
 * walker back on the height it took off from, matching the fallback that
 * grounded walking already uses. This is the last resort behind that - a floor
 * that exists but sits further down than any drop in this city - and past it
 * the arc is abandoned rather than falling out of the world.
 */
export const MAX_FALL = 40;

/**
 * One step of ballistic motion.
 *
 * Semi-implicit Euler: the new velocity is applied over this step, which is
 * stable at any frame rate we substep to and does not let the apex drift with
 * the frame time the way plain Euler does.
 *
 * @param {number} y
 * @param {number} vy
 * @param {number} dt seconds
 * @returns {{y:number, vy:number}}
 */
export function ballistic(y, vy, dt) {
  const nextVy = vy - GRAVITY * dt;
  return { y: y + nextVy * dt, vy: nextVy };
}

/**
 * Has this step put the walker's feet at or through a floor?
 *
 * Only while descending: rising through a floor is how you clear a low ledge,
 * and treating that as a landing would glue the walker to the underside of
 * every canopy it jumps beneath.
 *
 * @param {number} feetY feet before the step
 * @param {number} nextFeetY feet after the step
 * @param {number|null} floorY nearest floor below, or null if none was found
 * @param {number} vy velocity after the step
 */
export function hasLanded(feetY, nextFeetY, floorY, vy) {
  if (floorY === null || vy > 0) return false;
  return nextFeetY <= floorY && feetY >= floorY - 1e-6;
}
