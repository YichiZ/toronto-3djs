/**
 * Cinematic tour.
 *
 * A scripted camera path through the hero moments, roughly four and a half
 * minutes end to end. Position runs on a CatmullRomCurve3 so the camera glides
 * rather than cutting; orientation is a damped slerp toward a second curve, so
 * the look direction lags the move slightly the way a real operator's pan does.
 *
 * WHY EASING IS PER-BEAT: each beat maps to one curve knot, and the local time
 * inside a beat is smoothstepped before it is folded back into the global curve
 * parameter. That produces a settle at every hero frame without needing a
 * separate hold state machine.
 *
 * The tour also drives the time of day: the finish is a sunset down Front, and
 * that only works if the sun is actually where the clock says it is.
 */
import * as THREE from 'three';
import { LEVELS } from '../data/grid.js';

const EYE = 1.7;

/**
 * @typedef {object} Beat
 * @property {string} id
 * @property {[number,number,number]} pos
 * @property {[number,number,number]} look
 * @property {number} seconds
 * @property {number} hour local Toronto hour to set on entry
 * @property {string} caption
 */

/** @type {ReadonlyArray<Beat>} */
export const BEATS = Object.freeze([
  {
    id: 'establishing', seconds: 24, hour: 16.5,
    pos: [120, 210, 300], look: [-260, 60, 60],
    caption: 'Front Street West. Union Station along the bottom, the CN Tower closing the west end — a grid rotated 16.7° off true north.',
  },
  {
    id: 'descend-front', seconds: 20, hour: 16.8,
    pos: [-30, 46, 90], look: [-200, 16, 30],
    caption: 'Dropping onto the promenade at Bay. The head house runs 226 m west and stops short of York.',
  },
  {
    id: 'colonnade', seconds: 24, hour: 17.1,
    pos: [-40, EYE + 0.4, 17], look: [-235, 9, 19],
    caption: 'The colonnade: 22 Tuscan columns. The entablature above carries incised railway names — nothing more.',
  },
  {
    id: 'great-hall', seconds: 26, hour: 17.4,
    pos: [-150, EYE, 44], look: [-30, 15, 44],
    caption: 'Inside the Great Hall. Here — and only here — is the carved frieze of Canadian destination cities.',
  },
  {
    id: 'concourse', seconds: 22, hour: 17.7,
    pos: [-120, LEVELS.unionConcourse + EYE, 56], look: [-215, LEVELS.unionConcourse + 3, 58],
    caption: 'Down to the York Concourse. Great Hall, York, Bay and VIA are four different rooms at three different levels.',
  },
  {
    id: 'path', seconds: 22, hour: 18.0,
    pos: [-3, LEVELS.path + EYE, -20], look: [-3, LEVELS.path + 2, -150],
    caption: 'Into the PATH, six and a half metres under Bay Street. Thirty kilometres of it, and no daylight anywhere.',
  },
  {
    id: 'galleria', seconds: 26, hour: 18.2,
    pos: [50, EYE + 0.6, -88], look: [162, 18, -88],
    caption: 'Up into the Allen Lambert Galleria. Calatrava’s steel trees, and the 1845 bank facades rebuilt into the wall.',
  },
  {
    id: 'hhof', seconds: 20, hour: 18.4,
    pos: [178, EYE, -10], look: [155, 12, -33],
    caption: 'Front and Yonge: the 1885 Bank of Montreal. The stained-glass dome is inside — the street sees a plain skylight enclosure.',
  },
  {
    id: 'bay-street', seconds: 20, hour: 18.6,
    pos: [-11, EYE, -120], look: [-46, 20, 40],
    caption: 'Out to Bay Street. The financial canyon funnels straight down onto the station.',
  },
  {
    id: 'underpass', seconds: 20, hour: 18.8,
    pos: [-4, EYE, 60], look: [-4, 3, 170],
    caption: 'Under the viaduct on Bay. The corridor is carried on steel, and it is not electrified — no catenary, anywhere.',
  },
  {
    id: 'skywalk', seconds: 22, hour: 19.0,
    pos: [-430, LEVELS.skywalk + EYE, 58], look: [-140, LEVELS.skywalk + 1, 54],
    caption: 'The SkyWalk, nine metres up, running back east over the tracks toward the station.',
  },
  {
    id: 'arena', seconds: 20, hour: 19.3,
    pos: [-10, EYE + 0.5, 300], look: [-32, 16, 284],
    caption: 'Scotiabank Arena on Bay: the 1941 Postal Delivery Building facade kept in place, on this elevation and on Lake Shore.',
  },
  {
    id: 'sunset', seconds: 28, hour: 20.6,
    pos: [30, 16, 12], look: [-700, 90, 40],
    caption: 'Sunset down Front Street. The grid was laid parallel to the shoreline in the 1790s; this is what that decision looks like.',
  },
]);

const TOTAL_SECONDS = BEATS.reduce((n, b) => n + b.seconds, 0);
const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * @param {import('../core/context.js').Context} ctx
 * @param {ReturnType<import('./controls.js').install>} [controls]
 */
export function install(ctx, controls) {
  const { camera } = ctx;

  const posCurve = new THREE.CatmullRomCurve3(
    BEATS.map((b) => new THREE.Vector3(...b.pos)), false, 'catmullrom', 0.25
  );
  const lookCurve = new THREE.CatmullRomCurve3(
    BEATS.map((b) => new THREE.Vector3(...b.look)), false, 'catmullrom', 0.25
  );

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };

  const caption = document.createElement('div');
  caption.id = 'tour-caption';
  caption.hidden = true;
  caption.innerHTML = '<b class="tour-beat"></b><span class="tour-text"></span><i class="tour-progress"></i>';
  document.body.appendChild(caption);
  const beatEl = caption.querySelector('.tour-beat');
  const textEl = caption.querySelector('.tour-text');
  const progEl = caption.querySelector('.tour-progress');

  // A Camera, not a bare Object3D: Object3D.lookAt points +Z at the target,
  // cameras look down -Z, so copying a bare aim's rotation filmed every beat
  // facing directly away from what its caption describes (#25).
  const aim = new THREE.Camera();
  const target = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();

  let running = false;
  let elapsed = 0;
  let beatIndex = -1;
  let previousMode = 'walk';

  /** Time controller, if the boot sequence exposed one. Never assume it. */
  const timeController = () => ctx.__time ?? window.__TWIN__?.time ?? null;

  function applyBeat(i) {
    if (i === beatIndex) return;
    beatIndex = i;
    const b = BEATS[i];
    if (beatEl) beatEl.textContent = `${i + 1} / ${BEATS.length} · ${b.id}`;
    if (textEl) textEl.textContent = b.caption;
    try {
      timeController()?.setHour?.(b.hour);
    } catch (err) {
      console.warn('[tour] could not set time of day', err);
    }
  }

  /** Global curve parameter with the current beat's local time eased. */
  function curveParam(t) {
    let acc = 0;
    for (let i = 0; i < BEATS.length; i++) {
      const d = BEATS[i].seconds;
      if (t < acc + d || i === BEATS.length - 1) {
        const local = Math.min(1, (t - acc) / d);
        applyBeat(i);
        const eased = reduceMotion.matches ? local : smoothstep(local);
        return Math.min(1, (i + eased) / (BEATS.length - 1));
      }
      acc += d;
    }
    return 1;
  }

  function frame(dt) {
    if (!running) return;
    elapsed += dt;
    if (elapsed >= TOTAL_SECONDS) { stop(); return; }

    const u = curveParam(elapsed);
    posCurve.getPoint(u, target);
    lookCurve.getPoint(u, lookPoint);
    camera.position.copy(target);

    aim.position.copy(target);
    aim.up.set(0, 1, 0);
    aim.lookAt(lookPoint);
    // Reduced motion: snap orientation instead of easing into it.
    // The first frame snaps too, so the tour opens framed rather than easing
    // round from wherever the walker happened to be facing.
    const k = reduceMotion.matches || elapsed <= dt ? 1 : Math.min(1, dt * 3.2);
    camera.quaternion.slerp(aim.quaternion, k);

    if (progEl) progEl.style.width = `${(elapsed / TOTAL_SECONDS) * 100}%`;
  }
  ctx.onFrame.push(frame);

  function start() {
    if (running) return false;
    previousMode = controls?.mode ?? 'walk';
    try { controls?.setMode?.('cinematic'); } catch { /* controls are optional */ }
    running = true;
    elapsed = 0;
    beatIndex = -1;
    caption.hidden = false;
    caption.classList.add('visible');
    return true;
  }

  function stop() {
    if (!running) return false;
    running = false;
    caption.classList.remove('visible');
    caption.hidden = true;
    if (progEl) progEl.style.width = '0%';
    try { controls?.setMode?.(previousMode === 'cinematic' ? 'walk' : previousMode); } catch { /* ignore */ }
    return true;
  }

  return {
    start,
    stop,
    isRunning: () => running,
    beat: () => (beatIndex >= 0 ? { index: beatIndex, ...BEATS[beatIndex], elapsed, total: TOTAL_SECONDS } : null),
    beats: BEATS,
    duration: TOTAL_SECONDS,
  };
}
