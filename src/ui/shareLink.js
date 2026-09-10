/**
 * Shareable viewpoint links (#31): `#v=great-hall&mode=walk&t=18.75`.
 *
 * The address bar follows the visitor - last viewpoint, camera mode, hour - so
 * copying it sends someone the Great Hall at dusk. Opening one replays it.
 * Anything unrecognised is dropped field by field, so a bad link boots normally.
 *
 * ponytail: the viewpoint, not the camera pose - walk 200 m from a viewpoint and
 * the link still opens at it. Add a pose field when people share from mid-walk.
 */

/** Modes worth sharing. The tour is a sequence, not a place. */
export const SHARE_MODES = ['walk', 'orbit'];

/** @returns {string} the hash body, without '#' */
export function formatHash({ v, mode, t }) {
  const p = new URLSearchParams();
  if (v) p.set('v', v);
  if (SHARE_MODES.includes(mode)) p.set('mode', mode);
  if (Number.isFinite(t)) p.set('t', String(Math.round(t * 100) / 100));
  return p.toString();
}

/**
 * @param {string} hash location.hash, with or without the '#'
 * @param {string[]} knownIds viewpoint ids that exist
 * @returns {{v: string|null, mode: string|null, t: number|null}}
 */
export function parseHash(hash, knownIds) {
  const p = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const v = p.get('v');
  const mode = p.get('mode');
  const rawT = p.get('t');
  const t = rawT ? Number(rawT) : NaN;
  return {
    v: v && knownIds.includes(v) ? v : null,
    mode: SHARE_MODES.includes(mode) ? mode : null,
    t: Number.isFinite(t) && t >= 0 && t < 24 ? t : null,
  };
}

/**
 * Replay a link. Teleport first: a viewpoint carries its own mode, and the
 * link's mode must be the one that wins.
 */
export function applyHash(hash, { controls, time, ids }) {
  const s = parseHash(hash, ids);
  if (s.v) controls.teleport(s.v);
  if (s.mode) controls.setMode(s.mode);
  if (s.t !== null) time.setHour(s.t);
  return s;
}

/**
 * Keep the hash in step, twice a second. replaceState, not pushState: the back
 * button should not become a list of every hour the slider was dragged past.
 */
export function install(ctx, { controls, time }) {
  let acc = 0;
  let last = null;
  ctx.onFrame.push((dt) => {
    acc += dt;
    if (acc < 0.5) return;
    acc = 0;
    const hash = formatHash({ v: controls.viewpoint, mode: controls.mode, t: time.getHour() });
    if (hash === last) return;
    last = hash;
    history.replaceState(null, '', `#${hash}`);
  });
}
