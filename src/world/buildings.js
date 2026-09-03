/**
 * Generic building builder.
 *
 * Consumes every record in the building database that no landmark module owns
 * and produces three levels of fidelity in one object:
 *   L1 massing      correct footprint, height, roofline, setbacks
 *   L2 facade       storey-accurate window rhythm, cornice, base course
 *   L3 street level  glazed retail bays, entrances, awnings on the faces that
 *                    actually front a street
 *
 * Faces that front a street are derived from the grid table, not authored, so a
 * building never grows a storefront onto a blank party wall and never presents
 * a bare back side to a street it actually faces.
 */
import * as THREE from 'three';
import { genericBuildings, footprint } from '../data/buildings.js';
import { STREETS, corridorWidth } from '../data/grid.js';
import { massing, cornice, plinth, storefrontBand, awning, doorway, roofPlant } from './buildingKit.js';
import { M } from '../core/materials.js';
import { register, registerInteractive } from '../core/registry.js';
import { tenantsFor } from '../data/tenants.js';

const STREET_FACE_TOLERANCE = 14; // metres from the building face to the walk

/**
 * Which of a building's four faces front a street corridor.
 * @returns {Array<{dir:'north'|'south'|'east'|'west', street:object, offset:number}>}
 */
export function streetFaces(b) {
  const fp = footprint(b);
  const faces = [];
  for (const s of STREETS) {
    const half = corridorWidth(s) / 2;
    if (s.axis === 'ew') {
      const lo = Math.min(s.from, s.to);
      const hi = Math.max(s.from, s.to);
      if (fp.maxX < lo - 5 || fp.minX > hi + 5) continue;
      const walkNorth = s.z - s.road / 2 - s.northWalk;
      const walkSouth = s.z + s.road / 2 + s.southWalk;
      if (Math.abs(fp.minZ - walkNorth) < STREET_FACE_TOLERANCE) faces.push({ dir: 'north', street: s });
      if (Math.abs(fp.maxZ - walkSouth) < STREET_FACE_TOLERANCE) faces.push({ dir: 'south', street: s });
    } else {
      const lo = Math.min(s.from, s.to);
      const hi = Math.max(s.from, s.to);
      if (fp.maxZ < lo - 5 || fp.minZ > hi + 5) continue;
      const walkWest = s.x - s.road / 2 - s.westWalk;
      const walkEast = s.x + s.road / 2 + s.eastWalk;
      if (Math.abs(fp.minX - walkEast) < STREET_FACE_TOLERANCE) faces.push({ dir: 'west', street: s });
      if (Math.abs(fp.maxX - walkWest) < STREET_FACE_TOLERANCE) faces.push({ dir: 'east', street: s });
    }
  }
  return faces;
}

/** Place a face-local group onto one side of a footprint. */
function orientToFace(group, b, dir, inset = 0.05) {
  switch (dir) {
    case 'north': group.position.set(0, 0, -b.d / 2 - inset); group.rotation.y = Math.PI; break;
    case 'south': group.position.set(0, 0, b.d / 2 + inset); break;
    case 'east': group.position.set(b.w / 2 + inset, 0, 0); group.rotation.y = Math.PI / 2; break;
    case 'west': group.position.set(-b.w / 2 - inset, 0, 0); group.rotation.y = -Math.PI / 2; break;
  }
  return group;
}

const faceWidth = (b, dir) => (dir === 'north' || dir === 'south' ? b.w : b.d);

const AWNING_COLOURS = [0x7a2b30, 0x2f4a3c, 0x2b3c58, 0x5a4326, 0x3d3d42];

/** Build the ground-floor retail treatment and register each frontage. */
function buildStreetLevel(b, dir, group) {
  const width = faceWidth(b, dir);
  const { group: band, bays } = storefrontBand({ width: width - 1.2, height: 4.2, bayWidth: 6.0 });
  const face = new THREE.Group();
  face.add(band);

  const tenants = tenantsFor(b.id, dir);
  bays.forEach((bay, i) => {
    const tenant = tenants[i % Math.max(1, tenants.length)] ?? null;
    if (i % 2 === 0) {
      const a = awning({ width: bay.width - 0.9, color: AWNING_COLOURS[(i + b.id.length) % AWNING_COLOURS.length] });
      a.position.x = bay.x;
      face.add(a);
    }
    if (i === Math.floor(bays.length / 2)) {
      const d = doorway({ width: 2.4, height: 3.2 });
      d.position.x = bay.x;
      face.add(d);
    }
    // Interaction volume in front of the bay - thin, so it never blocks walking.
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(bay.width - 0.4, 3.6, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(bay.x, 1.9, 0.6);
    registerInteractive(hit, {
      building: b.name,
      address: b.address,
      tenant: tenant?.name ?? 'Vacant unit',
      category: tenant?.category ?? 'vacant',
      confidence: tenant?.confidence ?? 'approximated',
      note: tenant?.note ?? '',
    });
    face.add(hit);
  });

  // Street-level detail is the biggest draw-call contributor and is illegible
  // past a couple of blocks; the LOD system switches it off beyond the near band.
  face.userData.lod = { band: 'near' };
  orientToFace(face, b, dir);
  group.add(face);
  return bays.length;
}

export function build() {
  const root = new THREE.Group();
  root.name = 'generic-buildings';
  let frontages = 0;

  for (const b of genericBuildings()) {
    const g = new THREE.Group();
    g.name = b.id;
    g.position.set(b.x, 0, b.z);

    const floors = b.floors ?? Math.max(1, Math.round(b.height / 3.6));
    const shell = massing({
      width: b.w, depth: b.d, height: b.height, floors,
      kind: b.kind ?? 'punched', palette: b.palette ?? {},
    });
    g.add(shell);

    // L2: base course and crowning cornice give every block a silhouette.
    g.add(plinth({ width: b.w, depth: b.d, height: 1.1, material: b.kind === 'curtain' ? M.concretePlain() : M.limestonePlain() }));
    g.add(cornice({
      width: b.w, depth: b.d, y: b.height + 0.35, thickness: 0.9, overhang: 0.55,
      material: b.kind === 'curtain' ? M.concretePlain() : M.limestonePlain(),
    }));

    // L3: retail only where the building actually meets a sidewalk.
    const faces = streetFaces(b);
    const seen = new Set();
    for (const f of faces) {
      if (seen.has(f.dir)) continue;
      seen.add(f.dir);
      frontages += buildStreetLevel(b, f.dir, g);
    }

    const plant = roofPlant({ width: b.w, depth: b.d, y: b.height + 0.8, seed: b.id.length * 7 });
    plant.userData.lod = { band: 'mid' };
    g.add(plant);

    root.add(g);
    register({
      id: b.id, name: b.name, kind: 'building', object: g,
      confidence: b.confidence ?? 'approximated',
      source: 'massing from block geometry; facade proportion from imagery',
      note: b.note ?? '',
      data: { address: b.address, height: b.height, floors, streetFaces: [...seen] },
    });
  }

  root.userData.frontages = frontages;
  return root;
}
