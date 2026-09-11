/**
 * Wayfinding, first cut (#11): pick a destination, get an arrow and a distance.
 *
 * Straight line, not a route: the arrow points at the destination as the crow
 * flies, relative to where the walker is facing. Destinations are the reference
 * viewpoints - an orbit viewpoint's subject, not its aerial camera spot - and
 * the named intersections.
 *
 * ponytail: straight line, street plane only. Routing on the sidewalk graph
 * (pedestrians.js buildStreetGraph) and across levels comes after.
 */
import { VIEWPOINTS } from '../data/references.js';
import { INTERSECTIONS } from '../data/grid.js';

/** Within this many metres the destination counts as reached. */
export const ARRIVE_METRES = 8;

export const DESTINATIONS = Object.freeze([
  ...VIEWPOINTS.map((v) => {
    const p = v.mode === 'orbit' ? v.lookAt : v.position;
    return Object.freeze({ id: `vp:${v.id}`, name: v.name, x: p.x, z: p.z, group: 'Places' });
  }),
  ...INTERSECTIONS.map((i) => Object.freeze({ id: `x:${i.id}`, name: i.name, x: i.x, z: i.z, group: 'Corners' })),
]);

export const getDestination = (id) => DESTINATIONS.find((d) => d.id === id) ?? null;

/**
 * Where a destination is from here.
 *
 * @param {{x:number, z:number}} from   walker position
 * @param {{x:number, z:number}} forward view direction (any length; y ignored)
 * @param {{x:number, z:number}} dest
 * @returns {{distance:number, turn:number, arrived:boolean}} turn in degrees,
 *   0 straight ahead, positive to the right, +/-180 behind
 */
export function guide(from, forward, dest) {
  const tx = dest.x - from.x;
  const tz = dest.z - from.z;
  const distance = Math.hypot(tx, tz);
  const len = Math.hypot(forward.x, forward.z) || 1;
  const fx = forward.x / len;
  const fz = forward.z / len;
  // Right of forward, with y up, is (-fz, fx).
  const turn = (Math.atan2(tx * -fz + tz * fx, tx * fx + tz * fz) * 180) / Math.PI;
  return { distance, turn, arrived: distance <= ARRIVE_METRES };
}

// The one destination, shared by the HUD banner and the minimap marker.
let target = null;
export const getTarget = () => target;
/** Set by id, or clear with null. Unknown ids clear. */
export function setTarget(id) {
  target = id ? getDestination(id) : null;
  return target;
}
