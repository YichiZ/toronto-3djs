/**
 * CIBC SQUARE, 81 and 141 Bay Street (WilkinsonEyre / Adamson Associates).
 *
 * Two towers straddling the rail corridor at Bay Street, joined by a park built
 * on a deck over the tracks. Facts this module encodes:
 *   - 81 Bay (2021, 49 storeys) sits SOUTH of the corridor. Its podium is the
 *     Union Station Bus Terminal, which replaced the old GO terminal at
 *     141 Bay in 2020-21; buses enter and leave through portals in the podium,
 *     and the passenger hall behind them is fully glazed.
 *   - 141 Bay (2024, 50 storeys) is the NORTHERN tower, on the old terminal site.
 *   - THE PARK AT CIBC SQUARE spans the corridor between them on a structural
 *     deck at roughly y = 11. It is NOT Rail Deck Park - that was a separate,
 *     much larger City proposal further west, cancelled in 2021. The confusion
 *     is the single most common error about this site, so both the geometry and
 *     the registry note say so explicitly.
 *
 * Trains keep running underneath; nothing here may close the corridor void.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { tenantsFor } from '../data/tenants.js';
import { CORRIDOR } from '../data/grid.js';
import { M } from '../core/materials.js';
import { massing, storefrontBand, roofPlant, ringGeometry } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const GLASS = { glass: '#8fb6cc', spandrel: '#3a444d' };
/** Park deck soffit clears the catenary-free corridor with room for a train. */
const DECK_Y = 11;

/** Instanced run of identical boxes along one axis, centred on the parent. */
function run({ geo, material, count, spacing, axis, at, y, cast = true }) {
  const im = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  const span = (count - 1) * spacing;
  for (let i = 0; i < count; i++) {
    const t = -span / 2 + i * spacing;
    im.setMatrixAt(i, m.makeTranslation(axis === 'x' ? t : at, y, axis === 'x' ? at : t));
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = cast;
  im.receiveShadow = cast;
  return im;
}

/** Ground-floor frontage with one raycast volume per bay. */
function frontage({ parent, buildingId, buildingName, address, face, width, position, rotationY = 0 }) {
  const tenants = tenantsFor(buildingId, face);
  const { group, bays } = storefrontBand({ width, height: 5.4, bayWidth: 8 });
  const holder = new THREE.Group();
  holder.add(group);
  bays.forEach((bay, i) => {
    const tn = tenants[i % tenants.length];
    const hit = new THREE.Mesh(box(bay.width - 0.4, 4.4, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(bay.x, 2.3, 0.7);
    registerInteractive(hit, {
      building: buildingName, address, tenant: tn.name, category: tn.category,
      confidence: tn.confidence, note: tn.note ?? '',
    });
    holder.add(hit);
  });
  holder.position.copy(position);
  holder.rotation.y = rotationY;
  parent.add(holder);
  return bays.length;
}

/**
 * Shared tower language: a glazed shaft under a stepped, faceted crown. The
 * crown steps are what distinguish these two from every other Bay Street slab,
 * so they are modelled as real setbacks rather than painted on.
 */
function tower({ width, depth, height, floors }) {
  const g = new THREE.Group();
  const crownH = Math.min(30, height * 0.13);
  const shaftH = height - crownH;
  const shaftFloors = Math.round(floors * (shaftH / height));

  const shaft = massing({ width, depth, height: shaftH, floors: shaftFloors, kind: 'curtain', palette: GLASS });
  g.add(shaft);

  // Four stepped facets, each inset and slid grid-north, so the crown leans and
  // the silhouette changes as you walk Bay Street.
  const steps = 4;
  let w = width;
  let d = depth;
  let y = shaftH;
  for (let i = 0; i < steps; i++) {
    const h = crownH / steps;
    w -= width * 0.09;
    d -= depth * 0.06;
    const slab = massing({ width: w, depth: d, height: h, floors: 2, kind: 'curtain', palette: GLASS });
    slab.position.set(0, y + h / 2, -depth * 0.03 * (i + 1));
    g.add(slab);
    y += h;
  }
  g.userData.topY = y;
  g.add(roofPlant({ width: w * 0.7, depth: d * 0.7, y, seed: Math.round(width) }));
  return g;
}

/**
 * The bus terminal podium. Buses arrive off the Bay Street ramps on the west
 * side and turn into the portals; passengers wait in the glazed hall behind.
 */
function busTerminal(width, depth, height) {
  const g = new THREE.Group();
  g.name = 'cibc-bus-terminal';

  const shell = new THREE.Mesh(box(width, height, depth), M.concrete());
  shell.position.y = height / 2;
  shell.castShadow = true;
  shell.receiveShadow = true;
  g.add(shell);

  // Vehicle portals: deep dark reveals, sized for an intercity coach.
  const portalGeo = box(1.2, 5.6, 6.4);
  g.add(run({
    geo: portalGeo, material: M.paintedSteel(0x14181c), count: 5, spacing: 9,
    axis: 'z', at: -width / 2 + 0.2, y: 2.8, cast: false,
  }));
  // Matching portals on the north face, where the buses leave toward the ramps.
  const outGeo = box(6.4, 5.6, 1.2);
  g.add(run({
    geo: outGeo, material: M.paintedSteel(0x14181c), count: 3, spacing: 10,
    axis: 'x', at: -depth / 2 + 0.2, y: 2.8, cast: false,
  }));

  // Glazed passenger hall wrapping the north-west corner, above the portals.
  const hallN = new THREE.Mesh(box(width * 0.72, height - 8, 1.0), M.glazingClear());
  hallN.position.set(-width * 0.1, height - (height - 8) / 2 - 1.5, -depth / 2 - 0.4);
  const hallW = new THREE.Mesh(box(1.0, height - 8, depth * 0.6), M.glazingClear());
  hallW.position.set(-width / 2 - 0.4, height - (height - 8) / 2 - 1.5, -depth * 0.12);
  g.add(hallN, hallW);

  // Mullion rhythm on the hall, instanced.
  const mull = box(0.22, height - 8, 0.3);
  g.add(run({
    geo: mull, material: M.steelWhite(), count: Math.round(width * 0.72 / 3),
    spacing: 3, axis: 'x', at: -depth / 2 - 0.7, y: height - (height - 8) / 2 - 1.5, cast: false,
  }));

  const cap = new THREE.Mesh(box(width + 1.2, 0.9, depth + 1.2), M.concretePlain());
  cap.position.y = height + 0.45;
  cap.castShadow = true;
  g.add(cap);
  return g;
}

/**
 * The Park at CIBC SQUARE: a landscaped deck on transfer trusses spanning the
 * live rail corridor. Clipped to the corridor so the deck never lands on track.
 */
function elevatedPark(b) {
  const g = new THREE.Group();
  g.name = 'the-park-cibc';
  // The deck structure keeps its own group, and its own registry entry: it is
  // an air-rights bridge over live railway, not landscape.
  const structure = new THREE.Group();
  structure.name = 'cibc-park-deck';
  g.add(structure);

  // Trusses span grid-north/south across the corridor, carried at each end.
  const trussCount = Math.floor(b.w / 6);
  const trussGeo = box(0.8, 2.6, b.d);
  structure.add(run({
    geo: trussGeo, material: M.steelDark(), count: trussCount, spacing: b.w / trussCount,
    axis: 'x', at: 0, y: DECK_Y - 1.6,
  }));
  // Diagonal web, one instanced set, alternating lean - cheap but it reads.
  const webGeo = box(0.35, 3.4, 0.35);
  const web = new THREE.InstancedMesh(webGeo, M.steelDark(), trussCount * 6);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  let i = 0;
  for (let t = 0; t < trussCount; t++) {
    const x = -b.w / 2 + (b.w / trussCount) * (t + 0.5);
    for (let k = 0; k < 6; k++) {
      p.set(x, DECK_Y - 1.6, -b.d / 2 + (b.d / 6) * (k + 0.5));
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), k % 2 ? 0.6 : -0.6);
      web.setMatrixAt(i++, m.compose(p, q, s));
    }
  }
  web.instanceMatrix.needsUpdate = true;
  web.castShadow = true;
  structure.add(web);

  const deck = new THREE.Mesh(box(b.w, 0.7, b.d), M.concrete());
  deck.position.y = DECK_Y - 0.35;
  deck.receiveShadow = true;
  deck.castShadow = true;
  structure.add(deck);

  // Landscape: lawn panel, two paved paths crossing it, planting beds.
  const lawn = new THREE.Mesh(box(b.w - 8, 0.25, b.d - 14), M.grass());
  lawn.position.set(0, DECK_Y + 0.12, 0);
  lawn.receiveShadow = true;
  g.add(lawn);

  const pathNS = new THREE.Mesh(box(6, 0.3, b.d - 4), M.forecourt());
  pathNS.position.set(-b.w * 0.22, DECK_Y + 0.15, 0);
  const pathEW = new THREE.Mesh(box(b.w - 4, 0.3, 5), M.forecourt());
  pathEW.position.set(0, DECK_Y + 0.15, b.d * 0.22);
  pathNS.receiveShadow = pathEW.receiveShadow = true;
  g.add(pathNS, pathEW);

  // Planting beds and their low walls, instanced.
  const bedGeo = box(9, 0.9, 5);
  g.add(run({
    geo: bedGeo, material: M.foliage(), count: 6, spacing: (b.d - 20) / 6,
    axis: 'z', at: b.w * 0.28, y: DECK_Y + 0.65, cast: false,
  }));
  const wallGeo = ringGeometry(10, 6, 0.4, 0.7);
  g.add(run({
    geo: wallGeo, material: M.concretePlain(), count: 6, spacing: (b.d - 20) / 6,
    axis: 'z', at: b.w * 0.28, y: DECK_Y + 0.35, cast: false,
  }));

  // Glazed wind screens along both long edges. A deck 11 m up over an open
  // corridor is unusable without them, and they are visually load-bearing.
  const screenGeo = box(0.12, 2.6, b.d - 6);
  for (const side of [-1, 1]) {
    const screen = new THREE.Mesh(screenGeo, M.glazingClear());
    screen.position.set(side * (b.w / 2 - 0.5), DECK_Y + 1.4, 0);
    g.add(screen);
  }
  const postGeo = box(0.25, 2.8, 0.25);
  for (const side of [-1, 1]) {
    g.add(run({
      geo: postGeo, material: M.steelWhite(), count: 12, spacing: (b.d - 6) / 12,
      axis: 'z', at: side * (b.w / 2 - 0.5), y: DECK_Y + 1.5, cast: false,
    }));
  }
  g.userData.structure = structure;
  return g;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) {
  const root = new THREE.Group();
  root.name = 'cibc-square';
  let frontages = 0;

  // --- 81 Bay Street, south of the corridor ---------------------------------
  const b81 = getBuilding('cibc-square-81');
  const g81 = new THREE.Group();
  g81.name = 'cibc-square-81';
  g81.position.set(b81.x, 0, b81.z);

  const podiumH = 26;
  const podium = busTerminal(b81.w + 16, b81.d + 14, podiumH);
  podium.position.set(-4, 0, -6);
  g81.add(podium);

  const t81 = tower({ width: b81.w, depth: b81.d, height: b81.height - podiumH, floors: b81.floors - 6 });
  t81.position.set(4, podiumH, 6);
  g81.add(t81);
  root.add(g81);

  frontages += frontage({
    parent: g81, buildingId: b81.id, buildingName: b81.name, address: b81.address, face: 'north',
    width: b81.w, position: new THREE.Vector3(-4, 0, -(b81.d + 14) / 2 - 6.2), rotationY: Math.PI,
  });
  frontages += frontage({
    parent: g81, buildingId: b81.id, buildingName: b81.name, address: b81.address, face: 'west',
    width: b81.d, position: new THREE.Vector3(-(b81.w + 16) / 2 - 4.2, 0, 8), rotationY: -Math.PI / 2,
  });

  // --- 141 Bay Street, north of the corridor --------------------------------
  const b141 = getBuilding('cibc-square-141');
  const g141 = new THREE.Group();
  g141.name = 'cibc-square-141';
  g141.position.set(b141.x, 0, b141.z);

  const p141H = 20;
  const p141 = new THREE.Mesh(box(b141.w + 12, p141H, b141.d + 10), M.glassCool());
  p141.position.y = p141H / 2;
  p141.castShadow = true;
  p141.receiveShadow = true;
  g141.add(p141);
  const p141Cap = new THREE.Mesh(box(b141.w + 13, 0.8, b141.d + 11), M.concretePlain());
  p141Cap.position.y = p141H + 0.4;
  g141.add(p141Cap);

  const t141 = tower({ width: b141.w, depth: b141.d, height: b141.height - p141H, floors: b141.floors - 5 });
  t141.position.y = p141H;
  g141.add(t141);
  root.add(g141);

  frontages += frontage({
    parent: g141, buildingId: b141.id, buildingName: b141.name, address: b141.address, face: 'north',
    width: b141.w, position: new THREE.Vector3(0, 0, -(b141.d + 10) / 2 - 0.2), rotationY: Math.PI,
  });

  // --- the park over the tracks ---------------------------------------------
  const bPark = getBuilding('the-park-cibc');
  const park = elevatedPark(bPark);
  park.position.set(bPark.x, 0, bPark.z);
  root.add(park);

  register({
    id: 'cibc-square-81', name: b81.name, kind: 'landmark', object: g81,
    confidence: 'reference',
    source: 'footprint and storey count from the building database; massing proportion from photographic reference',
    note: b81.note,
    data: { address: b81.address, height: b81.height, floors: b81.floors, completed: 2021, frontages },
  });
  register({
    id: 'cibc-square-141', name: b141.name, kind: 'landmark', object: g141,
    confidence: 'reference',
    note: 'The northern tower, on the site of the GO bus terminal it replaced. Same crown language as 81 Bay, one storey taller in count and lower in metres.',
    data: { address: b141.address, height: b141.height, floors: b141.floors, completed: 2024 },
  });
  register({
    id: 'the-park-cibc', name: 'The Park at CIBC SQUARE', kind: 'landmark', object: park,
    confidence: 'reference',
    note: 'Elevated one-acre park on a structural deck over the live rail corridor between 81 and 141 Bay, soffit near y=11. NOT Rail Deck Park: that was a separate, much larger City of Toronto proposal to deck the corridor west of the Rogers Centre, cancelled in 2021 after the OMB/LPAT ruling on the air rights. Planting layout here is inferred.',
    data: { deckY: DECK_Y, corridor: { north: CORRIDOR.north, south: CORRIDOR.south } },
  });
  register({
    id: 'cibc-bus-terminal', name: 'Union Station Bus Terminal', kind: 'infrastructure', object: podium,
    confidence: 'reference',
    note: 'Occupies the 81 Bay podium; opened 2020-21 replacing the terminal at 141 Bay. Bay level and platform count are approximated - only the portals, the glazed hall and the massing are reconstructed.',
    data: { address: '81 Bay Street' },
  });
  register({
    id: 'cibc-park-deck', name: 'Park deck transfer structure', kind: 'infrastructure',
    object: park.userData.structure,
    confidence: 'inferred',
    note: 'Truss depth and spacing are inferred from the span and the required clearance over unelectrified track; no published section was used.',
  });

  root.userData.frontages = frontages;
  return root;
}
