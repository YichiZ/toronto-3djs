// Product-review driver: cold open, four routes, tour, reference. Advisory only.
import { openWorld, pressKey } from '/Users/yichizhang/code/toronto-3djs/.claude/worktrees/product-review-prompt-89d498/qa/e2eHarness.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '/Users/yichizhang/code/toronto-3djs/.claude/worktrees/product-review-prompt-89d498/product-review';
mkdirSync(OUT, { recursive: true });
const log = [];
const note = (k, v) => { log.push({ t: Date.now() - T0, k, v }); console.log(k, JSON.stringify(v)); };
let T0 = Date.now();
const errors = [];
const t0 = Date.now();
const world = await openWorld({ consoleErrors: errors, intro: true });
const { page } = world;
T0 = t0;
note('time-to-__TWIN__-ms', Date.now() - t0);

let n = 0;
const shot = async (name) => { const f = `${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: `${OUT}/${f}` }); return f; };
const hud = () => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.hidden; };
  const out = {};
  for (const el of document.querySelectorAll('[class*="hud"], #tour-caption, [id*="intro"], [class*="intro"], [class*="nearby"], [class*="guide"], [class*="minimap"]')) {
    if (!vis(el)) continue;
    const txt = el.innerText?.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (txt) out[(el.id ? '#' + el.id : '.' + [...el.classList].join('.'))] = txt;
  }
  const { controls } = window.__TWIN__;
  return { mode: controls.mode, level: controls.level, text: out };
});
const walk = async (code, ms) => { await pressKey(page, 'keydown', code); await page.waitForTimeout(ms); await pressKey(page, 'keyup', code); };
const pos = () => page.evaluate(() => { const p = window.__TWIN__.ctx.camera.position; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }; });
const tp = async (id) => { await page.evaluate((v) => window.__TWIN__.controls.teleport(v), id); await page.waitForTimeout(1500); };
const step = async (label, id, { walkMs = 2500 } = {}) => {
  if (id) await tp(id);
  const before = await pos();
  const s1 = await shot(`${label}`);
  const h = await hud();
  await walk('KeyW', walkMs);
  await page.waitForTimeout(300);
  const after = await pos();
  const s2 = await shot(`${label}-after-walk`);
  note(`step:${label}`, { s1, s2, before, after, moved: +Math.hypot(after.x - before.x, after.z - before.z).toFixed(1), hud: h });
};

// ---- Phase 1: first sixty seconds ----
await page.waitForTimeout(1500);
note('p1:cold-hud', { shot: await shot('cold-open'), hud: await hud() });
await page.waitForTimeout(8000);
note('p1:after-10s-idle', { shot: await shot('cold-10s-idle'), hud: await hud() });
// Try to move before dismissing anything: does the world respond?
const b0 = await pos(); await walk('KeyW', 1500); const b1 = await pos();
note('p1:walk-before-click', { moved: +Math.hypot(b1.x - b0.x, b1.z - b0.z).toFixed(1) });
await page.mouse.click(640, 400);
await page.waitForTimeout(1200);
note('p1:after-click', { shot: await shot('after-first-click'), hud: await hud() });
await pressKey(page, 'keydown', 'KeyH'); await page.waitForTimeout(600);
note('p1:help', { shot: await shot('help-panel'), hud: await hud() });
await pressKey(page, 'keyup', 'KeyH'); await pressKey(page, 'keydown', 'Escape'); await pressKey(page, 'keyup', 'Escape');
note('p1:goto-options', await page.evaluate(() => [...document.querySelectorAll('.hud-goto option')].map((o) => `${o.value}=${o.textContent}`)));

// ---- Route 1: Front & Bay -> Great Hall -> concourse -> street ----
await step('r1-front-bay', 'front-bay-west');
await step('r1-forecourt', 'union-forecourt');
await step('r1-great-hall', 'great-hall');
await step('r1-york-concourse', 'york-concourse');
await page.selectOption('.hud-goto', 'x:front-york').catch((e) => note('r1:goto-fail', String(e)));
await page.waitForTimeout(800);
note('r1:guide-to-street', { shot: await shot('r1-guide-back-to-street'), hud: await hud() });
// Try the level key from the concourse: can a visitor get back up without a teleport?
const lv0 = await hud(); await walk('KeyE', 200); await page.waitForTimeout(1500); const lv1 = await hud();
note('r1:level-up-from-concourse', { from: lv0.level, to: lv1.level, shot: await shot('r1-level-up') });

// ---- Route 2: street -> PATH -> back up ----
await tp('front-bay-west');
await page.selectOption('.hud-goto', 'vp:path-corridor').catch((e) => note('r2:goto-fail', String(e)));
await page.waitForTimeout(800);
note('r2:guide-to-path', { shot: await shot('r2-guide-to-path'), hud: await hud() });
await step('r2-path-corridor', 'path-corridor', { walkMs: 4000 });
const p0 = await hud(); await walk('KeyE', 200); await page.waitForTimeout(1500); const p1 = await hud();
note('r2:level-up-from-path', { from: p0.level, to: p1.level, shot: await shot('r2-level-up') });

// ---- Route 3: SkyWalk ----
await step('r3-skywalk', 'skywalk-east', { walkMs: 5000 });
await walk('ArrowLeft', 800);
note('r3:skywalk-turned', { shot: await shot('r3-skywalk-turned'), hud: await hud() });

// ---- Extra street context for sense of place ----
await step('x-bay-underpass', 'bay-underpass');
await step('x-hhof', 'hhof-front-yonge');
await step('x-lakeshore', 'lakeshore-under-gardiner');

// ---- Route 4: full tour, then reference toggle ----
await tp('front-bay-west');
await pressKey(page, 'keydown', 'KeyT'); await pressKey(page, 'keyup', 'KeyT');
await page.waitForTimeout(500);
const running = await page.evaluate(() => window.__TWIN__.tour.isRunning());
note('r4:tour-started-by-T', running);
if (!running) await page.evaluate(() => window.__TWIN__.tour.start());
let last = -1;
const tourStart = Date.now();
while (await page.evaluate(() => window.__TWIN__.tour.isRunning())) {
  const b = await page.evaluate(() => window.__TWIN__.tour.beat());
  if (b && b.index !== last) {
    last = b.index;
    await page.waitForTimeout(Math.min(b.seconds * 1000 * 0.5, 12000)); // mid-beat, the hero frame
    note(`r4:beat-${b.index + 1}-${b.id}`, { shot: await shot(`r4-tour-${b.index + 1}-${b.id}`), hud: await hud() });
  }
  await page.waitForTimeout(500);
  if (Date.now() - tourStart > 330_000) { note('r4:tour-timeout', true); break; }
}
note('r4:tour-ended', { sec: Math.round((Date.now() - tourStart) / 1000), hud: await hud(), shot: await shot('r4-tour-end') });
await pressKey(page, 'keydown', 'KeyR'); await pressKey(page, 'keyup', 'KeyR');
await page.waitForTimeout(2500);
note('r4:reference-on', { enabled: await page.evaluate(() => window.__TWIN__.reference.enabled()), shot: await shot('r4-reference-on'), hud: await hud() });
await pressKey(page, 'keydown', 'KeyR'); await pressKey(page, 'keyup', 'KeyR');
await page.waitForTimeout(1000);
note('r4:reference-off', { enabled: await page.evaluate(() => window.__TWIN__.reference.enabled()), shot: await shot('r4-reference-off') });

note('console-errors', errors);
writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 2));
await world.close();
