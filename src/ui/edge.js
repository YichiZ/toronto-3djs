/**
 * Edge blocking for the walker: you may not step off a floor onto nothing.
 *
 * WHY THIS EXISTS: ground() holds the walker at the level's NOMINAL height when
 * the downward probe finds nothing, because large stretches of this model have
 * no floor mesh at all (the PATH at -120, 40 is nominal-held, not floored) and
 * dropping through the world there would be worse than floating. The cost was
 * that walking off a real floor - the Royal Bank Plaza setback roof at level 9,
 * a SkyWalk deck end - let you keep walking on thin air at that height, 30 m out
 * over the street.
 *
 * WHY BLOCK RATHER THAN FALL: falling needs to tell "a gap in a real floor" from
 * "this area was never floored", and nothing in the model says which is which -
 * so a fall would drop you on some gaps and not others. Blocking needs only the
 * distinction this module makes: the walker is on a real floor NOW, and the next
 * step is not. On nominal-held ground nothing changes, because there is no floor
 * to step off in the first place.
 *
 * Pure arithmetic, so it can be unit tested: controls.js imports DOM-only Three
 * addons and cannot be loaded in Node.
 */

const ZERO = Object.freeze({ x: 0, z: 0 });

/**
 * The part of `step` the walker may actually take.
 *
 * Probes a body radius AHEAD rather than at the step itself: a substepped run is
 * a few centimetres long, and stopping only once the camera centre has left the
 * floor puts the walker's eye out past the parapet line. This is the same
 * clearance walls are given.
 *
 * When the full step is refused, each world axis is tried alone, so walking into
 * an edge at an angle slides along it instead of sticking - the behaviour a wall
 * already has.
 *
 * @param {{x:number, z:number}} step        intended movement this frame, metres
 * @param {boolean} onFloor                  is a real floor underfoot right now?
 * @param {number} radius                    how far ahead to probe, metres
 * @param {(dx:number, dz:number) => boolean} hasFloorToward
 *        is there a floor at this offset from the walker, on the current level?
 * @returns {{x:number, z:number}} the step to take; {0,0} means the edge blocks
 */
export function stepAtEdge(step, onFloor, radius, hasFloorToward) {
  if (!onFloor) return step;               // nominal-held: nothing to fall off
  const len = Math.hypot(step.x, step.z);
  if (len < 1e-9) return step;
  if (hasFloorToward((step.x / len) * radius, (step.z / len) * radius)) return step;
  if (step.x !== 0 && hasFloorToward(Math.sign(step.x) * radius, 0)) return { x: step.x, z: 0 };
  if (step.z !== 0 && hasFloorToward(0, Math.sign(step.z) * radius)) return { x: 0, z: step.z };
  return ZERO;
}
