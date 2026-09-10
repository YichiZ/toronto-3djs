/**
 * Entry point.
 *
 * Boot order matters: context -> lighting -> world -> camera modes -> UI. The
 * loading overlay reports which module is building so a slow block is visible
 * rather than looking like a hang.
 */
import { createContext } from './core/context.js';
import { buildWorld } from './world/index.js';
import { summary } from './core/registry.js';

const mount = document.getElementById('app');
const overlay = document.getElementById('loading');
const stageEl = overlay?.querySelector('.stage');
const barEl = overlay?.querySelector('.bar i');

function stage(text, pct) {
  if (stageEl) stageEl.textContent = text;
  if (barEl) barEl.style.width = `${Math.round(pct * 100)}%`;
}

async function boot() {
  const ctx = createContext(mount);

  const { install: installTime } = await import('./systems/timeOfDay.js');
  const time = installTime(ctx);

  const { failures, lod } = await buildWorld(ctx, (name, pct) => stage(`building ${name}`, pct * 0.9));

  stage('camera', 0.93);
  const { install: installControls } = await import('./ui/controls.js');
  const controls = installControls(ctx);
  // The brief's opening frame: "Union Station and the Front Street canyon". The
  // aerial establishing shot used here framed CIBC Square and the Royal York,
  // with the station a strip cut off at the bottom (6% of the view); the
  // colonnade in raking perspective from the Bay end is 29% (#23).
  controls.teleport('front-bay-west');

  stage('interface', 0.97);
  const { install: installHud } = await import('./ui/hud.js');
  const { install: installTour } = await import('./ui/tour.js');
  const { install: installReference } = await import('./ui/referenceMode.js');

  const tour = installTour(ctx, controls);
  const reference = installReference(ctx);
  installHud(ctx, { controls, tour, time, reference, failures });
  // Supplementary and off until M: the brief requires orientation without one.
  const { install: installMinimap } = await import('./ui/minimap.js');
  const minimap = installMinimap(ctx, { controls });

  ctx.start();
  stage('ready', 1);
  overlay?.classList.add('done');
  const overlayGone = setTimeout(() => overlay?.remove(), 700);

  // WebGL context loss (#30): integrated GPUs and phones reclaim contexts, and
  // the canvas froze under a live HUD with no word said. Pause, bring the
  // overlay back to say so, and reload when the context is restored - an
  // in-place restore re-uploads every buffer, texture and shader of the city.
  // preventDefault is what makes the browser offer a restore at all.
  const canvas = ctx.renderer.domElement;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ctx.stop();
    clearTimeout(overlayGone);
    if (overlay) {
      document.body.appendChild(overlay);
      overlay.classList.remove('done');
    }
    stage('Graphics context lost — reloading as soon as it is restored', 1);
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  // Exposed for the QA harness driving the page through a headless browser.
  window.__TWIN__ = {
    ctx, controls, tour, time, reference, lod, minimap,
    registry: summary,
    failures,
    stats: () => ({ ...ctx.stats, memory: ctx.renderer.info.memory }),
    /**
     * One call the QA capture can evaluate to get every runtime figure the
     * report asks for. Anything a system does not expose comes back null rather
     * than as a guess, so `npm run qa` prints "not captured" instead of fiction.
     */
    async metrics() {
      // Read the live counters off the scene groups, not off the modules. The
      // systems publish them on `group.userData`, and that is the instance the
      // running world actually built - a re-import can hand back a module whose
      // own counters were never populated.
      const live = (name, key) => {
        const g = ctx.scene.getObjectByName(name);
        const fn = g?.userData?.[key];
        return typeof fn === 'function' ? fn() : null;
      };
      const { interiorStates } = await import('./world/index.js');
      return {
        fps: Number(ctx.stats.fps.toFixed(1)),
        drawCalls: ctx.stats.drawCalls,
        triangles: ctx.stats.triangles,
        programs: ctx.renderer.info.programs?.length ?? null,
        memory: { ...ctx.renderer.info.memory },
        registry: summary(),
        interiors: interiorStates().length,
        lodTracked: lod?.tracked() ?? null,
        pedestrians: live('pedestrians', 'population'),
        vehicles: live('vehicles', 'count'),
        trains: live('trains', 'consists')?.length ?? null,
        failures,
      };
    },
    teleport: (name) => controls.teleport(name),
    setTime: (h) => time.setHour(h),
  };

  // A shared link (#31) replays over the default opening frame; a bad one is
  // ignored field by field. Then the address bar follows the visitor.
  const share = await import('./ui/shareLink.js');
  const { VIEWPOINTS } = await import('./data/references.js');
  share.applyHash(location.hash, { controls, time, ids: VIEWPOINTS.map((v) => v.id) });
  share.install(ctx, { controls, time });

  if (failures.length) {
    console.warn(`[boot] ${failures.length} module(s) failed to build`, failures);
  }
}

boot().catch((err) => {
  console.error('[boot] fatal', err);
  if (stageEl) stageEl.textContent = `failed: ${err.message}`;
});
