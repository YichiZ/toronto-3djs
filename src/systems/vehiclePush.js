/**
 * Traffic shoves the walker aside instead of driving through it.
 *
 * Vehicles are deliberately out of the walker's collision index (#6): they are
 * instanced and move every frame, so indexing them - or raycasting them - is
 * exactly the cost that index exists to avoid. So the car does not become a
 * wall; the walker is simply displaced out of the lane when a footprint reaches
 * it. Traffic never brakes, never swerves, never notices.
 *
 * The displacement is returned as a plain XZ offset for controls.js to feed
 * through slide(), so a walker beside a building is pushed along the wall
 * rather than into it. Wedged in an inside corner, slide() gives up and the
 * car passes through - there is no answer to being squashed.
 *
 * ponytail: an oriented-rectangle overlap per nearby car, resolved on the
 * shorter axis only. It cannot shove anyone out from under a bus that is
 * already straddling them lengthways; a swept test against the car's motion is
 * the upgrade if that ever shows.
 */

/** Metres of air kept outside the car's own footprint, behind and beside. */
export const CLEARANCE = 0.5;
/**
 * Seconds of warning in front of a moving car: the shove starts speed × REACT
 * ahead of the bumper. Clearing a car's width takes ~250 ms at PUSH_RATE, and a
 * sedan at 13 m/s covered CLEARANCE in 40 ms - measured as the walker inside
 * the bonnet for a frame. A stopped car gets no lead-in at all, so the walker
 * can still cross in front of a queue at a red light.
 */
export const REACT = 0.3;
/** Furthest ahead of the bumper the shove ever starts, metres. */
export const AHEAD = 4;
/** Fastest the walker is shoved, m/s. A shove, not a catapult. */
export const PUSH_RATE = 6;

/**
 * Sideways displacement a car imposes on the walker this frame.
 *
 * @param {{x:number, z:number, dx:number, dz:number, speed:number, half:number, halfWidth:number}} car
 *        lane position, unit heading, speed, half length and half width
 * @param {{cx:number, cz:number}} walker
 * @param {number} dt seconds
 * @param {number} [fallback] side to take when the walker is dead on the
 *        centreline, +1 (the car's right) or -1
 * @returns {{x:number, z:number}} metres to add to this frame's step
 */
export function push(car, { cx, cz }, dt, fallback = 1) {
  const nx = -car.dz;
  const nz = car.dx;
  const rx = cx - car.x;
  const rz = cz - car.z;
  const along = rx * car.dx + rz * car.dz;
  const ahead = Math.max(CLEARANCE, Math.min(AHEAD, car.speed * REACT));
  if (along >= car.half + ahead || -along >= car.half + CLEARANCE) return { x: 0, z: 0 };
  const lateral = rx * nx + rz * nz;
  const need = car.halfWidth + CLEARANCE - Math.abs(lateral);
  if (need <= 0) return { x: 0, z: 0 };
  const side = lateral > 0 ? 1 : lateral < 0 ? -1 : fallback;
  const mag = Math.min(need, PUSH_RATE * dt);
  return { x: nx * side * mag, z: nz * side * mag };
}
