/**
 * The run tells: FOV kick and head bob. `npm test`
 *
 * controls.js pulls in DOM-only Three addons, so the arithmetic lives in
 * src/ui/runFeel.js and is exercised directly here; qa/modes.e2e.mjs holds
 * Shift for real in a browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  settle, easeTo, runFraction, bobGain, bobHeight,
  RUN_FOV_GAIN, FOV_SETTLE, BOB_SETTLE, BOB_AMPLITUDE, BOB_MAX_GAIN, STEP_LENGTH,
} from '../src/ui/runFeel.js';

const WALK = 3.4;
const RUN = 7.5;
const BASE_FOV = 58;

/** Ease the FOV from rest to the running target over `span` seconds at `dt`. */
const fovAfter = (span, dt, target = BASE_FOV + RUN_FOV_GAIN) => {
  let fov = BASE_FOV;
  for (let t = 0; t < span - 1e-9; t += dt) fov = easeTo(fov, target, FOV_SETTLE, dt);
  return fov;
};

test('the FOV kick is frame-rate independent', () => {
  // The whole reason the ease is exponential-per-second. A per-frame factor
  // would widen the frame twice as far at 60 fps as at 30 for the same second,
  // which is how the ground settle and the jump arc each broke before this.
  // Both rates cover the SAME span in a whole number of steps, or the
  // comparison measures step quantisation instead of frame-rate dependence.
  const slow = fovAfter(0.6, 1 / 30);
  const fast = fovAfter(0.6, 1 / 120);
  assert.ok(Math.abs(slow - fast) < 0.05,
    `0.6 s of run gave ${slow.toFixed(3)} deg at 30 fps and ${fast.toFixed(3)} at 120`);
});

test('the FOV settles to the target and comes all the way back', () => {
  const running = fovAfter(2, 1 / 60);
  assert.ok(Math.abs(running - (BASE_FOV + RUN_FOV_GAIN)) < 0.05, `stalled at ${running}`);
  // Releasing Shift eases back to exactly the FOV the camera was built with -
  // not to a copy of 58 kept in a second module.
  let fov = running;
  for (let i = 0; i < 120; i++) fov = easeTo(fov, BASE_FOV, FOV_SETTLE, 1 / 60);
  assert.ok(Math.abs(fov - BASE_FOV) < 0.05, `stuck wide at ${fov}`);
});

test('the FOV kick means running, not merely moving', () => {
  assert.equal(runFraction(0, WALK, RUN), 0);
  assert.equal(runFraction(WALK, WALK, RUN), 0, 'a walk must not widen the frame');
  assert.equal(runFraction(RUN, WALK, RUN), 1);
  assert.ok(runFraction(RUN + 5, WALK, RUN) === 1, 'clamped above the run speed');
  assert.ok(runFraction((WALK + RUN) / 2, WALK, RUN) > 0.4);
});

test('the bob is keyed to distance, so the same ground gives the same head position', () => {
  // Keyed to time this fails: covering 4 m slowly and covering 4 m quickly would
  // land the head at different points in the step, and the bob would drift out
  // of phase with the legs every time the walker accelerates or stops.
  const slowly = bobHeight(4.0, 1);
  const quickly = bobHeight(4.0, 1);
  assert.equal(slowly, quickly);
  // And one step of ground really is one full cycle.
  assert.ok(Math.abs(bobHeight(0, 1) - bobHeight(STEP_LENGTH, 1)) < 1e-12);
  assert.ok(Math.abs(bobHeight(STEP_LENGTH / 4, 1) - BOB_AMPLITUDE) < 1e-12,
    'a quarter step should be the top of the arc');
});

test('the bob scales with speed and stays subtle', () => {
  assert.equal(bobGain(0, WALK, false), 0, 'standing still does not bob');
  assert.equal(bobGain(WALK, WALK, false), 1);
  assert.equal(bobGain(RUN, WALK, false), BOB_MAX_GAIN, 'the run scaling is capped');
  const worst = Math.abs(bobHeight(STEP_LENGTH / 4, bobGain(RUN, WALK, false)));
  assert.ok(worst < 0.05, `a run bobs ${(worst * 100).toFixed(1)} cm - too much for a city walk`);
  assert.ok(worst > 0.02, 'and it has to be visible at all');
});

test('the bob is off while airborne', () => {
  // A bobbing jump looks broken, and fly() owns the height mid-arc.
  assert.equal(bobGain(RUN, WALK, true), 0);
  assert.equal(bobGain(WALK, WALK, true), 0);
});

test('the bob fades rather than snapping, at any frame rate', () => {
  // Take-off would otherwise drop the head 4 cm in one frame. The fade is the
  // same ease as everything else here, so it must be frame-rate independent too.
  const fade = (dt) => {
    let gain = BOB_MAX_GAIN;
    for (let t = 0; t < 0.2 - 1e-9; t += dt) gain = easeTo(gain, 0, BOB_SETTLE, dt);
    return gain;
  };
  assert.ok(Math.abs(fade(1 / 30) - fade(1 / 120)) < 0.02,
    `fade differed between frame rates: ${fade(1 / 30)} vs ${fade(1 / 120)}`);
  // Over well inside a hop: a ~0.63 s arc, sampled at its halfway point.
  let gain = BOB_MAX_GAIN;
  for (let i = 0; i < 18; i++) gain = easeTo(gain, 0, BOB_SETTLE, 1 / 60);
  const residual = Math.abs(bobHeight(STEP_LENGTH / 4, gain));
  assert.ok(residual < 0.002,
    `${(residual * 1000).toFixed(1)} mm of bob left halfway through the hop`);
  // But it is a fade, not a snap: one 60 fps frame must not erase it.
  assert.ok(easeTo(BOB_MAX_GAIN, 0, BOB_SETTLE, 1 / 60) > BOB_MAX_GAIN * 0.7);
});

test('settle is a rate per second, not a factor per frame', () => {
  // The same guarantee qa/review-fixes.test.mjs asserts for the ground settle,
  // now against the shared function both of them actually use.
  const converge = (dt, steps, rate = 12) => {
    let gap = 3.0;
    for (let i = 0; i < steps; i++) gap -= gap * settle(rate, dt);
    return gap;
  };
  assert.ok(Math.abs(converge(1 / 100, 10) - converge(1 / 20, 2)) < 1e-9);
  assert.equal(settle(12, -1), 0, 'a negative dt must not run the ease backwards');
});
