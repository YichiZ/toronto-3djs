/**
 * What the player is aiming at: the storefront, door or exhibit under a ray -
 * unless something solid stands in front of it.
 *
 * One rule for three callers (issue #9): a click, the walk-mode hover hint that
 * runs a few times a second, and the F key that opens whatever the hint names.
 * It used to live inline in hud.js's pick(); the hint and the key would
 * otherwise have been two more copies of the occlusion rule, free to drift.
 *
 * Pure Three, so `npm test` covers it: hud.js touches the DOM.
 */

/** Nearest ancestor carrying a registry id - the entity a mesh belongs to. */
export function registryRoot(node) {
  let n = node;
  while (n && !n.userData?.registryId) n = n.parent;
  return n;
}

/**
 * Is `hit` a solid thing standing between the camera and the frontage?
 *
 * Geometry belonging to the SAME registered entity does not count: the
 * storefront's own glazing sits a few centimetres in front of its interaction
 * volume, and treating that as an occluder would make every frontage
 * unclickable. Invisible, non-colliding and interactive geometry is skipped
 * for the same reason the walker skips it.
 */
export function occludes(hit, ownRoot) {
  if (!hit.face) return false;
  // A proxy from the collision index is not in the scene graph; its source is,
  // and that is where its visibility and its owning entity are.
  for (let o = hit.object.userData?.collisionSource ?? hit.object; o; o = o.parent) {
    if (o.visible === false || o.userData?.noCollide || o.userData?.interactive) return false;
    if (ownRoot && o === ownRoot) return false;
  }
  return true;
}

/**
 * The interactive node under `raycaster`'s ray within `range`, or null.
 *
 * The interaction volumes are the only first-pass candidates, so nothing in the
 * world can occlude them on its own - without the second pass, clicking a blank
 * wall opens the card for a frontage on the far side of the building.
 *
 * WHY THE BLOCKERS ARE A FUNCTION. The second pass is a ray of up to 40 m, and
 * against the whole scene it walks every city-wide instanced set: measured at
 * 7.45 ms a probe with a storefront under the reticle. On the hint's 0.25 s
 * tick that is a 7 ms hitch four times a second. The app passes the walker's
 * collision index (issue #6) instead, which answers the same question over the
 * static world. Moving things then no longer occlude - which is also what you
 * want: the hint should not flicker as a bus goes by.
 *
 * @param {import('three').Raycaster} raycaster already aimed; setFromCamera also
 *        sets .camera, which Sprite.raycast dereferences
 * @param {import('three').Object3D[]} targets interaction volumes
 * @param {(rc: import('three').Raycaster) => import('three').Intersection[]} castBlockers
 *        everything that can stand in the way along rc, nearest first
 * @param {number} range metres
 * @returns {{node: import('three').Object3D, distance: number} | null}
 */
export function aimAt(raycaster, targets, castBlockers, range) {
  if (!targets.length) return null;
  raycaster.far = range;
  const hit = raycaster.intersectObjects(targets, true)[0];
  if (!hit) return null;
  let node = hit.object;
  while (node && !node.userData?.payload) node = node.parent;
  if (!node) return null;
  const ownRoot = registryRoot(node);
  raycaster.far = Math.max(0, hit.distance - 0.02);
  const blockers = castBlockers(raycaster);
  raycaster.far = range;
  for (const b of blockers) {
    if (occludes(b, ownRoot)) return null;
  }
  return { node, distance: hit.distance };
}
