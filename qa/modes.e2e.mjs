/**
 * End-to-end cover for issue #4: switching orbit <-> walk jumped the camera.
 *
 * The unit test in qa/mode-transition.test.mjs checks the arithmetic. This one
 * checks the thing the issue was actually reported against: a real browser, the
 * real scene, the real HUD buttons, and - the part no unit test can reach -
 * frames rendered AFTER the switch, because the old bug only showed its teeth
 * once ground() ran and pulled the walker down onto whatever roof was below.
 *
 *   npm run e2e
 *
 * Needs a Playwright chromium (`npx playwright install chromium`).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = new URL('../', import.meta.url).pathname;

let server;
let browser;
let page;
const consoleErrors = [];

/** Start vite and read the URL it actually bound, rather than assuming a port. */
function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn('npx', ['vite', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const fail = setTimeout(() => reject(new Error('vite did not report a URL within 30 s')), 30_000);
    let out = '';
    server.stdout.setEncoding('utf8');
    server.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) { clearTimeout(fail); resolve(`http://127.0.0.1:${m[1]}/`); }
    });
    server.on('error', (err) => { clearTimeout(fail); reject(err); });
  });
}

/**
 * Playwright's own chromium if it has been downloaded, otherwise the Chrome
 * already on the machine. A digital twin needs real WebGL, and asking every
 * checkout to pull a 150 MB browser it may already have twice over is the kind
 * of setup step that gets an e2e suite quietly switched off.
 */
async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    if (!/Executable doesn't exist/.test(String(err))) throw err;
    return chromium.launch({ channel: 'chrome' });
  }
}

before(async () => {
  const url = await startServer();
  browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(url);
  // The world builds asynchronously; __TWIN__ appears only once it is running.
  await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
});

after(async () => {
  await browser?.close();
  server?.kill();
});

/** Put the orbit camera somewhere specific, the way the QA harness is meant to be used. */
const orbitFrom = (camera, target) => page.evaluate(([c, t]) => {
  const { ctx, controls } = window.__TWIN__;
  controls.setMode('orbit');
  controls.orbitControls.target.set(t[0], t[1], t[2]);
  ctx.camera.position.set(c[0], c[1], c[2]);
  ctx.camera.lookAt(controls.orbitControls.target);
  controls.orbitControls.update();
}, [camera, target]);

const readCamera = () => page.evaluate(() => {
  const { ctx, controls } = window.__TWIN__;
  const e = new (Object.getPrototypeOf(ctx.camera.rotation).constructor)(0, 0, 0, 'YXZ')
    .setFromQuaternion(ctx.camera.quaternion);
  const d = ctx.camera.getWorldDirection(ctx.camera.position.clone());
  return {
    pos: ctx.camera.position.toArray(),
    dir: d.toArray(),
    pitch: e.x,
    yaw: e.y,
    mode: controls.mode,
    level: controls.level,
    target: controls.orbitControls.target.toArray(),
  };
});

/** Click a HUD mode button by its label, so the test drives the real UI. */
const clickMode = async (label) => {
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  // Let the frame loop actually run: the old bug surfaced in ground(), not in
  // the switch itself.
  await page.waitForTimeout(400);
};

test('orbit -> walk lands at the subject on the street, not on a roof 300 m away', async () => {
  const target = [-40, 20, 60];
  await orbitFrom([140, 150, 240], target);
  await clickMode('Walk');

  const cam = await readCamera();
  assert.equal(cam.mode, 'walk');
  assert.ok(Math.hypot(cam.pos[0] - target[0], cam.pos[2] - target[2]) < 1.0,
    `landed ${Math.hypot(cam.pos[0] - target[0], cam.pos[2] - target[2]).toFixed(1)} m from the subject`);
  assert.equal(cam.level, 'street', 'a target framing downtown at 20 m is not the Gardiner deck');
  // Eye height over the pavement, after several frames of grounding - this is
  // the assertion the old code failed, landing at y 16.8 on a rooftop.
  assert.ok(cam.pos[1] > 0.5 && cam.pos[1] < 3.5, `eye height was ${cam.pos[1].toFixed(2)}`);
  assert.ok(Math.abs(cam.pitch) < 1e-6, 'arrives looking level, not at the pavement');
});

test('walk -> orbit does not rotate the view or move the camera', async () => {
  const before = await readCamera();
  await clickMode('Orbit');
  const after = await readCamera();

  assert.equal(after.mode, 'orbit');
  // The camera itself must not budge - that is the jump the issue reports.
  // Horizontally that is exact. Vertically it is a couple of millimetres: the
  // walker's ground() is still easing toward eye height in the frames either
  // side of the click, and a millimetre of settle is not a jump.
  assert.ok(Math.abs(after.pos[0] - before.pos[0]) < 1e-4, `camera moved in x: ${before.pos[0]} -> ${after.pos[0]}`);
  assert.ok(Math.abs(after.pos[2] - before.pos[2]) < 1e-4, `camera moved in z: ${before.pos[2]} -> ${after.pos[2]}`);
  assert.ok(Math.abs(after.pos[1] - before.pos[1]) < 0.05, `camera moved in y: ${before.pos[1]} -> ${after.pos[1]}`);
  // The view may tilt by the sliver needed to stay inside maxPolarAngle, and no
  // more. The old code swung the whole view to face grid-north.
  const dot = after.dir[0] * before.dir[0] + after.dir[1] * before.dir[1] + after.dir[2] * before.dir[2];
  const swungDeg = Math.acos(Math.min(1, dot)) * 180 / Math.PI;
  assert.ok(swungDeg < 2, `view swung ${swungDeg.toFixed(2)} degrees`);
  // The pivot is ahead of the camera along that same view ray.
  const ahead = after.dir[0] * (after.target[0] - after.pos[0]) + after.dir[2] * (after.target[2] - after.pos[2]);
  assert.ok(ahead > 0, 'the orbit target sits ahead of the camera, not 60 m grid-north of it');
});

test('orbiting the PATH and switching to walk puts you on the PATH', async () => {
  await orbitFrom([-120, 60, 140], [-120, -6.5, 40]);
  await clickMode('Walk');

  const cam = await readCamera();
  assert.equal(cam.level, 'PATH');
  assert.ok(cam.pos[1] < 0, `still below grade after grounding, got y ${cam.pos[1].toFixed(2)}`);
});

test('a viewpoint teleport still lands where it says', async () => {
  const landed = await page.evaluate(() => {
    const { ctx, controls } = window.__TWIN__;
    const vp = controls.teleport(controls.viewpoints[0].id);
    return { want: vp.position, got: ctx.camera.position.toArray(), mode: controls.mode };
  });
  assert.ok(Math.hypot(landed.got[0] - landed.want.x, landed.got[2] - landed.want.z) < 0.01,
    'setMode must not overwrite the position teleport just set');
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
