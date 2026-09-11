/**
 * The sidewalk graph: sidewalk points at every street crossing, the walkable
 * runs between them, the corner returns and the marked crossings.
 *
 * Moved out of pedestrians.js so wayfinding can route on the same graph the
 * crowd walks (#11), and so it can be unit-tested without Three.
 */
import { STREETS } from '../data/grid.js';

/** Sidewalk surface height; streets.js lays the walks on a 0.15 m curb. */
const WALK_Y = 0.15;
/** Feet drop to the asphalt while inside a crossing. */
const ROAD_Y = 0.03;

/** Relative footfall per street. Calibrated against observed sidewalk use. */
const STREET_WEIGHT = Object.freeze({
  'front-w': 2.6, 'front-e': 1.4, wellington: 1.1, king: 2.1, bremner: 1.1,
  lakeshore: 0.22, bay: 2.2, yonge: 1.5, church: 0.7, york: 1.7,
  'lower-simcoe': 0.6, rees: 0.35, john: 0.75,
});

// ---------------------------------------------------------------------------
// sidewalk graph
// ---------------------------------------------------------------------------

/**
 * Nodes are sidewalk points at street crossings; edges are the walkable
 * segments between them, the four corner links at each intersection, and the
 * marked crossings over each roadway (`cross: true`, where agents pause).
 */
export function buildStreetGraph() {
  const nodes = [];
  const edges = [];
  const byKey = new Map();

  const node = (x, z) => {
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    let n = byKey.get(key);
    if (!n) { n = { x, z, edges: [] }; byKey.set(key, n); nodes.push(n); }
    return n;
  };
  const link = (a, b, w, cross = false) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.05) return null;
    const e = { a, b, w, cross, len, y: cross ? ROAD_Y : WALK_Y };
    a.edges.push(e); b.edges.push(e); edges.push(e);
    return e;
  };

  /** The two sidewalk centrelines of every street, as parametric lines. */
  const lines = [];
  for (const s of STREETS) {
    const lo = Math.min(s.from, s.to);
    const hi = Math.max(s.from, s.to);
    if (s.axis === 'ew') {
      lines.push({ s, axis: 'ew', side: 'north', cross: s.z - s.road / 2 - s.northWalk / 2, lo, hi });
      lines.push({ s, axis: 'ew', side: 'south', cross: s.z + s.road / 2 + s.southWalk / 2, lo, hi });
    } else {
      lines.push({ s, axis: 'ns', side: 'west', cross: s.x - s.road / 2 - s.westWalk / 2, lo, hi });
      lines.push({ s, axis: 'ns', side: 'east', cross: s.x + s.road / 2 + s.eastWalk / 2, lo, hi });
    }
  }
  const at = (line, t) => (line.axis === 'ew' ? node(t, line.cross) : node(line.cross, t));

  /**
   * Union Station's forecourt and the Bay Street commute carry several times
   * the footfall of the rest of the grid; Lake Shore carries almost none.
   */
  const weightOf = (line, mid) => {
    const base = STREET_WEIGHT[line.s.id] ?? 1;
    if (line.s.id === 'front-w' && line.side === 'south' && mid > -280 && mid < 10) return 5.5;
    if (line.s.id === 'front-w' && line.side === 'north' && mid > -280 && mid < 10) return 3.2;
    if (line.s.id === 'bay' && mid < 0) return 3.6;
    return base;
  };

  for (const line of lines) {
    const ts = [line.lo, line.hi];
    for (const p of STREETS) {
      if (p.axis === line.axis) continue;
      const pCoord = p.axis === 'ew' ? p.z : p.x;
      const pLo = Math.min(p.from, p.to);
      const pHi = Math.max(p.from, p.to);
      // The perpendicular street must actually reach this sidewalk, and this
      // sidewalk must actually reach the perpendicular street.
      if (line.cross < pLo - 12 || line.cross > pHi + 12) continue;
      if (pCoord < line.lo || pCoord > line.hi) continue;
      ts.push(pCoord);
    }
    ts.sort((a, b) => a - b);
    line.nodes = [];
    for (let i = 0; i < ts.length; i++) {
      if (i && ts[i] - ts[i - 1] < 0.5) continue;
      line.nodes.push({ t: ts[i], node: at(line, ts[i]) });
    }
    for (let i = 1; i < line.nodes.length; i++) {
      const mid = (line.nodes[i - 1].t + line.nodes[i].t) / 2;
      link(line.nodes[i - 1].node, line.nodes[i].node, weightOf(line, mid));
    }
  }

  const lineFor = (id, side) => lines.find((l) => l.s.id === id && l.side === side);
  const nodeAt = (line, t) => line?.nodes.find((n) => Math.abs(n.t - t) < 0.6)?.node ?? null;

  for (const ew of STREETS.filter((s) => s.axis === 'ew')) {
    for (const ns of STREETS.filter((s) => s.axis === 'ns')) {
      const n = nodeAt(lineFor(ew.id, 'north'), ns.x);
      const s = nodeAt(lineFor(ew.id, 'south'), ns.x);
      const w = nodeAt(lineFor(ns.id, 'west'), ew.z);
      const e = nodeAt(lineFor(ns.id, 'east'), ew.z);
      const wt = Math.min(STREET_WEIGHT[ew.id] ?? 1, STREET_WEIGHT[ns.id] ?? 1);
      if (n && s) link(n, s, wt, true);   // crossing the east-west roadway
      if (w && e) link(w, e, wt, true);   // crossing the north-south roadway
      if (n && w) link(n, w, wt);         // corner returns
      if (n && e) link(n, e, wt);
      if (s && w) link(s, w, wt);
      if (s && e) link(s, e, wt);
    }
  }
  return { nodes, edges };
}
