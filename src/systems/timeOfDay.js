/**
 * Day cycle: sun, sky, fog, environment and the night lighting switch.
 *
 * WHY THE SUN COMES FROM solarPosition(): Toronto's grid is rotated 16.7 deg
 * west of true north, which is precisely why the sun drops down the Front
 * Street canyon on the evenings it does. Faking a sun angle would throw that
 * away. `solarPosition` already returns a grid-frame direction, so this module
 * never re-applies the rotation.
 *
 * Colour is driven off solar altitude rather than clock hour, so golden hour,
 * civil twilight and night arrive at the physically right moment for whatever
 * date is set instead of at hard-coded times.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { solarPosition } from '../core/geo.js';
import { facadeMaterials } from '../core/materials.js';

// Default: 21 June, 18:40 local. Low sun straight down the Front Street canyon.
const DEFAULT_DATE = new Date(Date.UTC(2024, 5, 21, 22, 40, 0));

/** Shadow box, metres. Fitted to the core blocks, not the 4 km scene. */
const SHADOW_HALF = 450;
const SHADOW_FOCUS = { x: -60, z: 40 }; // between Front & Bay and the head house

const SKY_RADIUS = 5000;

/**
 * Colour stops keyed on solar altitude in degrees. Everything between is a
 * straight lerp, which is smooth enough and costs one Color.lerpColors a frame.
 */
const STOPS = [
  { alt: -18, sky: 0x060a14, horizon: 0x101a2e, sun: 0x9fb4dc, sunI: 0.10, hemiI: 0.10, fog: 0x0d1626, exposure: 1.30, env: 0.10 },
  { alt: -6,  sky: 0x172a4c, horizon: 0x3f5480, sun: 0x6f86bd, sunI: 0.30, hemiI: 0.35, fog: 0x2b3a58, exposure: 1.18, env: 0.35 },
  { alt: 0,   sky: 0x35578c, horizon: 0xd68a55, sun: 0xff9a4a, sunI: 1.30, hemiI: 0.55, fog: 0x8d7f84, exposure: 1.05, env: 0.60 },
  { alt: 6,   sky: 0x4a7ab2, horizon: 0xffc98d, sun: 0xffb765, sunI: 2.70, hemiI: 0.70, fog: 0xc4b0a4, exposure: 1.00, env: 0.85 },
  { alt: 20,  sky: 0x5d90c6, horizon: 0xd7e2ec, sun: 0xfff0d8, sunI: 3.10, hemiI: 0.85, fog: 0xbcc9d6, exposure: 0.98, env: 1.00 },
  { alt: 60,  sky: 0x6f9fd0, horizon: 0xdfe9f2, sun: 0xfffaf0, sunI: 3.30, hemiI: 0.95, fog: 0xc6d2de, exposure: 0.95, env: 1.10 },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Toronto observes DST from the second Sunday in March to the first in November. */
function isDST(date) {
  const y = date.getUTCFullYear();
  const secondSunMarch = 14 - new Date(Date.UTC(y, 2, 14)).getUTCDay();
  const firstSunNov = 7 - new Date(Date.UTC(y, 10, 7)).getUTCDay();
  const start = Date.UTC(y, 2, secondSunMarch, 7);
  const end = Date.UTC(y, 10, firstSunNov, 6);
  return date.getTime() >= start && date.getTime() < end;
}
const tzOffsetHours = (date) => (isDST(date) ? -4 : -5);

/** Interpolate the stop table at a solar altitude, into reusable targets. */
function sampleStops(altDeg, out) {
  let i = 0;
  while (i < STOPS.length - 2 && altDeg > STOPS[i + 1].alt) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const t = clamp((altDeg - a.alt) / (b.alt - a.alt), 0, 1);
  out.sky.setHex(a.sky).lerp(new THREE.Color(b.sky), t);
  out.horizon.setHex(a.horizon).lerp(new THREE.Color(b.horizon), t);
  out.sun.setHex(a.sun).lerp(new THREE.Color(b.sun), t);
  out.fog.setHex(a.fog).lerp(new THREE.Color(b.fog), t);
  out.sunI = lerp(a.sunI, b.sunI, t);
  out.hemiI = lerp(a.hemiI, b.hemiI, t);
  out.exposure = lerp(a.exposure, b.exposure, t);
  out.env = lerp(a.env, b.env, t);
  return out;
}

function phaseFor(altDeg) {
  if (altDeg > 20) return 'day';
  if (altDeg > 4) return 'golden hour';
  if (altDeg > -0.83) return 'sunset';
  if (altDeg > -6) return 'blue hour';
  if (altDeg > -12) return 'dusk';
  return 'night';
}

/** Gradient dome. Cheaper and more controllable than a scene background texture. */
function makeSkyDome() {
  const uniforms = {
    topColor: { value: new THREE.Color(0x5d90c6) },
    bottomColor: { value: new THREE.Color(0xd7e2ec) },
    sunColor: { value: new THREE.Color(0xffb765) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    glow: { value: 0.0 },
    offset: { value: 60 },
    exponent: { value: 0.55 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor, bottomColor, sunColor;
      uniform vec3 sunDir;
      uniform float offset, exponent, glow;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float h = max(dir.y + offset / 8000.0, 0.0);
        vec3 base = mix(bottomColor, topColor, pow(h, exponent));
        // Warm halo around the sun, and a broad warm lift near the horizon
        // opposite it -- both are what make a low sun read as a low sun.
        float d = max(dot(dir, normalize(sunDir)), 0.0);
        base += sunColor * (pow(d, 8.0) * 0.45 + pow(d, 2.0) * 0.10) * glow;
        gl_FragColor = vec4(base, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 24, 16), material);
  mesh.name = 'sky-dome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

/** @param {import('../core/context.js').Context} ctx */
export function install(ctx) {
  const { scene, renderer, camera } = ctx;

  const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF;
  sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
  sc.near = 1; sc.far = 2400;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.35;
  sun.target.position.set(SHADOW_FOCUS.x, 0, SHADOW_FOCUS.z);
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd2ea, 0x4c4438, 0.85);
  scene.add(hemi);

  const sky = makeSkyDome();
  scene.add(sky);

  // Cheap indoor probe so gold glass and glazing have something to reflect.
  // RoomEnvironment ships with three and needs no asset file.
  let envTexture = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmrem.dispose();
  } catch (err) {
    console.warn('[timeOfDay] environment map unavailable', err);
  }

  if (!scene.fog) scene.fog = new THREE.Fog(0xb9c6d2, 300, 2600);

  // --- night light cache --------------------------------------------------
  // The world has not been built when install() runs (main.js lights first),
  // so the traversal is deferred and re-run only when the scene's top-level
  // child count changes. ponytail: child-count check, swap for an explicit
  // "world built" signal if modules start adding roots at runtime.
  /** @type {Array<{o: THREE.Object3D, baseIntensity: number, baseEmissive: number}>} */
  let nightLights = [];
  let lastChildCount = -1;
  /**
   * Base values are captured ONCE per object and never re-read.
   *
   * applyNight writes straight into `intensity` and `emissiveIntensity`, so a
   * second scan that re-read them would take an already-scaled value as the new
   * base and compound it: rescan at midnight and every lamp gets brighter on
   * each pass, rescan at noon and they collapse toward zero.
   * @type {WeakMap<THREE.Object3D, {intensity:number, emissive:number}>}
   */
  const nightBase = new WeakMap();

  function rescanNightLights() {
    if (scene.children.length === lastChildCount) return;
    lastChildCount = scene.children.length;
    const found = [];
    scene.traverse((o) => {
      if (o.userData?.nightLight !== true) return;
      let base = nightBase.get(o);
      if (!base) {
        const mat = o.material;
        base = {
          intensity: o.isLight ? (o.userData.nightIntensity ?? o.intensity ?? 1) : 0,
          emissive: mat && !Array.isArray(mat) && mat.emissiveIntensity != null ? mat.emissiveIntensity : 1,
        };
        nightBase.set(o, base);
      }
      found.push({ o, baseIntensity: base.intensity, baseEmissive: base.emissive });
    });
    nightLights = found;
  }

  function applyNight(amount) {
    for (const rec of nightLights) {
      const o = rec.o;
      if (o.isLight) {
        o.visible = amount > 0.02;
        o.intensity = rec.baseIntensity * amount;
      } else {
        // Storefronts and lit interiors stay as geometry all day; only their
        // emissive contribution follows the clock.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m && m.emissive) m.emissiveIntensity = rec.baseEmissive * (0.06 + 1.25 * amount);
        }
        if (o.userData.nightOnly === true) o.visible = amount > 0.05;
      }
    }
    // Lit windows. Without this the skyline goes flat black after sunset and the
    // scene stops reading as a city; the facade materials already carry their
    // colour map as an emissive map, so this is one uniform per material.
    for (const m of facadeMaterials()) m.emissiveIntensity = 1.35 * amount;
  }

  // --- state --------------------------------------------------------------
  let date = new Date(DEFAULT_DATE.getTime());
  let speed = 0; // real seconds -> simulated seconds multiplier
  let auto = false;
  let dirty = true;

  const sampled = {
    sky: new THREE.Color(), horizon: new THREE.Color(),
    sun: new THREE.Color(), fog: new THREE.Color(),
    sunI: 3, hemiI: 0.85, exposure: 1, env: 1,
  };
  const sunDir = new THREE.Vector3();
  let altDeg = 0;
  let nightAmount = 0;

  function apply() {
    const solar = solarPosition(date);
    altDeg = (solar.altitude * 180) / Math.PI;
    sampleStops(altDeg, sampled);

    // `direction` points TOWARD the sun in grid space already.
    sunDir.set(solar.direction.x, solar.direction.y, solar.direction.z).normalize();
    sun.position.copy(sunDir).multiplyScalar(1200)
      .add(new THREE.Vector3(SHADOW_FOCUS.x, 0, SHADOW_FOCUS.z));
    sun.target.position.set(SHADOW_FOCUS.x, 0, SHADOW_FOCUS.z);
    sun.target.updateMatrixWorld();

    nightAmount = smoothstep(-1, -8, altDeg);

    if (nightAmount > 0.5) {
      // Below the horizon the "sun" becomes a moon: cool, weak, and coming
      // from a plausible opposite quarter rather than up through the pavement.
      sun.position.set(SHADOW_FOCUS.x - 600, 900, SHADOW_FOCUS.z - 700);
      sun.color.setHex(0x9fb4dc);
      sun.intensity = 0.12 + 0.2 * (1 - nightAmount);
    } else {
      sun.color.copy(sampled.sun);
      sun.intensity = sampled.sunI;
    }
    sun.visible = sun.intensity > 0.01;

    hemi.intensity = sampled.hemiI;
    hemi.color.copy(sampled.sky);
    hemi.groundColor.copy(sampled.fog).multiplyScalar(0.45);

    const u = sky.material.uniforms;
    u.topColor.value.copy(sampled.sky);
    u.bottomColor.value.copy(sampled.horizon);
    u.sunColor.value.copy(sampled.sun);
    u.sunDir.value.copy(sunDir);
    // Warm sky glow persists a little into the night (city light on cloud).
    u.glow.value = Math.max(1 - smoothstep(6, -6, altDeg) * 0, 0);
    u.glow.value = clamp(1.15 - Math.abs(altDeg) / 22, 0.12, 1.15);

    scene.fog.color.copy(sampled.fog);
    scene.fog.near = 300;
    scene.fog.far = nightAmount > 0.5 ? 1900 : 2600;
    scene.background = null; // the dome is the background
    scene.environmentIntensity = sampled.env;
    renderer.toneMappingExposure = sampled.exposure;

    rescanNightLights();
    // The generated environment map is a constant image-based light, and the
    // stop table alone did not take it low enough: limestone stayed at noon
    // brightness under a midnight sky. Fold the night factor in on top.
    scene.environmentIntensity *= 1 - 0.86 * nightAmount;

    applyNight(nightAmount);
    dirty = false;
  }

  apply();

  ctx.onFrame.push((dt) => {
    sky.position.copy(camera.position);
    if (auto && speed !== 0) {
      date = new Date(date.getTime() + dt * 1000 * speed);
      dirty = true;
    }
    if (dirty) apply();
  });

  /** Local (Toronto) hour, fractional. */
  function getHour() {
    const shifted = date.getTime() + tzOffsetHours(date) * 3600000;
    const d = new Date(shifted);
    return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  }

  function setHour(h) {
    if (!Number.isFinite(h)) throw new TypeError(`setHour: expected a number, received ${h}`);
    const wrapped = ((h % 24) + 24) % 24;
    const off = tzOffsetHours(date);
    const local = new Date(date.getTime() + off * 3600000);
    local.setUTCHours(Math.floor(wrapped), Math.round((wrapped % 1) * 60), 0, 0);
    date = new Date(local.getTime() - off * 3600000);
    dirty = true;
    apply();
    return getHour();
  }

  function setDate(d) {
    const next = d instanceof Date ? new Date(d.getTime()) : new Date(d);
    if (Number.isNaN(next.getTime())) throw new TypeError('setDate: invalid date');
    date = next;
    dirty = true;
    apply();
    return new Date(date.getTime());
  }

  function setSpeed(multiplier) {
    if (!Number.isFinite(multiplier)) throw new TypeError('setSpeed: expected a number');
    speed = multiplier;
    auto = multiplier !== 0;
    return speed;
  }

  function toggleAuto() {
    auto = !auto;
    if (auto && speed === 0) speed = 600; // 10 simulated minutes a second
    return auto;
  }

  const state = () => ({
    hour: getHour(),
    date: new Date(date.getTime()),
    phase: phaseFor(altDeg),
    altitude: altDeg,
    night: nightAmount,
    auto,
    speed,
    nightLights: nightLights.length,
    sunDirection: { x: sunDir.x, y: sunDir.y, z: sunDir.z },
  });

  return { setHour, getHour, setDate, setSpeed, toggleAuto, state };
}
