/**
 * Where the walker's two collision rays sit, vertically.
 *
 * WHY THERE ARE TWO. The walk used to test a single forward ray at eye - 0.6,
 * about 1.1 m over the floor, so anything shorter than that was invisible to
 * collision. Most of what systems/streetFurniture.js builds is shorter than
 * that: bollards top out at 0.98 m, benches at 0.98, planters at 0.85. The
 * walker strolled straight through downtown's street furniture.
 *
 * WHY THE LOW RAY IS AT KNEE-PLUS AND NOT AT SHIN HEIGHT. It has to clear the
 * stair the walker is standing on. The forecourt PATH headhouse stair rises
 * 0.325 m per 0.32 m of going - 45 degrees - so treads within the walker's
 * 0.55 m body radius already reach 0.65 m above the tread underfoot. A probe
 * below that reads the next riser as a wall and the stairs become impassable,
 * which is a far worse bug than walking through a bench. Above 0.85 m the probe
 * starts sailing over the planters. 0.75 sits in the middle of that window.
 *
 * WHY IT IS MEASURED FROM THE FLOOR AND NOT FROM THE EYE. ground() eases the
 * camera toward the surface at a rate, so on a climb the camera lags the floor
 * by speed/GROUND_SETTLE - about 0.3 m walking up the headhouse stair and 0.6 m
 * running. Hanging the low ray off the eye would drag it down into the risers
 * exactly where it must not be.
 *
 * ponytail: a fixed height, so anything shorter than LOW_PROBE - curbs, grates,
 * kerbs - is still walked through. They are all steppable, which is why that is
 * survivable. The real fix is a per-obstacle step-up test against a dedicated
 * collision layer (issue #6), not a third ray.
 */

/** Metres below the eye for the high ray: chest height on a 1.7 m walker. */
export const HIGH_DROP = 0.6;
/** Metres above the floor underfoot for the low ray. */
export const LOW_PROBE = 0.75;
/**
 * Metres above the FEET for the low ray mid-air. LOW_PROBE is that high only to
 * clear the next stair riser, and in the air there is no stair to climb: hung
 * 0.75 m off rising feet, both rays cleared a 0.98 m bollard once the feet were
 * 0.4 m up, and the walker passed through its top half. This is tucked legs -
 * a kerb's worth - so a hop clears a post only near the top of the arc.
 */
export const AIR_LIFT = 0.2;
/**
 * Least vertical gap that makes a second ray worth casting. Below this the two
 * rays see the same obstacles and the low one is pure cost.
 */
export const MIN_SEPARATION = 0.15;
/**
 * Deepest the floor may sit below the eye and still be the floor the walker is
 * standing on: eye height plus the worst settle lag. Past that the reading is
 * stale - a teleport, a level change or a mode switch moves the camera before
 * ground() has run once - and hanging a ray off it would put the ray somewhere
 * unrelated to the walker's shins.
 */
export const MAX_FLOOR_DROP = 2.4;

/**
 * Heights for the forward collision rays.
 *
 * `low` is null when there is no floor reading yet, or when the camera has
 * dropped so close to the floor (mid-climb lag, a fall) that the low ray would
 * sit at or above the high one.
 *
 * @param {number} cameraY eye height, world space
 * @param {number} floorY  surface actually underfoot (the feet, mid-air), world space
 * @param {number} [lift]  low ray height above floorY: LOW_PROBE grounded, AIR_LIFT mid-air
 * @returns {{high: number, low: number|null}}
 */
export function probeHeights(cameraY, floorY, lift = LOW_PROBE) {
  const high = cameraY - HIGH_DROP;
  if (!Number.isFinite(floorY)) return { high, low: null };
  if (cameraY - floorY > MAX_FLOOR_DROP) return { high, low: null };
  const low = floorY + lift;
  return { high, low: low <= high - MIN_SEPARATION ? low : null };
}
