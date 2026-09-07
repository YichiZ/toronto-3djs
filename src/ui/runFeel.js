/**
 * How running and walking FEEL: the FOV kick and the head bob.
 *
 * Running already existed - Shift gives 7.5 m/s against a walk of 3.4 - but
 * nothing on screen said so, and 7.5 m/s framed identically to 3.4 m/s is a
 * speed you cannot perceive. These are the two cheapest tells.
 *
 * Kept out of controls.js so the arithmetic can be tested without WebGL or the
 * DOM-only Three addons, the same arrangement as jump.js and modeTransition.js.
 */

/**
 * Fraction of the way to a target this step, for an exponential ease.
 *
 * `rate` is a time constant in 1/s, NOT a per-frame factor. A fixed per-frame
 * factor is the bug this codebase has now been bitten by twice: it converges in
 * a different number of SECONDS at 30 fps than at 144 fps, so the camera lagged
 * the forecourt stairs on a slow machine and was glued to them on a fast one.
 * Lives here because controls.js and both eases below need the same one.
 */
export const settle = (rate, dt) => 1 - Math.exp(-rate * Math.max(dt, 0));

/** Move `current` toward `target` at `rate` 1/s. */
export const easeTo = (current, target, rate, dt) =>
  current + (target - current) * settle(rate, dt);

/**
 * Degrees of extra field of view at a full run, added to whatever FOV the
 * camera was built with rather than to a copy of the 58 in context.js - one
 * definition of the resting frame, not two that can drift apart.
 */
export const RUN_FOV_GAIN = 6;

/** 1/s. Slower than the walker's acceleration, so the frame widens after you do. */
export const FOV_SETTLE = 5;

/**
 * How far into the run the walker is, 0 at walk speed and 1 at run speed.
 *
 * Measured from WALK_SPEED, not from a standstill: the kick has to mean
 * "running", and a FOV that widens as you merely start moving says nothing
 * about Shift at all.
 */
export function runFraction(speed, walkSpeed, runSpeed) {
  if (!(runSpeed > walkSpeed)) return 0;
  return Math.min(1, Math.max(0, (speed - walkSpeed) / (runSpeed - walkSpeed)));
}

/**
 * Metres of ground covered per footfall.
 *
 * ponytail: one fixed step length. A real stride lengthens with speed, so the
 * run's cadence here is faster than a person's; give this a speed term if the
 * bob ever reads as scurrying.
 */
export const STEP_LENGTH = 1.2;

/** Metres of vertical travel at a walk. Subtle on purpose - this is a city, not an FPS. */
export const BOB_AMPLITUDE = 0.028;

/** Ceiling on the speed scaling, so a run bobs half again as hard and no more. */
export const BOB_MAX_GAIN = 1.5;

/**
 * 1/s. Fades the bob in and out. Take-off would otherwise drop the head 4 cm in
 * a single frame; this is fast enough that the fade is invisibly over well
 * inside a ~0.63 s hop, and slow enough that it is a fade and not a snap.
 */
export const BOB_SETTLE = 12;

/**
 * How hard the bob should be running right now, before easing.
 *
 * Zero while airborne: a bobbing jump looks broken, and the walker's legs are
 * not doing anything. Zero at a standstill too, which is what stops the bob
 * without having to freeze the phase.
 */
export function bobGain(speed, walkSpeed, airborne) {
  if (airborne || !(speed > 0)) return 0;
  return Math.min(BOB_MAX_GAIN, speed / walkSpeed);
}

/**
 * Vertical head offset, in metres.
 *
 * Keyed to DISTANCE TRAVELLED, not to elapsed time. Keyed to time, the bob
 * keeps swinging at the same rate while you accelerate, decelerate or walk into
 * a wall, and the head visibly stops being in step with the legs. Keyed to
 * distance it cannot drift: a metre of ground is always the same fraction of a
 * step, so the cadence scales with speed for free and stopping stops the phase.
 *
 * @param {number} distance metres of ground covered since install
 * @param {number} gain eased output of bobGain()
 */
export function bobHeight(distance, gain) {
  return gain * BOB_AMPLITUDE * Math.sin((2 * Math.PI * distance) / STEP_LENGTH);
}
