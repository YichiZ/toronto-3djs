/**
 * Union Station head house — exterior.
 *
 * What this module encodes, and why the numbers are what they are:
 *
 *  - The head house is 229 m of Bedford limestone running grid-WEST from Bay.
 *    It STOPS SHORT OF YORK: its west end lands at x = -241 while York Street's
 *    centreline is at x = -270. That 29 m gap is real — plaza and the vehicle
 *    ramps down to the drop-off fill it, and they are built by world/forecourt.js.
 *    Only the train shed spans the full Bay–York block.
 *  - The Front Street elevation is a Roman TUSCAN colonnade of 22 unfluted
 *    columns, roughly 12 m shafts, standing forward of the wall on a stylobate
 *    of a few steps. 22 columns at 6.6 m centres reads as ~139 m of portico
 *    across the central block, which is the proportion in every photograph:
 *    the portico occupies the centre and the wings run out plain beyond it.
 *  - The entablature above the colonnade carries INCISED RAILWAY NAMES ONLY.
 *    The famous carved frieze of Canadian destination cities is INSIDE, on the
 *    Great Hall walls, and is emphatically not on this façade. See
 *    MODULE_CONTRACT.md, "Hallucination traps".
 *  - Bay (east, +X) and York (west, -X) elevations are pilastered limestone
 *    with punched windows and a single entrance bay each.
 *
 * Lettering is drawn as original canvas geometry from photographic proportion;
 * nothing here loads an external image.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { M } from '../core/materials.js';
import { colonnade, cornice, windowGrid, doorway } from '../world/buildingKit.js';
import { register, registerInteractive } from '../core/registry.js';
import { tenantsFor } from '../data/tenants.js';

// --- Elevation schedule, metres above the Front Street datum ---------------
const STYLOBATE_H = 1.5;   // three steps up from the promenade
const COLUMN_H = 12.0;     // shaft + capital
const COLUMN_DIA = 1.7;
const COLUMN_COUNT = 22;
const COLUMN_SPACING = 6.6; // 21 bays -> 138.6 m of portico
const ENTAB_Y = STYLOBATE_H + COLUMN_H;      // 13.5
const ENTAB_H = 3.5;
const ATTIC_TOP = 24.5;
const ROOF_TOP = 28.0;     // building DB height
const WING_TOP = 21.0;     // wings step down from the central block
const CENTRE_W = 150;      // central block; the two wings share the remainder

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Solid limestone volume with its base on y = 0. */
function stoneBlock(w, h, d, material = M.limestone()) {
  const mesh = new THREE.Mesh(box(w, h, d), material);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Incised frieze lettering, painted into a canvas.
 *
 * Cut letters read as a dark core with a bright lower lip where the light
 * catches the far side of the V-cut; that two-pass draw is cheaper and steadier
 * than any normal-map trick at the distance this band is ever seen from.
 */
function friezeTexture(left, right, metresW, metresH) {
  // The band is ~144 m long and 1.7 m tall. A canvas of that aspect would need
  // to be 10k px wide, so the texture is deliberately squat and the lettering is
  // laid out in VERTICAL pixel space, then squashed horizontally by the same
  // ratio the texture is stretched. Skip that and the two railway names run into
  // each other and the frieze reads as noise.
  const h = 96;
  const w = Math.min(4096, Math.max(1024, Math.round((h * metresW) / metresH)));
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('unionStation: 2d context unavailable for the frieze');

  ctx.fillStyle = '#c9c1ae';
  ctx.fillRect(0, 0, w, h);

  const squash = (w / metresW) / (h / metresH);
  const layoutWidth = w / squash;
  ctx.save();
  ctx.scale(squash, 1);
  ctx.textBaseline = 'middle';

  // Roman capitals on a monumental frieze are widely letterspaced; ctx has no
  // portable tracking control, so the glyphs are stepped out by hand and the
  // cap height is shrunk until the name fits its half of the band.
  const drawTracked = (text, centreX, maxWidth) => {
    let cap = Math.round(h * 0.6);
    let track = cap * 0.22;
    const measure = () =>
      [...text].reduce((a, c) => a + ctx.measureText(c).width + track, -track);
    let total;
    for (let i = 0; i < 30; i++) {
      ctx.font = `600 ${cap}px Georgia, "Times New Roman", serif`;
      total = measure();
      if (total <= maxWidth) break;
      cap = Math.round(cap * 0.92);
      track = cap * 0.22;
    }
    let x = centreX - total / 2;
    for (const c of text) {
      ctx.fillStyle = 'rgba(255,253,246,0.55)';
      ctx.fillText(c, x + 2, h / 2 + 2);
      ctx.fillStyle = '#4c4739';
      ctx.fillText(c, x, h / 2);
      x += ctx.measureText(c).width + track;
    }
  };
  // Each name gets its half of the band, with a margin so they never touch.
  drawTracked(left, layoutWidth * 0.25, layoutWidth * 0.42);
  drawTracked(right, layoutWidth * 0.75, layoutWidth * 0.42);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Stylobate: three receding steps, one instanced mesh. */
function stylobate(width, depth) {
  const steps = 3;
  const im = new THREE.InstancedMesh(box(1, 1, 1), M.limestonePlain(), steps);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const rise = STYLOBATE_H / steps;
  for (let i = 0; i < steps; i++) {
    const inset = i * 0.55;
    m.compose(
      new THREE.Vector3(0, rise * (i + 0.5), inset / 2),
      q,
      new THREE.Vector3(width - inset * 2, rise, depth - inset)
    );
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  im.receiveShadow = true;
  im.castShadow = true;
  return im;
}

/** Engaged pilasters marching along one elevation, instanced. */
function pilasters({ length, count, height, width = 1.2, projection = 0.35 }) {
  const im = new THREE.InstancedMesh(box(width, height, projection), M.limestone(), count);
  const m = new THREE.Matrix4();
  const span = length - width * 2;
  for (let i = 0; i < count; i++) {
    const t = -span / 2 + (span / (count - 1)) * i;
    im.setMatrixAt(i, m.makeTranslation(t, height / 2, 0));
  }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = true;
  return im;
}

/** A side elevation (Bay or York): pilasters, punched windows, one entrance. */
function sideElevation({ width, height, floors }) {
  const g = new THREE.Group();
  g.add(pilasters({ length: width, count: 7, height: height - 1.5 }));
  g.add(windowGrid({
    width: width - 6, floors, floorHeight: 4.2, baseY: 5.0,
    bayWidth: 5.0, winW: 1.9, winH: 2.6, depth: 0.22,
  }));
  const door = doorway({ width: 3.2, height: 4.2, recess: 0.9 });
  door.rotation.y = Math.PI; // recess inward, away from the street
  g.add(door);
  const hood = new THREE.Mesh(box(5.0, 0.6, 1.0), M.limestonePlain());
  hood.position.set(0, 4.9, 0.3);
  hood.castShadow = true;
  g.add(hood);
  return g;
}

/** Thin invisible raycast volume in front of an entrance. */
function entranceHit(width, height, baseY = 0) {
  const hit = new THREE.Mesh(
    box(width, height, 0.6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = baseY + height / 2;
  return hit;
}

export function build() {
  const b = getBuilding('union-station');
  if (!b) throw new Error('unionStation: building record "union-station" is missing');

  const root = new THREE.Group();
  root.name = 'union-station';
  root.position.set(b.x, 0, b.z);

  const halfW = b.w / 2;      // 114.5
  const halfD = b.d / 2;      // 22
  const frontZ = -halfD;      // Front Street elevation, grid north
  const wingW = (b.w - CENTRE_W) / 2; // 39.5 each

  // --- Central block ------------------------------------------------------
  const centre = stoneBlock(CENTRE_W, ATTIC_TOP, b.d);
  root.add(centre);
  root.add(cornice({ width: CENTRE_W, depth: b.d, y: ATTIC_TOP + 0.5, thickness: 1.1, overhang: 0.9 }));
  const roof = stoneBlock(CENTRE_W - 4, ROOF_TOP - ATTIC_TOP - 1.1, b.d - 4, M.concretePlain());
  roof.position.y = ATTIC_TOP + 1.1 + (ROOF_TOP - ATTIC_TOP - 1.1) / 2;
  root.add(roof);

  // --- Wings, stepping down ----------------------------------------------
  const wings = new THREE.Group();
  for (const sign of [-1, 1]) {
    const wing = stoneBlock(wingW, WING_TOP, b.d);
    wing.position.x = sign * (CENTRE_W / 2 + wingW / 2);
    wings.add(wing);
    const wc = cornice({ width: wingW, depth: b.d, y: WING_TOP + 0.45, thickness: 0.9, overhang: 0.7 });
    wc.position.x = wing.position.x;
    wings.add(wc);
    // Punched windows on the wing's Front elevation, two storeys over a base.
    const win = windowGrid({
      width: wingW - 5, floors: 3, floorHeight: 4.6, baseY: 5.5,
      bayWidth: 5.2, winW: 2.0, winH: 3.0, depth: 0.22,
    });
    win.position.set(wing.position.x, 0, frontZ - 0.12);
    win.rotation.y = Math.PI;
    wings.add(win);
    const pil = pilasters({ length: wingW - 2, count: 6, height: WING_TOP - 1.2 });
    pil.position.set(wing.position.x, 0, frontZ - 0.2);
    wings.add(pil);
  }
  root.add(wings);

  // --- The colonnade ------------------------------------------------------
  // Columns stand forward of the wall plane; the stylobate steps down onto the
  // Front Street promenade, which forecourt.js paves up to the building line.
  const colZ = frontZ - 2.4;
  const portico = new THREE.Group();
  const steps = stylobate(CENTRE_W + 2, 4.4);
  steps.position.z = frontZ - 2.2;
  portico.add(steps);

  const cols = colonnade({
    count: COLUMN_COUNT, spacing: COLUMN_SPACING, height: COLUMN_H,
    diameter: COLUMN_DIA, order: 'tuscan', axis: 'x',
  });
  cols.position.set(0, STYLOBATE_H, colZ);
  portico.add(cols);
  root.add(portico);

  // --- Entablature: architrave, incised frieze, projecting cornice --------
  const entabD = 4.8;
  const entabZ = frontZ - 2.4;
  const entab = new THREE.Mesh(box(CENTRE_W + 3, ENTAB_H, entabD), M.limestone());
  entab.position.set(0, ENTAB_Y + ENTAB_H / 2, entabZ);
  entab.castShadow = true;
  entab.receiveShadow = true;

  const friezeMat = new THREE.MeshStandardMaterial({
    map: friezeTexture('GRAND TRUNK RAILWAY SYSTEM', 'CANADIAN NATIONAL RAILWAYS', CENTRE_W - 6, 1.7),
    roughness: 0.84, metalness: 0.02,
  });
  const friezeGeo = new THREE.PlaneGeometry(CENTRE_W - 6, 1.7);
  const frieze = new THREE.Mesh(friezeGeo, friezeMat);
  frieze.position.set(0, ENTAB_Y + ENTAB_H * 0.52, entabZ - entabD / 2 - 0.02);
  frieze.rotation.y = Math.PI;

  const entabCornice = cornice({
    width: CENTRE_W + 3, depth: entabD, y: ENTAB_Y + ENTAB_H + 0.35, thickness: 0.8, overhang: 0.55,
  });
  entabCornice.position.z = entabZ;
  const entablature = new THREE.Group();
  entablature.add(entab, frieze, entabCornice);
  root.add(entablature);

  // --- Attic storey above the entablature ---------------------------------
  const atticWin = windowGrid({
    width: CENTRE_W - 12, floors: 1, floorHeight: 6.0, baseY: ENTAB_Y + ENTAB_H + 1.0,
    bayWidth: 6.6, winW: 2.2, winH: 2.4, depth: 0.2,
  });
  atticWin.position.z = frontZ - 0.12;
  atticWin.rotation.y = Math.PI;
  const attic = new THREE.Group();
  attic.add(atticWin);
  root.add(attic);

  // Wall plane behind the colonnade: tall arched openings read as two storeys.
  const porticoWall = windowGrid({
    width: CENTRE_W - 14, floors: 2, floorHeight: 5.4, baseY: 2.2,
    bayWidth: 6.6, winW: 3.0, winH: 4.0, depth: 0.24,
  });
  porticoWall.position.z = frontZ - 0.12;
  porticoWall.rotation.y = Math.PI;
  root.add(porticoWall);

  // --- Front Street entrance doors ---------------------------------------
  const frontDoors = new THREE.Group();
  const doorBays = 7;
  for (let i = 0; i < doorBays; i++) {
    const d = doorway({ width: 2.8, height: 4.4, recess: 0.9 });
    d.position.set(-((doorBays - 1) / 2) * COLUMN_SPACING + i * COLUMN_SPACING, STYLOBATE_H, frontZ - 0.05);
    d.rotation.y = Math.PI;
    frontDoors.add(d);
  }
  const frontTenants = tenantsFor('union-station', 'north');
  const frontHit = entranceHit(doorBays * COLUMN_SPACING, 4.4, STYLOBATE_H);
  frontHit.position.x = 0;
  frontHit.position.z = frontZ - 1.4;
  registerInteractive(frontHit, {
    building: b.name, address: b.address,
    tenant: frontTenants[0]?.name ?? 'Union Station Front Street entrance',
    category: 'transit', confidence: 'reference',
    note: 'Front Street head-house entrance, under the 22-column Tuscan portico.',
  });
  frontDoors.add(frontHit);
  root.add(frontDoors);

  // --- Bay (east) and York (west) elevations ------------------------------
  const elevations = new THREE.Group();
  const sides = [
    { dir: 'east', sign: 1, rot: Math.PI / 2, id: 'union-bay-elevation', name: 'Union Station Bay Street elevation', tenants: tenantsFor('union-station', 'east') },
    { dir: 'west', sign: -1, rot: -Math.PI / 2, id: 'union-york-elevation', name: 'Union Station York Street elevation', tenants: tenantsFor('union-station', 'west') },
  ];
  const sideGroups = {};
  for (const s of sides) {
    const g = sideElevation({ width: b.d, height: WING_TOP, floors: 3 });
    g.position.set(s.sign * (halfW + 0.12), 0, 0);
    g.rotation.y = s.rot;
    const hit = entranceHit(4.0, 4.2);
    hit.position.z = 1.2;
    registerInteractive(hit, {
      building: b.name, address: b.address,
      tenant: s.tenants[0]?.name ?? `${s.dir} entrance`,
      category: 'transit', confidence: 'reference',
      note: s.dir === 'west'
        ? 'York Street entrance. The head house ends 29 m short of York; the plaza fills the gap.'
        : 'Bay Street entrance, above the below-grade Union Station Loop.',
    });
    g.add(hit);
    elevations.add(g);
    sideGroups[s.id] = { group: g, spec: s };
  }
  root.add(elevations);

  // --- Registration -------------------------------------------------------
  register({
    id: 'union-station', name: b.name, kind: 'landmark', object: root,
    confidence: 'reference',
    source: 'Ross & Macdonald / Hugh Jones / John M. Lyle, 1914-27; proportions from published elevations and photography',
    note: b.note,
    data: { address: b.address, height: ROOF_TOP, columns: COLUMN_COUNT, westEndX: b.x - halfW },
  });
  register({
    id: 'union-colonnade', name: 'Union Station Front Street colonnade', kind: 'landmark',
    object: portico, confidence: 'reference',
    source: '22 Roman Tuscan columns, unfluted, ~12 m shafts on a stepped stylobate',
    note: `${COLUMN_COUNT} columns at ${COLUMN_SPACING} m centres span ${((COLUMN_COUNT - 1) * COLUMN_SPACING).toFixed(1)} m across the central block.`,
    data: { count: COLUMN_COUNT, spacing: COLUMN_SPACING, shaftHeight: COLUMN_H },
  });
  register({
    id: 'union-entablature', name: 'Union Station entablature and incised frieze', kind: 'landmark',
    object: entablature, confidence: 'reference',
    source: 'incised railway names carved into the Front Street frieze',
    note: 'Exterior frieze carries RAILWAY NAMES ONLY (Grand Trunk Railway System / Canadian National Railways). The carved list of Canadian destination cities is INSIDE, on the Great Hall walls, and is deliberately absent here.',
  });
  register({
    id: 'union-attic-storey', name: 'Union Station attic storey', kind: 'landmark',
    object: attic, confidence: 'inferred',
    source: 'attic band above the entablature, below the crowning cornice',
  });
  register({
    id: 'union-wings', name: 'Union Station east and west wings', kind: 'landmark',
    object: wings, confidence: 'inferred',
    source: 'wings stepping down from the central block',
    note: `Each wing is ${wingW} m wide and stops at ${WING_TOP} m, below the ${ATTIC_TOP} m central block.`,
  });
  register({
    id: 'union-front-entrance-doors', name: 'Union Station Front Street entrance doors', kind: 'frontage',
    object: frontDoors, confidence: 'reference',
    source: 'door bays aligned to the portico intercolumniation',
    data: { bays: doorBays },
  });
  for (const [id, { group, spec }] of Object.entries(sideGroups)) {
    register({
      id, name: spec.name, kind: 'frontage', object: group, confidence: 'inferred',
      source: 'pilastered limestone with punched windows and a single entrance bay',
      note: spec.dir === 'west'
        ? 'York elevation sits at x = -241; York Street is at x = -270. The gap is plaza and vehicle ramps, not building.'
        : '',
    });
  }

  return root;
}
