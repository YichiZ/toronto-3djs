/**
 * Routing on the sidewalk graph (#11, its "later" half).
 *
 * The same graph the crowd walks (systems/streetGraph.js): sidewalks, corner
 * returns and marked crossings, so a route crosses a road only where people do.
 * Both ends snap onto their nearest sidewalk - never onto a crossing - and
 * Dijkstra runs on edge length. The HUD re-routes from where the walker is on
 * every tick, so straying needs no special case: the next route simply starts
 * from wherever they are.
 *
 * ponytail: street level only, and an O(n^2) Dijkstra with a linear scan for
 * the next node - a few hundred nodes, well under a millisecond at 4 Hz. A heap
 * and a cross-level graph (PATH, concourses, their stairs) come with routing
 * below grade.
 *
 * Pure, so `npm test` covers it without WebGL.
 */
import { buildStreetGraph } from '../systems/streetGraph.js';

let cached = null;
/** The sidewalk graph, built once. */
export const streetGraph = () => (cached ??= buildStreetGraph());

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

/** The sidewalk edge nearest a point - crossings excluded, nobody starts in the road. */
export function nearestEdge(graph, p) {
  let best = null;
  for (const e of graph.edges) {
    if (e.cross) continue;
    const q = onEdge(e, p);
    if (!best || q.d < best.d) best = q;
  }
  return best;
}

/**
 * Shortest walk from `from` to `to` over the graph.
 *
 * @returns {{points: {x:number, z:number}[], length: number}} the polyline from
 *   the walker, onto the sidewalk, corner by corner, off it to the destination
 */
export function route(graph, from, to) {
  const a = { x: from.x, z: from.z };
  const b = { x: to.x, z: to.z };
  const s = nearestEdge(graph, from);
  const t = nearestEdge(graph, to);
  if (!s || !t) return { points: [a, b], length: Math.hypot(b.x - a.x, b.z - a.z) };
  const start = { x: s.x, z: s.z };
  const end = { x: t.x, z: t.z };
  const head = s.d;
  const tail = t.d;
  if (s.edge === t.edge) {
    return { points: [a, start, end, b], length: head + Math.abs(t.t - s.t) * s.edge.len + tail };
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
  if (!bestNode) return { points: [a, b], length: Math.hypot(b.x - a.x, b.z - a.z) };
  const corners = [];
  for (let n = bestNode; n; n = prev.get(n)) corners.unshift({ x: n.x, z: n.z });
  return { points: [a, start, ...corners, end, b], length: head + best + tail };
}

/** Where the arrow points: the first route point more than `ahead` metres away. */
export function nextWaypoint(points, pos, ahead = 4) {
  for (let i = 1; i < points.length; i++) {
    if (Math.hypot(points[i].x - pos.x, points[i].z - pos.z) > ahead) return points[i];
  }
  return points[points.length - 1];
}
