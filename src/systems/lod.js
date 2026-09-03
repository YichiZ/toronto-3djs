/**
 * Distance-banded detail streaming.
 *
 * Frustum culling handles what is behind you; this handles what is in front of
 * you but too far to read. Street-level detail - glazed retail bays, awnings,
 * doorways, signage, interaction volumes - is the single largest contributor to
 * the draw-call count, and none of it is legible past a couple of blocks.
 *
 * Modules opt in by tagging a group:
 *
 *   group.userData.lod = { band: 'near' }      // hidden beyond NEAR
 *   group.userData.lod = { band: 'mid' }       // hidden beyond MID
 *
 * The anchor position is taken from the group's world matrix once, at install
 * time, because these groups never move. Checking a few hundred squared
 * distances four times a second costs nothing; doing it per frame for thousands
 * of objects would cost more than the draw calls it saves.
 */
import * as THREE from 'three';
import { register } from '../core/registry.js';

/**
 * Band edges in metres. NEAR is roughly a block and a half; MID is the core.
 *
 * 210 m was chosen by measurement, not by feel: at 260 m the worst reference
 * viewpoint peaked at 2055 draw calls, over the 1800 budget, and a shopfront
 * mullion at 210 m is already under a pixel at 1080p.
 */
export const BANDS = Object.freeze({ near: 210, mid: 560 });

const CHECK_INTERVAL = 0.25;

export function install(ctx, root) {
  /** @type {Array<{obj: THREE.Object3D, radius: number, x: number, z: number}>} */
  const tracked = [];
  const pos = new THREE.Vector3();

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const lod = obj.userData?.lod;
    if (!lod) return;
    const radius = BANDS[lod.band] ?? BANDS.mid;
    obj.getWorldPosition(pos);
    tracked.push({ obj, radius: radius * radius, x: pos.x, z: pos.z });
  });

  let accum = 0;
  let visible = tracked.length;
  ctx.onFrame.push((dt) => {
    accum += dt;
    if (accum < CHECK_INTERVAL) return;
    accum = 0;
    const cx = ctx.camera.position.x;
    const cz = ctx.camera.position.z;
    let shown = 0;
    for (const t of tracked) {
      const dx = t.x - cx;
      const dz = t.z - cz;
      const near = dx * dx + dz * dz < t.radius;
      if (near !== t.obj.visible) t.obj.visible = near;
      if (near) shown++;
    }
    visible = shown;
  });

  register({
    id: 'lod-streaming', name: 'Distance-banded detail streaming', kind: 'system',
    confidence: 'surveyed', source: 'runtime system',
    data: { tracked: tracked.length, bands: BANDS },
  });

  return {
    tracked: () => tracked.length,
    visible: () => visible,
    /** Force everything on, for screenshot comparison against reference views. */
    showAll() {
      for (const t of tracked) t.obj.visible = true;
    },
  };
}
