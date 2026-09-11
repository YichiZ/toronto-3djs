/**
 * Issue #15 in a real browser: the nearby strip under the place label.
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

const LINE = /^[↑↗→↘↓↙←↖] (.+) · (\d+) m$/;

async function strip(viewpoint) {
  await page.evaluate((id) => window.__TWIN__.controls.teleport(id), viewpoint);
  await page.waitForTimeout(700);
  return page.evaluate(() => ({
    shown: document.querySelector('.place-nearby').checkVisibility(),
    lines: [...document.querySelectorAll('.place-nearby li')].map((li) => li.textContent),
    headline: document.querySelector('.place-name').childNodes[0]?.textContent.trim(),
  }));
}

test('on the forecourt: nearby places, and the lift down to the PATH', async () => {
  const s = await strip('union-forecourt');
  assert.equal(s.shown, true);
  for (const l of s.lines) assert.match(l, LINE);
  const places = s.lines.filter((l) => !/[⇣⇡]/.test(l));
  assert.ok(places.length >= 2, `only ${places.length} places: ${JSON.stringify(s.lines)}`);
  assert.ok(!places.some((l) => l.includes(` ${s.headline} · `)), `the headline "${s.headline}" is repeated`);
  // Nor its parts: both lines were Union Station's colonnade and entablature.
  assert.ok(!places.some((l) => l.slice(2).startsWith(`${s.headline} `)), `parts of "${s.headline}" listed: ${JSON.stringify(places)}`);
  const metres = places.map((l) => Number(l.match(LINE)[2]));
  assert.deepEqual(metres, [...metres].sort((a, b) => a - b), 'places are not nearest first');
  // The lift at (-112, 12), 17 m from the viewpoint at (-128, 6).
  const way = s.lines.find((l) => l.includes('Lift down to the PATH ⇣'));
  assert.ok(way, `no way down listed: ${JSON.stringify(s.lines)}`);
  assert.ok(Math.abs(Number(way.match(LINE)[2]) - 17) <= 1, way);
});

test('in the PATH: the nearest way up, the Loop entrance stairs to the street', async () => {
  const s = await strip('path-corridor');
  // The Union Station Loop headhouse at (-24, 17.5), 11 m from the viewpoint
  // at (-30, 8). Before the forecourt stairs were tagged (#72) the nearest
  // listed way up was the concourse stair at (-40, 26.1), 21 m off.
  const way = s.lines.find((l) => l.includes('Stairs up to street level ⇡'));
  assert.ok(way, `no way up listed: ${JSON.stringify(s.lines)}`);
  assert.ok(Math.abs(Number(way.match(LINE)[2]) - 11) <= 1, way);
});

test('walk mode only', async () => {
  const s = await strip('royal-bank-plaza-orbit');
  assert.equal(s.shown, false);
});

test('with the strip up, no HUD panel overlaps another', async () => {
  await strip('union-forecourt');
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.hud-panel')].filter((e) => e.checkVisibility() && e.getClientRects().length);
      const out = [];
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect();
        const b = els[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
          out.push(`${els[i].className} x ${els[j].className}`);
        }
      }
      return out;
    });
    assert.deepEqual(over, [], `at ${width} px`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('the whole run produced no console errors', () => {
  assert.deepEqual(consoleErrors, []);
});
