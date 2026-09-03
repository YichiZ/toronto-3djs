/**
 * Reference mode — the visual-verification layer.
 *
 * The point of this mode is falsifiability. Every claim the reconstruction
 * makes should be checkable by looking:
 *
 *  - LABELS   every registered entity's id, name, source and confidence,
 *             colour-coded, so an approximated massing cannot masquerade as a
 *             surveyed one.
 *  - XRAY     wireframe massing only, for reading the block structure.
 *  - GRID     street centrelines, the boundary box, the Front & Bay origin and
 *             a TRUE-north arrow. The visible gap between the arrow and the
 *             street lines IS the 16.7° grid rotation, drawn rather than
 *             asserted.
 *  - SECTION  labelled horizontal planes at PATH / concourse / street /
 *             viaduct / platform / SkyWalk / Gardiner, so the vertical layering
 *             can be checked at a glance.
 */
import * as THREE from 'three';
import { all } from '../core/registry.js';
import { NS, EW, LEVELS, STREETS } from '../data/grid.js';
import { trueToGrid } from '../core/geo.js';

const CONFIDENCE_COLOUR = {
  surveyed: '#4ade80',
  reference: '#60a5fa',
  inferred: '#fbbf24',
  approximated: '#f87171',
};

/** Reconstruction boundary, from data/buildings.js's stated extent. */
const BOUNDS = { minX: NS.john - 60, maxX: NS.church + 40, minZ: EW.king - 60, maxZ: EW.lakeShore + 60 };

// ponytail: one canvas texture per label. Capped, because 600 unique textures
// is a VRAM problem; raise the cap or switch to a texture atlas if it bites.
const MAX_LABELS = 260;

const LAYER_NAMES = ['labels', 'xray', 'grid', 'section'];

function labelSprite(record) {
  const colour = CONFIDENCE_COLOUR[record.confidence] ?? '#cbd5e1';
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(8,12,18,0.78)';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = colour;
  g.fillRect(0, 0, 8, 128);
  g.font = '600 30px ui-sans-serif, system-ui, sans-serif';
  g.fillStyle = '#f1f5f9';
  g.fillText(record.name.slice(0, 30), 20, 38);
  g.font = '22px ui-monospace, SFMono-Regular, Menlo, monospace';
  g.fillStyle = colour;
  g.fillText(`${record.confidence} · ${record.kind}`, 20, 72);
  g.fillStyle = '#94a3b8';
  g.fillText(record.id.slice(0, 34), 20, 100);
  g.font = '18px ui-sans-serif, system-ui, sans-serif';
  g.fillText(record.source.slice(0, 46), 20, 122);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, depthTest: false, transparent: true, sizeAttenuation: true,
  }));
  sprite.scale.set(24, 6, 1);
  sprite.renderOrder = 900;
  sprite.userData.noCollide = true;
  return sprite;
}

function textPlane(text, colour, width = 60) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(6,10,16,0.7)';
  g.fillRect(0, 0, 1024, 96);
  g.font = '600 56px ui-sans-serif, system-ui, sans-serif';
  g.fillStyle = colour;
  g.fillText(text, 16, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, depthTest: false, transparent: true,
  }));
  sprite.scale.set(width, width * 96 / 1024, 1);
  sprite.renderOrder = 901;
  sprite.userData.noCollide = true;
  return sprite;
}

function lineSegments(points, colour, opacity = 0.8) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: colour, transparent: true, opacity, depthTest: false,
  }));
  mesh.renderOrder = 890;
  mesh.userData.noCollide = true;
  return mesh;
}

/** @param {import('../core/context.js').Context} ctx */
export function install(ctx) {
  const { scene, camera } = ctx;

  const root = new THREE.Group();
  root.name = 'reference-mode';
  root.visible = false;
  root.userData.noCollide = true;
  scene.add(root);

  const groups = {};
  for (const name of LAYER_NAMES) {
    groups[name] = new THREE.Group();
    groups[name].name = `reference-${name}`;
    groups[name].userData.noCollide = true;
    root.add(groups[name]);
  }
  groups.xray.visible = false; // opt-in: it hides the actual reconstruction

  // --- grid layer ---------------------------------------------------------
  {
    const pts = [];
    for (const s of STREETS) {
      if (s.axis === 'ew') {
        pts.push(new THREE.Vector3(s.from, 0.08, s.z), new THREE.Vector3(s.to, 0.08, s.z));
      } else {
        pts.push(new THREE.Vector3(s.x, 0.08, s.from), new THREE.Vector3(s.x, 0.08, s.to));
      }
      const mid = s.axis === 'ew'
        ? new THREE.Vector3((s.from + s.to) / 2, 2, s.z)
        : new THREE.Vector3(s.x, 2, (s.from + s.to) / 2);
      const tag = textPlane(s.name, '#7dd3fc', 44);
      tag.position.copy(mid);
      groups.grid.add(tag);
    }
    groups.grid.add(lineSegments(pts, 0x38bdf8, 0.85));

    // Boundary box.
    const box = new THREE.Box3(
      new THREE.Vector3(BOUNDS.minX, -8, BOUNDS.minZ),
      new THREE.Vector3(BOUNDS.maxX, 120, BOUNDS.maxZ)
    );
    const helper = new THREE.Box3Helper(box, 0xf472b6);
    helper.material.depthTest = false;
    helper.material.transparent = true;
    helper.material.opacity = 0.5;
    helper.userData.noCollide = true;
    groups.grid.add(helper);

    // Origin marker at Front & Bay.
    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf472b6, depthTest: false })
    );
    origin.position.set(0, 1.6, 0);
    origin.userData.noCollide = true;
    groups.grid.add(origin);
    const originLabel = textPlane('ORIGIN · Front & Bay · 0,0', '#f472b6', 52);
    originLabel.position.set(0, 8, 0);
    groups.grid.add(originLabel);

    // TRUE north arrow. Grid north is -Z. True north is due north expressed in
    // the grid frame, which is exactly what trueToGrid(0, -1) returns (its
    // arguments are true east and true south). The visible gap between this
    // arrow and the blue grid-north arrow IS the 16.7 deg survey rotation.
    const tn = trueToGrid(0, -1);
    const trueN = new THREE.Vector3(tn.x, 0, tn.z).normalize();
    const arrow = new THREE.ArrowHelper(trueN, new THREE.Vector3(0, 0.5, 0), 90, 0xfacc15, 16, 9);
    arrow.userData.noCollide = true;
    arrow.line.material.depthTest = false;
    arrow.cone.material.depthTest = false;
    groups.grid.add(arrow);
    const northLabel = textPlane('TRUE NORTH (grid north is 16.7 deg off)', '#facc15', 62);
    northLabel.position.copy(trueN).multiplyScalar(100).setY(10);
    groups.grid.add(northLabel);

    const gridArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.5, 0), 90, 0x38bdf8, 16, 9
    );
    gridArrow.userData.noCollide = true;
    gridArrow.line.material.depthTest = false;
    gridArrow.cone.material.depthTest = false;
    groups.grid.add(gridArrow);
    const gridLabel = textPlane('GRID NORTH (Bay Street)', '#38bdf8', 50);
    gridLabel.position.set(0, 6, -100);
    groups.grid.add(gridLabel);
  }

  // --- section layer ------------------------------------------------------
  {
    const planeGeo = new THREE.PlaneGeometry(560, 420);
    const entries = [
      ['PATH concourse', LEVELS.path, 0x818cf8],
      ['Union concourse', LEVELS.unionConcourse, 0xa78bfa],
      ['Street datum (Y=0)', LEVELS.street, 0x34d399],
      ['Rail viaduct deck', LEVELS.viaductDeck, 0xfbbf24],
      ['Platform level', LEVELS.platform, 0xfb923c],
      ['SkyWalk', LEVELS.skywalk, 0x38bdf8],
      ['Gardiner deck', LEVELS.gardinerDeck, 0xf472b6],
    ];
    for (const [name, y, colour] of entries) {
      const plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
        color: colour, transparent: true, opacity: 0.10,
        side: THREE.DoubleSide, depthWrite: false,
      }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(-150, y, 120);
      plane.userData.noCollide = true;
      groups.section.add(plane);
      const tag = textPlane(`${name}  y = ${y.toFixed(1)} m`, `#${colour.toString(16).padStart(6, '0')}`, 72);
      tag.position.set(60, y + 2, 120);
      groups.section.add(tag);
    }
  }

  // --- labels + xray, built lazily ---------------------------------------
  let builtEntities = false;
  const xrayMaterial = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc, wireframe: true, transparent: true, opacity: 0.28, depthTest: false,
  });
  const boxCache = new THREE.Box3();
  const sizeCache = new THREE.Vector3();
  const centreCache = new THREE.Vector3();

  function buildEntities() {
    if (builtEntities) return;
    builtEntities = true;
    const records = all().filter((r) => r.object);
    if (records.length > MAX_LABELS) {
      console.warn(`[referenceMode] ${records.length} entities, labelling the first ${MAX_LABELS}`);
    }
    for (const record of records.slice(0, MAX_LABELS)) {
      try {
        boxCache.setFromObject(record.object);
        if (boxCache.isEmpty()) continue;
        boxCache.getCenter(centreCache);
        boxCache.getSize(sizeCache);

        const sprite = labelSprite(record);
        sprite.position.set(centreCache.x, boxCache.max.y + 6, centreCache.z);
        groups.labels.add(sprite);

        const cage = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(sizeCache.x, 0.5), Math.max(sizeCache.y, 0.5), Math.max(sizeCache.z, 0.5)),
          xrayMaterial
        );
        cage.position.copy(centreCache);
        cage.userData.noCollide = true;
        groups.xray.add(cage);
      } catch (err) {
        console.warn(`[referenceMode] could not annotate "${record.id}"`, err);
      }
    }
  }

  // Labels are billboards already (Sprite), but they should shrink with
  // distance in a controlled way rather than vanish; scale mildly with range.
  const tmp = new THREE.Vector3();
  ctx.onFrame.push(() => {
    if (!root.visible || !groups.labels.visible) return;
    for (const sprite of groups.labels.children) {
      sprite.getWorldPosition(tmp);
      const d = tmp.distanceTo(camera.position);
      sprite.visible = d < 700;
      const s = THREE.MathUtils.clamp(d * 0.05, 12, 70);
      sprite.scale.set(s, s * 0.25, 1);
    }
  });

  let enabled = false;

  function toggle(force) {
    enabled = typeof force === 'boolean' ? force : !enabled;
    if (enabled) buildEntities();
    root.visible = enabled;
    return enabled;
  }

  function setLayer(name, force) {
    if (!LAYER_NAMES.includes(name)) throw new RangeError(`setLayer: unknown layer "${name}"`);
    const g = groups[name];
    g.visible = typeof force === 'boolean' ? force : !g.visible;
    if (g.visible && (name === 'labels' || name === 'xray')) buildEntities();
    return g.visible;
  }

  return {
    toggle,
    enabled: () => enabled,
    setLayer,
    layers: () => LAYER_NAMES.map((n) => ({ name: n, visible: groups[n].visible })),
    confidenceColours: CONFIDENCE_COLOUR,
  };
}
