/**
 * What the walk-mode minimap draws (issue #7), as plain primitives.
 *
 * The plan follows the level the walker is on - the street grid and footprints
 * at grade; below it the PATH spine or the concourse rooms, above it the deck
 * you are standing on - with the streets and buildings dimmed underneath so
 * you can still place yourself. Heading-up, GTA style: the projection turns
 * the map so the walker's forward direction is up, `heading` 0 meaning grid
 * north (-Z) and reproducing the old north-up map exactly. Ticks mark where
 * true and grid north went.
 *
 * Pure: minimap.js owns the canvas, so `npm test` covers everything here.
 */
import { STREETS, CORRIDOR } from '../data/grid.js';
import { BUILDINGS, footprint } from '../data/buildings.js';
import { trueToGrid } from '../core/geo.js';
import { PATH_SEGMENTS } from '../interiors/path.js';
import { ROOMS } from '../interiors/concourses.js';
import { SKYWALK_PATH, SKYWALK_WIDTH } from '../world/skywalk.js';
import { GARDINER_DECK } from '../world/gardiner.js';
import { CORRIDOR_X } from '../world/railCorridor.js';

/** Metres across the visible map. About two blocks each way from the walker. */
export const VIEW_METRES = 240;

/** Every level the walker can be on, as controls.level names them. */
export const LEVEL_PLANS = Object.freeze(['PATH', 'concourse', 'street', 'viaduct deck', 'platform', 'SkyWalk', 'Gardiner deck']);

const streetLines = (style) => STREETS.map((s) => ({
  kind: 'line', style, width: s.road,
  points: s.axis === 'ew'
    ? [{ x: s.from, z: s.z }, { x: s.to, z: s.z }]
    : [{ x: s.x, z: s.from }, { x: s.x, z: s.to }],
}));

const buildingRects = (dim) => BUILDINGS.map((b) => {
  const f = footprint(b);
  return { kind: 'rect', x0: f.minX, z0: f.minZ, x1: f.maxX, z1: f.maxZ, style: dim ? 'buildingDim' : (b.landmark ? 'landmark' : 'building') };
});

const rect = (x0, z0, x1, z1, style) => ({ kind: 'rect', x0, z0, x1, z1, style });

/**
 * The primitives for one level: `{kind:'rect', x0, z0, x1, z1, style}` or
 * `{kind:'line', points:[{x,z}], width, style}`, in grid metres. An unknown
 * level gets the street plan rather than nothing.
 *
 * @param {string} level
 */
export function planFor(level) {
  const atGrade = level === 'street' || !LEVEL_PLANS.includes(level);
  const base = [...streetLines(atGrade ? 'street' : 'streetDim'), ...buildingRects(!atGrade)];
  switch (level) {
    case 'PATH':
      return [...base, ...PATH_SEGMENTS.map((s) => ({ kind: 'line', style: 'path', width: s.width, points: [s.from, s.to] }))];
    case 'concourse':
      return [...base, ...ROOMS.map((r) => rect(r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2, 'room'))];
    case 'viaduct deck':
    case 'platform':
      return [...base, rect(CORRIDOR_X.west, CORRIDOR.north, CORRIDOR_X.east, CORRIDOR.south, 'deck')];
    case 'SkyWalk':
      return [...base, { kind: 'line', style: 'deck', width: SKYWALK_WIDTH, points: SKYWALK_PATH.map((p) => ({ x: p.x, z: p.z })) }];
    case 'Gardiner deck':
      return [...base, rect(GARDINER_DECK.west, GARDINER_DECK.z - GARDINER_DECK.width / 2,
        GARDINER_DECK.east, GARDINER_DECK.z + GARDINER_DECK.width / 2, 'deck')];
    default:
      return base;
  }
}

/**
 * The camera's forward direction as a map heading in radians: 0 facing grid
 * north (-Z), growing clockwise. Feed it `camera.getWorldDirection()` x and z.
 */
export function headingOf(dirX, dirZ) {
  return Math.atan2(dirX, -dirZ);
}

/** Turn a map offset (x right, y down) by -heading, so the heading points up. */
function turn(x, y, heading) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { x: x * c + y * s, y: -x * s + y * c };
}

/**
 * Grid position to map pixels, centred on `centre` and turned so `heading` is
 * up. At heading 0 that is grid north up: +x right, grid south (+z) down. A
 * centre carrying its own `heading` (the minimap's view) supplies the default.
 */
export function worldToMap(x, z, centre, sizePx, viewM = VIEW_METRES, heading = centre.heading ?? 0) {
  const k = sizePx / viewM;
  const t = turn((x - centre.x) * k, (z - centre.z) * k, heading);
  return { x: sizePx / 2 + t.x, y: sizePx / 2 + t.y };
}

/** Inverse of {@link worldToMap}: map pixels back to grid metres. */
export function mapToWorld(px, py, centre, sizePx, viewM = VIEW_METRES, heading = centre.heading ?? 0) {
  const k = sizePx / viewM;
  const t = turn(px - sizePx / 2, py - sizePx / 2, -heading);
  return { x: centre.x + t.x / k, z: centre.z + t.y / k };
}

/**
 * True north as a unit direction on the map (x right, y down). The grid is
 * turned 16.7 degrees off true, so on a grid-north-up map true north leans
 * that far clockwise; on a heading-up map it turns with everything else.
 */
export function trueNorthOnMap(heading = 0) {
  const g = trueToGrid(0, -1);            // true north: x = true east, z = true south
  return turn(g.x, g.z, heading);
}

/** Grid north (-Z) as a unit direction on the map, for the second tick. */
export function gridNorthOnMap(heading = 0) {
  return turn(0, -1, heading);
}

/**
 * The viewpoint whose dot is under a map pixel, within `radiusPx`, or null.
 * The nearest wins when two dots are close.
 */
export function pickViewpoint(px, py, viewpoints, centre, sizePx, radiusPx = 7, viewM = VIEW_METRES, heading = centre.heading ?? 0) {
  let best = null;
  let bestD = radiusPx;
  for (const v of viewpoints) {
    const m = worldToMap(v.position.x, v.position.z, centre, sizePx, viewM, heading);
    const d = Math.hypot(m.x - px, m.y - py);
    if (d <= bestD) { bestD = d; best = v; }
  }
  return best;
}
