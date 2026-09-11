/**
 * Routing for the wayfinding guide (#11): along the sidewalks, and down into
 * the PATH and back up.
 *
 * Two floors, one graph. The street is the graph the crowd walks
 * (systems/streetGraph.js): sidewalks, corner returns and marked crossings, so
 * a route crosses a road only where people do. The PATH is its corridors, end
 * to end. They are joined by the stairs, escalators and lifts path.js tags
 * `userData.access` - each one a single edge between its foot and its head.
 * Both ends of a route snap onto their nearest edge ON THEIR OWN FLOOR - never
 * onto a crossing - and Dijkstra runs on length. The HUD re-routes from where
 * the walker is on every tick, so straying needs no special case.
 *
 * ponytail: street and PATH only - the concourses have no walkable graph, so a
 * concourse destination keeps the straight line. A level change is a flat
 * LEVEL_CHANGE_COST rather than a timed climb. And Dijkstra scans linearly for
 * the next node: a few hundred nodes, well under a millisecond at 4 Hz.
 *
 * Pure, so `npm test` covers it without WebGL.
 */
import { buildStreetGraph } from '../systems/streetGraph.js';
import { LEVELS } from '../data/grid.js';

export const STREET_FLOOR = 0;
export const PATH_FLOOR = LEVELS.path;
/** An edge within this of a floor is on it: sidewalks sit on a 0.15 m curb. */
const SAME_FLOOR = 2;
/** Floors within this of the street or the PATH can be routed from or to. */
const ON_ROUTABLE = 1.5;
/**
 * Metres a stair or lift costs on top of nothing: the climb, the wait. Without
 * it a route would duck through the PATH to save half a block.
 */
export const LEVEL_CHANGE_COST = 30;
/** An access point further than this from any corridor or sidewalk joins nothing. */
const ACCESS_REACH = 25;

let cached = null;
/** The sidewalk graph, built once. */
export const streetGraph = () => (cached ??= buildStreetGraph());

/** True for the floors the walk graph covers: the street and the PATH. */
export const routable = (y) =>
  Math.abs(y - STREET_FLOOR) < ON_ROUTABLE || Math.abs(y - PATH_FLOOR) < ON_ROUTABLE;

function link(a, b, y, edges, len = Math.hypot(b.x - a.x, b.z - a.z)) {
  if (len < 0.05) return null;
  const e = { a, b, len, y, cross: false };
  a.edges.push(e); b.edges.push(e); edges.push(e);
  return e;
}

/** PATH corridors as a graph, ends within 2 m merged into one junction. */
export function pathGraph(segments) {
  const nodes = [];
  const edges = [];
  const byKey = new Map();
  const node = (p) => {
    const key = `${Math.round(p.x / 2)},${Math.round(p.z / 2)}`;
    let n = byKey.get(key);
    if (!n) { n = { x: p.x, z: p.z, edges: [] }; byKey.set(key, n); nodes.push(n); }
    return n;
  };
  for (const s of segments) link(node(s.from), node(s.to), PATH_FLOOR, edges);
  return { nodes, edges };
}

/**
 * Street and PATH, joined wherever a stair, escalator or lift runs between them.
 *
 * @param {{pathSegments?: {from:{x,z}, to:{x,z}}[], access?: {x,z,lowY,highY}[]}} src
 */
export function buildWalkGraph({ pathSegments = [], access = [] } = {}) {
  const street = buildStreetGraph();
  const path = pathGraph(pathSegments);
  const graph = { nodes: [...street.nodes, ...path.nodes], edges: [...street.edges, ...path.edges] };
  for (const a of access) {
    if (Math.abs(a.lowY - PATH_FLOOR) > SAME_FLOOR || Math.abs(a.highY - STREET_FLOOR) > SAME_FLOOR) continue;
    const below = nearestEdge(path, a, PATH_FLOOR);
    const above = nearestEdge(street, a, STREET_FLOOR);
    if (!below || !above || below.d > ACCESS_REACH || above.d > ACCESS_REACH) continue;
    const foot = { x: a.x, z: a.z, edges: [], access: a };
    const head = { x: a.x, z: a.z, edges: [], access: a };
    graph.nodes.push(foot, head);
    // Connectors from the climb to the corners either side. Walkable, but never
    // snapped onto: a walker on the sidewalk is on the sidewalk, not on a
    // diagonal to a lift door.
    for (const e of [
      link(foot, below.edge.a, PATH_FLOOR, graph.edges),
      link(foot, below.edge.b, PATH_FLOOR, graph.edges),
      link(head, above.edge.a, above.edge.y, graph.edges),
      link(head, above.edge.b, above.edge.y, graph.edges),
    ]) if (e) e.connector = true;
    // The climb itself: no floor of its own, so nothing ever snaps onto it.
    link(foot, head, null, graph.edges, LEVEL_CHANGE_COST);
  }
  return graph;
}

/** Closest point of an edge to p, and its fraction along a -> b. */
function onEdge(e, p) {
  const vx = e.b.x - e.a.x;
  const vz = e.b.z - e.a.z;
  const len2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - e.a.x) * vx + (p.z - e.a.z) * vz) / len2));
  const x = e.a.x + vx * t;
  const z = e.a.z + vz * t;
  return { edge: e, t, x, z, d: Math.hypot(p.x - x, p.z - z) };
}

/**
 * The walkable edge nearest a point: never a crossing, a climb or a connector
 * to one, and - when a floor is given - only on that floor.
 */
export function nearestEdge(graph, p, floorY) {
  let best = null;
  for (const e of graph.edges) {
    if (e.cross || e.y === null || e.connector) continue;
    if (floorY !== undefined && e.y !== undefined && Math.abs(e.y - floorY) > SAME_FLOOR) continue;
    const q = onEdge(e, p);
    if (!best || q.d < best.d) best = q;
  }
  return best;
}

/**
 * Shortest walk from `from` to `to` over the graph.
 *
 * @param {{fromY?: number, toY?: number}} [floors] the floor each end is on
 * @returns {{points: {x:number, z:number, access?: object}[], length: number}}
 *   the polyline from the walker, onto the graph, corner by corner, off it to
 *   the destination; a point with `access` is the foot or head of a climb
 */
export function route(graph, from, to, { fromY, toY } = {}) {
  const a = { x: from.x, z: from.z };
  const b = { x: to.x, z: to.z };
  const straight = { points: [a, b], length: Math.hypot(b.x - a.x, b.z - a.z) };
  const s = nearestEdge(graph, from, fromY);
  const t = nearestEdge(graph, to, toY);
  if (!s || !t) return straight;
  const start = { x: s.x, z: s.z };
  const end = { x: t.x, z: t.z };
  if (s.edge === t.edge) {
    return { points: [a, start, end, b], length: s.d + Math.abs(t.t - s.t) * s.edge.len + t.d };
  }

  const dist = new Map([[s.edge.a, s.t * s.edge.len], [s.edge.b, (1 - s.t) * s.edge.len]]);
  const goal = new Map([[t.edge.a, t.t * t.edge.len], [t.edge.b, (1 - t.t) * t.edge.len]]);
  const prev = new Map();
  const done = new Set();
  let best = Infinity;
  let bestNode = null;
  for (;;) {
    let n = null;
    let nd = Infinity;
    for (const [k, v] of dist) if (!done.has(k) && v < nd) { n = k; nd = v; }
    if (!n || nd >= best) break;
    done.add(n);
    if (goal.has(n) && nd + goal.get(n) < best) { best = nd + goal.get(n); bestNode = n; }
    for (const e of n.edges) {
      const m = e.a === n ? e.b : e.a;
      const alt = nd + e.len;
      if (alt < (dist.get(m) ?? Infinity)) { dist.set(m, alt); prev.set(m, n); }
    }
  }
  if (!bestNode) return straight;
  const corners = [];
  for (let n = bestNode; n; n = prev.get(n)) {
    corners.unshift(n.access ? { x: n.x, z: n.z, access: n.access } : { x: n.x, z: n.z });
  }
  return { points: [a, start, ...corners, end, b], length: s.d + best + t.d };
}

/** Where the arrow points: the first route point more than `ahead` metres away. */
export function nextWaypoint(points, pos, ahead = 4) {
  for (let i = 1; i < points.length; i++) {
    if (Math.hypot(points[i].x - pos.x, points[i].z - pos.z) > ahead) return points[i];
  }
  return points[points.length - 1];
}
