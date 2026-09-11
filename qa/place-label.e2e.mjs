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
// No provenance badge outside reference mode (#69).
const UNION_HEADLINE = /^Union Station \d+ m$/;

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

test('far from any building, a scattered street-furniture set does not take the headline', async () => {
  // A record like "Pay-and-display parking machine" is one entry for every
  // machine downtown, so its box covers the whole city and the walker is
  // "inside" it almost everywhere. At this spot on the model's west edge, 72 m
  // from the nearest building, the HUD named it at 0 m. On a 25 m grid across
  // the model, a set like it took the headline at 174 of 1,035 street points.
  const place = await placeAt(-700, 1.7, -150);
  assert.doesNotMatch(place.name, /Pay-and-display|wayfinding pylon|signal head|shrubs|Transit shelter|Storefront fascia/,
    `the HUD named a scattered set: "${place.name}"`);
  assert.doesNotMatch(place.name, / 0 m$/, `claimed to be right at something: "${place.name}"`);
});

/** Jump to a viewpoint, let the HUD refresh, read the headline. */
async function headlineAt(viewpoint) {
  await page.evaluate((id) => window.__TWIN__.controls.teleport(id), viewpoint);
  await page.waitForTimeout(700);
  return page.evaluate(() => document.querySelector('.hud-place .place-name')?.textContent?.trim() ?? '');
}

test('in the Great Hall, the HUD names the Great Hall (#69)', async () => {
  // It said "Union Station east and west wings · INFERRED".
  const name = await headlineAt('great-hall');
  assert.match(name, /^Union Station Great Hall \d+ m$/, `the HUD said "${name}"`);
});

test('in the SkyWalk, the HUD names the SkyWalk (#69)', async () => {
  // It said "Metro Toronto Convention Centre".
  const name = await headlineAt('skywalk-east');
  assert.match(name, /^SkyWalk/, `the HUD said "${name}"`);
});

test('provenance badges and the true bearing live in reference mode (#69)', async () => {
  const read = () => page.evaluate(() => ({
    badge: Boolean(document.querySelector('.hud-place .place-name em')),
    bearing: document.querySelector('.hud-place .bearing').checkVisibility(),
  }));
  await headlineAt('union-forecourt');
  assert.deepEqual(await read(), { badge: false, bearing: false }, 'shown outside reference mode');
  await page.evaluate(() => window.__TWIN__.reference.toggle());
  await page.waitForTimeout(500);
  assert.deepEqual(await read(), { badge: true, bearing: true }, 'missing in reference mode');
  await page.evaluate(() => window.__TWIN__.reference.toggle());
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
