/**
 * Footsteps (#12): one footfall per stride, voiced by the surface underfoot.
 *
 * No sample files - the build loads no assets (CLAUDE.md) - so each step is a
 * short burst of noise through a filter tuned per surface, with a little pitch
 * and filter jitter so no two steps are identical. Footfalls are counted off
 * the same distance the head bob is keyed to, one per STEP_LENGTH, so sound and
 * bob keep time. The AudioContext is created on the first pointer lock: the
 * autoplay policy wants a user gesture, and that click is one.
 *
 * ponytail: synthesised steps, four surfaces. Recorded samples would sound
 * better and need an asset pipeline the build does not have.
 */
import { STEP_LENGTH } from './runFeel.js';
import { browserStorage } from './lookSpeed.js';

export const MUTE_KEY = 'twin.footstepsMuted';

/** How each surface sounds: a filter on white noise, and an envelope. */
export const SURFACES = Object.freeze({
  marble: Object.freeze({ type: 'highpass', freq: 1800, q: 0.7, decay: 0.07, gain: 0.5 }),
  concrete: Object.freeze({ type: 'bandpass', freq: 900, q: 0.9, decay: 0.09, gain: 0.6 }),
  pavement: Object.freeze({ type: 'lowpass', freq: 700, q: 0.7, decay: 0.11, gain: 0.7 }),
  steel: Object.freeze({ type: 'bandpass', freq: 420, q: 6, decay: 0.22, gain: 0.6 }),
});

/** Group-name patterns, checked leaf first; anything unmatched is pavement. */
const RULES = [
  [/great-hall|galleria|hhof/, 'marble'],
  [/^path-|concourse|^conc-|rail-platforms/, 'concrete'],
  [/^skywalk/, 'steel'],
];

/** @param {string[]} names object names from the floor mesh up to the root */
export function surfaceFor(names) {
  for (const n of names) {
    if (!n) continue;
    for (const [re, surface] of RULES) if (re.test(n)) return surface;
  }
  return 'pavement';
}

/** Stride boundaries crossed between two distances walked. */
export const stepsCrossed = (prev, now, stride = STEP_LENGTH) => Math.floor(now / stride) - Math.floor(prev / stride);

/** Names from a floor mesh up to the scene root. */
function namesOf(obj) {
  const out = [];
  for (let o = obj; o; o = o.parent) out.push(o.name);
  return out;
}

export function install(ctx, { controls }) {
  const storage = browserStorage();
  let muted = false;
  try { muted = storage?.getItem(MUTE_KEY) === '1'; } catch { /* audible */ }

  let audio = null;
  let master = null;
  let noise = null;
  let plays = 0;

  function startAudio() {
    if (audio) return;
    try {
      audio = new AudioContext();
      master = audio.createGain();
      master.gain.value = 0.35;
      master.connect(audio.destination);
      noise = audio.createBuffer(1, Math.round(audio.sampleRate * 0.3), audio.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (err) {
      console.warn('[footsteps] no audio', err);
      audio = null;
    }
  }
  controls.pointerLock?.addEventListener?.('lock', startAudio);

  function play(surface) {
    if (!audio || muted) return;
    const s = SURFACES[surface];
    const t = audio.currentTime;
    const src = audio.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = audio.createBiquadFilter();
    filter.type = s.type;
    filter.frequency.value = s.freq * (0.92 + Math.random() * 0.16);
    filter.Q.value = s.q;
    const env = audio.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(s.gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, t + s.decay);
    src.connect(filter).connect(env).connect(master);
    src.start(t);
    src.stop(t + s.decay + 0.02);
    plays++;
  }

  const surfaceNow = () => {
    const o = controls.floorObject;
    return o ? surfaceFor(namesOf(o)) : 'pavement';
  };

  let lastDistance = controls.strideDistance;
  let wasAirborne = false;
  ctx.onFrame.push(() => {
    const d = controls.strideDistance;
    const crossed = stepsCrossed(lastDistance, d);
    lastDistance = d;
    const airborne = controls.airborne;
    const landed = wasAirborne && !airborne;
    wasAirborne = airborne;
    if (controls.mode !== 'walk' || airborne || (crossed <= 0 && !landed)) return;
    play(surfaceNow());
  });

  return {
    get muted() { return muted; },
    setMuted(on) {
      muted = !!on;
      try { storage?.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* not remembered; still applies */ }
      return muted;
    },
    /** The surface under the walker now. */
    surface: surfaceNow,
    /** Footfalls actually voiced - for qa/footsteps.e2e.mjs. */
    plays: () => plays,
    audioState: () => audio?.state ?? 'none',
  };
}
