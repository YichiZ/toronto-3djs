/**
 * Issue #110 in a real browser: pressing E in a concourse lifted the walker
 * straight up, into the inside of the head house — a white slab with no exit,
 * while the place card still read "York Concourse" and the level chip read
 * "street".
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

/** Where the walker ended up, and whether that spot is inside a building. */
const LANDING = `async () => {
  const { BUILDINGS, footprint } = await import('/src/data/buildings.js');
  const { ctx, controls } = window.__TWIN__;
  const p = ctx.camera.position;
  const inside = BUILDINGS.filter((b) => {
    const f = footprint(b);
    return (b.height ?? 0) > p.y
      && p.x > f.minX && p.x < f.maxX && p.z > f.minZ && p.z < f.maxZ;
  }).map((b) => b.id);
  return {
    x: +p.x.toFixed(1), y: +p.y.toFixed(2), z: +p.z.toFixed(1),
    level: controls.level,
    place: document.querySelector('.hud-place')?.textContent?.trim().slice(0, 40) ?? '',
    inside,
  };
}`;

for (const viewpoint of ['york-concourse', 'bay-concourse']) {
  test(`E from "${viewpoint}" lands somewhere a walker can stand, not inside the station (#110)`, async () => {
    await page.evaluate((id) => window.__TWIN__.controls.teleport(id), viewpoint);
    await page.waitForTimeout(1200);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(2500);
    const l = await page.evaluate(`(${LANDING})()`);
    const where = JSON.stringify(l);
    // Unfixed: x and z unchanged, inside ["union-station"], place still the concourse.
    assert.deepEqual(l.inside, [], `inside ${l.inside.join(', ')} - ${where}`);
    assert.equal(l.level, 'street', where);
    // Standing on the street, not hovering over it or sunk into it.
    assert.ok(Math.abs(l.y - 1.7) < 0.6, `eye at ${l.y} m - ${where}`);
    assert.ok(!/Concourse/.test(l.place), `the place card still says "${l.place}"`);
  });
}

test('a level change that is already in the open does not move the walker (#110)', async () => {
  await page.evaluate(() => window.__TWIN__.controls.teleport('path-corridor'));
  await page.waitForTimeout(1200);
  const before = await page.evaluate(`(${LANDING})()`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2500);
  const after = await page.evaluate(`(${LANDING})()`);
  assert.equal(after.level, 'street');
  // On the spot, give or take the metre grounding and collision settle it by:
  // the corridor under Bay comes up onto open roadway, so nothing relocates it.
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  assert.ok(moved < 2, `the PATH under Bay moved ${moved.toFixed(1)} m to come up`);
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
