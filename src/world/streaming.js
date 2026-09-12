/**
 * When a streamed interior is on, in numbers — out of world/index.js so
 * `npm test` can reach it, and because the rule is the whole of the fix (#132).
 *
 * The old test was `distance < radius`, with nothing between coming and going.
 * A camera sitting on that circle toggled the entire room — geometry and every
 * lifted light — at the 250 ms check rate: six flips in six seconds, measured,
 * with 5 cm of movement. That is the ordinary case, not a contrived one: walking
 * a path that runs tangentially past a room crosses its radius over and over.
 *
 * So the line to come in is not the line to go out. A room streams in at
 * `radius` and does not leave until `radius + EXIT_MARGIN`, and the same band
 * applies to the contact test against the room's own box.
 */

/**
 * How much further than the entry radius the camera must go before a room that
 * is already on is streamed out. 10 m is four checks' travel at a run (7.5 m/s,
 * checked every 0.25 s), so a walker crosses the band deliberately or not at all.
 */
export const EXIT_MARGIN = 10;

/**
 * The same idea for the contact test against a room's own box, and much smaller.
 *
 * It cannot be EXIT_MARGIN. The PATH's Union-to-arena corridor tops out 4.6 m
 * under a street-level eye, and CONTACT = 4 is what keeps a walker on Front
 * Street from streaming in a cluster nobody up there can see — a check in
 * qa/collision-fidelity.e2e.mjs, which is how I found this out. A 10 m band on
 * the contact test puts the limit at 14 m and draws the corridor from the
 * pavement above it. Half a metre is enough to stop a walker brushing along a
 * wall from toggling the room, and leaves that 4.6 m clearance intact.
 */
export const CONTACT_MARGIN = 0.5;

/**
 * @param {object} p
 * @param {boolean} p.visible whether the interior is streamed in right now
 * @param {number} p.distance camera to the interior's centre, metres
 * @param {number} p.contact camera to the interior's own bounding box, metres
 * @param {number} p.radius the interior's entry radius
 * @param {number} p.contactRange how close to the box counts as being at it
 * @param {number} [p.margin] the hysteresis band on the radius
 * @param {number} [p.contactMargin] the hysteresis band on the box
 * @returns {boolean} whether the interior should be streamed in
 */
export function streamsIn({
  visible, distance, contact, radius, contactRange,
  margin = EXIT_MARGIN, contactMargin = CONTACT_MARGIN,
}) {
  if (!visible) return distance < radius || contact < contactRange;
  return distance < radius + margin || contact < contactRange + contactMargin;
}
