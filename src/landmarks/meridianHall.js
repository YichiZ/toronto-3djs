/**
 * Meridian Hall, 1 Front Street East - the 1960 O'Keefe Centre (Earle C. Morgan
 * with Peter Dickinson), later the Hummingbird Centre and the Sony Centre.
 *
 * Facts encoded here:
 *   - The signature move is a long, thin, UPSWEPT CANTILEVERED CANOPY over the
 *     Front Street entrance, running nearly the full frontage with no columns
 *     under it. Everything else on the building defers to that one line.
 *   - Behind and under the canopy the lobby is a fully glazed two-storey wall,
 *     so at night the canopy floats over a lit glass box.
 *   - Above and behind, the auditorium and fly tower are a windowless mass in
 *     patterned precast - deliberately blank, which is what makes the canopy
 *     read.
 *   - "MERIDIAN HALL" on the canopy fascia is drawn as original canvas lettering
 *     from photographic proportion; no scraped brand artwork is used anywhere.
 *
 * Orientation: the database footprint puts the Front Street entrance on the
 * grid-north (-Z) face, so the canopy cantilevers toward -Z.
 */
import * as THREE from 'three';
import { getBuilding } from '../data/buildings.js';
import { M } from '../core/materials.js';
import { register, registerInteractive } from '../core/registry.js';
import { tenantsFor } from '../data/tenants.js';

const b = getBuilding('meridian-hall');

const LOBBY_H = 9.0;          // two storeys of glazing under the canopy
const CANOPY_Y = 11.2;        // soffit height, just clear of the lobby head
const CANOPY_PROJECTION = 8.5;
const PODIUM_H = 20.0;        // auditorium block; the fly tower rises above it

function instanced(geo, mat, transforms, shadow = false) {
  const im = new THREE.InstancedMesh(geo, mat, transforms.length);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(1, 1, 1);
  transforms.forEach((t, i) => {
    p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    e.set(0, t.ry ?? 0, 0);
    q.setFromEuler(e);
    im.setMatrixAt(i, m.compose(p, q, s));
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = shadow;
  return im;
}

/**
 * Marquee lettering painted into a canvas. Original geometry: letterforms are
 * drawn from the browser's own font stack at photographic proportions, never
 * traced from or composited with brand artwork.
 * @returns {THREE.CanvasTexture|null} null where no 2D canvas exists (headless).
 */
function marqueeTexture(text) {
  const W = 2048;
  const H = 128;
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(W, H);
  else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
  } else return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#1b1e22';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f2efe6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 74px "Helvetica Neue", Helvetica, Arial, sans-serif';
  // Wide tracking is the marquee's whole character; canvas has no letterSpacing
  // everywhere, so the string is stepped out glyph by glyph.
  const tracking = 16;
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, w) => a + w, 0) + tracking * (text.length - 1);
  let x = (W - total) / 2;
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x + widths[i] / 2, H / 2 + 3);
    x += widths[i] + tracking;
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** The upswept cantilever, its ribs, and the fascia that carries the marquee. */
function canopy(width) {
  const g = new THREE.Group();
  g.name = 'mh-canopy';
  const tilt = 0.1; // radians; lifts the free edge, which is the whole gesture

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.55, CANOPY_PROJECTION), M.concretePlain()
  );
  slab.rotation.x = tilt;
  slab.position.set(0, CANOPY_Y, -b.d / 2 - CANOPY_PROJECTION / 2);
  slab.castShadow = true;
  g.add(slab);

  // Tapering ribs on the soffit; they read as structure without pretending to
  // be columns - nothing touches the ground under this canopy.
  const rib = new THREE.BoxGeometry(0.35, 0.75, CANOPY_PROJECTION * 0.92);
  const ribs = [];
  const n = 21;
  for (let i = 0; i < n; i++) {
    ribs.push({
      x: -width / 2 + (width / (n - 1)) * i,
      y: CANOPY_Y - 0.5,
      z: -b.d / 2 - CANOPY_PROJECTION / 2,
    });
  }
  const ribMesh = instanced(rib, M.concretePlain(), ribs);
  ribMesh.rotation.x = tilt;
  g.add(ribMesh);

  const fasciaZ = -b.d / 2 - CANOPY_PROJECTION;
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(width, 1.5, 0.3), M.paintedSteel(0x1b1e22));
  fascia.position.set(0, CANOPY_Y + 1.2, fasciaZ);
  g.add(fascia);

  const tex = marqueeTexture('MERIDIAN HALL');
  if (tex) {
    const lettering = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.62, 1.15),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    lettering.position.set(0, CANOPY_Y + 1.2, fasciaZ - 0.18);
    lettering.rotation.y = Math.PI;
    g.add(lettering);
    g.userData.marquee = lettering;
  }
  return g;
}

export function build() {
  const root = new THREE.Group();
  root.name = 'meridian-hall';
  root.position.set(b.x, 0, b.z);

  // Auditorium podium: full footprint, blank stone/precast.
  const podium = new THREE.Mesh(new THREE.BoxGeometry(b.w, PODIUM_H, b.d), M.concrete());
  podium.position.y = PODIUM_H / 2;
  podium.castShadow = true;
  podium.receiveShadow = true;
  root.add(podium);

  // Fly tower: taller, set back from the Front Street face, windowless.
  const flyW = b.w * 0.62;
  const flyD = b.d * 0.5;
  const flyTower = new THREE.Mesh(
    new THREE.BoxGeometry(flyW, b.height - PODIUM_H, flyD), M.concrete()
  );
  flyTower.position.set(0, PODIUM_H + (b.height - PODIUM_H) / 2, b.d * 0.16);
  flyTower.castShadow = true;
  root.add(flyTower);

  // Patterned precast: a relief grid on the blank elevations. Instanced, no
  // shadow casting - the podium silhouette already carries the shadow.
  const panel = new THREE.BoxGeometry(3.4, 3.4, 0.22);
  const panels = [];
  const rows = Math.floor((PODIUM_H - LOBBY_H) / 3.8);
  for (let r = 0; r < rows; r++) {
    const y = LOBBY_H + 2.0 + r * 3.8;
    for (let c = 0; c < Math.floor(b.w / 3.9); c++) {
      const x = -b.w / 2 + 2.2 + c * 3.9;
      panels.push({ x, y, z: -b.d / 2 - 0.08 });
    }
    for (let c = 0; c < Math.floor(b.d / 3.9); c++) {
      const z = -b.d / 2 + 2.2 + c * 3.9;
      panels.push({ x: -b.w / 2 - 0.08, y, z, ry: Math.PI / 2 });
      panels.push({ x: b.w / 2 + 0.08, y, z, ry: Math.PI / 2 });
    }
  }
  root.add(instanced(panel, M.concretePlain(), panels));

  // Fully glazed two-storey lobby wall on the Front Street face, under the canopy.
  const lobbyW = b.w - 6;
  const lobby = new THREE.Group();
  lobby.name = 'mh-lobby';
  const glass = new THREE.Mesh(new THREE.BoxGeometry(lobbyW, LOBBY_H, 0.3), M.glazingClear());
  glass.position.set(0, LOBBY_H / 2, -b.d / 2 - 0.2);
  lobby.add(glass);
  const mullion = new THREE.BoxGeometry(0.2, LOBBY_H, 0.5);
  const mullions = [];
  const bays = 25;
  for (let i = 0; i <= bays; i++) {
    mullions.push({ x: -lobbyW / 2 + (lobbyW / bays) * i, y: LOBBY_H / 2, z: -b.d / 2 - 0.2 });
  }
  lobby.add(instanced(mullion, M.paintedSteel(0x2a2e33), mullions));
  const transom = new THREE.Mesh(new THREE.BoxGeometry(lobbyW, 0.4, 0.6), M.paintedSteel(0x2a2e33));
  transom.position.set(0, LOBBY_H / 2, -b.d / 2 - 0.25);
  lobby.add(transom);
  root.add(lobby);

  const hood = canopy(b.w - 3);
  root.add(hood);

  // Entrance frontage. Box office and lobby are the two real uses here.
  const tenants = tenantsFor('meridian-hall', 'north');
  const hits = [];
  tenants.slice(0, 2).forEach((tenant, i) => {
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(lobbyW / 2 - 2, 3.6, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(i === 0 ? -lobbyW / 4 : lobbyW / 4, 1.9, -b.d / 2 - 1.2);
    registerInteractive(hit, {
      building: b.name,
      address: b.address,
      tenant: tenant.name,
      category: tenant.category,
      confidence: tenant.confidence,
      note: tenant.note ?? '',
    });
    root.add(hit);
    hits.push(hit);
  });

  register({
    id: 'meridian-hall', name: b.name, kind: 'landmark', object: root,
    confidence: 'reference', source: '1960 O\'Keefe Centre; massing and canopy from photographic proportion',
    note: b.note,
    data: { address: b.address, year: 1960, formerNames: ["O'Keefe Centre", 'Hummingbird Centre', 'Sony Centre'], seats: 3191 },
  });
  register({
    id: 'mh-canopy', name: 'Cantilevered Front Street canopy', kind: 'landmark', object: hood,
    confidence: 'reference', source: 'the building\'s defining element, from elevation photographs',
    note: 'Projection (8.5 m) and upsweep angle are proportional estimates. Deliberately unsupported - no columns reach the sidewalk.',
    data: { projection: CANOPY_PROJECTION, soffitY: CANOPY_Y },
  });
  register({
    id: 'mh-lobby-glazing', name: 'Two-storey glazed lobby wall', kind: 'frontage', object: lobby,
    confidence: 'inferred', source: 'photographic proportion',
    note: 'Mullion count approximated; the real lobby glazing is a continuous curtain wall behind the canopy.',
    data: { height: LOBBY_H, bays },
  });
  register({
    id: 'mh-marquee', name: 'MERIDIAN HALL marquee lettering', kind: 'prop', object: hood.userData.marquee ?? hood,
    confidence: 'reference', source: 'original canvas lettering drawn from photographic proportion',
    note: 'Letterforms are drawn procedurally at run time; no brand artwork is embedded or fetched.',
    data: { text: 'MERIDIAN HALL' },
  });
  register({
    id: 'mh-flytower', name: 'Fly tower and auditorium mass', kind: 'building', object: flyTower,
    confidence: 'inferred', source: 'massing from the database footprint',
    note: 'Windowless by design. Fly tower plan dimensions are a proportional guess from the stage house position.',
    data: { height: b.height, cladding: 'patterned precast' },
  });

  root.userData.frontages = hits.length;
  return root;
}
