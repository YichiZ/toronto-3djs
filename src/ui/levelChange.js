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
