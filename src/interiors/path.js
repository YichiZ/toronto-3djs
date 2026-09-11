/**
 * The PATH — Toronto's below-grade pedestrian network.
 *
 * REAL-WORLD FACTS ENCODED
 *   - The PATH concourse level runs at about 3.6 m clear: floor at
 *     LEVELS.path = -6.5, finished ceiling at LEVELS.pathCeiling = -2.9. It is a
 *     LOW space, and that lowness is most of what makes it recognisable.
 *   - Wayfinding uses the four-colour PATH letterforms:
 *       P red   A orange   T blue   H yellow
 *     with the direction each letter faces encoding a compass direction. The
 *     colour order is the single most recognisable detail in the whole network.
 *   - Union Station is the hub: north under Front to the Royal York, east under
 *     Bay to Royal Bank Plaza and on to Brookfield Place and Yonge, south under
 *     the rail corridor to Scotiabank Arena, and east to CIBC SQUARE.
 *   - STREETCARS REACH UNION ENTIRELY BELOW GRADE. The 509/510 come down the
 *     Bay Street tunnel into the Union Station Loop, a below-grade curved loop
 *     platform. There is NO streetcar track at street level anywhere here — see
 *     MODULE_CONTRACT.md. The loop and the subway mezzanine are both built at
 *     this level.
 *
 * All lettering is drawn as original canvas vector lettering. Nothing is
 * scraped, fetched or traced from TTC or PATH artwork.
 */
import * as THREE from 'three';
import { LEVELS, NS } from '../data/grid.js';
import { M, variant } from '../core/materials.js';
import { storefrontBand } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';
import { tenantsFor } from '../data/tenants.js';
import { registerInterior } from '../world/index.js';

const FLOOR = LEVELS.path;            // -6.5
const CEIL = LEVELS.pathCeiling;      // -2.9
const CLEAR = CEIL - FLOOR;           // 3.6 m

const seg = (id, name, from, to, width) => ({
  id, name, from, to, width,
  metres: Math.round(Math.hypot(to.x - from.x, to.z - from.z) * 10) / 10,
});

/**
 * The reconstructed network. Node positions are inferred from the building
 * database footprints and the street grid; the real PATH wanders more than a
 * straight run between two points, so these are the spine, not the full plan.
 * @type {ReadonlyArray<{id:string,name:string,from:{x:number,z:number},to:{x:number,z:number},width:number,metres:number}>}
 */
export const PATH_SEGMENTS = Object.freeze([
  seg('path-union-north', 'Union Station north to Front Street',
    { x: -115, z: 20 }, { x: -115, z: -6 }, 14),
  seg('path-royal-york', 'Front Street to the Fairmont Royal York',
    { x: -115, z: -6 }, { x: -150, z: -22 }, 10),
  seg('path-union-east', 'Union Station east to Bay Street',
    { x: -115, z: 20 }, { x: -30, z: 20 }, 14),
  seg('path-bay-north', 'Bay Street north to Royal Bank Plaza',
    { x: -30, z: 20 }, { x: -30, z: -40 }, 12),
  seg('path-rbp-brookfield', 'Royal Bank Plaza north-east to Brookfield Place',
    { x: -30, z: -40 }, { x: 40, z: -70 }, 12),
  seg('path-brookfield-yonge', 'Brookfield Place east toward Yonge Street',
    { x: 40, z: -70 }, { x: 150, z: -70 }, 12),
  seg('path-union-arena', 'Union Station south under the rail corridor to Scotiabank Arena',
    { x: -113, z: 22 }, { x: -110, z: 205 }, 12),
  seg('path-union-cibc', 'Bay Street east to CIBC SQUARE',
    { x: -30, z: 22 }, { x: 58, z: 62 }, 12),
]);

/** Metres of PATH corridor reconstructed. Consumed by the QA report. */
export const PATH_TOTAL_METRES = Math.round(
  PATH_SEGMENTS.reduce((n, s) => n + s.metres, 0) * 10
) / 10;

/** PATH letterform colours, in order. Getting this order wrong is the tell. */
const PATH_COLOURS = Object.freeze({ P: '#e4002b', A: '#f5a300', T: '#0057a8', H: '#ffd400' });

const matCache = new Map();
const local = (key, build) => {
  let m = matCache.get(key);
  if (!m) { m = build(); m.name = `path:${key}`; matCache.set(key, m); }
  return m;
};

function canvas2d(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('path: 2d canvas context unavailable');
  return { canvas: c, ctx };
}

const texFrom = (canvas) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
};

/** Draw the four-colour PATH mark. Each letter sits in its own coloured tile. */
function drawPathMark(ctx, x, y, size) {
  const letters = ['P', 'A', 'T', 'H'];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  letters.forEach((ch, i) => {
    const cx = x + i * size;
    ctx.fillStyle = PATH_COLOURS[ch];
    ctx.fillRect(cx, y, size - size * 0.06, size);
    ctx.fillStyle = ch === 'H' || ch === 'A' ? '#1b1b1b' : '#ffffff';
    ctx.font = `bold ${Math.round(size * 0.74)}px Helvetica, Arial, sans-serif`;
    ctx.fillText(ch, cx + (size - size * 0.06) / 2, y + size * 0.54);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** Overhead directional sign: the mark plus destinations and arrows. */
function directionSignTexture(rows) {
  const { canvas, ctx } = canvas2d(1024, 256);
  ctx.fillStyle = '#f4f2ec';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = '#c9c5ba';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 1018, 250);
  drawPathMark(ctx, 24, 74, 46);
  ctx.font = 'bold 34px Helvetica, Arial, sans-serif';
  rows.forEach((r, i) => {
    const y = 88 + i * 62;
    ctx.fillStyle = '#20242a';
    ctx.fillText(r[0], 250, y);
    // arrow drawn as vector geometry, not a glyph
    const ax = 940;
    const dir = r[1];
    ctx.beginPath();
    if (dir === 'left') { ctx.moveTo(ax - 34, y - 12); ctx.lineTo(ax, y - 32); ctx.lineTo(ax, y + 8); }
    else if (dir === 'right') { ctx.moveTo(ax + 34, y - 12); ctx.lineTo(ax, y - 32); ctx.lineTo(ax, y + 8); }
    else { ctx.moveTo(ax, y - 34); ctx.lineTo(ax - 20, y + 2); ctx.lineTo(ax + 20, y + 2); }
    ctx.closePath();
    ctx.fillStyle = '#20242a';
    ctx.fill();
  });
  return texFrom(canvas);
}

/** Floor-level directory pylon face. */
function pylonTexture() {
  const { canvas, ctx } = canvas2d(512, 1024);
  ctx.fillStyle = '#1a1e24';
  ctx.fillRect(0, 0, 512, 1024);
  drawPathMark(ctx, 72, 60, 88);
  ctx.fillStyle = '#f2f0e9';
  ctx.font = 'bold 40px Helvetica, Arial, sans-serif';
  ctx.fillText('DIRECTORY', 72, 246);
  ctx.font = '30px Helvetica, Arial, sans-serif';
  const list = [
    'Union Station', 'Fairmont Royal York', 'Royal Bank Plaza',
    'Brookfield Place', 'Hockey Hall of Fame', 'Scotiabank Arena',
    'CIBC SQUARE', 'Union Station Bus Terminal', 'Union Subway Station',
    'Union Station Streetcar Loop',
  ];
  ctx.fillStyle = '#b9c2cb';
  list.forEach((s, i) => ctx.fillText(s, 72, 316 + i * 52));
  return texFrom(canvas);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
function place(im, i, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  im.setMatrixAt(i, _m.compose(_p.set(px, py, pz), _q.setFromEuler(_e), _s.set(sx, sy, sz)));
}

const signMaterial = (rows, key) =>
  local(key, () => {
    const map = directionSignTexture(rows);
    return new THREE.MeshStandardMaterial({
      map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.75,
      roughness: 0.6, side: THREE.DoubleSide,
    });
  });

/**
 * One corridor. Built in local space running along +X from the origin, then
 * rotated onto the segment bearing — so every corridor shares one construction
 * path and the storefronts always face inward.
 */
/**
 * Where another corridor meets this one, and on which side.
 *
 * Segments are authored as straight runs between shared points, so a spur that
 * starts on a trunk's centreline puts its own side wall straight across the
 * trunk. Rather than trimming every segment by hand, each corridor asks which
 * others touch it and leaves a gap in the wall on that side.
 *
 * @returns {Array<{c:number, w:number}>} opening centres along the local X axis
 */
function junctionOpenings(s, len, dz) {
  const ux = (s.to.x - s.from.x) / len;
  const uz = (s.to.z - s.from.z) / len;
  const toLocal = (p) => {
    const px = p.x - s.from.x;
    const pz = p.z - s.from.z;
    return { x: px * ux + pz * uz, z: -px * uz + pz * ux };
  };
  const out = [];
  for (const b of PATH_SEGMENTS) {
    if (b.id === s.id) continue;
    const ends = [[b.from, b.to], [b.to, b.from]];
    for (const [meet, away] of ends) {
      const m = toLocal(meet);
      if (m.x < -1 || m.x > len + 1) continue;          // not alongside this run
      // Half-widths, not the full width: m.z is measured from THIS corridor's
      // centreline, so its own wall is at s.width / 2. Comparing against the
      // full width accepted endpoints entirely outside the corridor and would
      // have cut an opening onto nothing.
      if (Math.abs(m.z) > s.width / 2 + b.width / 2) continue;
      // Only open the wall the other corridor actually heads through.
      const a = toLocal(away);
      if (Math.sign(a.z - m.z) !== Math.sign(dz)) continue;
      out.push({ c: Math.max(0, Math.min(len, m.x)), w: b.width + 1.2 });
    }
  }
  return out;
}

/** Solid spans of a side wall, i.e. the wall minus its junction openings. */
function wallSpans(s, len, dz) {
  const gaps = junctionOpenings(s, len, dz)
    .map((o) => [Math.max(0, o.c - o.w / 2), Math.min(len, o.c + o.w / 2)])
    .sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = 0;
  for (const [a, b] of gaps) {
    if (a > cursor + 0.3) spans.push({ mid: (cursor + a) / 2, len: a - cursor });
    cursor = Math.max(cursor, b);
  }
  if (len > cursor + 0.3) spans.push({ mid: (cursor + len) / 2, len: len - cursor });
  return spans;
}

function corridor(s, tenantKey) {
  const g = new THREE.Group();
  g.name = s.id;
  const len = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z);
  const half = s.width / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(len, s.width), M.pathFloor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(len / 2, FLOOR, 0);
  floor.receiveShadow = true;
  g.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(len, s.width), M.ceilingPanel());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(len / 2, CEIL, 0);
  g.add(ceil);

  // Side walls, broken by an opening wherever another corridor meets this one.
  // Built as one solid box per side, a T-junction was walled off: a walker could
  // cross a single segment but never turn a corner, so the "network" was eight
  // disconnected tubes. Openings make it actually connected.
  for (const dz of [-half, half]) {
    for (const span of wallSpans(s, len, dz)) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(span.len, CLEAR, 0.35), M.concretePlain());
      wall.position.set(span.mid, FLOOR + CLEAR / 2, dz);
      wall.receiveShadow = true;
      g.add(wall);
    }
  }

  // Recessed fluorescent troffers — instanced, emissive, and the only light.
  const N = Math.max(2, Math.round(len / 5.5));
  const troffers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.6, 0.07, 0.55),
    local('troffer', () => new THREE.MeshBasicMaterial({ color: 0xf7f5ea })),
    N * 2
  );
  let ti = 0;
  for (let i = 0; i < N; i++) {
    for (const dz of [-half * 0.5, half * 0.5]) {
      place(troffers, ti++, (len / N) * (i + 0.5), CEIL - 0.1, dz);
    }
  }
  troffers.instanceMatrix.needsUpdate = true;
  g.add(troffers);

  // Glazed shop windows, scaled to the 3.6 m clear height.
  const tenants = tenantsFor(tenantKey.building, tenantKey.face);
  let units = 0;
  if (len > 26) {
    for (const [dz, rotY] of [[-half + 0.3, 0], [half - 0.3, Math.PI]]) {
      const { group: band, bays } = storefrontBand({
        width: len - 14, height: 3.05, bayWidth: 7.0, glass: 0x243139,
      });
      const wall = new THREE.Group();
      wall.add(band);
      const fascia = new THREE.Mesh(
        new THREE.BoxGeometry(len - 14, 0.5, 0.4),
        local('fascia', () => new THREE.MeshStandardMaterial({
          color: 0xeae7df, roughness: 0.8, emissive: 0xd2d6da, emissiveIntensity: 0.3,
        }))
      );
      fascia.position.set(0, 3.32, 0.2);
      wall.add(fascia);

      bays.forEach((bay, i) => {
        const tenant = tenants[(i + (rotY ? 1 : 0)) % Math.max(1, tenants.length)];
        const hit = new THREE.Mesh(
          new THREE.BoxGeometry(bay.width - 0.5, 2.8, 0.6),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hit.position.set(bay.x, 1.5, 0.7);
        registerInteractive(hit, {
          building: `PATH — ${s.name}`,
          address: 'PATH concourse level',
          tenant: tenant?.name ?? 'PATH retail unit',
          category: tenant?.category ?? 'retail',
          confidence: tenant?.confidence ?? 'approximated',
          note: tenant?.note ?? 'PATH retail turns over frequently; the frontage is reconstructed, the operator is not asserted.',
        });
        wall.add(hit);
        units++;
      });
      wall.position.set(len / 2, FLOOR, dz);
      wall.rotation.y = rotY;
      g.add(wall);
    }
  }

  // Hung directional signage, one per ~40 m.
  const signs = Math.max(1, Math.round(len / 40));
  for (let i = 0; i < signs; i++) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      signMaterial([[s.name.toUpperCase().slice(0, 34), 'ahead'], ['UNION STATION', 'left']], `sign:${s.id}`)
    );
    sign.position.set((len / (signs + 1)) * (i + 1), CEIL - 0.75, 0);
    g.add(sign);
    const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), M.steelDark());
    hanger.position.set(sign.position.x, CEIL - 0.28, 0);
    g.add(hanger);
  }

  // Floor directory pylon at the far end.
  const pylon = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.3, 0.28),
    local('pylon', () => {
      const map = pylonTexture();
      return new THREE.MeshStandardMaterial({
        map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5,
      });
    })
  );
  pylon.position.set(len - 4, FLOOR + 1.15, half - 1.6);
  g.add(pylon);

  // Rotate onto the segment bearing: local +X must land on (dx, dz).
  const theta = Math.atan2(-(s.to.z - s.from.z), s.to.x - s.from.x);
  g.position.set(s.from.x, 0, s.from.z);
  g.rotation.y = theta;
  return { group: g, units };
}

/** Raked ribbed slab escalator. */
function escalator({ rise, run, width = 1.6 }) {
  const g = new THREE.Group();
  const len = Math.hypot(rise, run);
  const angle = Math.atan2(rise, run);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, len), M.steelDark());
  slab.rotation.x = -angle;
  slab.position.set(0, rise / 2, run / 2);
  g.add(slab);
  const RIBS = Math.max(8, Math.round(len / 0.42));
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(width - 0.24, 0.06, 0.3), M.steelWhite(), RIBS);
  for (let i = 0; i < RIBS; i++) {
    const t = (i + 0.5) / RIBS;
    place(ribs, i, 0, rise * t + 0.2 * Math.cos(angle), run * t, -angle);
  }
  ribs.instanceMatrix.needsUpdate = true;
  g.add(ribs);
  return g;
}

/** Straight stair with instanced treads. */
function stair({ rise, run, width = 3.0 }) {
  const g = new THREE.Group();
  const steps = Math.max(6, Math.round(rise / 0.175));
  const treadDepth = run / steps;
  const treads = new THREE.InstancedMesh(new THREE.BoxGeometry(width, 0.16, treadDepth), M.concretePlain(), steps);
  for (let i = 0; i < steps; i++) {
    place(treads, i, 0, (rise / steps) * (i + 1) - 0.08, treadDepth * (i + 0.5));
  }
  treads.instanceMatrix.needsUpdate = true;
  g.add(treads);
  return g;
}

/** Glass-car elevator from the PATH level to the street. */
function elevator(x, z) {
  const g = new THREE.Group();
  const glass = local('liftGlass', () => new THREE.MeshPhysicalMaterial({
    color: 0xd6e4ec, roughness: 0.06, transmission: 0.7, thickness: 0.05,
    // FrontSide, not DoubleSide: see glazingClear in core/materials.js (#60).
    transparent: true, opacity: 0.4, side: THREE.FrontSide,
  }));
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.6, -FLOOR + 0.4, 2.6), glass);
  shaft.position.set(x, FLOOR + (-FLOOR + 0.4) / 2, z);
  g.add(shaft);
  const car = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.4, 2.1), M.steelWhite());
  car.position.set(x, FLOOR + 1.25, z);
  g.add(car);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 3.0), M.steelWhite());
  cap.position.set(x, 0.5, z);
  g.add(cap);
  return g;
}

/**
 * UNION STATION LOOP — the below-grade streetcar terminal.
 * The 509/510 arrive through the Bay Street tunnel; nothing surfaces. The loop
 * is a curved single-track balloon around an island platform.
 */
function buildStreetcarLoop() {
  const g = new THREE.Group();
  g.name = 'path-union-streetcar-loop';
  const cx = -22;
  const cz = 30;
  const R = 17;
  const y = FLOOR - 0.4;   // track slab sits just below the concourse floor

  // A private variant: writing side onto the shared material would flip every
  // other concrete surface in the city to back-facing.
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(R * 2 + 16, 5.2, R * 2 + 16),
    variant(M.concretePlain(), { side: THREE.BackSide })   // we are inside it
  );
  box.position.set(cx, y + 2.6, cz);
  // A back-facing shell renders as nothing from outside, so colliding with it
  // from outside is an invisible wall. This 50 m box straddles the Bay Street
  // PATH run and dammed it 10 m in. Let the walker pass through into the room.
  box.userData.noCollide = true;
  g.add(box);

  // two rails as flattened tori — a real 1.495 m TTC gauge
  const railMat = M.steelDark();
  for (const r of [R - 0.75, R + 0.75]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 96), railMat);
    rail.rotation.x = -Math.PI / 2;
    rail.position.set(cx, y + 0.07, cz);
    g.add(rail);
  }

  // curved island platform inside the loop
  const platform = new THREE.Mesh(
    new THREE.RingGeometry(R - 9, R - 2.2, 48, 1, Math.PI * 0.15, Math.PI * 1.6),
    M.pathFloor()
  );
  platform.rotation.x = -Math.PI / 2;
  platform.position.set(cx, y + 0.32, cz);
  platform.receiveShadow = true;
  g.add(platform);

  const edge = new THREE.Mesh(new THREE.TorusGeometry(R - 2.2, 0.16, 6, 64, Math.PI * 1.6), M.paintedSteel(0xb8a03a));
  edge.rotation.x = -Math.PI / 2;
  edge.rotation.z = -Math.PI * 0.15;
  edge.position.set(cx, y + 0.42, cz);
  g.add(edge);

  // ceiling and its troffers
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(R + 8, 40), M.ceilingPanel());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, y + 5.0, cz);
  g.add(ceil);
  const LAMPS = 16;
  const lamps = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.2, 0.07, 0.5),
    local('troffer', () => new THREE.MeshBasicMaterial({ color: 0xf7f5ea })),
    LAMPS
  );
  for (let i = 0; i < LAMPS; i++) {
    const a = (i / LAMPS) * Math.PI * 2;
    place(lamps, i, cx + Math.cos(a) * (R - 5), y + 4.9, cz + Math.sin(a) * (R - 5), 0, -a);
  }
  lamps.instanceMatrix.needsUpdate = true;
  g.add(lamps);

  // Bay Street tunnel portal, heading north under Bay. NOTHING surfaces here.
  const portal = new THREE.Mesh(
    new THREE.BoxGeometry(9.0, 4.6, 1.2),
    local('portal', () => new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.9 }))
  );
  portal.position.set(NS.bay - 8, y + 2.3, cz - R - 7.4);
  g.add(portal);
  const tunnel = new THREE.Mesh(
    new THREE.BoxGeometry(8.2, 4.4, 34),
    variant(M.concretePlain(), { side: THREE.BackSide })
  );
  tunnel.userData.noCollide = true;   // same reason as the loop shell above
  tunnel.position.set(NS.bay - 8, y + 2.2, cz - R - 24);
  g.add(tunnel);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(20, 3.0, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(cx, y + 1.7, cz + R - 6);
  registerInteractive(hit, {
    building: 'Union Station Streetcar Loop',
    address: 'below grade, Bay Street tunnel',
    tenant: 'TTC 509 Harbourfront / 510 Spadina — Union Station Loop',
    category: 'transit',
    confidence: 'reference',
    note: 'Streetcars reach Union entirely below grade through the Bay Street tunnel. There is no surface streetcar track on Front Street.',
  });
  g.add(hit);

  g.add(new THREE.AmbientLight(0xdde3e9, 0.5));
  return g;
}

/** The corridor the subway mezzanine has to sit beside rather than on. */
export const MEZZANINE_CORRIDOR_ID = 'path-bay-north';

/**
 * The subway mezzanine's footprint, placed against the Bay Street corridor's
 * east edge rather than on top of it.
 *
 * Hardcoded at cx = -8 the room spanned x -30..14, so its west wall landed
 * exactly on the corridor centreline (x = -30) and split the 12 m corridor
 * lengthwise: a walker heading north hit that wall head-on 10 m in and the
 * segment was 22% traversable. Derived from the segment, the room stays adjacent
 * and connected - the doorway in its west wall opens onto the corridor - and the
 * two cannot drift back into each other if either moves.
 *
 * Exported so the regression test can assert against the geometry actually
 * built, instead of a copy of these numbers.
 */
export const MEZZANINE = (() => {
  const w = 44;
  const d = 18;
  const bay = PATH_SEGMENTS.find((s) => s.id === MEZZANINE_CORRIDOR_ID);
  // `width` is a cross-section; on this north-south run it reads as an x-extent.
  const northSouth = bay ? Math.abs(bay.to.x - bay.from.x) < 1e-6 : false;
  const eastEdge = bay && northSouth
    ? bay.from.x + bay.width / 2
    : (bay ? Math.max(bay.from.x, bay.to.x) + bay.width / 2 : -24);
  return Object.freeze({ cx: eastEdge + w / 2, cz: 8, w, d });
})();

/** Union subway station mezzanine, with the fare line and stairs to the platform. */
function buildSubwayMezzanine() {
  const g = new THREE.Group();
  g.name = 'path-union-subway-mezzanine';
  const { cx, cz, w, d } = MEZZANINE;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.pathFloor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, FLOOR, cz);
  floor.receiveShadow = true;
  g.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.ceilingPanel());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, CEIL, cz);
  g.add(ceil);

  // Walls with a doorway in the middle of each side. Built solid, the mezzanine
  // was a sealed box that the Bay Street PATH run terminated against - a walker
  // heading north stopped 16 m in against a room they could see into but never
  // enter. A mezzanine has openings on every side; so does this one.
  const DOOR = 6;
  for (const [bw, bd, dx, dz] of [[w, 0.4, 0, -d / 2], [w, 0.4, 0, d / 2], [0.4, d, -w / 2, 0], [0.4, d, w / 2, 0]]) {
    const alongX = bw > bd;
    const span = alongX ? bw : bd;
    const piece = (span - DOOR) / 2;
    if (piece <= 0.2) continue;                      // wall shorter than its doorway
    for (const sign of [-1, 1]) {
      const off = sign * (DOOR / 2 + piece / 2);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? piece : bw, CLEAR, alongX ? bd : piece),
        M.concretePlain()
      );
      wall.position.set(cx + dx + (alongX ? off : 0), FLOOR + CLEAR / 2, cz + dz + (alongX ? 0 : off));
      g.add(wall);
    }
  }

  // fare gates, instanced
  const GATES = 10;
  const gates = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.35, 1.05, 1.5), M.paintedSteel(0x3a4249), GATES
  );
  const readers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.3, 0.25, 0.4),
    local('reader', () => new THREE.MeshStandardMaterial({
      color: 0x1c8a4a, emissive: 0x1c8a4a, emissiveIntensity: 0.8, roughness: 0.5,
    })),
    GATES
  );
  for (let i = 0; i < GATES; i++) {
    const x = cx - 9 + i * 2.0;
    place(gates, i, x, FLOOR + 0.55, cz);
    place(readers, i, x, FLOOR + 1.15, cz);
  }
  gates.instanceMatrix.needsUpdate = true;
  readers.instanceMatrix.needsUpdate = true;
  g.add(gates, readers);

  // stairs down to the subway platform, which lives below this module
  const down = stair({ rise: 5.2, run: 7.0, width: 4.0 });
  down.position.set(cx + 14, FLOOR - 5.2, cz + 3);
  g.add(down);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(22, 2.6, 3), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(cx, FLOOR + 1.3, cz - 1.6);
  registerInteractive(hit, {
    building: 'Union Subway Station',
    address: 'Line 1 Yonge-University, below Union Station',
    tenant: 'Union subway station mezzanine',
    category: 'transit',
    confidence: 'reference',
    note: 'Fare-paid mezzanine between the PATH concourse and the Line 1 platforms.',
  });
  g.add(hit);

  g.add(new THREE.AmbientLight(0xdfe5ea, 0.5));
  return g;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) { // eslint-disable-line no-unused-vars
  const root = new THREE.Group();
  root.name = 'path-network';

  const TENANT_KEYS = {
    'path-union-north': { building: 'union-station', face: 'north' },
    'path-royal-york': { building: 'royal-york', face: 'south' },
    'path-union-east': { building: 'union-station', face: 'east' },
    'path-bay-north': { building: 'royal-bank-plaza-s', face: 'west' },
    'path-rbp-brookfield': { building: 'allen-lambert-galleria', face: 'south' },
    'path-brookfield-yonge': { building: 'brookfield-heritage-facades', face: 'south' },
    'path-union-arena': { building: 'scotiabank-arena', face: 'north' },
    'path-union-cibc': { building: 'cibc-square-81', face: 'west' },
  };

  // Four streaming clusters. Each corridor is parented to the cluster nearest its
  // midpoint, so a walker only ever pays for the part of the network they are
  // standing in — registering one shared group four times would let the last
  // check win and strand the whole network on one radius.
  const CLUSTERS = [
    { id: 'path-cluster-union', name: 'PATH — Union Station cluster', centre: { x: -105, y: FLOOR + 1.5, z: 16 } },
    { id: 'path-cluster-bay', name: 'PATH — Bay Street cluster', centre: { x: -25, y: FLOOR + 1.5, z: -10 } },
    { id: 'path-cluster-brookfield', name: 'PATH — Brookfield Place cluster', centre: { x: 90, y: FLOOR + 1.5, z: -70 } },
    { id: 'path-cluster-south', name: 'PATH — south of the corridor cluster', centre: { x: -60, y: FLOOR + 1.5, z: 150 } },
  ].map((c) => ({ ...c, group: new THREE.Group() }));
  for (const c of CLUSTERS) {
    c.group.name = c.id;
    root.add(c.group);
  }
  const nearestCluster = (x, z) =>
    CLUSTERS.reduce((best, c) =>
      Math.hypot(c.centre.x - x, c.centre.z - z) < Math.hypot(best.centre.x - x, best.centre.z - z) ? c : best);

  let totalUnits = 0;
  for (const s of PATH_SEGMENTS) {
    const { group, units } = corridor(s, TENANT_KEYS[s.id]);
    totalUnits += units;
    nearestCluster((s.from.x + s.to.x) / 2, (s.from.z + s.to.z) / 2).group.add(group);
    register({
      id: s.id, name: `PATH — ${s.name}`, kind: 'infrastructure', object: group,
      confidence: 'inferred',
      source: 'PATH network topology; alignment inferred from building footprints and the street grid',
      note: `${s.metres} m of ${s.width} m corridor at ${FLOOR} m, ${CLEAR.toFixed(1)} m clear. The real corridor wanders more than this straight run.`,
      data: { metres: s.metres, width: s.width, from: s.from, to: s.to },
    });
  }

  // Vertical circulation up to street level and to the Union concourses.
  const vertical = new THREE.Group();
  vertical.name = 'path-vertical-circulation';
  // Each way up or down is tagged for the HUD's nearby strip (#15): where it is
  // (halfway along its run) and which two floors it joins.
  const access = (kind, x, z, highY, highName) =>
    ({ kind, x, z, lowY: FLOOR, highY, lowName: 'the PATH', highName });
  const up1 = escalator({ rise: LEVELS.unionConcourse - FLOOR, run: 5.0 });
  up1.position.set(-108, FLOOR, 24);
  up1.userData.access = access('Escalator', -108, 24 + 2.5, LEVELS.unionConcourse, 'the concourses');
  vertical.add(up1);
  const up2 = escalator({ rise: -FLOOR, run: 9.5 });
  up2.position.set(-98, FLOOR, 16);
  up2.userData.access = access('Escalator', -98, 16 + 4.75, 0, 'street level');
  vertical.add(up2);
  const st1 = stair({ rise: LEVELS.unionConcourse - FLOOR, run: 4.2, width: 3.6 });
  st1.position.set(-40, FLOOR, 24);
  st1.userData.access = access('Stairs', -40, 24 + 2.1, LEVELS.unionConcourse, 'the concourses');
  vertical.add(st1);
  const st2 = stair({ rise: -FLOOR, run: 8.4, width: 3.6 });
  st2.position.set(38, FLOOR, -66);
  st2.userData.access = access('Stairs', 38, -66 + 4.2, 0, 'street level');
  vertical.add(st2);
  for (const [x, z] of [[-112, 12], [44, -74]]) {
    const lift = elevator(x, z);
    lift.userData.access = access('Lift', x, z, 0, 'street level');
    vertical.add(lift);
  }
  nearestCluster(-108, 16).group.add(vertical);

  const loop = buildStreetcarLoop();
  const mezz = buildSubwayMezzanine();
  nearestCluster(-22, 30).group.add(loop);
  nearestCluster(-8, 8).group.add(mezz);

  register({
    id: 'path-network', name: 'PATH pedestrian network', kind: 'infrastructure', object: root,
    confidence: 'inferred',
    source: 'PATH topology around Union Station',
    note: `${PATH_TOTAL_METRES} m of corridor reconstructed across ${PATH_SEGMENTS.length} segments. This is the spine only — the real network is roughly 30 km citywide.`,
    data: { totalMetres: PATH_TOTAL_METRES, segments: PATH_SEGMENTS.length, retailUnits: totalUnits, floorY: FLOOR, clearHeight: CLEAR },
  });
  register({
    id: 'path-wayfinding', name: 'PATH wayfinding signage', kind: 'system',
    confidence: 'reference',
    source: 'four-colour PATH letterforms drawn as original canvas lettering',
    note: 'Colour order P red, A orange, T blue, H yellow. Hung directional signs plus floor directory pylons.',
    data: { colours: PATH_COLOURS },
  });
  register({
    id: 'path-union-streetcar-loop', name: 'Union Station Streetcar Loop', kind: 'infrastructure',
    object: loop, confidence: 'reference',
    source: 'below-grade balloon loop reached by the Bay Street streetcar tunnel',
    note: 'Streetcars reach Union entirely below grade. NO surface streetcar track on Front Street. Loop radius and platform geometry are approximated.',
  });
  register({
    id: 'path-union-subway-mezzanine', name: 'Union Subway Station mezzanine', kind: 'infrastructure',
    object: mezz, confidence: 'inferred',
    source: 'Line 1 Yonge-University mezzanine below Union Station',
    note: 'Mezzanine extent approximated; the platforms themselves are below this module and are not reconstructed.',
  });
  register({
    id: 'path-vertical-circulation', name: 'PATH stairs, escalators and elevators', kind: 'infrastructure',
    object: vertical, confidence: 'approximated',
    source: 'circulation points inferred from corridor endpoints',
    note: 'Two escalators, two stairs and two elevators connect the PATH to the Union concourses (-3.5) and to street level (0). Positions approximated.',
  });

  for (const c of CLUSTERS) {
    register({
      id: c.id, name: c.name, kind: 'interior', object: c.group,
      confidence: 'inferred',
      source: 'PATH corridors grouped for proximity streaming',
      note: 'Streaming cluster, not a real named space; corridors are assigned to the cluster nearest their midpoint.',
    });
    registerInterior({ id: c.id, group: c.group, centre: c.centre, radius: 80 });
  }

  return root;
}
