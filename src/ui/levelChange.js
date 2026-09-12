/**
 * Which level Q/E lands on, how close a floor must be to count as that level,
 * and how fast the camera eases between levels.
 *
 * Kept out of controls.js so the arithmetic can be tested without WebGL or the
 * DOM-only Three addons, the same arrangement as jump.js and modeTransition.js.
 */

/**
 * Settle rate for a level change, in 1/s, fed to the same `settle()` helper
 * grounding uses. Exponential, so this covers 98% of the gap in ~0.4 s.
 *
 * A per-frame factor was not an option: this codebase has twice shipped motion
 * that ran at a different speed on a 144 Hz machine than on a 30 fps one.
 */
export const LEVEL_SETTLE = 10;

/** Within this of the target eye height, the transition is over. */
export const LEVEL_ARRIVED = 0.02;

/** Widest a floor may sit from its level's nominal height and still count as it. */
export const MAX_LEVEL_TOLERANCE = 1.5;

/**
 * Per-level tolerance for "is this surface that level's floor?".
 *
 * One tolerance for every level worked only while the levels were far apart.
 * The platform level (7.0) sits half a metre over the viaduct deck (6.5), and
 * at 1.5 m each accepted the other's floor: pressing Q on a platform
 * "descended" to the deck and grounding hauled you straight back up 0.5 m.
 * Half the gap to the nearest neighbour can never accept a neighbour's floor,
 * and leaves every widely-spaced level at the full tolerance.
 *
 * @param {{y:number}[]} levels ordered low to high
 * @param {number} max
 * @returns {number[]}
 */
export function levelTolerances(levels, max = MAX_LEVEL_TOLERANCE) {
  return levels.map((level, i) => Math.min(
    max,
    ...[levels[i - 1], levels[i + 1]]
      .filter(Boolean)
      .map((neighbour) => Math.abs(neighbour.y - level.y) / 2),
  ));
}

/**
 * The level `delta` steps away that actually has a floor at the walker's feet.
 *
 * The naive one-step version stranded the walker: descend to the PATH from
 * Front Street, press E, and the intended concourse does not exist at that
 * spot, so grounding pulled you straight back down to the PATH - there was no
 * way out below grade except by finding a modelled stair. Skipping empty
 * levels makes Q/E mean "next surface up/down", which is what the layering is
 * for. If nothing in that direction has a floor, fall back to the immediate
 * neighbour so the key is never simply dead - but say so, because the walker
 * will be grounded back off that level within the second and a silent
 * fallback reads as a broken key.
 *
 * @param {number} index current level
 * @param {number} delta +1 or -1
 * @param {number} count how many levels there are
 * @param {(index:number) => boolean} hasFloorAt
 * @returns {{index:number, outcome:'ok'|'fallback'|'refused'}}
 */
/**
 * Metres of clear walking that count as "not facing a wall" after a level
 * change: about 2.5 s at a walk. Measured at the York Concourse's E: the old
 * heading had 5.9 m, an open 11.9 m was a 23 degree turn away.
 */
export const FACE_CLEAR = 8;

/**
 * Which way to face on arriving at a new level (#72).
 *
 * A level change lifts or drops the walker straight up or down on the spot, so
 * they kept facing whatever they faced below - in the York Concourse, E landed
 * them nose to a blank stone wall. So: keep the heading if it is open, else take
 * the smallest turn that is, else the most open direction there is.
 *
 * @param {number[]} clear metres of clear walking along each of n headings,
 *   evenly spaced round a full turn, index 0 being the current one
 * @param {number} [min] what counts as open
 * @returns {number} the index to face
 */
export function openHeading(clear, min = FACE_CLEAR) {
  const n = clear.length;
  const turn = (i) => Math.min(i, n - i);
  const bySmallestTurn = [...clear.keys()].sort((a, b) => turn(a) - turn(b));
  const open = bySmallestTurn.find((i) => clear[i] >= min);
  if (open !== undefined) return open;
  return clear.indexOf(Math.max(...clear));
}

/**
 * How far a level change will take you to a stair, escalator or lift.
 *
 * Generous next to the nearby strip's 60 m: this is the difference between
 * arriving on a floor and arriving inside a wall (#110).
 */
export const LEVEL_ACCESS_METRES = 120;

/** A floor within this of an access's end counts as being on it. */
const ON_FLOOR = 1.5;

/**
 * Would a landing at (x, z) on the level at height `y` be inside a building?
 *
 * Only at or above the street: below grade a footprint is where the interiors
 * are, and standing inside one is the point. A floor probe cannot answer this —
 * at the York Concourse the street surface runs on under the head house, so the
 * landing had a floor and was still inside the building (#110).
 *
 * @param {{minX:number, maxX:number, minZ:number, maxZ:number, height:number}[]} boxes
 */
export function insideSolidAt(boxes, x, z, y, margin = 0.5) {
  if (y < -0.5) return false;
  return boxes.some((b) => b.height > y + 1
    && x > b.minX - margin && x < b.maxX + margin
    && z > b.minZ - margin && z < b.maxZ + margin);
}

/**
 * The nearest access joining the level at `fromY` to the one at `toY`, either
 * way round, or null if none is within `maxMetres`.
 *
 * @param {{x:number, z:number, lowY:number, highY:number}[]} list
 * @param {{x:number, z:number}} pos
 */
export function pickAccess(list, pos, fromY, toY, maxMetres = LEVEL_ACCESS_METRES) {
  let best = null;
  for (const a of list) {
    const joins =
      (Math.abs(a.lowY - fromY) < ON_FLOOR && Math.abs(a.highY - toY) < ON_FLOOR)
      || (Math.abs(a.highY - fromY) < ON_FLOOR && Math.abs(a.lowY - toY) < ON_FLOOR);
    if (!joins) continue;
    const distance = Math.hypot(a.x - pos.x, a.z - pos.z);
    if (distance <= maxMetres && (!best || distance < best.distance)) best = { access: a, distance };
  }
  return best;
}

/**
 * The nearest spot around (x, z) that is not inside a building at height `y`.
 *
 * The fallback when no stair joins the two levels, or none of them is somewhere
 * you could stand: rings outward on `step` metres until a heading comes up
 * clear. From the York Concourse this lands on the forecourt promenade, which is
 * where the way up actually is. Positions only — whether a floor is there is the
 * caller's probe to run.
 *
 * @returns {{x:number, z:number, distance:number} | null}
 */
export function nearestOpenSpot(boxes, x, z, y, { step = 4, max = 80, headings = 16, accept = () => true } = {}) {
  const ok = (cx, cz) => !insideSolidAt(boxes, cx, cz, y) && accept(cx, cz);
  if (ok(x, z)) return { x, z, distance: 0 };
  for (let r = step; r <= max; r += step) {
    for (let i = 0; i < headings; i++) {
      const a = (i * 2 * Math.PI) / headings;
      const cx = x + Math.cos(a) * r;
      const cz = z + Math.sin(a) * r;
      if (ok(cx, cz)) return { x: cx, z: cz, distance: r };
    }
  }
  return null;
}

export function pickLevel(index, delta, count, hasFloorAt) {
  for (let i = index + delta; i >= 0 && i < count; i += delta) {
    if (hasFloorAt(i)) return { index: i, outcome: 'ok' };
  }
  const neighbour = Math.max(0, Math.min(count - 1, index + delta));
  // Already at the top or the bottom of the stack: there is nothing to fall
  // back to, and the level does not change at all.
  if (neighbour === index) return { index, outcome: 'refused' };
  return { index: neighbour, outcome: 'fallback' };
}
