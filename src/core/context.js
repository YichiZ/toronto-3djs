/**
 * Renderer, scene and frame loop.
 *
 * Everything downstream receives the same immutable-ish context object; modules
 * add to `scene` and push per-frame work onto `onFrame`. Nothing else reaches
 * for the renderer directly.
 */
import * as THREE from 'three';

/** @typedef {ReturnType<typeof createContext>} Context */

export function createContext(mount) {
  if (!mount) throw new TypeError('createContext: mount element is required');

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
    logarithmicDepthBuffer: true, // CN Tower at 553 m and a 2 cm curb in one frame
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb9c6d2, 300, 2600);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.15, 12000);
  camera.position.set(-115, 1.7, 60);

  const clock = new THREE.Clock();
  /** @type {Array<(dt:number, elapsed:number)=>void>} */
  const onFrame = [];
  /** @type {Array<()=>void>} */
  const onResize = [];

  const stats = { fps: 0, frames: 0, acc: 0, drawCalls: 0, triangles: 0 };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    for (const fn of onResize) fn();
  }
  window.addEventListener('resize', resize);

  let running = false;
  function start() {
    if (running) return;
    running = true;
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.elapsedTime;
      for (const fn of onFrame) {
        try {
          fn(dt, elapsed);
        } catch (err) {
          // A single misbehaving system must not stop the whole city rendering.
          console.error('[frame]', err);
        }
      }
      renderer.render(scene, camera);
      stats.frames++;
      stats.acc += dt;
      if (stats.acc >= 0.5) {
        stats.fps = stats.frames / stats.acc;
        stats.frames = 0;
        stats.acc = 0;
        stats.drawCalls = renderer.info.render.calls;
        stats.triangles = renderer.info.render.triangles;
      }
    });
  }

  function stop() {
    running = false;
    renderer.setAnimationLoop(null);
  }

  return { renderer, scene, camera, clock, onFrame, onResize, stats, start, stop, resize };
}
