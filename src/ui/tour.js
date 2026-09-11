/**
 * Cinematic tour.
 *
 * Thirteen stops through the hero moments, about four and a half minutes end to
 * end. Each beat GLIDES IN, THEN HOLDS: for the first quarter the camera travels
 * from the previous stop, for the rest it stands on its own stop while that
 * stop's caption is up. The captions are written as arrivals - "Dropping onto
 * the promenade", "Down to the York Concourse", "Into the PATH" - so the glide
 * reads as the caption's first line.
 *
 * WHY NOT ONE SPLINE THROUGH EVERY STOP (#67): a beat used to spend its whole
 * caption travelling from its stop toward the next one, so the camera was
 * always somewhere between two stops - and between two interiors that is the
 * inside of a wall. Ten of thirteen captions described something off screen.
 * Now a glide only happens where a straight line between the two stops meets
 * nothing; everywhere else, the tour cuts.
 *
 * WHY THE STOPS ARE VIEWPOINTS: every walk viewpoint in data/references.js is
 * checked by `npm run qa` and the viewpoint e2e - a floor under it, outside
 * every building, framing what it names (#24, #28, #68). Hand-typed tour
 * coordinates had drifted: the PATH stop stood in solid ground under Bay.
 *
 * The tour also drives the time of day: the finish is a sunset down Front, and
 * that only works if the sun is actually where the clock says it is.
 */
import * as THREE from 'three';
import { getViewpoint } from '../data/references.js';

/** Fraction of a beat spent gliding in from the previous stop; the rest holds. */
const GLIDE = 0.25;

/** A beat's stop: a checked viewpoint, or - for the two aerials - its own numbers. */
function beat(b) {
  if (!b.vp) return Object.freeze(b);
  const v = getViewpoint(b.vp);
  if (!v) throw new Error(`tour: no viewpoint "${b.vp}" for beat "${b.id}"`);
  return Object.freeze({
    ...b,
    pos: [v.position.x, v.position.y, v.position.z],
    look: [v.lookAt.x, v.lookAt.y, v.lookAt.z],
  });
}

/**
 * @typedef {object} Beat
 * @property {string} id
 * @property {string} [vp] viewpoint the stop is taken from
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
    id: 'descend-front', seconds: 20, hour: 16.8, vp: 'front-bay-west',
    caption: 'Dropping onto the promenade at Bay. The head house runs 226 m west and stops short of York.',
  },
  {
    id: 'colonnade', seconds: 24, hour: 17.1, vp: 'union-forecourt',
    caption: 'The colonnade: 22 Tuscan columns. The entablature above carries incised railway names — nothing more.',
  },
  {
    id: 'great-hall', seconds: 26, hour: 17.4, vp: 'great-hall',
    caption: 'Inside the Great Hall. Here — and only here — is the carved frieze of Canadian destination cities.',
  },
  {
    id: 'concourse', seconds: 22, hour: 17.7, vp: 'york-concourse',
    caption: 'Down to the York Concourse. Great Hall, York, Bay and VIA are four different rooms at three different levels.',
  },
  {
    id: 'path', seconds: 22, hour: 18.0, vp: 'path-corridor',
    caption: 'Into the PATH, six and a half metres under Bay Street. Thirty kilometres of it, and no daylight anywhere.',
  },
  {
    id: 'galleria', seconds: 26, hour: 18.2, vp: 'galleria-interior',
    caption: 'Up into the Allen Lambert Galleria. Calatrava’s steel trees, and the 1845 bank facades rebuilt into the wall.',
  },
  {
    id: 'hhof', seconds: 20, hour: 18.4, vp: 'hhof-front-yonge',
    caption: 'Front and Yonge: the 1885 Bank of Montreal. The stained-glass dome is inside — the street sees a plain skylight enclosure.',
  },
  {
    id: 'bay-street', seconds: 20, hour: 18.6, vp: 'bay-north-of-front',
    caption: 'Out to Bay Street. The financial canyon funnels straight down onto the station.',
  },
  {
    id: 'underpass', seconds: 20, hour: 18.8, vp: 'bay-underpass',
    caption: 'Under the viaduct on Bay. The corridor is carried on steel, and it is not electrified — no catenary, anywhere.',
  },
  {
    id: 'skywalk', seconds: 22, hour: 19.0, vp: 'skywalk-east',
    caption: 'The SkyWalk, nine metres up, running back east over the tracks toward the station.',
  },
  {
    id: 'arena', seconds: 20, hour: 19.3, vp: 'arena-bay-heritage',
    caption: 'Scotiabank Arena on Bay: the 1941 Postal Delivery Building facade kept in place, on this elevation and on Lake Shore.',
  },
  {
    id: 'sunset', seconds: 28, hour: 20.6,
    pos: [30, 16, 12], look: [-700, 90, 40],
    caption: 'Sunset down Front Street. The grid was laid parallel to the shoreline in the 1790s; this is what that decision looks like.',
  },
].map(beat));

const TOTAL_SECONDS = BEATS.reduce((n, b) => n + b.seconds, 0);
const smoothstep = (t) => t * t * (3 - 2 * t);

/** Where the tour leaves the walker when it ends on a stop that is not a walk viewpoint. */
const LANDING = 'front-bay-west';

/**
 * @param {import('../core/context.js').Context} ctx
 * @param {ReturnType<import('./controls.js').install>} [controls]
 */
export function install(ctx, controls) {
  const { camera, scene } = ctx;

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
  const tmp = new THREE.Vector3();

  /**
   * Does each beat glide in, or cut? A glide only where the straight line from
   * the previous stop meets nothing - hidden interiors included, since Three's
   * raycaster ignores visibility and a streamed-out wall is still a wall.
   * Worked out on first start, when the whole world is built.
   * @type {boolean[] | null}
   */
  let glides = null;
  function planGlides() {
    const rc = new THREE.Raycaster();
    rc.camera = camera;                     // sprites throw without it
    return BEATS.map((b, i) => {
      if (i === 0) return false;
      const from = new THREE.Vector3(...BEATS[i - 1].pos);
      const to = new THREE.Vector3(...b.pos);
      const dir = to.clone().sub(from);
      const len = dir.length();
      rc.set(from, dir.normalize());
      rc.far = len;
      return !rc.intersectObject(scene, true).some((h) => h.face && !h.object.userData?.noCollide);
    });
  }

  let running = false;
  let elapsed = 0;
  let beatIndex = -1;
  let previousMode = 'walk';

  /** Time controller, if the boot sequence exposed one. Never assume it. */
  const timeController = () => ctx.__time ?? window.__TWIN__?.time ?? null;

  function applyBeat(i) {
    if (i === beatIndex) return false;
    beatIndex = i;
    const b = BEATS[i];
    if (beatEl) beatEl.textContent = `${i + 1} / ${BEATS.length} · ${b.id}`;
    if (textEl) textEl.textContent = b.caption;
    try {
      timeController()?.setHour?.(b.hour);
    } catch (err) {
      console.warn('[tour] could not set time of day', err);
    }
    return true;
  }

  /** Which beat a moment of the tour falls in, and how far through it. */
  function locate(t) {
    let acc = 0;
    for (let i = 0; i < BEATS.length; i++) {
      const d = BEATS[i].seconds;
      if (t < acc + d || i === BEATS.length - 1) return { i, local: Math.min(1, (t - acc) / d) };
      acc += d;
    }
    return { i: BEATS.length - 1, local: 1 };
  }

  function frame(dt) {
    if (!running) return;
    elapsed += dt;
    if (elapsed >= TOTAL_SECONDS) { stop(); return; }

    const { i, local } = locate(elapsed);
    const entering = applyBeat(i);
    const b = BEATS[i];
    const gliding = glides[i] && !reduceMotion.matches && local < GLIDE;
    if (gliding) {
      const s = smoothstep(local / GLIDE);
      const p = BEATS[i - 1];
      target.set(...p.pos).lerp(tmp.set(...b.pos), s);
      lookPoint.set(...p.look).lerp(tmp.set(...b.look), s);
    } else {
      target.set(...b.pos);
      lookPoint.set(...b.look);
    }
    camera.position.copy(target);

    aim.position.copy(target);
    aim.up.set(0, 1, 0);
    aim.lookAt(lookPoint);
    // A cut snaps orientation too: easing the look round after a jump pans
    // through whatever lies between. So does reduced motion, and so does the
    // tour's first frame, so it opens framed rather than turning from wherever
    // the walker happened to be facing.
    const k = reduceMotion.matches || (entering && !gliding) ? 1 : Math.min(1, dt * 3.2);
    camera.quaternion.slerp(aim.quaternion, k);

    if (progEl) progEl.style.width = `${(elapsed / TOTAL_SECONDS) * 100}%`;
  }
  ctx.onFrame.push(frame);

  function start() {
    if (running) return false;
    glides ??= planGlides();
    previousMode = controls?.mode ?? 'walk';
    try { controls?.setMode?.('cinematic'); } catch { /* controls are optional */ }
    running = true;
    elapsed = 0;
    beatIndex = -1;
    caption.hidden = false;
    caption.classList.add('visible');
    return true;
  }

  /**
   * Back to walking ON A FLOOR. Switching to walk wherever the camera stood left
   * the walker 16 m over Front Street after the sunset, on the "Gardiner deck"
   * level (#67). So walk resumes on the stop in view when that is a walk
   * viewpoint, and at the Bay end of Front Street otherwise.
   */
  function stop() {
    if (!running) return false;
    running = false;
    caption.classList.remove('visible');
    caption.hidden = true;
    if (progEl) progEl.style.width = '0%';
    const back = previousMode === 'cinematic' ? 'walk' : previousMode;
    try {
      if (back === 'walk') {
        const vp = BEATS[beatIndex]?.vp;
        controls?.teleport?.(vp && getViewpoint(vp)?.mode === 'walk' ? vp : LANDING);
      } else {
        controls?.setMode?.(back);
      }
    } catch { /* controls are optional */ }
    return true;
  }

  return {
    start,
    stop,
    isRunning: () => running,
    beat: () => (beatIndex >= 0 ? { index: beatIndex, ...BEATS[beatIndex], elapsed, total: TOTAL_SECONDS } : null),
    /** Jump to a moment of the tour, in seconds - for qa/tour.e2e.mjs. */
    seek(seconds) {
      elapsed = Math.max(0, Math.min(TOTAL_SECONDS - 1e-3, seconds));
      beatIndex = -1;                      // re-enter: caption, hour and a snapped frame
    },
    /** Glide (true) or cut (false) into each beat, once the tour has started. */
    plan: () => (glides ? glides.slice() : null),
    beats: BEATS,
    duration: TOTAL_SECONDS,
  };
}
