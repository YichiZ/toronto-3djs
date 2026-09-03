/**
 * Ripley's Aquarium of Canada, 288 Bremner Boulevard (2013, B+H Architects).
 *
 * Low, wide, and deliberately subordinate: it sits at the foot of the CN Tower
 * and is the one building in the southbank block that must NOT compete with the
 * tower's silhouette. Two storeys, roughly 16 m to the crest, with 5.7 million
 * litres of water and most of the galleries below the entrance level - which is
 * why the visible building is so much smaller than the attraction.
 *
 * The single feature that makes it identifiable from above (and from the
 * tower's LookOut, which is where most people see it from) is the UNDULATING
 * WAVE-FORM ROOF in light metal panel. It is built here as a real parametric
 * surface: a plane whose vertices are displaced by a sine along the grid-east
 * axis. Because the displacement is a function of X only, the east and west
 * elevations stay flat-topped and the north and south walls take the wave as a
 * profile - which is why those two walls are extruded from a sampled curve
 * rather than boxed, and why the roof needs no overhang to hide a gap.
 *
 * FRONTAGE NOTE. The tenant table keys this building's frontage 'north',
 * after Bremner Boulevard, the street it addresses. In the reconstruction's
 * grid the record's centroid sits grid-NORTH of the Bremner centreline, so the
 * face that actually meets the boulevard is the +Z one. The entrance pavilion
 * is placed on the face that meets the street, and the tenant lookup keeps the
 * street's key. See the registry note.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { EW } from '../data/grid.js';
import { tenantsFor } from '../data/tenants.js';
import { M } from '../core/materials.js';
import { register, registerInteractive } from '../core/registry.js';

const WAVES = 3.5;        // full sine cycles across the grid-east width
const TROUGH = 11.5;      // roof soffit at the low points
const SPAN_SEG = 40;      // enough to keep the crest smooth at walking distance

/** Roof height at a grid-east offset. One function, used by roof and walls. */
function roofY(x, width, crest) {
  const amp = (crest - TROUGH) / 2;
  return TROUGH + amp + amp * Math.sin((x / width) * Math.PI * 2 * WAVES);
}

/** The wave surface itself: a plane, displaced, in light metal panel. */
function buildRoof(width, depth, crest) {
  const geo = new THREE.PlaneGeometry(width, depth, SPAN_SEG, 6);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, roofY(pos.getX(i), width, crest));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, M.steelWhite());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * North and south walls, extruded from the same sine so their parapets follow
 * the roof exactly. Instanced - the two are identical, mirrored by rotation.
 */
function buildWaveWalls(width, depth, crest) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  for (let i = 0; i <= SPAN_SEG; i++) {
    const x = -width / 2 + (width * i) / SPAN_SEG;
    shape.lineTo(x, roofY(x, width, crest));
  }
  shape.lineTo(width / 2, 0);
  shape.closePath();

  const t = 0.7;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t / 2);

  const walls = new THREE.InstancedMesh(geo, M.limestonePlain(), 2);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? -1 : 1;
    p.set(0, 0, (sign * depth) / 2);
    // The far wall is turned 180 deg so the sine reads the same way from both
    // sides rather than mirroring into a different building.
    q.setFromAxisAngle(up, i === 0 ? Math.PI : 0);
    walls.setMatrixAt(i, m.compose(p, q, s));
  }
  walls.instanceMatrix.needsUpdate = true;
  walls.castShadow = true;
  walls.receiveShadow = true;
  return walls;
}

/** East and west elevations: flat-topped, because the wave runs along X. */
function buildEndWalls(width, depth, crest) {
  const g = new THREE.Group();
  for (const sign of [-1, 1]) {
    const h = roofY((sign * width) / 2, width, crest);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, depth), M.limestonePlain());
    wall.position.set((sign * width) / 2, h / 2, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
  }
  return g;
}

/** Opaque gallery box under the roof - the tanks have no daylight. */
function buildShell(width, depth) {
  const h = TROUGH - 0.6;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(width - 2, h, depth - 1.4), M.concretePlain());
  shell.position.y = h / 2;
  shell.castShadow = true;
  shell.receiveShadow = true;
  return shell;
}

let signMaterial = null;

/**
 * The blue-lit signage band. Original canvas lettering drawn from scratch in a
 * plain grotesque - the building's name, not its logotype. Nothing here is
 * traced from or derived from the operator's brand artwork.
 */
function signBand() {
  if (signMaterial) return signMaterial;
  const w = 1024;
  const h = 128;
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('aquarium: 2d context unavailable for the signage band');
  ctx.fillStyle = '#062338';
  ctx.fillRect(0, 0, w, h);
  // Cove-light wash along the bottom of the band.
  const wash = ctx.createLinearGradient(0, h, 0, 0);
  wash.addColorStop(0, 'rgba(60,190,235,0.85)');
  wash.addColorStop(1, 'rgba(20,80,130,0.1)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#eaf7ff';
  ctx.font = '600 62px system-ui, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RIPLEY’S AQUARIUM OF CANADA', w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  signMaterial = new THREE.MeshBasicMaterial({ map: tex });
  signMaterial.name = 'aq-signband';
  return signMaterial;
}

/** Glazed entrance pavilion with its canopy, on the face that meets Bremner. */
function buildEntrance(b, streetSign) {
  const g = new THREE.Group();
  const w = 26;
  const h = 9;
  const d = 5;   // pavilion depth; the canopy oversails the walk beyond it

  const glazing = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.glazingClear());
  glazing.position.set(0, h / 2, d / 2);

  // Mullions, instanced.
  const bays = 9;
  const mullions = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.24, h, 0.4), M.paintedSteel(0x20262b), bays + 1);
  const m = new THREE.Matrix4();
  for (let i = 0; i <= bays; i++) {
    mullions.setMatrixAt(i, m.makeTranslation(-w / 2 + (w * i) / bays, h / 2, d + 0.2));
  }
  mullions.instanceMatrix.needsUpdate = true;

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(w + 8, 0.5, 4), M.steelWhite());
  canopy.position.set(0, h - 1.2, d + 1.5);
  canopy.castShadow = true;

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w + 6, 2.4), streetSign);
  sign.position.set(0, h + 1.6, d + 0.3);
  sign.userData.nightLight = true;

  g.add(glazing, mullions, canopy, sign);
  g.userData.sign = sign;   // named, so the registry never indexes into children
  return g;
}

/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) {
  const b = getBuilding('ripleys-aquarium');
  if (!b) throw new Error('aquarium: building record "ripleys-aquarium" is missing');

  const group = new THREE.Group();
  group.name = 'ripleys-aquarium';
  group.position.set(b.x, 0, b.z);

  const roof = buildRoof(b.w, b.d, b.height);
  const waveWalls = buildWaveWalls(b.w, b.d, b.height);
  const endWalls = buildEndWalls(b.w, b.d, b.height);
  const shell = buildShell(b.w, b.d);

  // Face the boulevard, whichever side of it the record's centroid falls on.
  const towardStreet = EW.bremner > b.z ? 1 : -1;
  const entrance = buildEntrance(b, signBand());
  entrance.userData.lod = { band: 'mid' };
  entrance.position.z = towardStreet * (b.d / 2 - 2);
  if (towardStreet < 0) entrance.rotation.y = Math.PI;

  group.add(shell, endWalls, waveWalls, roof, entrance);

  // Visitor entrance interaction volume, in front of the doors.
  const tenants = tenantsFor('ripleys-aquarium', 'north');
  tenants.forEach((tenant, i) => {
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(11, 4, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(-6 + i * 12, 2.1, towardStreet * (b.d / 2 + 3.5));
    registerInteractive(hit, {
      building: b.name, address: b.address,
      tenant: tenant.name, category: tenant.category,
      confidence: tenant.confidence, note: tenant.note ?? '',
    });
    group.add(hit);
  });

  register({
    id: 'ripleys-aquarium', name: "Ripley's Aquarium of Canada", kind: 'landmark', object: group,
    confidence: 'inferred',
    source: 'footprint from the building database; wave roof and entrance proportion from photographic reference',
    note:
      'Wave roof is a parametric sine surface (3.5 cycles across the grid-east width, soffit 11.5 m, ' +
      `crest ${b.height} m) - the real roof is a lofted double curve, not a pure sine, and the ` +
      'cycle count is proportional rather than measured. Most of the aquarium is below grade and is ' +
      'not modelled. The tenant table keys the frontage \'north\' after Bremner Boulevard; the ' +
      "record's centroid sits grid-north of the Bremner centreline, so the entrance is built on the " +
      '+Z face, which is the one that actually meets the street here.',
    data: { address: b.address, height: b.height, floors: b.floors, waveCycles: WAVES },
  });
  register({ id: 'aq-roof', name: "Ripley's Aquarium wave roof", kind: 'landmark', object: roof,
    confidence: 'inferred', note: 'Light metal panel; sine-displaced plane, 40 segments across.' });
  register({ id: 'aq-wave-walls', name: "Ripley's Aquarium wave-profile walls", kind: 'building', object: waveWalls,
    confidence: 'inferred', note: 'North and south elevations extruded from the same sine as the roof.' });
  register({ id: 'aq-entrance', name: "Ripley's Aquarium entrance pavilion", kind: 'frontage', object: entrance,
    confidence: 'inferred', note: 'Glazed pavilion and canopy on the Bremner Boulevard frontage.' });
  register({ id: 'aq-sign', name: "Ripley's Aquarium signage band", kind: 'prop', object: entrance.userData.sign,
    confidence: 'approximated',
    note: 'Blue-lit band with original canvas lettering of the building name; not the operator logotype. Tagged userData.nightLight.' });

  return group;
}
