/**
 * Procedural canvas textures.
 *
 * Nothing here is scraped or photographic. Each generator paints into an
 * OffscreenCanvas (falling back to a DOM canvas) and returns a cached, tiling
 * THREE.CanvasTexture. Keeping this procedural is what lets the reconstruction
 * ship without redistributing imagery from Google Earth, Street View or any
 * other proprietary source.
 */
import * as THREE from 'three';

const cache = new Map();

function makeCanvas(size) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * @param {string} key cache key
 * @param {number} size texture edge in pixels
 * @param {(ctx:CanvasRenderingContext2D, size:number)=>void} paint
 * @param {{repeat?:[number,number], srgb?:boolean, anisotropy?:number}} [opts]
 */
function texture(key, size, paint, opts = {}) {
  const cacheKey = `${key}:${size}:${opts.repeat ?? ''}:${opts.srgb !== false}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`textures: 2d context unavailable for "${key}"`);
  paint(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = opts.anisotropy ?? 8;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(cacheKey, tex);
  return tex;
}

/** Deterministic hash-noise so textures are stable across reloads. */
function noise(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function grain(ctx, size, amount, seed = 0) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const n = (noise(p % size, (p / size) | 0, seed) - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Soft radial falloff, white centre to black edge: the light a lamp throws on
 * the pavement, for an additive emissive decal (#76). Black at the rim, so the
 * repeat wrap never shows.
 */
export const lightPool = () =>
  texture('lightPool', 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#8a8a8a');
    g.addColorStop(0.7, '#262626');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, { anisotropy: 4 });

/** Bedford limestone: Union Station's colonnade, entablature and wall plane. */
export const limestone = (repeat = [4, 4]) =>
  texture('limestone', 512, (ctx, s) => {
    ctx.fillStyle = '#cfc7b4';
    ctx.fillRect(0, 0, s, s);
    const courseH = s / 8;
    for (let row = 0; row < 8; row++) {
      const top = row * courseH;
      const offset = (row % 2) * (s / 12);
      for (let col = -1; col < 6; col++) {
        const v = noise(col + 7, row + 3, 11) * 22 - 11;
        ctx.fillStyle = `rgb(${205 + v}, ${197 + v}, ${180 + v})`;
        ctx.fillRect(col * (s / 6) + offset + 1, top + 1, s / 6 - 2, courseH - 2);
      }
      ctx.strokeStyle = 'rgba(120,112,96,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(s, top);
      ctx.stroke();
    }
    grain(ctx, s, 16, 5);
  }, { repeat });

/** Ohio freestone, warmer and pinker than the station's Bedford limestone. */
export const freestone = (repeat = [3, 3]) =>
  texture('freestone', 512, (ctx, s) => {
    ctx.fillStyle = '#c8b49b';
    ctx.fillRect(0, 0, s, s);
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 5; col++) {
        const v = noise(col, row, 23) * 26 - 13;
        ctx.fillStyle = `rgb(${200 + v}, ${180 + v}, ${155 + v})`;
        ctx.fillRect(col * (s / 5) + 1, row * (s / 10) + 1, s / 5 - 2, s / 10 - 2);
      }
    }
    grain(ctx, s, 20, 9);
  }, { repeat });

/** Red-brown Toronto brick for the older Front / Wellington infill blocks. */
export const brick = (repeat = [6, 6]) =>
  texture('brick', 512, (ctx, s) => {
    ctx.fillStyle = '#6d5647';
    ctx.fillRect(0, 0, s, s);
    const rows = 20;
    const h = s / rows;
    for (let row = 0; row < rows; row++) {
      const offset = (row % 2) * (s / 16);
      for (let col = -1; col < 9; col++) {
        const v = noise(col, row, 41) * 34 - 17;
        ctx.fillStyle = `rgb(${150 + v}, ${86 + v * 0.7}, ${68 + v * 0.6})`;
        ctx.fillRect(col * (s / 8) + offset + 1, row * h + 1, s / 8 - 2, h - 2);
      }
    }
    grain(ctx, s, 14, 3);
  }, { repeat });

/** Board-formed / precast concrete for the viaduct, Gardiner and podiums. */
export const concrete = (repeat = [4, 4]) =>
  texture('concrete', 512, (ctx, s) => {
    ctx.fillStyle = '#9a9791';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const x = noise(i, 1, 17) * s;
      const y = noise(i, 2, 19) * s;
      const r = 1 + noise(i, 3, 23) * 5;
      ctx.fillStyle = `rgba(${120 + noise(i, 4, 29) * 70 | 0},${120 + noise(i, 5, 31) * 70 | 0},${118 + noise(i, 6, 37) * 70 | 0},0.22)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // form-board joints
    ctx.strokeStyle = 'rgba(80,78,74,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i * s) / 6);
      ctx.lineTo(s, (i * s) / 6);
      ctx.stroke();
    }
    grain(ctx, s, 12, 13);
  }, { repeat });

/** Roadway asphalt. */
export const asphalt = (repeat = [8, 8]) =>
  texture('asphalt', 512, (ctx, s) => {
    ctx.fillStyle = '#3a3a3c';
    ctx.fillRect(0, 0, s, s);
    grain(ctx, s, 34, 77);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${90 + noise(i, 1, 3) * 60 | 0},${90 + noise(i, 2, 5) * 60 | 0},${92 + noise(i, 3, 7) * 60 | 0},0.16)`;
      ctx.fillRect(noise(i, 4, 11) * s, noise(i, 5, 13) * s, 2 + noise(i, 6, 17) * 4, 2 + noise(i, 7, 19) * 3);
    }
  }, { repeat });

/** Precast paver sidewalk with a scored joint pattern. */
export const sidewalk = (repeat = [10, 10]) =>
  texture('sidewalk', 512, (ctx, s) => {
    ctx.fillStyle = '#9d9a94';
    ctx.fillRect(0, 0, s, s);
    const n = 4;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const v = noise(r, c, 61) * 18 - 9;
        ctx.fillStyle = `rgb(${162 + v},${159 + v},${152 + v})`;
        ctx.fillRect((c * s) / n + 2, (r * s) / n + 2, s / n - 4, s / n - 4);
      }
    }
    grain(ctx, s, 12, 43);
  }, { repeat });

/**
 * The forecourt's granite-banded paving. Union Station's revitalised
 * pedestrian promenade reads as broad light bands with darker inlays.
 */
export const forecourtPaving = (repeat = [6, 6]) =>
  texture('forecourt', 512, (ctx, s) => {
    ctx.fillStyle = '#b0aca4';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#8d8880' : '#b8b4ac';
      ctx.fillRect(0, (i * s) / 8, s, s / 8 - 3);
    }
    grain(ctx, s, 10, 71);
  }, { repeat });

/** Weathered copper for the Royal York's chateau roof. */
export const copperPatina = (repeat = [3, 3]) =>
  texture('copper', 512, (ctx, s) => {
    ctx.fillStyle = '#4e8f7d';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      const g = noise(i, 1, 91);
      ctx.fillStyle = `rgba(${60 + g * 40 | 0},${130 + g * 45 | 0},${112 + g * 35 | 0},0.35)`;
      ctx.beginPath();
      ctx.arc(noise(i, 2, 93) * s, noise(i, 3, 97) * s, 3 + g * 16, 0, Math.PI * 2);
      ctx.fill();
    }
    // standing seams
    ctx.strokeStyle = 'rgba(38,80,68,0.5)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo((i * s) / 10, 0);
      ctx.lineTo((i * s) / 10, s);
      ctx.stroke();
    }
    grain(ctx, s, 10, 101);
  }, { repeat });

/**
 * Curtain-wall panel: one storey tall, N bays wide, with spandrel and mullions.
 * Used as the emissive/colour map for mid-rise and tower façades.
 * @param {string} glass base glass colour
 * @param {string} spandrel opaque band colour
 */
export const curtainWall = (glass = '#5f7c8c', spandrel = '#3b4750', repeat = [1, 1]) =>
  texture(`curtain:${glass}:${spandrel}`, 256, (ctx, s) => {
    ctx.fillStyle = spandrel;
    ctx.fillRect(0, 0, s, s);
    const bays = 4;
    const glazeH = s * 0.72;
    for (let b = 0; b < bays; b++) {
      const w = s / bays;
      const v = noise(b, 0, 131) * 22 - 11;
      ctx.fillStyle = shade(glass, v);
      ctx.fillRect(b * w + 3, 3, w - 6, glazeH - 6);
    }
    ctx.strokeStyle = 'rgba(20,24,28,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
  }, { repeat });

/** Window-grid map for masonry façades: punched openings in a stone field. */
export const punchedWindows = (wall = '#c2bba8', glass = '#40515c', repeat = [1, 1]) =>
  texture(`punched:${wall}:${glass}`, 256, (ctx, s) => {
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, s, s);
    const bays = 4;
    for (let b = 0; b < bays; b++) {
      const w = s / bays;
      ctx.fillStyle = shade(glass, noise(b, 1, 151) * 18 - 9);
      ctx.fillRect(b * w + w * 0.22, s * 0.16, w * 0.56, s * 0.6);
      ctx.strokeStyle = 'rgba(60,56,48,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b * w + w * 0.22, s * 0.16, w * 0.56, s * 0.6);
    }
    grain(ctx, s, 10, 157);
  }, { repeat });

/**
 * Night emissive map for a facade.
 *
 * Matches the bay grid of {@link curtainWall} / {@link punchedWindows} but paints
 * only the LIT bays, everything else black. Roughly half the offices are dark at
 * any hour, and that scatter is what makes a skyline read as occupied rather
 * than as a glowing slab. Deterministic, so a tower's lit pattern is stable
 * across reloads instead of flickering on every rebuild.
 *
 * @param {'curtain'|'punched'} kind
 * @param {number} seed distinct per building so no two towers share a pattern
 */
export const nightWindows = (kind = 'curtain', seed = 0, repeat = [1, 1]) =>
  texture(`night:${kind}:${seed}`, 256, (ctx, s) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, s, s);
    const bays = 4;
    const w = s / bays;
    const curtain = kind === 'curtain';
    const glazeH = curtain ? s * 0.72 : s * 0.6;
    const top = curtain ? 3 : s * 0.16;
    for (let b = 0; b < bays; b++) {
      const lit = noise(b + 3, seed + 11, 211);
      if (lit < 0.42) continue;                       // dark office
      // Warm tungsten through cool fluorescent, plus a little level variation.
      const warm = noise(b + 7, seed + 17, 223);
      const level = 0.55 + 0.45 * noise(b + 13, seed + 29, 227);
      const r = Math.round((255 * (0.78 + 0.22 * warm)) * level);
      const g = Math.round((255 * (0.74 + 0.20 * warm)) * level);
      const bl = Math.round((255 * (0.62 + 0.34 * (1 - warm))) * level);
      ctx.fillStyle = `rgb(${r},${g},${bl})`;
      if (curtain) ctx.fillRect(b * w + 3, top, w - 6, glazeH - 6);
      else ctx.fillRect(b * w + w * 0.22, top, w * 0.56, glazeH);
    }
  }, { repeat, srgb: true });

function shade(hex, delta) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp((n >> 16) + delta)},${clamp(((n >> 8) & 255) + delta)},${clamp((n & 255) + delta)})`;
}

export { shade, noise };

/** Release every cached texture. Called on teardown and by the QA harness. */
export function disposeAll() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
