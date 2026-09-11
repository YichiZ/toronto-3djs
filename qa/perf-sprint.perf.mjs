/**
 * Frame-time regression cover: "after sprinting for a while it starts to lag,
 * as if it needs a reload".
 *
 * Measured against the PRODUCTION bundle (`vite preview` over dist/), because
 * that is what the report is about; the dev server's module graph is not the
 * thing that lags. It is kept out of `npm run e2e` (2.5 minutes of measuring)
 * and runs, after a fresh build, as:
 *
 *   npm run e2e:perf
 *
 * Each scenario runs the same probe (qa/perfProbe.mjs): per-frame gaps from
 * requestAnimationFrame, and renderer.info / performance.memory every 5 s. The
 * assertions are about the SHAPE of the run - a stable resource count and no
 * stalls - rather than an absolute frame rate, which depends on the machine
 * and on whether the GPU is real. The absolute figures are printed either way,
 * because a report with no numbers behind it is an opinion.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld, pressKey, standWalker } from './e2eHarness.mjs';
import { SAMPLE, summarise, report, growth } from './perfProbe.mjs';

let world;
let page;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors, preview: true });
  page = world.page;
  // Let the first frames - shader compilation, the first shadow map - fall
  // outside every measurement.
  await page.waitForTimeout(3000);
});

after(async () => { await world?.close(); });

/**
 * Run the probe with an optional per-frame driver, given as source.
 *
 * The probe and the driver are passed as SOURCE and eval'd in the page:
 * page.evaluate hands a real closure over only when the whole scenario fits in
 * one function, and these have to be shared between four of them.
 */
const measure = (seconds, driveSrc = null) => page.evaluate(
  ({ src, arg }) => eval(src)(arg),                       // eslint-disable-line no-eval
  { src: SAMPLE, arg: { seconds, driveSrc } },
).then(summarise);

const standAt = ([x, y, z], yaw) => standWalker(page, { x, y, z, yaw });
const key = (type, code) => pressKey(page, type, code);

/** Front Street West, open pavement with room to run - the spot qa/modes.e2e.mjs uses. */
const OPEN_STREET = [-90, 1.7, 0];
const ALONG_STREET = Math.PI / 2;

/**
 * Sprint back and forth along Front Street.
 *
 * Turning around every 6 s keeps the walker on modelled pavement for a full
 * minute instead of running off the edge of downtown, and each reversal
 * re-enters ground the LOD and interior streaming have already seen - which is
 * exactly where a per-visit leak would show up.
 */
const SPRINT_ROUTE = `(elapsed) => {
  const { ctx } = window.__TWIN__;
  const leg = Math.floor(elapsed / 6000);
  const yaw = ${ALONG_STREET} + leg * Math.PI;
  ctx.camera.rotation.set(0, yaw, 0);
}`;

test('sprinting for 60 s does not degrade', async () => {
  await standAt(OPEN_STREET, ALONG_STREET);
  await key('keydown', 'ShiftLeft');
  await key('keydown', 'KeyW');
  const sprint = await measure(60, SPRINT_ROUTE);
  // A second minute over the same ground, once every surface has been drawn at
  // least once. Geometry and texture counts are FIRST-VISIT uploads - they climb
  // on the first pass however healthy the app is - so they are held to 5% here,
  // where a real leak is the only thing that can still move them.
  const again = await measure(20, SPRINT_ROUTE);
  await key('keyup', 'KeyW');
  await key('keyup', 'ShiftLeft');
  console.log(report('sprint 60 s', sprint));
  console.log(report('sprint, second pass', again));

  assert.ok(Math.abs(growth(again, 'geometries')) < 0.05,
    `geometries ${again.first.geometries} -> ${again.last.geometries} on ground already covered`);
  assert.ok(Math.abs(growth(again, 'textures')) < 0.05,
    `textures ${again.first.textures} -> ${again.last.textures} on ground already covered`);
  assert.equal(again.delta.objects, 0, `the scene grew by ${again.delta.objects} objects while sprinting`);
  // Shader programs, though, must not move even on the first pass: a program
  // compiled mid-run is a frozen frame, and that was the reported lag (#perf).
  // The visible-light count is the root cause behind that symptom - three keys
  // its program cache on it - so it is held constant on its own.
  assert.equal(sprint.delta.lights, 0,
    `visible light count changed while sprinting (${sprint.first.lights} -> ${sprint.last.lights})`);
  assert.equal(sprint.delta.programs, 0,
    `${sprint.delta.programs} shader programs were compiled while sprinting `
    + `(${sprint.first.programs} -> ${sprint.last.programs})`);
  assert.equal(sprint.delta.objects, 0,
    `the scene grew by ${sprint.delta.objects} objects while sprinting`);

  // Smoothness.
  assert.ok(sprint.p95 < 20, `p95 frame time ${sprint.p95.toFixed(1)} ms`);
  assert.equal(sprint.over100, 0, `${sprint.over100} frames over 100 ms (worst ${sprint.max.toFixed(0)} ms)`);
  // And no drift: the last fifth of the run must not be slower than the first.
  assert.ok(sprint.quintiles.at(-1) < sprint.quintiles[0] * 1.3 + 2,
    `frame time drifted ${sprint.quintiles[0].toFixed(1)} -> ${sprint.quintiles.at(-1).toFixed(1)} ms`);
});

test('standing in the Great Hall is steady', async () => {
  await page.evaluate(() => window.__TWIN__.controls.teleport('great-hall'));
  await page.waitForTimeout(1500);
  const s = await measure(20);
  console.log(report('great hall idle 20 s', s));
  assert.ok(Math.abs(growth(s, 'geometries')) < 0.05, `geometries ${s.first.geometries} -> ${s.last.geometries}`);
  assert.equal(s.delta.programs, 0, `${s.delta.programs} shader programs compiled while standing still`);
  assert.equal(s.delta.objects, 0, `the scene grew by ${s.delta.objects} objects while standing still`);
  assert.ok(s.p95 < 20, `p95 frame time ${s.p95.toFixed(1)} ms`);
  assert.equal(s.over100, 0, `${s.over100} frames over 100 ms (worst ${s.max.toFixed(0)} ms)`);
});

test('walking outdoors at street level is steady', async () => {
  await standAt(OPEN_STREET, ALONG_STREET);
  await key('keydown', 'KeyW');
  const s = await measure(20, SPRINT_ROUTE);
  await key('keyup', 'KeyW');
  console.log(report('street walk 20 s', s));
  assert.equal(s.delta.lights, 0, `visible light count changed while walking (${s.first.lights} -> ${s.last.lights})`);
  assert.equal(s.delta.programs, 0, `${s.delta.programs} shader programs compiled while walking`);
  assert.equal(s.delta.objects, 0, `the scene grew by ${s.delta.objects} objects while walking`);
  assert.ok(s.p95 < 20, `p95 frame time ${s.p95.toFixed(1)} ms`);
  assert.equal(s.over100, 0, `${s.over100} frames over 100 ms (worst ${s.max.toFixed(0)} ms)`);
});

test('switching walk <-> tour <-> reference ten times leaves nothing behind', async () => {
  const CYCLE = `(elapsed) => {
    const { controls, tour, reference } = window.__TWIN__;
    const step = Math.floor(elapsed / 1000);
    if (step === window.__perfStep) return;
    window.__perfStep = step;
    const phase = step % 3;
    if (phase === 0) { reference.toggle(false); controls.setMode('walk'); }
    else if (phase === 1) { tour.start(); }
    else { tour.stop(); controls.setMode('walk'); reference.toggle(true); }
  }`;
  const settle = () => page.evaluate(() => {
    window.__TWIN__.reference.toggle(false);
    window.__TWIN__.controls.setMode('walk');
    delete window.__perfStep;
  });
  // Reference mode builds its labels and x-ray cages on first use. One warm-up
  // cycle takes that one-off out of the count, so the ten measured cycles must
  // leave the scene exactly as they found it.
  await measure(3, CYCLE);
  await settle();
  const before = await page.evaluate(() => window.__TWIN__.ctx.onFrame.length);
  const s = await measure(30, CYCLE);
  await settle();
  console.log(report('mode switching x10', s));
  const after = await page.evaluate(() => window.__TWIN__.ctx.onFrame.length);
  assert.equal(after, before, `onFrame grew from ${before} to ${after} callbacks over ten mode switches`);
  assert.equal(s.delta.objects, 0, `the scene grew by ${s.delta.objects} objects over ten mode switches`);
  assert.ok(s.p95 < 20, `p95 frame time ${s.p95.toFixed(1)} ms`);
  assert.equal(s.over100, 0, `${s.over100} frames over 100 ms (worst ${s.max.toFixed(0)} ms)`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
