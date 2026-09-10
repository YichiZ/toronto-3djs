/**
 * Look speed: one multiplier for touch-drag look and mouse look, remembered in
 * the browser (issue #14). Touch look was a literal 0.0035 with no way to
 * change it; PointerLockControls already scales mouse look by pointerSpeed.
 *
 * Every storage touch is guarded: localStorage can throw on access (blocked
 * site data, some previews), and a refused save must never stop the speed from
 * applying.
 */

/** Radians of look per pixel of touch drag, at speed 1. */
export const TOUCH_LOOK_RATE = 0.0035;
export const LOOK_SPEED_MIN = 0.25;
export const LOOK_SPEED_MAX = 3;
export const LOOK_SPEED_KEY = 'twin.lookSpeed';

/** A usable look speed from anything: garbage, zero or negative is the default, 1. */
export function clampLookSpeed(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(LOOK_SPEED_MAX, Math.max(LOOK_SPEED_MIN, n));
}

/** The browser's localStorage, or null where even reaching it throws. */
export function browserStorage() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The remembered look speed, or 1. Never throws. */
export function loadLookSpeed(storage) {
  try {
    const v = storage?.getItem(LOOK_SPEED_KEY);
    return v == null ? 1 : clampLookSpeed(v);
  } catch {
    return 1;
  }
}

/** Remember a look speed. A storage that refuses is not an error: it still applies. */
export function saveLookSpeed(storage, v) {
  try {
    storage?.setItem(LOOK_SPEED_KEY, String(clampLookSpeed(v)));
  } catch {
    /* not remembered across reloads; still in effect now */
  }
}
