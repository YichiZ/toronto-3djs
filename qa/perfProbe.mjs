/**
 * Frame-time and GPU-resource sampling for the perf suites.
 *
 * Runs entirely in the page: one requestAnimationFrame loop that records the
 * gap between frames, plus a snapshot of renderer.info and performance.memory
 * every 5 s. Kept out of perf-sprint.e2e.mjs so the same probe can be pointed
 * at any scenario (idle, street walk, mode switching) - a trend only means
 * something if every scenario is measured the same way.
 */

/** The in-page probe, as source, so it can be handed to page.evaluate. */
export const SAMPLE = `async ({ seconds, driveSrc }) => {
  const { ctx } = window.__TWIN__;
  const drive = driveSrc ? eval(driveSrc) : null;
  const info = ctx.renderer.info;
  const snap = () => {
    let objects = 0;
    let lights = 0;
    ctx.scene.traverse(() => objects++);
    // What three's program cache key counts: visible, non-ambient lights.
    ctx.scene.traverseVisible((o) => { if (o.isLight && !o.isAmbientLight) lights++; });
    return {
      t: performance.now(),
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      calls: info.render.calls,
      triangles: info.render.triangles,
      heap: performance.memory ? performance.memory.usedJSHeapSize : null,
      children: ctx.scene.children.length,
      objects,
      lights,
    };
  };

  const frames = [];
  const snaps = [snap()];
  const t0 = performance.now();
  let last = t0;
  let nextSnap = 5000;
  await new Promise((done) => {
    const tick = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      const elapsed = now - t0;
      if (drive) drive(elapsed);
      if (elapsed >= nextSnap) { snaps.push(snap()); nextSnap += 5000; }
      if (elapsed >= seconds * 1000) { snaps.push(snap()); done(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return { frames: frames.slice(1), snaps };   // drop the first gap: it spans the setup
}`;

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

/** p50/p95/max plus the resource deltas, from a raw probe result. */
export function summarise({ frames, snaps }) {
  const sorted = [...frames].sort((a, b) => a - b);
  const first = snaps[0];
  const last = snaps.at(-1);
  const delta = {};
  for (const k of ['geometries', 'textures', 'programs', 'objects', 'lights', 'children', 'heap']) {
    delta[k] = (last[k] ?? 0) - (first[k] ?? 0);
  }
  const n = Math.max(1, Math.floor(frames.length / 5));
  return {
    frames: frames.length,
    p50: pct(sorted, 0.5),
    p95: pct(sorted, 0.95),
    max: sorted.at(-1),
    over100: frames.filter((f) => f > 100).length,
    first,
    last,
    delta,
    snaps,
    /** Mean frame time in each fifth of the run - a steady decline shows here. */
    quintiles: Array.from({ length: 5 }, (_, i) => {
      const part = frames.slice(i * n, (i + 1) * n);
      return part.reduce((a, b) => a + b, 0) / (part.length || 1);
    }),
  };
}

/** Growth as a fraction of the starting count, 0 when it started at 0. */
export const growth = (s, key) => (s.first[key] ? s.delta[key] / s.first[key] : (s.delta[key] ? Infinity : 0));

/** A few lines per scenario, for the test log and the report. */
export function report(name, s) {
  const f = (n) => (n === null || n === undefined ? 'n/a' : typeof n === 'number' ? n.toFixed(1) : String(n));
  return [
    `[perf] ${name}: ${s.frames} frames  p50 ${f(s.p50)} ms  p95 ${f(s.p95)} ms  max ${f(s.max)} ms  frames>100ms ${s.over100}`,
    `[perf] ${name}: quintile means ${s.quintiles.map(f).join(' / ')} ms`,
    `[perf] ${name}: geometries ${s.first.geometries} -> ${s.last.geometries}  textures ${s.first.textures} -> ${s.last.textures}`
      + `  programs ${s.first.programs} -> ${s.last.programs}  lights ${s.first.lights} -> ${s.last.lights}  objects ${s.first.objects} -> ${s.last.objects}`
      + `  heap ${f(s.first.heap && s.first.heap / 1e6)} -> ${f(s.last.heap && s.last.heap / 1e6)} MB`,
    `[perf] ${name}: draw calls ${s.first.calls} -> ${s.last.calls}  triangles ${s.first.triangles} -> ${s.last.triangles}`,
  ].join('\n');
}
