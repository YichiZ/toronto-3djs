/**
 * Shared plumbing for the Playwright suites: one vite server, one browser.
 *
 * Extracted when the second e2e file appeared - the fifty lines of "start vite,
 * find the port it actually bound, fall back to the system Chrome" are the same
 * for every suite and are not what any of them is testing.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;

/** Start vite and read the URL it actually bound, rather than assuming a port. */
/** Newest mtime under a directory, so a stale bundle is caught before it is measured. */
function newestMtime(dir) {
  let newest = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    newest = Math.max(newest, e.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

/**
 * `vite preview` serves whatever is in dist/ - or a 404 page if nothing is -
 * without complaint, so a perf run against a missing or stale bundle would be
 * blamed on the current source. Refuse up front.
 */
function assertFreshBundle() {
  const built = join(ROOT, 'dist', 'index.html');
  if (!existsSync(built)) throw new Error('dist/ is missing: run `npm run build` (or `npm run e2e:perf`) first');
  if (newestMtime(join(ROOT, 'src')) > statSync(built).mtimeMs) {
    throw new Error('dist/ is older than src/: run `npm run build` (or `npm run e2e:perf`) first');
  }
}

export function startServer({ preview = false } = {}) {
  if (preview) assertFreshBundle();
  return new Promise((resolve, reject) => {
    // `preview` serves dist/ - the production bundle, which is what a perf run
    // has to measure. Port 0 lets the OS pick, so a busy 4173 is not a failure.
    const args = preview ? ['vite', 'preview', '--host', '127.0.0.1', '--port', '0'] : ['vite', '--host', '127.0.0.1'];
    const server = spawn('npx', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const fail = setTimeout(() => reject(new Error('vite did not report a URL within 30 s')), 30_000);
    let out = '';
    server.stdout.setEncoding('utf8');
    server.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) { clearTimeout(fail); resolve({ server, url: `http://127.0.0.1:${m[1]}/` }); }
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
export async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    if (!/Executable doesn't exist/.test(String(err))) throw err;
    return chromium.launch({ channel: 'chrome' });
  }
}

/**
 * Server + browser + a page with the world already built.
 *
 * The first-visit card (#26) is marked seen unless `intro` is set: it sits over
 * the middle of the view, and no other suite is testing it.
 */
export async function openWorld({ consoleErrors = [], contextOptions, intro = false, preview = false } = {}) {
  const { server, url } = await startServer({ preview });
  const browser = await launchBrowser();
  const viewport = { width: 1280, height: 800 };
  // contextOptions: e.g. { hasTouch: true } for a touchscreen device.
  const page = contextOptions
    ? await (await browser.newContext({ viewport, ...contextOptions })).newPage()
    : await browser.newPage({ viewport });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  if (!intro) await page.addInitScript(() => { try { localStorage.setItem('twin.introSeen', '1'); } catch { /* card shows */ } });
  await page.goto(url);
  // The world builds asynchronously; __TWIN__ appears only once it is running.
  await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
  return { server, browser, page, close: async () => { await browser.close(); server.kill(); } };
}

/** Dispatch a keyboard event on the window, the way the controls listen for it. */
export const pressKey = (page, type, code) => page.evaluate(([t, c]) =>
  window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [type, code]);

/**
 * Stand the walker at a world position, facing `yaw`, on the level that
 * contains its feet, and let grounding settle for 40 frames.
 */
export const standWalker = (page, { x, y, z, yaw = 0 }) => page.evaluate(async ([px, py, pz, angle]) => {
  const { ctx, controls } = window.__TWIN__;
  controls.setMode('orbit');
  controls.setMode('walk');
  ctx.camera.position.set(px, py, pz);
  controls.setLevelByY(py - 1.7);
  ctx.camera.rotation.set(0, angle, 0);
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  return { y: ctx.camera.position.y, level: controls.level };
}, [x, y, z, yaw]);
