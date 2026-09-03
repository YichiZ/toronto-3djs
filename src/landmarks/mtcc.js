/**
 * Metro Toronto Convention Centre - North and South Buildings.
 *
 * The North Building (255 Front Street West, 1984) is the vertically
 * interesting one: it is BUILT OVER THE RAIL CORRIDOR. Its exhibit level sits
 * on a transfer structure carried on column lines set between the tracks, so
 * from Front Street it reads as a long horizontal banded block, and from the
 * corridor it reads as a roof over live railway. Getting the layering right -
 * open track below, transfer level, halls above - is the entire point of this
 * module; a solid block on the ground here would be wrong in the one way that
 * matters. The SkyWalk (another module) connects it east to Union Station.
 *
 * The South Building (222 Bremner Boulevard, 1997) inverts the problem: almost
 * all of its volume is below grade, dug into the old rail lands, and what the
 * street sees is a long glazed north elevation and the entrance pavilion on
 * Bremner. Modelling it as a 34 m block standing on the ground would be the
 * mirror-image mistake.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { tenantsFor } from '../data/tenants.js';
import { CORRIDOR, EW } from '../data/grid.js';
import { M } from '../core/materials.js';
import { storefrontBand, roofPlant, cornice } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
/** Underside of the North Building's exhibit level, above the trains. */
const TRANSFER_Y = 8.5;

/** Instanced run of identical boxes along one axis. */
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

/** Horizontal precast bands alternating with glazing - the 1984 elevation. */
function bandedElevation({ length, height, baseY, axis, at, bands = 4 }) {
  const g = new THREE.Group();
  const pitch = height / bands;
  const precastGeo = axis === 'x' ? box(length, pitch * 0.62, 0.6) : box(0.6, pitch * 0.62, length);
  const glassGeo = axis === 'x' ? box(length - 2, pitch * 0.3, 0.35) : box(0.35, pitch * 0.3, length - 2);
  const precast = new THREE.InstancedMesh(precastGeo, M.concrete(), bands);
  const glass = new THREE.InstancedMesh(glassGeo, M.glassCool(), bands);
  const m = new THREE.Matrix4();
  for (let i = 0; i < bands; i++) {
    const y = baseY + i * pitch;
    const px = axis === 'x' ? 0 : at;
    const pz = axis === 'x' ? at : 0;
    precast.setMatrixAt(i, m.makeTranslation(px, y + pitch * 0.31, pz));
    glass.setMatrixAt(i, m.makeTranslation(px, y + pitch * 0.78, pz));
  }
  precast.instanceMatrix.needsUpdate = true;
  glass.instanceMatrix.needsUpdate = true;
  precast.castShadow = true;
  g.add(precast, glass);
  return g;
}

/** Ground-floor frontage with one raycast volume per bay. */
function frontage({ parent, buildingId, buildingName, address, face, width, position, rotationY = 0 }) {
  const tenants = tenantsFor(buildingId, face);
  const { group, bays } = storefrontBand({ width, height: 6.0, bayWidth: 9 });
  const holder = new THREE.Group();
  holder.add(group);
  bays.forEach((bay, i) => {
    const tn = tenants[i % tenants.length];
    const hit = new THREE.Mesh(box(bay.width - 0.4, 5.0, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(bay.x, 2.6, 0.7);
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

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) {
  const root = new THREE.Group();
  root.name = 'mtcc';
  let frontages = 0;

  // ===========================================================================
  // NORTH BUILDING - over the corridor
  // ===========================================================================
  const n = getBuilding('mtcc-north');
  const gN = new THREE.Group();
  gN.name = 'mtcc-north';
  gN.position.set(n.x, 0, n.z);
  const nhd = n.d / 2;
  const nhw = n.w / 2;

  // How much of the footprint is actually over live track, in local metres.
  const corridorStart = CORRIDOR.north - n.z; // local z where the tracks begin
  const groundDepth = Math.max(6, corridorStart + nhd); // solid, street-side part
  const spanDepth = n.d - groundDepth;                  // the part on columns

  // Street-side base: the only part of the building that reaches the ground.
  const base = new THREE.Mesh(box(n.w, TRANSFER_Y, groundDepth), M.concrete());
  base.position.set(0, TRANSFER_Y / 2, -nhd + groundDepth / 2);
  base.castShadow = true;
  base.receiveShadow = true;
  gN.add(base);

  // Column lines standing between the tracks, carrying everything to the south.
  const colRows = 3;
  const colsPerRow = 7;
  const colGeo = box(1.8, TRANSFER_Y, 1.8);
  for (let r = 0; r < colRows; r++) {
    const z = -nhd + groundDepth + (spanDepth / colRows) * (r + 0.5);
    gN.add(run({
      geo: colGeo, material: M.concretePlain(), count: colsPerRow,
      spacing: n.w / colsPerRow, axis: 'x', at: z, y: TRANSFER_Y / 2,
    }));
  }

  // Transfer slab: the deck the exhibit halls sit on, spanning column to column.
  const transfer = new THREE.Mesh(box(n.w, 2.2, spanDepth + 2), M.concretePlain());
  transfer.position.set(0, TRANSFER_Y + 1.1, -nhd + groundDepth + spanDepth / 2);
  transfer.castShadow = true;
  gN.add(transfer);

  // Exhibit halls above: one long horizontal mass, no vertical articulation.
  const hallH = n.height - TRANSFER_Y;
  const hall = new THREE.Mesh(box(n.w, hallH, n.d), M.concrete());
  hall.position.set(0, TRANSFER_Y + hallH / 2, 0);
  hall.castShadow = true;
  hall.receiveShadow = true;
  gN.add(hall);
  gN.add(bandedElevation({ length: n.w, height: hallH - 2, baseY: TRANSFER_Y + 1, axis: 'x', at: -nhd - 0.4 }));
  gN.add(bandedElevation({ length: n.d, height: hallH - 2, baseY: TRANSFER_Y + 1, axis: 'z', at: nhw + 0.4, bands: 4 }));
  gN.add(cornice({ width: n.w, depth: n.d, y: n.height + 0.5, thickness: 1.0, overhang: 0.8, material: M.concretePlain() }));
  gN.add(roofPlant({ width: n.w * 0.5, depth: n.d * 0.5, y: n.height + 1, seed: 5 }));

  // Front Street entrance hall: full-height glazing under a projecting canopy.
  const entrance = new THREE.Group();
  entrance.name = 'mtcc-north-entrance';
  const glassHall = new THREE.Mesh(box(58, 16, 3), M.glazingClear());
  glassHall.position.set(0, 8, -nhd - 1.4);
  entrance.add(glassHall);
  const mullGeo = box(0.3, 16, 0.5);
  entrance.add(run({
    geo: mullGeo, material: M.steelWhite(), count: 19, spacing: 3,
    axis: 'x', at: -nhd - 2.9, y: 8, cast: false,
  }));
  const canopy = new THREE.Mesh(box(64, 0.8, 9), M.steelWhite());
  canopy.position.set(0, 7.2, -nhd - 6);
  canopy.castShadow = true;
  entrance.add(canopy);
  const strutGeo = box(0.35, 7.0, 0.35);
  entrance.add(run({
    geo: strutGeo, material: M.steelWhite(), count: 7, spacing: 9,
    axis: 'x', at: -nhd - 10, y: 3.5, cast: false,
  }));
  gN.add(entrance);

  frontages += frontage({
    parent: gN, buildingId: n.id, buildingName: n.name, address: n.address, face: 'north',
    width: n.w - 70, position: new THREE.Vector3(-52, 0, -nhd - 0.2), rotationY: Math.PI,
  });
  root.add(gN);

  // ===========================================================================
  // SOUTH BUILDING - below Bremner, behind a glazed pavilion
  // ===========================================================================
  const s = getBuilding('mtcc-south');
  const gS = new THREE.Group();
  gS.name = 'mtcc-south';
  gS.position.set(s.x, 0, s.z);
  const shd = s.d / 2;

  // The halls are dug in: of 34 m only the top ~15 stand above the sidewalk.
  const above = 15;
  const buried = s.height - above;
  const halls = new THREE.Mesh(box(s.w, s.height, s.d), M.concrete());
  halls.position.y = above - s.height / 2;
  halls.castShadow = true;
  halls.receiveShadow = true;
  gS.add(halls);
  gS.add(cornice({ width: s.w, depth: s.d, y: above + 0.4, thickness: 0.9, overhang: 0.7, material: M.concretePlain() }));
  gS.add(roofPlant({ width: s.w * 0.45, depth: s.d * 0.45, y: above + 0.9, seed: 9 }));

  // Long glazed north elevation onto Bremner - the whole building's public face.
  const glazedN = new THREE.Mesh(box(s.w - 6, above - 1.5, 1.0), M.glassCool());
  glazedN.position.set(0, (above - 1.5) / 2 + 0.5, -shd - 0.5);
  glazedN.castShadow = true;
  gS.add(glazedN);
  gS.add(run({
    geo: box(0.3, above - 1.5, 0.4), material: M.steelWhite(),
    count: Math.round((s.w - 6) / 4), spacing: 4, axis: 'x', at: -shd - 1.1,
    y: (above - 1.5) / 2 + 0.5, cast: false,
  }));

  // Entrance pavilion: a taller glazed volume pushed out toward Bremner, which
  // is what you actually walk into - the halls themselves are down the escalator.
  const pavilion = new THREE.Group();
  pavilion.name = 'mtcc-south-pavilion';
  const pavShell = new THREE.Mesh(box(44, 22, 16), M.glazingClear());
  pavShell.position.set(-6, 11, -shd - 8);
  pavilion.add(pavShell);
  const frameGeo = box(0.35, 22, 0.5);
  pavilion.add(run({
    geo: frameGeo, material: M.steelWhite(), count: 12, spacing: 4,
    axis: 'x', at: -shd - 16.2, y: 11, cast: false,
  }));
  const pavRoof = new THREE.Mesh(box(46, 1.0, 18), M.steelWhite());
  pavRoof.position.set(-6, 22.5, -shd - 8);
  pavRoof.castShadow = true;
  pavilion.add(pavRoof);
  pavilion.position.x = 0;
  gS.add(pavilion);

  frontages += frontage({
    parent: gS, buildingId: s.id, buildingName: s.name, address: s.address, face: 'north',
    width: 40, position: new THREE.Vector3(-6, 0, -shd - 16.4), rotationY: Math.PI,
  });
  root.add(gS);

  register({
    id: 'mtcc-north', name: n.name, kind: 'landmark', object: gN,
    confidence: 'inferred',
    source: 'footprint from the building database; elevation proportion from photographic reference',
    note: `BUILT OVER THE RAIL CORRIDOR. Only the Front Street ${groundDepth.toFixed(0)} m of the footprint reaches grade; the remaining ${spanDepth.toFixed(0)} m sits on a transfer structure at y=${TRANSFER_Y} carried on column lines between live, unelectrified tracks (corridor z ${CORRIDOR.north}-${CORRIDOR.south}). Column grid spacing is inferred, not surveyed. The SkyWalk connects the building east to Union Station.`,
    data: { address: n.address, height: n.height, transferY: TRANSFER_Y, groundDepth, spanDepth, frontStreetZ: EW.front },
  });
  register({
    id: 'mtcc-north-entrance', name: 'MTCC North Building Front Street entrance hall',
    kind: 'frontage', object: entrance, confidence: 'reference',
    note: 'Glazed entrance hall under a projecting canopy on the Front Street elevation.',
  });
  register({
    id: 'mtcc-north-transfer', name: 'MTCC North transfer structure', kind: 'infrastructure',
    object: transfer, confidence: 'inferred',
    note: 'Reconstructed transfer deck and columns. Depths are proportional guesses; the real structure is a set of deep trusses on air-rights column lines.',
  });
  register({
    id: 'mtcc-south', name: s.name, kind: 'landmark', object: gS,
    confidence: 'approximated',
    note: `Largely below grade: of ${s.height} m of section only about ${above} m stands above the Bremner sidewalk, so the street reads a long glazed north elevation and the entrance pavilion rather than a block. Buried depth (${buried} m) is inferred.`,
    data: { address: s.address, height: s.height, aboveGrade: above, bremnerZ: EW.bremner },
  });
  register({
    id: 'mtcc-south-pavilion', name: 'MTCC South Building entrance pavilion', kind: 'frontage',
    object: pavilion, confidence: 'inferred',
    note: 'Glazed pavilion on Bremner Boulevard; the exhibit halls are below and behind it.',
  });

  root.userData.frontages = frontages;
  return root;
}
