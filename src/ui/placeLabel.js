/**
 * What the HUD's "where am I" line names, and the intersection under it.
 *
 * WHY NOT THE NEAREST CENTRE. The label used to rank every registered entity by
 * the centre of its bounding box. Union Station is 229 m long, so standing on
 * the pavement 4 m from its face, its centre is over 100 m away and the label
 * named whatever small thing had a nearby centre instead - the taxi lay-by, the
 * streetcar loop, the York Street plaza. controls/hud.js now measures to the
 * box itself (Three's Box3.distanceToPoint), 0 when inside, which is the
 * footprint distance issue #10 asked for plus the vertical: this city is
 * layered, and a box on another level is genuinely further away.
 *
 * WHY THE KIND PENALTY. Distance alone still loses on Front Street: the PATH
 * "Union Station cluster" is one box spanning most of the underground, its top
 * pokes 0.6 m above grade at the headhouses, and a street-level walker is inside
 * its footprint and 1.1 m from its top. So the headline prefers places a person
 * would name - landmarks and buildings, and below grade the PATH too - and
 * anything else must be HEADLINE_PENALTY metres closer to beat them.
 *
 * WHY THE FOOTPRINT TIE-BREAK. Boxes nest in a layered city. At one probed
 * PATH spot under Front Street the walker is inside a 373 m2 corridor, the
 * 6,962 m2 forecourt whose stairs reach down to it, the 20,672 m2 Union cluster
 * and the 84,988 m2 PATH network - all at 0 m. The smallest footprint is the
 * most specific place you are in.
 *
 * ponytail: a flat penalty by kind plus a footprint tie-break is a heuristic. It
 * is right on every spot probed along Front Street and in the PATH, and no
 * scattered set wins anywhere on the city grid. Its ceiling is that a box is a
 * box: a long single structure (the rail viaduct) names everything along its
 * length, and an L-shaped building claims its empty corner. The fix for that is
 * distance to real geometry, not a bigger table here.
 *
 * Pure, so `npm test` covers it without WebGL: hud.js imports Three.
 */

/** Metres a non-place record must beat a place by to take the headline. */
export const HEADLINE_PENALTY = 25;

const PLACE_KINDS = new Set(['landmark', 'building']);
// Below grade the PATH is the place. Its corridors are registered as
// 'infrastructure' (probed, not assumed), which at street level means lay-bys
// and ramps - so the kind only counts as a place underground.
const PLACE_KINDS_BELOW_GRADE = new Set(['landmark', 'building', 'interior', 'infrastructure']);

/**
 * The record the HUD should name.
 *
 * @param {{record: {kind: string}, distance: number, footprint?: number}[]} entries
 *        distance to each record's box and its ground footprint, metres / m2
 * @param {boolean} belowGrade is the walker under the street?
 * @returns {{record: object, distance: number} | null}
 */
export function pickPlace(entries, belowGrade) {
  const places = belowGrade ? PLACE_KINDS_BELOW_GRADE : PLACE_KINDS;
  const footprintOf = (e) => e.footprint ?? Infinity;
  let best = null;
  let bestRank = Infinity;
  for (const e of entries) {
    // Props never name the place. Most are scattered sets - one record for every
    // parking machine or street tree downtown - whose box covers the city, so
    // one sat "0 m" away almost everywhere: on a 25 m grid across the model a set
    // took the headline at 174 of 1,035 street points. The rest are signage bands
    // and cornices. Dropping props changed no park or monument spot: each already
    // had its landmark named. Dropping only the instanced ones was tried, and the
    // merged "Storefront fascia signs" took 76 of those points instead.
    if (e.record.kind === 'prop') continue;
    const rank = e.distance + (places.has(e.record.kind) ? 0 : HEADLINE_PENALTY);
    const tied = Math.abs(rank - bestRank) < 1e-6;
    if (!best || (rank < bestRank && !tied) || (tied && footprintOf(e) < footprintOf(best))) {
      best = e;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Nearest named intersection to a grid position, or null for an empty list.
 *
 * @param {number} x
 * @param {number} z
 * @param {{name: string, x: number, z: number}[]} intersections
 * @returns {{name: string, distance: number} | null}
 */
export function nearestIntersection(x, z, intersections) {
  let best = null;
  let bestD = Infinity;
  for (const it of intersections) {
    const d = Math.hypot(it.x - x, it.z - z);
    if (d < bestD) { bestD = d; best = it; }
  }
  return best ? { name: best.name, distance: bestD } : null;
}
