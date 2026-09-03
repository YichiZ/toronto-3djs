/**
 * The street grid, authored in grid metres from the Front & Bay origin.
 *
 * WHY METRES AND NOT LAT/LON: block-to-block spacing and street widths are what
 * make the scene read as Toronto; a rigid-body error in the absolute geo anchor
 * does not. Authoring the grid in metres keeps it internally consistent and lets
 * `localToGeo` emit WGS84 for every node, rather than accumulating independent
 * per-intersection guesses. Confidence is recorded per figure.
 *
 * Axes:  +X grid east (toward Yonge/Church)   -Z grid north (toward King)
 */

/** Centreline offsets of the north-south streets, metres grid-east of Bay. */
export const NS = Object.freeze({
  church: 370,
  yonge: 185,
  bay: 0,
  york: -270,
  lowerSimcoe: -440,
  rees: -600,
  john: -700,
});

/** Centreline offsets of the east-west streets, metres grid-south of Front. */
export const EW = Object.freeze({
  king: -300,
  wellington: -160,
  front: 0,
  bremner: 250,
  lakeShore: 380,
});

/** Vertical layering. Y = 0 is the Front & Bay street datum. */
export const LEVELS = Object.freeze({
  path: -6.5,            // PATH concourse floor
  pathCeiling: -2.9,
  unionConcourse: -3.5,  // York / Bay / VIA concourse floors
  street: 0,
  viaductDeck: 6.5,      // rail deck over the Bay/York/Yonge/Lower Simcoe underpasses
  platform: 7.0,
  skywalk: 9.0,
  gardinerDeck: 12.0,
});

/**
 * Rail corridor extent, metres grid-south of Front Street centreline.
 * These are the WIDEST figures - the Union Station throat, where 14-plus tracks
 * fan out across the block.
 *
 * The north edge is the head house's SOUTH WALL, not the north edge of the
 * block. Union Station's head house stands between Front Street and the tracks;
 * putting the corridor any further north drives the viaduct straight through
 * the Great Hall. z=70 is the head house record's south face (z 24..68) plus
 * clearance, and it is also the train shed record's north face.
 */
export const CORRIDOR = Object.freeze({ north: 70, south: 200 });

/**
 * Corridor edges at a given grid-east position. The throat holds full width
 * through the station and narrows west of York; without that taper the CN Tower
 * and the Rogers Centre would stand on the tracks.
 * @returns {{north:number, south:number}}
 */
export function corridorAt(x) {
  if (x >= -300) return { north: CORRIDOR.north, south: CORRIDOR.south };
  if (x <= -700) return { north: 50, south: 82 };
  const t = (-300 - x) / 400; // 0 at x=-300, 1 at x=-700
  return {
    north: CORRIDOR.north + (50 - CORRIDOR.north) * t,
    south: CORRIDOR.south + (82 - CORRIDOR.south) * t,
  };
}

/**
 * Roadway widths (curb to curb) and sidewalk widths per side, in metres.
 * `southWalk` / `northWalk` are for east-west streets; `eastWalk` / `westWalk`
 * for north-south streets. Front Street's south walk is the wide revitalised
 * promenade in front of the station.
 */
export const STREETS = Object.freeze([
  { id: 'front-w', name: 'Front Street West', axis: 'ew', z: EW.front, from: NS.john, to: NS.bay,
    road: 20, northWalk: 6.5, southWalk: 14, lanes: 4, oneWay: false,
    note: 'No surface streetcar track on Front within the boundary.' },
  { id: 'front-e', name: 'Front Street East', axis: 'ew', z: EW.front, from: NS.bay, to: NS.church,
    road: 18, northWalk: 6, southWalk: 8, lanes: 4, oneWay: false },
  { id: 'wellington', name: 'Wellington Street West', axis: 'ew', z: EW.wellington, from: NS.york, to: NS.church,
    road: 13, northWalk: 5, southWalk: 5, lanes: 3, oneWay: true, flow: 1 },
  { id: 'king', name: 'King Street West', axis: 'ew', z: EW.king, from: NS.john, to: NS.church,
    road: 14, northWalk: 6, southWalk: 6, lanes: 2, oneWay: false,
    note: 'King Street Transit Priority Corridor - streetcars run here, not on Front.' },
  { id: 'bremner', name: 'Bremner Boulevard', axis: 'ew', z: EW.bremner, from: NS.john, to: NS.york,
    road: 16, northWalk: 6, southWalk: 6, lanes: 4, oneWay: false,
    note: 'Bremner ends at York Street - it does not continue east to Bay, where Scotiabank Arena and Maple Leaf Square occupy the block.' },
  { id: 'lakeshore', name: 'Lake Shore Boulevard West', axis: 'ew', z: EW.lakeShore, from: NS.john, to: NS.church,
    road: 30, northWalk: 5, southWalk: 5, lanes: 8, oneWay: false,
    note: 'Gardiner Expressway deck runs above at y=+12.' },

  { id: 'bay', name: 'Bay Street', axis: 'ns', x: NS.bay, from: EW.king, to: EW.lakeShore,
    road: 17, eastWalk: 6, westWalk: 6, lanes: 4, oneWay: false,
    note: 'Passes under the rail viaduct; streetcar tunnel to the Union Loop is below grade.' },
  { id: 'yonge', name: 'Yonge Street', axis: 'ns', x: NS.yonge, from: EW.king, to: EW.lakeShore,
    road: 14, eastWalk: 6, westWalk: 6, lanes: 3, oneWay: false },
  { id: 'church', name: 'Church Street', axis: 'ns', x: NS.church, from: EW.king, to: EW.lakeShore,
    road: 12, eastWalk: 4.5, westWalk: 4.5, lanes: 2, oneWay: false },
  { id: 'york', name: 'York Street', axis: 'ns', x: NS.york, from: EW.king, to: EW.lakeShore,
    road: 16, eastWalk: 6, westWalk: 6, lanes: 4, oneWay: false,
    note: 'York Street rail underpass.' },
  { id: 'lower-simcoe', name: 'Lower Simcoe Street', axis: 'ns', x: NS.lowerSimcoe, from: EW.front, to: EW.lakeShore,
    road: 12, eastWalk: 4.5, westWalk: 4.5, lanes: 2, oneWay: false,
    note: 'Simcoe Street ENDS at Front. Lower Simcoe runs south through the 2009 Simcoe Street Tunnel.' },
  { id: 'rees', name: 'Rees Street', axis: 'ns', x: NS.rees, from: EW.bremner, to: EW.lakeShore,
    road: 11, eastWalk: 4, westWalk: 4, lanes: 2, oneWay: false },
  { id: 'john', name: 'John Street', axis: 'ns', x: NS.john, from: EW.king, to: EW.bremner,
    road: 12, eastWalk: 5, westWalk: 5, lanes: 2, oneWay: false },
]);

/** Named intersections, derived rather than independently guessed. */
export const INTERSECTIONS = Object.freeze(
  [
    ['front-bay', 'Front & Bay', NS.bay, EW.front],
    ['front-yonge', 'Front & Yonge', NS.yonge, EW.front],
    ['front-church', 'Front & Church', NS.church, EW.front],
    ['front-york', 'Front & York', NS.york, EW.front],
    ['front-simcoe', 'Front & Simcoe', NS.lowerSimcoe, EW.front],
    ['wellington-bay', 'Wellington & Bay', NS.bay, EW.wellington],
    ['wellington-yonge', 'Wellington & Yonge', NS.yonge, EW.wellington],
    ['wellington-york', 'Wellington & York', NS.york, EW.wellington],
    ['king-bay', 'King & Bay', NS.bay, EW.king],
    ['king-yonge', 'King & Yonge', NS.yonge, EW.king],
    ['king-york', 'King & York', NS.york, EW.king],
    ['bremner-york', 'Bremner & York', NS.york, EW.bremner],
    ['bremner-simcoe', 'Bremner & Lower Simcoe', NS.lowerSimcoe, EW.bremner],
    ['lakeshore-bay', 'Lake Shore & Bay', NS.bay, EW.lakeShore],
    ['lakeshore-york', 'Lake Shore & York', NS.york, EW.lakeShore],
    ['lakeshore-simcoe', 'Lake Shore & Lower Simcoe', NS.lowerSimcoe, EW.lakeShore],
  ].map(([id, name, x, z]) => Object.freeze({ id, name, x, z }))
);

/** The four streets that pass UNDER the rail viaduct. Simcoe is Lower Simcoe. */
export const UNDERPASSES = Object.freeze([
  { street: 'bay', x: NS.bay, width: 17, note: 'Bay Street underpass' },
  { street: 'york', x: NS.york, width: 16, note: 'York Street underpass' },
  { street: 'yonge', x: NS.yonge, width: 14, note: 'Yonge Street underpass' },
  { street: 'lower-simcoe', x: NS.lowerSimcoe, width: 12, note: 'Simcoe Street Tunnel, opened 2009' },
]);

export const getStreet = (id) => STREETS.find((s) => s.id === id) ?? null;
export const getIntersection = (id) => INTERSECTIONS.find((i) => i.id === id) ?? null;

/** Total width of a street corridor including both sidewalks. */
export function corridorWidth(street) {
  const a = street.axis === 'ew' ? street.northWalk : street.eastWalk;
  const b = street.axis === 'ew' ? street.southWalk : street.westWalk;
  return street.road + a + b;
}

/** Half-width of the roadway, used for curb placement and vehicle lanes. */
export const halfRoad = (street) => street.road / 2;
