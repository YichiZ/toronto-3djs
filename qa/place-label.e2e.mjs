/**
 * Issue #10 in the real scene: what the HUD's "where am I" line says.
 *
 * Before the fix, standing on the pavement 4 m from Union Station's face, the
 * label named the York Street plaza at the west end, the taxi lay-by in the
 * middle and the streetcar loop at the east end - never the building you are
 * standing at. The unit test in qa/place-label.test.mjs checks the ranking;
 * this one needs the real registry and the real HUD.
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

/** Stand still at an eye position, let the throttled HUD refresh, read the place panel. */
async function placeAt(x, eyeY, z) {
  await page.evaluate(([px, py, pz]) => {
    const { ctx, controls } = window.__TWIN__;
    controls.setMode('walk');
    ctx.camera.position.set(px, py, pz);
    controls.setLevelByY(py - 1.7);
  }, [x, eyeY, z]);
  await page.waitForTimeout(600);   // the HUD refreshes every 0.25 s
  return page.evaluate(() => ({
    name: document.querySelector('.hud-place .place-name')?.textContent?.trim() ?? '',
    near: document.querySelector('.hud-place .place-near')?.textContent?.trim() ?? '',
  }));
}

// Union Station's box runs x -242.6 to -13.4, long face at z 18.6 - probed from
// the registry, not guessed. The pavement 4 m off that face:
const PAVEMENT_Z = 18.6 - 4;
const UNION_HEADLINE = /^Union Station (surveyed|reference|inferred|approximated) \d+ m$/;

for (const [spot, x, corner] of [
  ['west end', -234.6, 'Front & York'],
  ['middle', -128, null],
  ['east end', -21.4, 'Front & Bay'],
]) {
  test(`on Front Street at Union's ${spot}, the HUD names Union Station`, async () => {
    const place = await placeAt(x, 1.7, PAVEMENT_Z);
    assert.match(place.name, UNION_HEADLINE, `the HUD said "${place.name}"`);
    assert.match(place.near, /^near .+ · \d+ m$/, `no intersection line: "${place.near}"`);
    if (corner) assert.ok(place.near.startsWith(`near ${corner} `), `nearest corner was "${place.near}"`);
  });
}

test('below grade in the PATH, the HUD names the PATH - not Union Station above it', async () => {
  // Inside the PATH Union cluster's box, 4.8 m under Union's floor.
  const place = await placeAt(-120, -6.5 + 1.7, 20);
  assert.match(place.name, /^PATH/, `the HUD said "${place.name}"`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
