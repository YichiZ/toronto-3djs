/**
 * Issue #11 in a real browser: routes into the PATH and back up to the street.
 *
 *   npm run e2e
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openWorld } from './e2eHarness.mjs';

let world;
let page;
const consoleErrors = [];

before(async () => {
  world = await openWorld({ consoleErrors });
  page = world.page;
});

after(async () => { await world?.close(); });

/** Stand at a viewpoint, choose a destination, and read back what the guide worked out. */
async function goFrom(viewpoint, destination) {
  await page.evaluate((v) => window.__TWIN__.controls.teleport(v), viewpoint);
  await page.waitForTimeout(400);
  await page.selectOption('.hud-goto', destination);
  await page.waitForTimeout(600);
  return page.evaluate(async () => {
    const { getRoute } = await import('/src/ui/wayfinding.js');
    const pts = getRoute();
    return {
      text: document.querySelector('.hud-guide .guide-text').textContent,
      points: pts?.length ?? 0,
      climbs: (pts ?? []).filter((p) => p.access).map((p) => `${p.access.kind} ${p.x},${p.z}`),
    };
  });
}

test('from Front Street to the PATH corridor, the route goes down a stair or lift', async () => {
  const r = await goFrom('front-bay-west', 'vp:path-corridor');
  assert.ok(r.climbs.length >= 1, `no way down on the route (${r.points} points): "${r.text}"`);
  assert.match(r.text, /· \d+ m$/);
});

test('from the PATH up to a street corner', async () => {
  const r = await goFrom('path-corridor', 'x:front-york');
  assert.ok(r.climbs.length >= 1, `no way up on the route (${r.points} points): "${r.text}"`);
});

test('a concourse destination keeps the straight line: the concourses have no walk graph yet', async () => {
  const r = await goFrom('front-bay-west', 'vp:york-concourse');
  assert.equal(r.points, 0);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
