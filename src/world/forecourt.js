/**
 * Front Street forecourt — the promenade in front of Union Station.
 *
 * Facts this module encodes:
 *  - Front Street West's SOUTH sidewalk is 14 m wide here (grid.js, 'front-w'),
 *    the widest walk downtown. The revitalisation paved it as a granite-banded
 *    pedestrian promenade running the whole length of the head house, from Bay
 *    (x ≈ -30) west past the building's end (x = -241) to York (x = -270).
 *  - The head house STOPS at x = -241. The 29 m between it and York is not
 *    building: it is plaza and the vehicle ramps down to the station's
 *    below-grade drop-off. That gap is filled here, not by unionStation.js.
 *  - The streetcars are BELOW GRADE. They reach the Union Station Loop through
 *    the Bay Street tunnel, so the Loop appears up here only as a stair
 *    headhouse on the Bay end. There is NO surface track on Front Street and
 *    none is laid by this module. (MODULE_CONTRACT.md, "Hallucination traps".)
 *  - The Monument to Multiculturalism, Francesco Perilli's bronze, stands on
 *    the forecourt near the station's Bay end. Its exact metre-level placement
 *    is inferred and flagged in the registry.
 *
 * Benches, litter bins and transit shelters are deliberately absent — street
 * furniture is systems/streetFurniture.js's job, not this module's.
 */
import * as THREE from 'three';
import { NS, EW, LEVELS, getStreet } from '../data/grid.js';
import { M } from '../core/materials.js';
import { ringGeometry } from './buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';

// --- Extents, world grid metres --------------------------------------------
const PAVING_X0 = -30;    // Bay end of the promenade
const PAVING_X1 = -268;   // York curb
const HEAD_HOUSE_WEST = -241;
const WALK_Z0 = 10;       // Front Street south curb
const WALK_Z1 = 24;       // head house building line
const PAVING_Y = 0.16;    // just proud of the streets.js sidewalk slab
const RAMP_FLOOR = LEVELS.unionConcourse; // vehicle drop-off level, -3.5

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Flat XZ quad facing up. */
function slab(w, d, material, y = 0) {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

/** Instanced bollard run along a line of x positions at fixed z. */
function bollards(xs, z, y = PAVING_Y) {
  const geo = new THREE.CylinderGeometry(0.11, 0.13, 0.95, 8);
  const im = new THREE.InstancedMesh(geo, M.steelDark(), xs.length);
  const m = new THREE.Matrix4();
  xs.forEach((x, i) => im.setMatrixAt(i, m.makeTranslation(x, y + 0.475, z)));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = false;
  return im;
}

/** Granite planters: a hollow stone ring with soil inside. */
function planters(spots, { width = 5.0, depth = 2.6, wall = 0.4, height = 0.62 } = {}) {
  const g = new THREE.Group();
  const rings = new THREE.InstancedMesh(
    ringGeometry(width, depth, wall, height), M.limestonePlain(), spots.length
  );
  const soil = new THREE.InstancedMesh(
    box(width - wall * 2, 0.1, depth - wall * 2), M.bark(), spots.length
  );
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    // ringGeometry spans [h/2, 3h/2] above its origin, so drop it by half a height.
    rings.setMatrixAt(i, m.makeTranslation(x, PAVING_Y - height / 2, z));
    soil.setMatrixAt(i, m.makeTranslation(x, PAVING_Y + height - 0.12, z));
  });
  rings.instanceMatrix.needsUpdate = true;
  soil.instanceMatrix.needsUpdate = true;
  rings.castShadow = true;
  g.add(rings, soil);
  return g;
}

/**
 * A glazed stair enclosure with the stair actually cut down to a lower level,
 * so looking in from the promenade reads as a descent rather than a lit box.
 */
function stairHeadhouse({ width, depth, floorY, steps = 20, label }) {
  const g = new THREE.Group();

  // Shaft: a dark void the stair descends into, so the opening never reads solid.
  //
  // It stops at the PATH ceiling rather than running all the way to the floor.
  // Driven the full depth it was a solid 6.5 m box standing across the corridor
  // it lands in, damming the network: a walker heading east under Front Street
  // hit it head-on 40 m short of Bay. The stair itself still descends; only the
  // enclosing well is trimmed to the slab it passes through.
  const shaftDepth = depth + 4.5;
  // Spans street level down to the PATH ceiling only - the slab it cuts through -
  // leaving the corridor's own clear height below it open.
  const shaftHeight = Math.max(0.6, -LEVELS.pathCeiling);
  const shaft = new THREE.Mesh(box(width - 0.4, shaftHeight, shaftDepth), M.concretePlain());
  shaft.position.set(0, LEVELS.pathCeiling + shaftHeight / 2, shaftDepth / 2 - depth / 2);
  g.add(shaft);

  const rise = -floorY / steps;
  const going = 0.32;
  const treads = new THREE.InstancedMesh(
    box(width - 1.4, rise, going), M.concretePlain(), steps
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < steps; i++) {
    treads.setMatrixAt(i, m.makeTranslation(0, -rise * (i + 0.5), -depth / 2 + 0.9 + going * i));
  }
  treads.instanceMatrix.needsUpdate = true;
  g.add(treads);

  const landing = new THREE.Mesh(box(width + 1.5, 0.3, 4.0), M.pathFloor());
  landing.position.set(0, floorY - 0.15, -depth / 2 + 0.9 + going * steps + 2.0);
  g.add(landing);

  // Glazed enclosure over the head of the stair.
  const glassH = 3.4;
  const glass = new THREE.Mesh(box(width, glassH, depth), M.glazingClear());
  glass.position.y = PAVING_Y + glassH / 2;
  g.add(glass);
  const frame = new THREE.Mesh(ringGeometry(width + 0.2, depth + 0.2, 0.16, glassH), M.steelWhite());
  frame.position.y = PAVING_Y - glassH / 2; // see ringGeometry's origin convention
  frame.castShadow = true;
  g.add(frame);
  const cap = new THREE.Mesh(box(width + 1.2, 0.35, depth + 1.2), M.steelWhite());
  cap.position.y = PAVING_Y + glassH + 0.17;
  cap.castShadow = true;
  g.add(cap);

  const hit = new THREE.Mesh(
    box(width, glassH, 0.6), new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(0, glassH / 2, -depth / 2 - 0.5);
  registerInteractive(hit, {
    building: 'Union Station forecourt', address: '65 Front Street West',
    tenant: label, category: 'transit', confidence: 'reference',
  });
  g.add(hit);
  return g;
}

/** One vehicle ramp deck, descending grid-east from the York plaza. */
function ramp({ length, width, drop }) {
  const g = new THREE.Group();
  const angle = Math.atan2(drop, length);
  const deck = new THREE.Mesh(box(Math.hypot(length, drop), 0.4, width), M.concrete());
  deck.rotation.z = -angle; // the +X (grid-east) end is the low end
  deck.position.y = -drop / 2;
  deck.receiveShadow = true;
  g.add(deck);
  for (const sign of [-1, 1]) {
    const wall = new THREE.Mesh(box(length, 1.0, 0.3), M.concretePlain());
    wall.rotation.z = -angle;
    wall.position.set(0, -drop / 2 + 0.7, sign * (width / 2));
    wall.castShadow = true;
    g.add(wall);
  }
  return g;
}

/** Simplified standing bronze figure, ~2.5 m, for the monument. */
function bronzeFigure(baseY) {
  const g = new THREE.Group();
  const bronze = M.paintedSteel(0x6b4a2a);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 1.05, 10), bronze);
  legs.position.y = baseY + 0.52;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.30, 0.95, 10), bronze);
  torso.position.y = baseY + 1.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), bronze);
  head.position.y = baseY + 2.24;
  g.add(legs, torso, head);
  // One arm raised — the monument's figure holds a globe aloft.
  const armGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.95, 8);
  for (const [sign, tilt] of [[-1, -0.95], [1, 0.35]]) {
    const arm = new THREE.Mesh(armGeo, bronze);
    arm.position.set(sign * 0.42, baseY + 1.75, 0);
    arm.rotation.z = tilt;
    g.add(arm);
  }
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bronze);
  globe.position.set(-0.82, baseY + 2.35, 0);
  g.add(globe);
  for (const o of g.children) o.castShadow = true;
  return g;
}

export function build() {
  const root = new THREE.Group();
  root.name = 'forecourt';

  const front = getStreet('front-w');
  if (!front) throw new Error('forecourt: street record "front-w" is missing');
  const curbZ = front.z + front.road / 2; // +10, Front Street south curb

  // --- Granite-banded paving ---------------------------------------------
  const pavingW = PAVING_X0 - PAVING_X1;
  const paving = slab(pavingW, WALK_Z1 - WALK_Z0, M.forecourt(), PAVING_Y);
  paving.position.set((PAVING_X0 + PAVING_X1) / 2, PAVING_Y, (WALK_Z0 + WALK_Z1) / 2);
  root.add(paving);
  register({
    id: 'forecourt-paving', name: 'Union Station forecourt paving', kind: 'infrastructure',
    object: paving, confidence: 'reference',
    source: "Front Street West's 14 m south walk, repaved as granite-banded promenade",
    data: { fromX: PAVING_X1, toX: PAVING_X0, fromZ: WALK_Z0, toZ: WALK_Z1 },
  });

  // --- Taxi / passenger pick-up lay-by ------------------------------------
  const layby = new THREE.Group();
  const laybyW = 110;
  const laybyX = -125;
  const laybyDeck = slab(laybyW, 5.0, M.asphalt(), 0.02);
  laybyDeck.position.set(laybyX, 0.02, curbZ - 2.5);
  layby.add(laybyDeck);
  const island = new THREE.Mesh(box(laybyW - 16, 0.16, 1.4), M.concretePlain());
  island.position.set(laybyX, 0.08, curbZ - 5.4);
  island.receiveShadow = true;
  layby.add(island);
  const islandXs = [];
  for (let x = laybyX - laybyW / 2 + 10; x <= laybyX + laybyW / 2 - 10; x += 6) islandXs.push(x);
  layby.add(bollards(islandXs, curbZ - 5.4, 0.16));
  root.add(layby);
  register({
    id: 'forecourt-taxi-layby', name: 'Union Station taxi and passenger lay-by', kind: 'infrastructure',
    object: layby, confidence: 'inferred',
    source: 'kerbside pick-up bay recessed off the Front Street through lanes',
    note: 'Bay length and the separating island are inferred; the pick-up function and its position on the south kerb are documented.',
  });

  // --- York-side plaza and the vehicle ramps ------------------------------
  const gap = new THREE.Group();
  const gapW = HEAD_HOUSE_WEST - PAVING_X1; // 27 m between the head house and York
  const gapCentreX = (HEAD_HOUSE_WEST + PAVING_X1) / 2;
  const plaza = slab(gapW, 8, M.forecourt(), PAVING_Y);
  plaza.position.set(gapCentreX, PAVING_Y, WALK_Z1 + 4);
  gap.add(plaza);

  const rampLength = 25;
  for (const [z, dir] of [[16.5, 'down'], [23.5, 'up']]) {
    const r = ramp({ length: rampLength, width: 7.5, drop: -RAMP_FLOOR });
    r.position.set(gapCentreX, 0, z);
    r.userData.direction = dir;
    gap.add(r);
  }
  // Guard the plaza edge where it meets the ramp mouths.
  const rampGuardXs = [];
  for (let x = PAVING_X1 + 2; x <= HEAD_HOUSE_WEST - 2; x += 3.5) rampGuardXs.push(x);
  gap.add(bollards(rampGuardXs, 12.0));
  root.add(gap);
  register({
    id: 'forecourt-york-plaza', name: 'York Street plaza and station vehicle ramps', kind: 'infrastructure',
    object: gap, confidence: 'inferred',
    source: 'the 29 m between the head house west end (x = -241) and York Street (x = -270)',
    note: `Two ramps descend ${(-RAMP_FLOOR).toFixed(1)} m to the below-grade drop-off. The head house genuinely stops short of York; ramp widths and gradients are inferred.`,
    data: { gapWidth: gapW, rampFloor: RAMP_FLOOR },
  });

  // --- Bollards along the curb line ---------------------------------------
  const curbXs = [];
  for (let x = PAVING_X0 - 2; x >= PAVING_X1 + 4; x -= 4) curbXs.push(x);
  const curbBollards = bollards(curbXs, WALK_Z0 + 0.7);
  root.add(curbBollards);
  register({
    id: 'forecourt-bollards', name: 'Forecourt bollard line', kind: 'prop',
    object: curbBollards, confidence: 'inferred',
    source: 'bollard line separating the promenade from the Front Street kerb',
    data: { count: curbXs.length },
  });

  // --- Granite planters ----------------------------------------------------
  const planterSpots = [-55, -95, -135, -172, -208, -232].map((x) => [x, 13.4]);
  const planterGroup = planters(planterSpots);
  root.add(planterGroup);
  register({
    id: 'forecourt-planters', name: 'Forecourt granite planters', kind: 'prop',
    object: planterGroup, confidence: 'inferred',
    source: 'granite planter walls along the promenade',
    note: 'Planter positions are a plausible rhythm, not surveyed.',
    data: { count: planterSpots.length },
  });

  // --- PATH / subway stair headhouses -------------------------------------
  const pathSpots = [
    { id: 'forecourt-path-entrance-east', x: -68, label: 'PATH / TTC Union subway entrance', name: 'Forecourt PATH entrance (east)' },
    { id: 'forecourt-path-entrance-west', x: -196, label: 'PATH / York Concourse entrance', name: 'Forecourt PATH entrance (west)' },
  ];
  for (const spot of pathSpots) {
    const h = stairHeadhouse({ width: 7.0, depth: 5.0, floorY: LEVELS.path, steps: 20, label: spot.label });
    h.position.set(spot.x, 0, 18.0);
    root.add(h);
    register({
      id: spot.id, name: spot.name, kind: 'infrastructure', object: h,
      confidence: 'inferred',
      source: `glazed stair enclosure descending to the PATH concourse at y = ${LEVELS.path}`,
      note: 'Entrance positions along the promenade are inferred; the presence of glazed PATH/subway stair headhouses on this forecourt is documented.',
    });
  }

  // --- Union Station Loop streetcar entrance (Bay end) ---------------------
  const loop = stairHeadhouse({
    width: 6.0, depth: 4.6, floorY: LEVELS.path, steps: 20,
    label: 'Union Station Loop — 509/510 streetcars',
  });
  loop.position.set(-24, 0, 17.5);
  root.add(loop);
  register({
    id: 'forecourt-loop-headhouse', name: 'Union Station Loop streetcar entrance', kind: 'infrastructure',
    object: loop, confidence: 'reference',
    source: 'stair headhouse on the Bay end of the forecourt',
    note: 'The Union Station Loop is BELOW GRADE and reached through the Bay Street tunnel. No surface streetcar track exists on Front Street and none is modelled here.',
  });

  // --- Monument to Multiculturalism ---------------------------------------
  const monument = new THREE.Group();
  const plinthH = 2.0;
  const plinthMesh = new THREE.Mesh(box(2.3, plinthH, 2.3), M.limestone());
  plinthMesh.position.set(0, PAVING_Y + plinthH / 2, 0);
  plinthMesh.castShadow = true;
  plinthMesh.receiveShadow = true;
  const cap = new THREE.Mesh(box(2.7, 0.22, 2.7), M.limestonePlain());
  cap.position.set(0, PAVING_Y + plinthH + 0.11, 0);
  monument.add(plinthMesh, cap, bronzeFigure(PAVING_Y + plinthH + 0.22));
  monument.position.set(-44, 0, 15.5);
  const monumentHit = new THREE.Mesh(
    box(3.2, 4.8, 3.2), new THREE.MeshBasicMaterial({ visible: false })
  );
  monumentHit.position.y = 2.4;
  registerInteractive(monumentHit, {
    building: 'Union Station forecourt', address: '65 Front Street West',
    tenant: 'Monument to Multiculturalism', category: 'public art', confidence: 'reference',
    note: 'Francesco Perilli bronze; casts of the same work stand in Sarajevo, Sydney, Changchun and Cape Town.',
  });
  monument.add(monumentHit);
  root.add(monument);
  register({
    id: 'forecourt-monument-multiculturalism', name: 'Monument to Multiculturalism', kind: 'prop',
    object: monument, confidence: 'inferred',
    source: 'Francesco Perilli, 1985; simplified standing bronze ~2.5 m on a ~2 m stone plinth',
    note: 'PLACEMENT INFERRED. The monument stands on the Front Street forecourt near the station\'s east/Bay end; its exact position on the promenade was not surveyed for this reconstruction, and the figure is a simplified stand-in for the actual sculpture, not a reproduction of it.',
  });

  register({
    id: 'forecourt-front-street', name: 'Front Street forecourt and promenade', kind: 'infrastructure',
    object: root, confidence: 'reference',
    source: 'Union Station revitalisation public realm',
    note: 'Benches, litter bins and transit shelters are intentionally not built here — street furniture is a separate module.',
    data: { northOf: EW.front, bayEndX: PAVING_X0, yorkEndX: NS.york + 2 },
  });

  return root;
}
