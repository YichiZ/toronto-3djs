/**
 * Shared plumbing for the Playwright suites: one vite server, one browser.
 *
 * Extracted when the second e2e file appeared - the fifty lines of "start vite,
 * find the port it actually bound, fall back to the system Chrome" are the same
 * for every suite and are not what any of them is testing.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = new URL('../', import.meta.url).pathname;

/** Start vite and read the URL it actually bound, rather than assuming a port. */
export function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('npx', ['vite', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
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

/** Server + browser + a page with the world already built. */
export async function openWorld({ consoleErrors = [] } = {}) {
  const { server, url } = await startServer();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(url);
  // The world builds asynchronously; __TWIN__ appears only once it is running.
  await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
  return { server, browser, page, close: async () => { await browser.close(); server.kill(); } };
}
