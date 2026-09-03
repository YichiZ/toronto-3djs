/**
 * Scene registry.
 *
 * Every reconstructed entity registers itself here with provenance metadata.
 * Three consumers depend on it:
 *   - the QA harness, which counts buildings / tenants / interiors and audits
 *     coverage without walking the Three.js graph;
 *   - the interaction layer, which raycasts only against registered frontages;
 *   - reference mode, which annotates objects with their source and confidence.
 *
 * Registration is append-only and returns a frozen record; nothing mutates an
 * entry after it is filed.
 */

/** @typedef {'building'|'landmark'|'interior'|'frontage'|'street'|'infrastructure'|'prop'|'system'} EntityKind */
/** @typedef {'surveyed'|'reference'|'inferred'|'approximated'} Confidence */

const entries = [];
const byId = new Map();
const interactive = [];

/**
 * @param {object} spec
 * @param {string} spec.id stable slug, unique across the scene
 * @param {string} spec.name human-readable label
 * @param {EntityKind} spec.kind
 * @param {import('three').Object3D} [spec.object]
 * @param {Confidence} [spec.confidence]
 * @param {string} [spec.source] where the geometry came from
 * @param {string} [spec.note] uncertainty note, surfaced in reference mode
 * @param {object} [spec.data] arbitrary extra payload (tenant list, address, ...)
 */
export function register(spec) {
  if (!spec || typeof spec.id !== 'string' || !spec.id) {
    throw new TypeError('registry.register: spec.id is required');
  }
  if (byId.has(spec.id)) {
    throw new Error(`registry.register: duplicate id "${spec.id}"`);
  }
  const record = Object.freeze({
    id: spec.id,
    name: spec.name ?? spec.id,
    kind: spec.kind ?? 'prop',
    object: spec.object ?? null,
    confidence: spec.confidence ?? 'inferred',
    source: spec.source ?? 'procedural reconstruction',
    note: spec.note ?? '',
    data: Object.freeze(spec.data ?? {}),
  });
  entries.push(record);
  byId.set(record.id, record);
  if (record.object) {
    record.object.userData.registryId = record.id;
    record.object.userData.registryKind = record.kind;
  }
  return record;
}

/**
 * Mark an object as raycast-interactive (storefronts, doors, exhibits).
 *
 * Interaction volumes are invisible via `material.visible = false`, which leaves
 * `object.visible === true` - so the walker's collision raycast, which can only
 * see object visibility, would treat all 400-odd of them as solid walls. Several
 * are free-standing in walkable floor (the Union Loop mezzanine, the Stanley Cup
 * plinth), so this flag is what keeps the player from being stopped by nothing.
 */
export function registerInteractive(object, payload) {
  if (!object) throw new TypeError('registerInteractive: object is required');
  object.userData.interactive = true;
  object.userData.noCollide = true;
  object.userData.payload = Object.freeze(payload ?? {});
  interactive.push(object);
  return object;
}

export const getInteractive = () => interactive.slice();
export const all = () => entries.slice();
export const get = (id) => byId.get(id) ?? null;
export const countByKind = (kind) => entries.reduce((n, e) => n + (e.kind === kind ? 1 : 0), 0);

/** Aggregate snapshot consumed by the QA report generator. */
export function summary() {
  const kinds = {};
  const confidence = {};
  for (const e of entries) {
    kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    confidence[e.confidence] = (confidence[e.confidence] ?? 0) + 1;
  }
  return {
    total: entries.length,
    kinds,
    confidence,
    interactive: interactive.length,
    uncertain: entries.filter((e) => e.note).map((e) => ({ id: e.id, note: e.note })),
  };
}
