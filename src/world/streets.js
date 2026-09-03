/**
 * Roadways, curbs, sidewalks, crossings and lane markings.
 *
 * Streets are built from the grid table rather than drawn by eye, so an
 * intersection is always exactly the overlap of two corridors and the curb
 * returns line up. The rail corridor punches the four underpasses through the
 * viaduct; that geometry lives in railCorridor.js and only the roadway passes
 * through here.
 */
import * as THREE from 'three';
import { STREETS, EW, NS, corridorWidth } from '../data/grid.js';
import { M } from '../core/materials.js';
import { register } from '../core/registry.js';

const CURB_HEIGHT = 0.15;

/** Flat XZ quad at a given Y, facing up. */
function slab(w, d, material, y = 0) {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function curb(length, axis) {
  const geo = axis === 'ew'
    ? new THREE.BoxGeometry(length, CURB_HEIGHT, 0.35)
    : new THREE.BoxGeometry(0.35, CURB_HEIGHT, length);
  const mesh = new THREE.Mesh(geo, M.concretePlain());
  mesh.receiveShadow = true;
  return mesh;
}

/** Dashed lane line as one instanced mesh per street. */
function laneMarkings(street) {
  const paint = new THREE.MeshBasicMaterial({ color: 0xd9d4c4 });
  const len = street.axis === 'ew' ? Math.abs(street.to - street.from) : Math.abs(street.to - street.from);
  const dash = 3;
  const gap = 5;
  const n = Math.max(1, Math.floor(len / (dash + gap)));
  const lanes = Math.max(1, Math.floor(street.lanes / 2) - 0);
  const lineCount = Math.max(1, lanes);
  const geo = street.axis === 'ew'
    ? new THREE.BoxGeometry(dash, 0.02, 0.14)
    : new THREE.BoxGeometry(0.14, 0.02, dash);
  const im = new THREE.InstancedMesh(geo, paint, n * lineCount);
  const m = new THREE.Matrix4();
  const start = Math.min(street.from, street.to);
  let i = 0;
  for (let l = 0; l < lineCount; l++) {
    // offset each line from the centreline out toward the curbs
    const off = (l - (lineCount - 1) / 2) * (street.road / lineCount);
    for (let k = 0; k < n; k++) {
      const t = start + k * (dash + gap) + dash / 2;
      if (street.axis === 'ew') m.makeTranslation(t, 0.03, street.z + off);
      else m.makeTranslation(street.x + off, 0.03, t);
      im.setMatrixAt(i++, m);
    }
  }
  im.count = i;
  im.instanceMatrix.needsUpdate = true;
  return im;
}

/** Zebra crossing bars at an intersection approach. */
function crossing(x, z, axis, width, span) {
  const paint = new THREE.MeshBasicMaterial({ color: 0xe4e0d2 });
  const bars = Math.max(3, Math.floor(span / 1.1));
  const geo = axis === 'ew'
    ? new THREE.BoxGeometry(0.5, 0.02, width)
    : new THREE.BoxGeometry(width, 0.02, 0.5);
  const im = new THREE.InstancedMesh(geo, paint, bars);
  const m = new THREE.Matrix4();
  for (let i = 0; i < bars; i++) {
    const t = -span / 2 + (span / (bars - 1)) * i;
    if (axis === 'ew') m.makeTranslation(x + t, 0.025, z);
    else m.makeTranslation(x, 0.025, z + t);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}

export function build() {
  const group = new THREE.Group();
  group.name = 'streets';

  // One shared ground plane keeps the horizon closed behind the modelled blocks.
  const ground = slab(4200, 3600, M.asphalt(), -0.06);
  ground.position.set(-320, -0.06, 40);
  ground.material = M.concretePlain();
  group.add(ground);

  for (const s of STREETS) {
    const g = new THREE.Group();
    g.name = `street-${s.id}`;
    const length = Math.abs(s.to - s.from);
    const mid = (s.from + s.to) / 2;

    if (s.axis === 'ew') {
      const road = slab(length, s.road, M.asphalt());
      road.position.set(mid, 0, s.z);
      g.add(road);

      const nWalk = slab(length, s.northWalk, M.sidewalk(), CURB_HEIGHT);
      nWalk.position.set(mid, CURB_HEIGHT, s.z - s.road / 2 - s.northWalk / 2);
      const sWalk = slab(length, s.southWalk, M.sidewalk(), CURB_HEIGHT);
      sWalk.position.set(mid, CURB_HEIGHT, s.z + s.road / 2 + s.southWalk / 2);
      g.add(nWalk, sWalk);

      const cn = curb(length, 'ew');
      cn.position.set(mid, CURB_HEIGHT / 2, s.z - s.road / 2);
      const cs = curb(length, 'ew');
      cs.position.set(mid, CURB_HEIGHT / 2, s.z + s.road / 2);
      g.add(cn, cs);
      g.add(laneMarkings(s));
    } else {
      const road = slab(s.road, length, M.asphalt());
      road.position.set(s.x, 0, mid);
      g.add(road);

      const wWalk = slab(s.westWalk, length, M.sidewalk(), CURB_HEIGHT);
      wWalk.position.set(s.x - s.road / 2 - s.westWalk / 2, CURB_HEIGHT, mid);
      const eWalk = slab(s.eastWalk, length, M.sidewalk(), CURB_HEIGHT);
      eWalk.position.set(s.x + s.road / 2 + s.eastWalk / 2, CURB_HEIGHT, mid);
      g.add(wWalk, eWalk);

      const cw = curb(length, 'ns');
      cw.position.set(s.x - s.road / 2, CURB_HEIGHT / 2, mid);
      const ce = curb(length, 'ns');
      ce.position.set(s.x + s.road / 2, CURB_HEIGHT / 2, mid);
      g.add(cw, ce);
      g.add(laneMarkings(s));
    }

    group.add(g);
    register({
      id: `street-${s.id}`, name: s.name, kind: 'street', object: g,
      confidence: 'reference', source: 'Toronto Centreline geometry, widths measured from imagery',
      note: s.note ?? '', data: { width: corridorWidth(s), lanes: s.lanes },
    });
  }

  // Crossings at the intersections that carry the most foot traffic.
  const crossingSpots = [
    [NS.bay, EW.front], [NS.york, EW.front], [NS.yonge, EW.front],
    [NS.bay, EW.wellington], [NS.yonge, EW.wellington], [NS.bay, EW.king],
    [NS.york, EW.bremner], [NS.bay, EW.lakeShore],
  ];
  for (const [x, z] of crossingSpots) {
    group.add(crossing(x, z - 13, 'ew', 4.5, 16));
    group.add(crossing(x, z + 13, 'ew', 4.5, 16));
    group.add(crossing(x - 13, z, 'ns', 4.5, 16));
    group.add(crossing(x + 13, z, 'ns', 4.5, 16));
  }

  return group;
}
