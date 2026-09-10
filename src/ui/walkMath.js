/**
 * The walker's pure arithmetic, out of install() so `npm test` can reach it
 * (issue #16). controls.js keeps the raycasts and the state; everything here is
 * a function of its arguments - no Three, no scene, no camera.
 */
import { LEVELS } from '../data/grid.js';

/** Walkable levels, low to high. Q/E steps through these. */
export const LEVEL_ORDER = Object.freeze([
  Object.freeze({ name: 'PATH', y: LEVELS.path }),
  Object.freeze({ name: 'concourse', y: LEVELS.unionConcourse }),
  Object.freeze({ name: 'street', y: LEVELS.street }),
  Object.freeze({ name: 'viaduct deck', y: LEVELS.viaductDeck }),
  Object.freeze({ name: 'platform', y: LEVELS.platform }),
  Object.freeze({ name: 'SkyWalk', y: LEVELS.skywalk }),
  Object.freeze({ name: 'Gardiner deck', y: LEVELS.gardinerDeck }),
]);

export const STREET_LEVEL = LEVEL_ORDER.findIndex((l) => l.name === 'street');

/**
 * Index of the level nearest height `y`. On an exact tie the lower level - the
 * first in the list - wins; with an empty list, `fallback`.
 */
export function nearestLevel(y, levels = LEVEL_ORDER, fallback = STREET_LEVEL) {
  let best = fallback;
  let bestD = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const d = Math.abs(levels[i].y - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Is there a floor at `levelY`, judging every surface down the probe rather
 * than only the first?
 *
 * Judging only the first, anything standing on the pavement shadowed it: a
 * planter top at 1.51 m or a passing vehicle roof at 1.58 m is outside the
 * tolerance, so street level read as floorless and Q/E skipped it - and because
 * traffic moves, the same key gave different answers second to second.
 *
 * @param {number[]} hitYs heights of the solid surfaces under the probe,
 *        nearest (highest) first - the order a downward raycast returns
 * @param {number} levelY nominal height of the level
 * @param {number} tolerance how far off nominal still counts as that floor
 */
export function floorAtLevel(hitYs, levelY, tolerance) {
  for (const y of hitYs) {
    if (Math.abs(y - levelY) <= tolerance) return true;
    if (y < levelY - tolerance) return false;   // sorted: already past the level
  }
  return false;
}

/**
 * How many substeps to split a walk frame into.
 *
 * The bound is the speed the walker could REACH this frame, not the speed it
 * has: acceleration saturates (`min(1, ACCEL * dt)`) for any dt at or above
 * 1/12 s, so a walker starting from a dead stop reaches full speed within the
 * same frame. Reading the stale velocity said "span 0, no substep needed" and
 * then took a 1.7 m step at dt 0.5 s - through the wall this guard exists for.
 * Airborne, the arc also needs short steps: at 30 fps a hop otherwise loses 8 cm
 * of apex.
 *
 * @param {number} speed current horizontal speed, m/s
 * @param {number} dt frame time, s
 * @param {{runSpeed:number, maxStep:number, airborne?:boolean, maxAirDt?:number, cap?:number}} o
 */
export function substeps(speed, dt, { runSpeed, maxStep, airborne = false, maxAirDt = 1 / 120, cap = 16 }) {
  const span = Math.max(speed, runSpeed) * dt;
  return Math.min(cap, Math.max(
    span > maxStep ? Math.ceil(span / maxStep) : 1,
    airborne ? Math.ceil(dt / maxAirDt) : 1,
  ));
}

/**
 * Slide a step along whatever blocks it, rather than stopping dead.
 *
 * Two passes: the first slide can put the walker into a second surface (an
 * inside corner), and the second resolves it. A third would buy nothing - if
 * two surfaces still block, the walker is genuinely wedged. The velocity is
 * projected the same way, so the walker does not build up speed into a wall.
 * The blocking test is carried between passes rather than repeated at the end:
 * the unobstructed case, nearly every frame, costs one probe.
 *
 * @param {{x:number, z:number}} step intended movement this substep
 * @param {{x:number, z:number}} velocity horizontal velocity
 * @param {(dx:number, dz:number) => ({x:number, z:number} | null)} normalAt
 *        unit ground-plane normal of the first thing blocking a step that way
 * @returns {{step:{x:number,z:number}, velocity:{x:number,z:number}, blocker:object|null}}
 *          a non-null blocker means still wedged after both passes
 */
export function slide(step, velocity, normalAt, passes = 2) {
  let sx = step.x;
  let sz = step.z;
  let vx = velocity.x;
  let vz = velocity.z;
  let blocker = sx * sx + sz * sz > 1e-10 ? normalAt(sx, sz) : null;
  for (let pass = 0; pass < passes && blocker; pass++) {
    const sd = sx * blocker.x + sz * blocker.z;
    sx += blocker.x * -sd;
    sz += blocker.z * -sd;
    const vd = vx * blocker.x + vz * blocker.z;
    vx += blocker.x * -vd;
    vz += blocker.z * -vd;
    blocker = sx * sx + sz * sz > 1e-10 ? normalAt(sx, sz) : null;
  }
  return { step: { x: sx, z: sz }, velocity: { x: vx, z: vz }, blocker };
}
