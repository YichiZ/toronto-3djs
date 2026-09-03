/**
 * Shared material library.
 *
 * Every module pulls its materials from here rather than instantiating its own,
 * so the scene keeps a single coherent look, shares GPU programs, and the draw
 * call budget stays predictable. Materials are lazily built and cached by key.
 */
import * as THREE from 'three';
import * as T from './textures.js';

const cache = new Map();

/** @param {string} key @param {() => THREE.Material} build */
function memo(key, build) {
  let m = cache.get(key);
  if (!m) {
    m = build();
    m.name = key;
    cache.set(key, m);
  }
  return m;
}

export const M = {
  limestone: () =>
    memo('limestone', () =>
      new THREE.MeshStandardMaterial({ map: T.limestone([3, 2]), roughness: 0.82, metalness: 0.02 })),

  limestonePlain: () =>
    memo('limestonePlain', () =>
      new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.85, metalness: 0.02 })),

  freestone: () =>
    memo('freestone', () =>
      new THREE.MeshStandardMaterial({ map: T.freestone([2, 2]), roughness: 0.86, metalness: 0.0 })),

  brick: () =>
    memo('brick', () =>
      new THREE.MeshStandardMaterial({ map: T.brick([4, 6]), roughness: 0.9, metalness: 0.0 })),

  concrete: () =>
    memo('concrete', () =>
      new THREE.MeshStandardMaterial({ map: T.concrete([3, 3]), roughness: 0.93, metalness: 0.0 })),

  concretePlain: () =>
    memo('concretePlain', () =>
      new THREE.MeshStandardMaterial({ color: 0x9a9791, roughness: 0.94 })),

  asphalt: () =>
    memo('asphalt', () =>
      new THREE.MeshStandardMaterial({ map: T.asphalt([40, 40]), roughness: 0.96, metalness: 0.0 })),

  sidewalk: () =>
    memo('sidewalk', () =>
      new THREE.MeshStandardMaterial({ map: T.sidewalk([30, 30]), roughness: 0.9 })),

  forecourt: () =>
    memo('forecourt', () =>
      new THREE.MeshStandardMaterial({ map: T.forecourtPaving([8, 8]), roughness: 0.86 })),

  copper: () =>
    memo('copper', () =>
      new THREE.MeshStandardMaterial({ map: T.copperPatina([4, 3]), roughness: 0.62, metalness: 0.35 })),

  /** Royal Bank Plaza. Real gold leaf is fused into the glazing; read as warm metal. */
  goldGlass: () =>
    memo('goldGlass', () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xc9a227, metalness: 0.92, roughness: 0.14,
        envMapIntensity: 1.5, clearcoat: 0.5, clearcoatRoughness: 0.2,
      })),

  glassCool: () =>
    memo('glassCool', () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x86a3b4, metalness: 0.55, roughness: 0.12,
        transmission: 0.25, thickness: 0.4, envMapIntensity: 1.3,
      })),

  glassDark: () =>
    memo('glassDark', () =>
      new THREE.MeshPhysicalMaterial({ color: 0x2e3a44, metalness: 0.7, roughness: 0.18, envMapIntensity: 1.1 })),

  /** Clear atrium / train-shed / Galleria glazing seen from both sides. */
  glazingClear: () =>
    memo('glazingClear', () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xdfeaf0, metalness: 0.0, roughness: 0.06,
        transmission: 0.86, thickness: 0.05, side: THREE.DoubleSide,
        transparent: true, opacity: 0.42,
      })),

  steelWhite: () =>
    memo('steelWhite', () =>
      new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.45, metalness: 0.35 })),

  steelDark: () =>
    memo('steelDark', () =>
      new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.5, metalness: 0.7 })),

  paintedSteel: (color = 0x2c3138) =>
    memo(`paintedSteel:${color}`, () =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.4 })),

  terrazzo: () =>
    memo('terrazzo', () =>
      new THREE.MeshStandardMaterial({ color: 0xbfb6a4, roughness: 0.35, metalness: 0.05 })),

  guastavinoTile: () =>
    memo('guastavino', () =>
      new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.7 })),

  pathFloor: () =>
    memo('pathFloor', () =>
      new THREE.MeshStandardMaterial({ color: 0xcfc9bd, roughness: 0.28, metalness: 0.02 })),

  ceilingPanel: () =>
    memo('ceilingPanel', () =>
      new THREE.MeshStandardMaterial({ color: 0xe6e4df, roughness: 0.85 })),

  foliage: () =>
    memo('foliage', () =>
      new THREE.MeshStandardMaterial({ color: 0x4b6b3a, roughness: 0.95, flatShading: true })),

  bark: () =>
    memo('bark', () => new THREE.MeshStandardMaterial({ color: 0x4a3b2e, roughness: 0.95 })),

  grass: () =>
    memo('grass', () => new THREE.MeshStandardMaterial({ color: 0x4f6b3c, roughness: 0.98 })),

  water: () =>
    memo('water', () =>
      new THREE.MeshPhysicalMaterial({ color: 0x2b4a5c, roughness: 0.08, metalness: 0.1, transmission: 0.4, thickness: 1 })),

  /** Warm interior/shop glow. Intensity is driven by the time-of-day system. */
  litInterior: (color = 0xffd9a0) =>
    memo(`lit:${color}`, () =>
      new THREE.MeshBasicMaterial({ color })),

  signWhite: () => memo('signWhite', () => new THREE.MeshBasicMaterial({ color: 0xf4f2ec })),
};

/**
 * Every façade material built so far. The time-of-day system drives their
 * emissive intensity so the city lights up after dark.
 * @type {Set<THREE.MeshStandardMaterial>}
 */
const facadeMats = new Set();

/**
 * Build a façade material from a generated curtain-wall or punched-window map.
 *
 * The colour map doubles as the emissive map. Glass bays are the brightest part
 * of both generated textures, so scaling emissiveIntensity after sunset lights
 * the windows and leaves the spandrels and stone comparatively dark - a lit
 * skyline for the cost of one uniform, with no extra geometry, no extra draw
 * calls and no per-window lights.
 */
export function facadeMaterial(kind, opts = {}) {
  const key = `facade:${kind}:${JSON.stringify(opts)}`;
  return memo(key, () => {
    const floors = opts.floors ?? 10;
    const baysAcross = opts.baysAcross ?? 8;
    const curtain = kind === 'curtain';
    const map = curtain
      ? T.curtainWall(opts.glass ?? '#5f7c8c', opts.spandrel ?? '#3b4750', [baysAcross / 4, floors])
      : T.punchedWindows(opts.wall ?? '#c2bba8', opts.glass ?? '#40515c', [baysAcross / 4, floors]);
    // The emissive map is a separate night-window pattern, not the colour map:
    // reusing the colour map lights every bay equally and the tower reads as a
    // glowing slab. Seeded off the key so each building keeps its own pattern.
    const seed = [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
    const m = new THREE.MeshStandardMaterial({
      map,
      roughness: curtain ? 0.25 : 0.8,
      metalness: curtain ? 0.55 : 0.05,
      emissiveMap: T.nightWindows(curtain ? 'curtain' : 'punched', seed, [baysAcross / 4, floors]),
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0,
    });
    facadeMats.add(m);
    return m;
  });
}

/** Snapshot of the façade materials, for the night lighting switch. */
export const facadeMaterials = () => [...facadeMats];

/**
 * A private copy of a shared material with some properties overridden.
 *
 * Materials from `M` are CACHED AND SHARED - mutating one changes every mesh
 * using it. That bit us: two interior modules set `.side = BackSide` on
 * `M.concretePlain()` because they were inside a box, which silently flipped the
 * global ground plane, the curbs, the viaduct parapets, the Gardiner barriers
 * and the platform decks to back-facing. The ground plane then vanished from
 * both rendering and raycasts, and the walker fell 6.7 m through the street into
 * the PATH. Take a variant instead of writing to the shared instance.
 *
 * Variants are themselves cached by (base name + overrides), so calling this in
 * a loop does not leak a material per call.
 *
 * @param {THREE.Material} base a material from `M`
 * @param {Record<string, unknown>} overrides e.g. `{ side: THREE.BackSide }`
 */
export function variant(base, overrides = {}) {
  const key = `variant:${base.name ?? base.uuid}:${JSON.stringify(overrides)}`;
  return memo(key, () => Object.assign(base.clone(), overrides));
}

/** Every material currently alive, for the performance audit. */
export const materialCount = () => cache.size;

export function disposeAll() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
  T.disposeAll();
}
