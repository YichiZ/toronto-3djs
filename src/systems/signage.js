/**
 * Architectural, transit and storefront signage.
 *
 * EVERY piece of lettering here is drawn from scratch into a canvas at build
 * time - original type, set in system fonts, at photographic proportion. No
 * scraped wordmark, no logo artwork, no external image, no fetch. Where a real
 * identity is unmistakably a logo (the TTC roundel, GO's green livery, a
 * retailer's mark) only the words are set; the mark itself is not reproduced.
 *
 * THE HONESTY RULE (from the brief, enforced in `fasciaText()`):
 *   confidence 'reference' or 'inferred' -> the tenant's real name is set
 *   confidence 'approximated'            -> a GENERIC CATEGORY WORD is set
 * The census in src/data/tenants.js grades every unit. An approximated unit
 * holds a real frontage whose current occupant was never verified, so this
 * reconstruction refuses to paint a brand on it. That is why a walk down Front
 * Street shows "CAFE" and "PHARMACY" on some bays and real names on others.
 *
 * REAL-WORLD FACTS ENCODED HERE
 *  - Union Station's Front Street entablature carries INCISED RAILWAY NAMES.
 *    The carved frieze of Canadian destination cities is inside the Great Hall
 *    and is not this module's business. The modern "UNION STATION" identity is
 *    small, at door head height, not on the entablature.
 *  - GO Transit, UP Express and TTC wayfinding all meet at Union; the bus
 *    terminal moved to the CIBC SQUARE podium at 81 Bay in 2020-21.
 *  - Building identification downtown is restrained: letters at the parapet or
 *    over the entrance, sized to the building. Nothing here is a billboard.
 *  - PATH wayfinding is deliberately NOT built here - the interiors module owns
 *    it, and duplicating it would double-sign every concourse door.
 *
 * PERFORMANCE. Signs carry unique textures, so they cannot be instanced with
 * each other; instead each sign mesh is tagged `userData.lod = { band:'near' }`
 * so systems/lod.js hides it beyond ~260 m. Texture and material are cached per
 * (text, style), so the dozens of "CAFE" fascias share one texture and one
 * program. Blade posts and totem posts, which ARE identical, are instanced.
 */
import * as THREE from 'three';
import { INTERSECTIONS } from '../data/grid.js';
import { getBuilding } from '../data/buildings.js';
import { identifiedTenants } from '../data/tenants.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';
import { SIDEWALK_Y, streetsAt, buildType, propMaterial } from './streetFurniture.js';

// ---------------------------------------------------------------------------
// Canvas lettering
// ---------------------------------------------------------------------------

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const texCache = new Map();
const matCache = new Map();

/** @typedef {{fg?:string, bg?:string, font?:string, weight?:string, tracking?:number, ratio?:number}} SignStyle */

/**
 * Canvas texture carrying one line of original lettering, fitted to the plate.
 *
 * `ratio` is plate width / height; the canvas matches it so type is never
 * stretched. Tracking is expressed as a fraction of the cap height, which is
 * how signage letterspacing actually scales.
 *
 * @param {string} text
 * @param {SignStyle} style
 */
function textTexture(text, style = {}) {
  const {
    fg = '#f2efe6', bg = '#20242a', font = 'Helvetica, Arial, sans-serif',
    weight = '600', tracking = 0.08, ratio = 4,
  } = style;
  const key = `${text}|${fg}|${bg}|${font}|${weight}|${tracking}|${ratio}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const W = 512;
  const H = Math.max(32, Math.round(W / Math.max(0.2, ratio)));
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`signage: 2d context unavailable for "${text}"`);

  if (bg === 'transparent') ctx.clearRect(0, 0, W, H);
  else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  const label = text.toUpperCase();
  const margin = W * 0.06;
  // Binary-free fit: measure at a nominal size and scale once. Cheap and exact
  // enough, because the only thing that matters is that the line fits the plate.
  let size = H * 0.62;
  ctx.font = `${weight} ${size}px ${font}`;
  const track = size * tracking;
  const measured = ctx.measureText(label).width + track * (label.length - 1);
  const maxW = W - margin * 2;
  if (measured > maxW) size *= maxW / measured;
  ctx.font = `${weight} ${size}px ${font}`;

  const trackFinal = size * tracking;
  const lineW = ctx.measureText(label).width + trackFinal * (label.length - 1);
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  let x = (W - lineW) / 2;
  for (const ch of label) {
    ctx.fillText(ch, x, H / 2);
    x += ctx.measureText(ch).width + trackFinal;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

/**
 * A sign plate. Illuminated plates get an emissive map and
 * `userData.nightLight = true` so the time-of-day system can switch them.
 *
 * @param {string} text
 * @param {{width:number, height:number, lit?:boolean}} plate
 * @param {SignStyle} [style]
 */
export function textPlane(text, plate, style = {}) {
  const { width, height, lit = false } = plate;
  const ratio = width / height;
  const tex = textTexture(text, { ...style, ratio });
  const key = `${tex.uuid}|${lit}`;
  let mat = matCache.get(key);
  if (!mat) {
    mat = lit
      ? new THREE.MeshStandardMaterial({
          map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.3,
          roughness: 0.45, side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, side: THREE.DoubleSide });
    mat.name = `sign:${text}`;
    matCache.set(key, mat);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.userData.lod = { band: 'near' };
  if (lit) mesh.userData.nightLight = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Placement on building faces
// ---------------------------------------------------------------------------

const FACE_ROT = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };

/**
 * World transform for a sign on a building face, `t` metres along that face
 * from its centre and `y` metres above grade.
 * @returns {{x:number, y:number, z:number, ry:number, span:number}|null}
 */
function faceSpot(building, face, t, y, standoff = 0.16) {
  const b = building;
  if (!b || FACE_ROT[face] === undefined) return null;
  switch (face) {
    case 'south': return { x: b.x + t, y, z: b.z + b.d / 2 + standoff, ry: 0, span: b.w };
    case 'north': return { x: b.x - t, y, z: b.z - b.d / 2 - standoff, ry: Math.PI, span: b.w };
    case 'east': return { x: b.x + b.w / 2 + standoff, y, z: b.z - t, ry: Math.PI / 2, span: b.d };
    default: return { x: b.x - b.w / 2 - standoff, y, z: b.z + t, ry: -Math.PI / 2, span: b.d };
  }
}

/** Place a plate at a face spot. Returns the mesh, or null if the face is unknown. */
function placeOnFace(group, buildingId, face, t, y, text, plate, style) {
  const spot = faceSpot(getBuilding(buildingId), face, t, y);
  if (!spot) return null;
  const mesh = textPlane(text, plate, style);
  mesh.position.set(spot.x, spot.y, spot.z);
  mesh.rotation.y = spot.ry;
  group.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Storefront fascias
// ---------------------------------------------------------------------------

/**
 * Generic category words used where the census graded a unit 'approximated'.
 * One word, no brand, no invented operator name.
 */
const GENERIC_WORD = {
  cafe: 'CAFE', bakery: 'BAKERY', restaurant: 'RESTAURANT', bar: 'BAR', pub: 'PUB',
  retail: 'SHOP', pharmacy: 'PHARMACY', liquor: 'LIQUOR', grocery: 'GROCERY',
  bank: 'BANK', services: 'SERVICES', fitness: 'FITNESS', hotel: 'HOTEL',
  museum: 'MUSEUM', venue: 'BOX OFFICE', transit: 'TRANSIT', 'food hall': 'FOOD HALL',
  office: 'OFFICES', attraction: 'ATTRACTION', brewery: 'BREWERY',
  entertainment: 'ENTERTAINMENT', heritage: 'HERITAGE',
};

/**
 * The honesty rule, in one function: verified names get set, unverified units
 * get their category word.
 * @param {{name:string, category:string, confidence:string}} tenant
 */
export function fasciaText(tenant) {
  if (tenant.confidence === 'reference' || tenant.confidence === 'inferred') return tenant.name;
  return GENERIC_WORD[tenant.category] ?? tenant.category.toUpperCase();
}

/** Fascia plate palette: dark plate, warm lettering, lit after dark. */
const FASCIA_STYLE = { fg: '#f0e7d4', bg: '#1f2429', tracking: 0.06 };

// ---------------------------------------------------------------------------
// Building identification - restrained, at the real scale and position
// ---------------------------------------------------------------------------

/**
 * `y` is metres above grade, `width` the plate width in metres. Sizes are read
 * off each building's own elevation: parapet lettering on the arena and the
 * convention centre, entrance-canopy lettering everywhere else.
 */
const BUILDING_SIGNS = [
  { building: 'royal-york', face: 'south', t: 0, y: 8.4, width: 17, height: 1.15,
    text: 'FAIRMONT ROYAL YORK', lit: true,
    style: { fg: '#e8dcc0', bg: '#2a2822' },
    note: 'Over the Front Street porte-cochere, not on the tower.' },
  { building: 'allen-lambert-galleria', face: 'south', t: -34, y: 6.6, width: 13, height: 0.95,
    text: 'BROOKFIELD PLACE', lit: false, style: { fg: '#3a3833', bg: '#cdc7b8' },
    note: 'Etched lettering on the Galleria stone, Front Street side.' },
  { building: 'scotiabank-arena', face: 'north', t: 30, y: 24, width: 26, height: 2.0,
    text: 'SCOTIABANK ARENA', lit: true, style: { fg: '#f2f2f0', bg: '#1a2b3c' },
    note: 'Parapet lettering above the Gate 1 elevation facing the rail corridor.' },
  { building: 'mtcc-north', face: 'north', t: 0, y: 13.5, width: 24, height: 1.5,
    text: 'METRO TORONTO CONVENTION CENTRE', lit: true, style: { fg: '#eef1f3', bg: '#20303a' } },
  { building: 'meridian-hall', face: 'north', t: 0, y: 13.2, width: 14, height: 1.4,
    text: 'MERIDIAN HALL', lit: true, style: { fg: '#f4ece0', bg: '#241f22' },
    note: 'Above the cantilevered Front Street canopy. Formerly the O\'Keefe Centre / Sony Centre.' },
  { building: 'hockey-hall-of-fame', face: 'south', t: 0, y: 6.2, width: 11, height: 0.8,
    text: 'HOCKEY HALL OF FAME', lit: false, style: { fg: '#4a3f30', bg: '#c9b294' },
    note: 'Restrained plate on the 1885 freestone; the visitor entrance is in the Brookfield concourse, not here.' },
];

// ---------------------------------------------------------------------------
// Transit signage
// ---------------------------------------------------------------------------

/**
 * Freestanding transit entrance totems, in grid metres. Positions sit in the
 * sidewalk band beside the entrance they serve.
 */
const TRANSIT_TOTEMS = [
  { id: 'ttc-front-bay', x: -12, z: 16, ry: Math.PI, text: 'TTC SUBWAY', sub: 'UNION',
    note: 'Union subway station entrance on the south side of Front at Bay.' },
  { id: 'ttc-front-york', x: -258, z: 16, ry: Math.PI, text: 'TTC SUBWAY', sub: 'UNION',
    note: 'York Street entrance to the Union subway station.' },
  { id: 'ttc-bay-concourse', x: -10, z: 40, ry: -Math.PI / 2, text: 'TTC SUBWAY', sub: 'BAY CONCOURSE' },
];

/** Totem post and header box - identical at every totem, so instanced. */
const totemParts = () => [
  { geo: new THREE.BoxGeometry(0.18, 3.6, 0.18), mat: M.paintedSteel(0x2b2f33), pos: [-0.62, 1.8, 0] },
  { geo: new THREE.BoxGeometry(0.18, 3.6, 0.18), mat: M.paintedSteel(0x2b2f33), pos: [0.62, 1.8, 0] },
  { geo: new THREE.BoxGeometry(1.5, 1.05, 0.16), mat: M.paintedSteel(0x2b2f33), pos: [0, 3.15, 0] },
];

/** Street name blade post. */
const bladePostParts = () => [
  { geo: new THREE.CylinderGeometry(0.055, 0.07, 3.5, 8), mat: M.paintedSteel(0x2b2f33), pos: [0, 1.75, 0] },
  { geo: new THREE.CylinderGeometry(0.1, 0.11, 0.12, 8), mat: M.paintedSteel(0x2b2f33), pos: [0, 0.06, 0] },
];

/** "Front Street West" -> "FRONT ST W", the way a Toronto blade actually reads. */
export function bladeText(name) {
  return name
    .replace(/\bStreet\b/, 'ST')
    .replace(/\bBoulevard\b/, 'BLVD')
    .replace(/\bWest\b/, 'W')
    .replace(/\bEast\b/, 'E')
    .toUpperCase();
}

const BLADE_STYLE = { fg: '#f4f4f2', bg: '#1d5a3a', tracking: 0.05, weight: '700' };

let COUNTS = {};

/** Per-type sign counts for the QA report. */
export function counts() {
  return { ...COUNTS };
}

export function build() {
  const root = new THREE.Group();
  root.name = 'signage';
  COUNTS = {};

  // --- Union Station ---------------------------------------------------------
  const union = new THREE.Group();
  union.name = 'union-station-signage';
  const station = getBuilding('union-station');
  if (station) {
    // Incised railway names on the Front Street entablature. Stone-on-stone,
    // never lit: these are carved, not applied.
    const incised = { fg: '#8e876f', bg: '#c7bfa9', tracking: 0.16, weight: '500' };
    placeOnFace(union, 'union-station', 'north', -52, 21.6,
      'CANADIAN NATIONAL RAILWAYS', { width: 34, height: 1.5 }, incised);
    placeOnFace(union, 'union-station', 'north', 52, 21.6,
      'CANADIAN PACIFIC RAILWAY', { width: 34, height: 1.5 }, incised);
    // Modern identity, at door head height over the centre entrance.
    placeOnFace(union, 'union-station', 'north', 0, 7.8,
      'UNION STATION', { width: 9.5, height: 1.05, lit: true },
      { fg: '#f6efdd', bg: '#22262b' });
    // Concourse wayfinding either side of the head house.
    placeOnFace(union, 'union-station', 'north', -86, 6.4,
      'YORK CONCOURSE', { width: 7.5, height: 0.8, lit: true }, { fg: '#eef2f4', bg: '#1c2c38' });
    placeOnFace(union, 'union-station', 'north', 86, 6.4,
      'BAY CONCOURSE', { width: 7.5, height: 0.8, lit: true }, { fg: '#eef2f4', bg: '#1c2c38' });
    // GO and UP Express wayfinding. Words only - no livery, no logo.
    placeOnFace(union, 'union-station', 'north', -66, 4.6,
      'GO TRANSIT', { width: 5.4, height: 0.8, lit: true }, { fg: '#0f3b22', bg: '#cfe3d2' });
    placeOnFace(union, 'union-station', 'north', 66, 4.6,
      'UP EXPRESS', { width: 5.4, height: 0.8, lit: true }, { fg: '#2b1d3a', bg: '#ddd3e6' });
    placeOnFace(union, 'union-station', 'west', 0, 5.6,
      'UP EXPRESS PLATFORM', { width: 8, height: 0.75, lit: true }, { fg: '#2b1d3a', bg: '#ddd3e6' });
  }
  root.add(union);
  COUNTS['union-station'] = union.children.length;
  register({
    id: 'sign-union-station', name: 'Union Station identification and wayfinding', kind: 'prop',
    object: union, confidence: 'reference',
    source: 'Front Street elevation photography; lettering redrawn from proportion',
    note: 'The entablature carries INCISED RAILWAY NAMES only - the frieze of Canadian destination cities is inside the Great Hall and is not built here. Exact wording and spacing of the incised names is inferred.',
    data: { plates: union.children.length },
  });

  // --- GO bus terminal -------------------------------------------------------
  const terminal = new THREE.Group();
  terminal.name = 'bus-terminal-signage';
  placeOnFace(terminal, 'cibc-square-81', 'north', 0, 8.5,
    'UNION STATION BUS TERMINAL', { width: 18, height: 1.3, lit: true }, { fg: '#eaf1ec', bg: '#12341f' });
  placeOnFace(terminal, 'cibc-square-81', 'north', -20, 5.4,
    'GO TRANSIT', { width: 6.5, height: 0.9, lit: true }, { fg: '#0f3b22', bg: '#cfe3d2' });
  root.add(terminal);
  COUNTS['bus-terminal'] = terminal.children.length;
  register({
    id: 'sign-bus-terminal', name: 'Union Station Bus Terminal signage', kind: 'prop',
    object: terminal, confidence: 'reference',
    source: 'CIBC SQUARE podium terminal, opened 2020-21',
    note: 'Replaced the old GO bus terminal at 141 Bay. Words only; no GO livery or mark is reproduced.',
    data: { plates: terminal.children.length },
  });

  // --- TTC entrance totems ---------------------------------------------------
  const totems = new THREE.Group();
  totems.name = 'transit-totems';
  const totemPosts = buildType(totemParts(), TRANSIT_TOTEMS.map((t) => ({
    x: t.x, y: SIDEWALK_Y, z: t.z, ry: t.ry,
  })), { name: 'totem-post' });
  if (totemPosts) totems.add(totemPosts);
  for (const t of TRANSIT_TOTEMS) {
    const head = textPlane(t.text, { width: 1.35, height: 0.5, lit: true },
      { fg: '#f5f5f3', bg: '#2b2f33' });
    head.position.set(t.x + Math.sin(t.ry) * 0.1, SIDEWALK_Y + 3.32, t.z + Math.cos(t.ry) * 0.1);
    head.rotation.y = t.ry;
    const sub = textPlane(t.sub, { width: 1.3, height: 0.34, lit: true },
      { fg: '#20242a', bg: '#e8e5dc' });
    sub.position.set(t.x + Math.sin(t.ry) * 0.1, SIDEWALK_Y + 2.86, t.z + Math.cos(t.ry) * 0.1);
    sub.rotation.y = t.ry;
    totems.add(head, sub);
  }
  root.add(totems);
  COUNTS['ttc-entrance'] = TRANSIT_TOTEMS.length;
  register({
    id: 'sign-ttc-entrances', name: 'TTC subway entrance signage', kind: 'prop',
    object: totems, confidence: 'inferred',
    source: 'TTC entrance totem typology',
    note: 'Lettering only. The TTC roundel is a trademark and is deliberately not reproduced; entrance positions are plausible, not surveyed.',
    data: { totems: TRANSIT_TOTEMS.length },
  });

  // --- building identification ----------------------------------------------
  const idGroup = new THREE.Group();
  idGroup.name = 'building-identification';
  let idCount = 0;
  for (const s of BUILDING_SIGNS) {
    const mesh = placeOnFace(idGroup, s.building, s.face, s.t, s.y, s.text,
      { width: s.width, height: s.height, lit: s.lit }, s.style);
    if (!mesh) {
      console.warn(`[signage] building "${s.building}" not in the database; sign skipped`);
      continue;
    }
    idCount++;
  }
  root.add(idGroup);
  COUNTS['building-id'] = idCount;
  register({
    id: 'sign-building-identification', name: 'Building identification lettering', kind: 'prop',
    object: idGroup, confidence: 'inferred',
    source: 'Letter heights and positions read off each building\'s own elevation',
    note: 'Restrained plates at the real scale and position - parapet lettering on the arena and convention centre, entrance lettering elsewhere. None of these is a billboard.',
    data: { plates: idCount, buildings: BUILDING_SIGNS.map((s) => s.building) },
  });

  // --- street name blades ----------------------------------------------------
  const blades = new THREE.Group();
  blades.name = 'street-name-blades';
  const postSpots = [];
  let bladeCount = 0;
  for (const i of INTERSECTIONS) {
    const { ew, ns } = streetsAt(i);
    if (!ew || !ns) {
      console.warn(`[signage] intersection "${i.id}" has no matching street pair; blades skipped`);
      continue;
    }
    const ox = ns.road / 2 + 1.6;
    const oz = ew.road / 2 + 1.6;
    // Two diagonally opposite corners, which is how a Toronto intersection is
    // actually blade-signed: you can read both names from either approach.
    const corners = [{ sx: -1, sz: -1 }, { sx: 1, sz: 1 }];
    for (const c of corners) {
      const px = i.x + c.sx * ox;
      const pz = i.z + c.sz * oz;
      postSpots.push({ x: px, y: SIDEWALK_Y, z: pz, ry: 0 });
      // The blade naming a street runs PARALLEL to that street.
      const ewBlade = textPlane(bladeText(ew.name), { width: 2.0, height: 0.34 }, BLADE_STYLE);
      ewBlade.position.set(px + c.sx * 0.5, SIDEWALK_Y + 3.15, pz);
      blades.add(ewBlade);
      const nsBlade = textPlane(bladeText(ns.name), { width: 2.0, height: 0.34 }, BLADE_STYLE);
      nsBlade.position.set(px, SIDEWALK_Y + 2.72, pz + c.sz * 0.5);
      nsBlade.rotation.y = Math.PI / 2;
      blades.add(nsBlade);
      bladeCount += 2;
    }
  }
  const posts = buildType(bladePostParts(), postSpots, { name: 'blade-post' });
  if (posts) blades.add(posts);
  root.add(blades);
  COUNTS['street-blade'] = bladeCount;
  register({
    id: 'sign-street-blades', name: 'Street name blades', kind: 'prop', object: blades,
    confidence: 'reference', source: 'Street names from src/data/grid.js STREETS',
    note: `Both streets named at two diagonally opposite corners of all ${INTERSECTIONS.length} intersections; each blade runs parallel to the street it names. Blades are double-sided.`,
    data: { blades: bladeCount, posts: postSpots.length },
  });

  // --- storefront fascias ----------------------------------------------------
  const fascias = new THREE.Group();
  fascias.name = 'storefront-fascias';
  const tenants = identifiedTenants();
  // Group by building face so units on one frontage share it out evenly.
  const byFace = new Map();
  for (const tn of tenants) {
    const key = `${tn.buildingId}|${tn.face}`;
    const list = byFace.get(key) ?? [];
    list.push(tn);
    byFace.set(key, list);
  }

  let fasciaCount = 0;
  let genericCount = 0;
  for (const [key, list] of byFace) {
    const [buildingId, face] = key.split('|');
    const b = getBuilding(buildingId);
    if (!b) {
      console.warn(`[signage] tenant building "${buildingId}" not in the database; fascias skipped`);
      continue;
    }
    const probe = faceSpot(b, face, 0, 0);
    if (!probe) continue;
    const span = probe.span;
    const pitch = Math.min(9, span / (list.length + 0.6));
    const plateW = Math.min(6.4, pitch * 0.82);
    list.forEach((tn, i) => {
      const t = (i - (list.length - 1) / 2) * pitch;
      if (Math.abs(t) + plateW / 2 > span / 2) return; // never overhang the frontage
      const text = fasciaText(tn);
      if (text !== tn.name) genericCount++;
      const spot = faceSpot(b, face, t, 4.9);
      const mesh = textPlane(text, { width: plateW, height: 0.62, lit: true }, FASCIA_STYLE);
      mesh.position.set(spot.x, spot.y, spot.z);
      mesh.rotation.y = spot.ry;
      mesh.userData.tenant = { name: tn.name, category: tn.category, confidence: tn.confidence };
      fascias.add(mesh);
      fasciaCount++;
    });
  }
  root.add(fascias);
  COUNTS['storefront-fascia'] = fasciaCount;
  COUNTS['storefront-fascia-generic'] = genericCount;
  register({
    id: 'sign-storefront-fascias', name: 'Storefront fascia signs', kind: 'prop',
    object: fascias, confidence: 'inferred',
    source: 'src/data/tenants.js identifiedTenants()',
    note: `${fasciaCount} fascia plates, of which ${genericCount} carry a GENERIC CATEGORY WORD because the census graded that unit 'approximated'. The reconstruction never renders a brand it did not verify.`,
    data: { plates: fasciaCount, generic: genericCount, verified: fasciaCount - genericCount },
  });

  register({
    id: 'sign-path-wayfinding-excluded', name: 'PATH wayfinding (not built here)', kind: 'prop',
    confidence: 'reference', source: 'module boundary',
    note: 'PATH concourse wayfinding is owned by the interiors module. Building it here as well would double-sign every concourse door.',
  });

  return root;
}
