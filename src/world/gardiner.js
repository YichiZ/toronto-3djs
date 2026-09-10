/**
 * The Gardiner Expressway elevated deck.
 *
 * REAL-WORLD FACTS ENCODED HERE
 *  - The Gardiner runs above LAKE SHORE BOULEVARD WEST (EW.lakeShore, z 380),
 *    the full width of the reconstruction boundary, SOUTH of the rail corridor.
 *    It does not run over Front Street and never has; the elevated structure a
 *    viewer sees from Front is the rail viaduct, not this.
 *  - Post-tensioned concrete box-girder deck on paired hammerhead piers standing
 *    in the Lake Shore median, so the roadway below runs in two carriageways
 *    either side of the pier line and the whole street lives in the shadow of
 *    the soffit. That soffit is the expressway's signature: dark, water-stained,
 *    scuppered.
 *  - Deck level is LEVELS.gardinerDeck (+12.0). Lake Shore's own roadway and
 *    sidewalks belong to streets.js and are not duplicated here.
 */
import * as THREE from 'three';
import { EW, LEVELS } from '../data/grid.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';

const X0 = -820;
const X1 = 420;
const LENGTH = X1 - X0;
const MID_X = (X0 + X1) / 2;
const Z = EW.lakeShore;
const DECK_Y = LEVELS.gardinerDeck;   // 12.0, top of pavement
const DECK_W = 26;                    // six lanes plus shoulders
/** Plan extent of the deck, for the minimap. */
export const GARDINER_DECK = Object.freeze({ west: X0, east: X1, z: Z, width: DECK_W });
const GIRDER = 1.6;                   // deck structural depth
const SOFFIT = DECK_Y - GIRDER;

const BENT_PITCH = 35;                // pier bent spacing along the median
const PIER_OFFSET = 5.5;              // half the gap between the paired columns

const UP = new THREE.Vector3(0, 1, 0);
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function put(im, i, x, y, z, sx, sy, sz, rotY = 0) {
  _q.setFromAxisAngle(UP, rotY);
  im.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
}

function instanced(geo, mat, count, { shadow = false } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, count);
  im.castShadow = shadow;
  im.receiveShadow = shadow;
  return im;
}

/** Jersey barrier cross-section, extruded along the deck edge. */
function jerseyGeometry(segment) {
  const s = new THREE.Shape();
  s.moveTo(-0.31, 0);
  s.lineTo(0.31, 0);
  s.lineTo(0.20, 0.26);
  s.lineTo(0.11, 0.86);
  s.lineTo(-0.11, 0.86);
  s.lineTo(-0.20, 0.26);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: segment, bevelEnabled: false });
  geo.translate(0, 0, -segment / 2);
  geo.rotateY(Math.PI / 2); // profile is drawn in XY; the run belongs on X
  return geo;
}

function buildDeck() {
  const g = new THREE.Group();
  g.name = 'gardiner-deck';

  const deck = new THREE.Mesh(new THREE.BoxGeometry(LENGTH, GIRDER, DECK_W), M.concrete());
  deck.position.set(MID_X, DECK_Y - GIRDER / 2, Z);
  deck.castShadow = true;
  deck.receiveShadow = true;
  g.add(deck);

  // The stained soffit is a separate darkened plane; the concrete map alone
  // reads far too clean from the sidewalk below.
  const soffit = new THREE.Mesh(new THREE.BoxGeometry(LENGTH, 0.08, DECK_W - 0.3), M.paintedSteel(0x4a453d));
  soffit.position.set(MID_X, SOFFIT - 0.04, Z);
  g.add(soffit);

  // Drainage scuppers, both edges. These are what stain the soffit.
  const scupperCount = Math.floor(LENGTH / 17.5) * 2;
  const scuppers = instanced(new THREE.CylinderGeometry(0.11, 0.11, 1.1, 6), M.steelDark(), scupperCount);
  for (let i = 0; i < scupperCount / 2; i++) {
    for (const side of [-1, 1]) {
      const idx = i * 2 + (side > 0 ? 1 : 0);
      _q.identity();
      scuppers.setMatrixAt(idx, _m.compose(
        _p.set(X0 + 17.5 * (i + 0.5), SOFFIT - 0.55, Z + side * (DECK_W / 2 - 1.6)), _q, _s.set(1, 1, 1)));
    }
  }
  scuppers.instanceMatrix.needsUpdate = true;
  g.add(scuppers);

  // Jersey barriers in 8 m segments, one draw call for both edges.
  const SEG = 8;
  const perSide = Math.floor(LENGTH / SEG);
  const barriers = instanced(jerseyGeometry(SEG), M.concretePlain(), perSide * 2, { shadow: true });
  let bi = 0;
  for (let i = 0; i < perSide; i++) {
    for (const side of [-1, 1]) {
      _q.identity();
      barriers.setMatrixAt(bi++, _m.compose(
        _p.set(X0 + SEG * (i + 0.5), DECK_Y, Z + side * (DECK_W / 2 - 0.4)), _q, _s.set(1, 1, 1)));
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  g.add(barriers);

  // Lane markings: three lanes each way, plus the median gap.
  const DASH = 3;
  const GAP = 6;
  const offsets = [-9.6, -6.2, -2.8, 2.8, 6.2, 9.6];
  const perLine = Math.floor(LENGTH / (DASH + GAP));
  const paint = instanced(UNIT, M.signWhite(), offsets.length * perLine);
  let mi = 0;
  for (const off of offsets) {
    for (let k = 0; k < perLine; k++) {
      put(paint, mi++, X0 + k * (DASH + GAP) + DASH / 2, DECK_Y + 0.02, Z + off, DASH, 0.02, 0.15);
    }
  }
  paint.instanceMatrix.needsUpdate = true;
  g.add(paint);

  return g;
}

function buildPiers() {
  const g = new THREE.Group();
  g.name = 'gardiner-piers';
  const bents = Math.floor(LENGTH / BENT_PITCH) + 1;
  const colH = SOFFIT - 0.9;

  const columns = instanced(UNIT, M.concrete(), bents * 2, { shadow: true });
  const caps = instanced(UNIT, M.concrete(), bents * 2, { shadow: true });
  let i = 0;
  for (let b = 0; b < bents; b++) {
    const x = X0 + b * BENT_PITCH;
    for (const side of [-1, 1]) {
      const z = Z + side * PIER_OFFSET;
      put(columns, i, x, colH / 2, z, 2.0, colH, 2.4);
      // The hammerhead: a cap cantilevered outboard to pick up the deck edge.
      put(caps, i, x, SOFFIT - 0.45, z + side * 2.4, 2.6, 1.6, 9.0);
      i++;
    }
  }
  columns.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  g.add(columns, caps);
  return g;
}

function buildFurniture() {
  const g = new THREE.Group();
  g.name = 'gardiner-furniture';
  const count = Math.floor(LENGTH / BENT_PITCH) + 1;
  const POLE_H = 9.5;

  const poles = instanced(UNIT, M.steelDark(), count);
  const arms = instanced(UNIT, M.steelDark(), count);
  const heads = instanced(UNIT, M.litInterior(0xffbe70), count);
  for (let i = 0; i < count; i++) {
    // Standards alternate sides so the deck is lit evenly from both barriers.
    const side = i % 2 === 0 ? -1 : 1;
    const x = X0 + i * BENT_PITCH + BENT_PITCH / 2;
    const z = Z + side * (DECK_W / 2 - 0.9);
    put(poles, i, x, DECK_Y + POLE_H / 2, z, 0.24, POLE_H, 0.24);
    put(arms, i, x, DECK_Y + POLE_H, z - side * 1.1, 0.18, 0.18, 2.4);
    put(heads, i, x, DECK_Y + POLE_H - 0.2, z - side * 2.2, 0.7, 0.18, 1.3);
  }
  for (const im of [poles, arms, heads]) {
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }
  return g;
}

/** @param {import('../core/context.js').Context} _ctx */
export function build(_ctx) {
  const group = new THREE.Group();
  group.name = 'gardiner';

  const deck = buildDeck();
  group.add(deck);
  register({
    id: 'gardiner-deck', name: 'Gardiner Expressway deck', kind: 'infrastructure',
    object: deck, confidence: 'reference',
    source: 'Elevated F.G. Gardiner Expressway over Lake Shore Boulevard West',
    note: 'Deck width and girder depth are proportioned from imagery. The Gardiner is over Lake Shore, not Front Street.',
    data: { west: X0, east: X1, z: Z, deck: DECK_Y, width: DECK_W },
  });

  const piers = buildPiers();
  group.add(piers);
  register({
    id: 'gardiner-piers', name: 'Gardiner hammerhead piers', kind: 'infrastructure',
    object: piers, confidence: 'inferred',
    source: 'Paired hammerhead bents in the Lake Shore median',
    note: `Bent spacing modelled at ${BENT_PITCH} m; real spans vary with the cross streets below.`,
    data: { pitch: BENT_PITCH },
  });

  const furniture = buildFurniture();
  group.add(furniture);
  register({
    id: 'gardiner-furniture', name: 'Gardiner deck lighting', kind: 'infrastructure',
    object: furniture, confidence: 'approximated',
    source: 'High-mast standards alternating along the barrier line',
    note: 'Luminaire spacing and colour temperature are approximate.',
  });

  return group;
}
