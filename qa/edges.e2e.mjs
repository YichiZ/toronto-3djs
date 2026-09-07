/**
 * End-to-end cover for issue #13, problem 2: walking off a floor kept walking.
 *
 * ground() holds the level's nominal height when nothing is underfoot, so the
 * walker used to stroll 30 m out over Front Street at eye height 10.7. The unit
 * test in qa/edge.test.mjs checks the arithmetic; this one needs the real scene,
 * because the whole question is which surfaces are actually modelled where.
 *
 * The reported site was the SkyWalk deck edge. That one cannot be reproduced:
 * the tube is glazed to the springing on both sides and both ends are walled by
 * the vertical cores, so collision already stops you. The reachable instance is
 * the Royal Bank Plaza north setback roof at 8.77, which you reach with E from
 * the street and walk off northward.
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

/** Playwright's own chromium if it has been downloaded, otherwise the machine's Chrome. */
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
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
});

after(async () => {
  await browser?.close();
  server?.kill();
});

/**
 * Stand at `from`, face `look`, hold W for `ms`, and report where the walker
 * ended up and whether anything is modelled under it.
 *
 * The floor probe repeats what ground() does - the same origin, the same
 * invisible/noCollide skip - because "is the walker standing on air" is exactly
 * the question ground() answers, and the test must ask it the same way.
 */
const walkAndProbe = (from, look, ms = 9000) => page.evaluate(async ([from, look, ms]) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { ctx, controls } = window.__TWIN__;
  const down = new THREE.Raycaster();
  down.camera = ctx.camera;
  down.far = 11.4;                       // PROBE_ABOVE + PROBE_BELOW
  const solid = (hit) => {
    if (!hit.face) return false;
    for (let o = hit.object; o; o = o.parent) if (o.visible === false || o.userData?.noCollide) return false;
    return true;
  };
  const floorUnder = (x, z, levelY) => {
    down.set(new THREE.Vector3(x, levelY + 2.4, z), new THREE.Vector3(0, -1, 0));
    for (const hit of down.intersectObject(ctx.scene, true)) {
      if (!solid(hit)) continue;
      if (hit.point.y + 1.7 - ctx.camera.position.y > 3.6) continue;
      return hit.point.y;
    }
    return null;
  };

  controls.setMode('walk');
  ctx.camera.position.set(from[0], from[1], from[2]);
  const level = controls.setLevelByY(from[1] - 1.7);
  ctx.camera.lookAt(look[0], from[1], look[1]);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  const t0 = performance.now();
  while (performance.now() - t0 < ms) await new Promise((r) => requestAnimationFrame(r));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));

  const p = ctx.camera.position;
  const levelY = { PATH: -6.5, concourse: -3.5, street: 0, 'viaduct deck': 6.5, SkyWalk: 9, 'Gardiner deck': 12 };
  return {
    level,
    pos: p.toArray(),
    floor: floorUnder(p.x, p.z, levelY[controls.level]),
    travelled: Math.hypot(p.x - from[0], p.z - from[2]),
  };
}, [from, look, ms]);

// The setback roof sits at 8.77 and is walkable at level 9 (nearest of the six).
// Facing grid-north from z -124 crosses the roof and runs out of it around -117.
const ROOF = [-28, 8.77 + 1.7, -124];

test('walking north off the Royal Bank Plaza roof stops at the edge', async () => {
  const end = await walkAndProbe(ROOF, [-28, 100]);
  assert.equal(end.level, 'SkyWalk');
  assert.ok(end.travelled > 1, `never left the spot: moved ${end.travelled.toFixed(2)} m`);
  // The assertion the old code failed: it ended at z -89, 30 m past the roof,
  // with nothing whatever underneath it.
  assert.notEqual(end.floor, null,
    `walked off the roof into thin air: ended at ${end.pos.map((n) => n.toFixed(1))} with no floor under it`);
  assert.ok(end.pos[2] < -110, `crossed the void to z ${end.pos[2].toFixed(1)}`);
});

test('nominal-held ground is still walkable - the PATH at -120, 40 has no floor mesh', async () => {
  // The guard ground() has always had, and the reason the edge is blocked rather
  // than fallen off: unfloored stretches must stay walkable, not become holes or
  // walls. If the edge test were written as "no floor ahead means stop", this
  // walker would not move at all.
  const end = await walkAndProbe([-120, -6.5 + 1.7, 40], [-120, 120], 5000);
  assert.equal(end.floor, null, 'this stretch is nominal-held; the test is only meaningful while it is');
  assert.ok(end.travelled > 5, `nominal-held ground became unwalkable: moved ${end.travelled.toFixed(2)} m`);
});
