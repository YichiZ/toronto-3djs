/**
 * A light push-away for the crowd (#38): pedestrians sidestep the walker.
 *
 * Agents are `noCollide` on purpose - a crowd must not be a wall - and they
 * walked straight through the camera. Now each one slides sideways off its
 * sidewalk line, just far enough to pass CLEARANCE from the walker, and eases
 * back once past. Nobody stops or turns round, and the walker's collision is
 * untouched: the crowd still never blocks anyone.
 *
 * ponytail: a sideways offset capped at MAX_SIDE, not avoidance steering. At
 * the cap an agent on a narrow sidewalk can still brush past closer than
 * CLEARANCE; real steering (and agents avoiding each other) is the upgrade.
 */

/** Metres the walker is given. */
export const CLEARANCE = 1.2;
/** Furthest an agent strays from its line; a sidewalk is 4-6 m wide. */
export const MAX_SIDE = 1.0;
/** 1/s. Fast enough to be clear in time at a walk, slow enough not to snap. */
export const SIDE_RATE = 5;

/**
 * Sideways offset an agent should have to keep clear of the walker.
 *
 * @param {{px:number, pz:number}} p   the agent's point on its line
 * @param {{dx:number, dz:number}} d   unit direction of travel
 * @param {{cx:number, cz:number}} c   the walker
 * @param {number} [fallback] side to take when the walker is dead on the line, +1 or -1
 * @returns {number} metres to the right of travel (negative: to the left)
 */
export function clearance({ px, pz }, { dx, dz }, { cx, cz }, fallback = 1) {
  const nx = -dz;
  const nz = dx;
  const rx = cx - px;
  const rz = cz - pz;
  const along = rx * dx + rz * dz;
  const lateral = rx * nx + rz * nz;
  if (along * along + lateral * lateral >= CLEARANCE * CLEARANCE) return 0;
  const reach = Math.sqrt(CLEARANCE * CLEARANCE - along * along);
  const side = lateral > 0 ? lateral - reach : lateral < 0 ? lateral + reach : -fallback * reach;
  return Math.max(-MAX_SIDE, Math.min(MAX_SIDE, side));
}
