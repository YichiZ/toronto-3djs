/**
 * The nearby strip (#15): while walking, the next few named places around you
 * and the nearest way up or down - "← Royal York · 80 m", "↗ Lift down to the
 * PATH ⇣ · 17 m". The place label names where you are; this names what is
 * around it, so wandering turns into finding things.
 *
 * Places use the same kinds the headline does (placeLabel.js) and the same box
 * distances the HUD already measures. Ways up and down are the stairs,
 * escalators and lifts tagged `userData.access` where they are built.
 *
 * ponytail: landmarks, buildings and PATH vertical circulation only. Tenants
 * (identifiedTenants) and the concourses' own stairs are the issue's other
 * sources; add them when the strip is short of things to say.
 *
 * Pure, so `npm test` covers it without WebGL.
 */
import { PLACE_KINDS, PLACE_KINDS_BELOW_GRADE } from './placeLabel.js';

/** Clockwise from straight ahead, one per 45 degrees. */
export const ARROWS = Object.freeze(['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']);

/** @param {number} turn degrees, 0 ahead, positive to the right */
export const arrowFor = (turn) => ARROWS[((Math.round(turn / 45) % 8) + 8) % 8];

/** Farther than this, a staircase is not "the way down from here". */
export const ACCESS_METRES = 60;

/** Floors within this of an end count as being on it; covers the head bob and stair lag. */
const ON_FLOOR = 1.5;

/**
 * Named places around the walker, nearest first, one per name.
 *
 * @param {{record: {name: string, kind: string}, distance: number}[]} entries
 * @param {{exclude?: object|null, count?: number, belowGrade?: boolean, skip?: (e: object) => boolean}} opts
 *        exclude: the record the place label already names; skip: anything
 *        else to leave out (the HUD drops the headline's own parts)
 */
export function nearbyPlaces(entries, { exclude = null, count = 2, belowGrade = false, skip = () => false } = {}) {
  const kinds = belowGrade ? PLACE_KINDS_BELOW_GRADE : PLACE_KINDS;
  const seen = new Set(exclude ? [exclude.name] : []);
  const out = [];
  for (const e of [...entries].sort((a, b) => a.distance - b.distance)) {
    if (out.length >= count) break;
    // Inside a box is where you are, not somewhere nearby.
    if (!kinds.has(e.record.kind) || e.record === exclude || e.distance < 1 || skip(e)) continue;
    if (seen.has(e.record.name)) continue;
    seen.add(e.record.name);
    out.push(e);
  }
  return out;
}

/**
 * The nearest stair, escalator or lift with an end on the walker's floor.
 *
 * @param {{x:number, z:number, lowY:number, highY:number}[]} list
 * @param {{x:number, z:number}} pos
 * @param {number} floorY height of the floor the walker is on
 * @returns {{access: object, end: 'low'|'high', distance: number} | null}
 */
export function nearestAccess(list, pos, floorY, maxMetres = ACCESS_METRES) {
  let best = null;
  for (const a of list) {
    let end = null;
    if (Math.abs(a.lowY - floorY) < ON_FLOOR) end = 'low';
    else if (Math.abs(a.highY - floorY) < ON_FLOOR) end = 'high';
    if (!end) continue;
    const distance = Math.hypot(a.x - pos.x, a.z - pos.z);
    if (distance <= maxMetres && (!best || distance < best.distance)) best = { access: a, end, distance };
  }
  return best;
}

/** "Lift down to the PATH ⇣" from the top, "Stairs up to street level ⇡" from the bottom. */
export function accessText({ access: a, end }) {
  return end === 'low' ? `${a.kind} up to ${a.highName} ⇡` : `${a.kind} down to ${a.lowName} ⇣`;
}
