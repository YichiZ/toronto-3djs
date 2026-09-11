// Product-review run 2 driver: the surfaces run 1 skipped. Advisory only.
//   node .agents/notes/product-review.driver2.mjs  -> product-review/run2/*.jpg + log.json
import { openWorld, pressKey } from '../../qa/e2eHarness.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../../product-review/run2/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const log = [];
const note = (k, v) => { log.push({ k, v }); console.log(k, JSON.stringify(v).slice(0, 400)); };
let n = 0;

function kit(page, tag) {
  const shot = async (name) => { const f = `${String(++n).padStart(2, '0')}-${tag}-${name}.jpg`; await page.screenshot({ path: OUT + f, type: 'jpeg', quality: 70 }); return f; };
  const hud = () => page.evaluate(() => {
    const t = (s) => document.querySelector(s)?.innerText?.trim().replace(/\s+/g, ' ').slice(0, 160) ?? null;
    const { controls } = window.__TWIN__;
    return { mode: controls.mode, level: controls.level, place: t('.hud-place'), guide: t('.hud-guide'), card: t('.hud-card:not([hidden])') };
  });
  const pos = () => page.evaluate(() => window.__TWIN__.ctx.camera.position.toArray().map((v) => +v.toFixed(1)));
  const tp = async (id) => { await page.evaluate((v) => window.__TWIN__.controls.teleport(v), id); await page.waitForTimeout(1500); };
  const walk = async (code, ms) => { await pressKey(page, 'keydown', code); await page.waitForTimeout(ms); await pressKey(page, 'keyup', code); };
  return { shot, hud, pos, tp, walk };
}

// ---------------- Desktop ----------------
const errors = [];
let world = await openWorld({ consoleErrors: errors });
let { page } = world;
let k = kit(page, 'd');

// A. Viewpoints run 1 never visited.
const UNVISITED = ['bay-concourse', 'galleria-interior', 'royal-york-porte-cochere', 'front-york-east', 'bay-north-of-front',
  'cn-tower-base', 'bremner-lower-simcoe', 'arena-bay-heritage', 'the-park-cibc', 'maple-leaf-square', 'roundhouse-park',
  'gooderham-flatiron', 'front-street-establishing', 'union-trainshed-orbit', 'royal-bank-plaza-orbit'];
for (const id of UNVISITED) {
  await k.tp(id);
  const s = await k.shot(`vp-${id}`);
  const h = await k.hud();
  const a = await k.pos(); await k.walk('KeyW', 2000); const b = await k.pos();
  note(`vp:${id}`, { s, moved: +Math.hypot(b[0] - a[0], b[2] - a[2]).toFixed(1), hud: h });
}

// B. Night at the key spots.
for (const id of ['union-forecourt', 'front-bay-west', 'great-hall', 'path-corridor']) {
  await k.tp(id);
  await page.evaluate(() => window.__TWIN__.time.setHour(22.5));
  await page.waitForTimeout(1200);
  note(`night:${id}`, { s: await k.shot(`night-${id}`), hud: await k.hud() });
}
await page.evaluate(() => window.__TWIN__.time.setHour(18.7));

// C. Orbit mode: switch, drag, zoom.
await k.tp('union-forecourt');
await pressKey(page, 'keydown', 'Digit2'); await pressKey(page, 'keyup', 'Digit2');
await page.waitForTimeout(1500);
note('orbit:enter', { s: await k.shot('orbit-enter'), hud: await k.hud() });
await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.move(900, 350, { steps: 12 }); await page.mouse.up();
await page.mouse.wheel(0, -800); await page.waitForTimeout(1000);
note('orbit:drag-zoom', { s: await k.shot('orbit-drag-zoom'), hud: await k.hud() });
await pressKey(page, 'keydown', 'Digit1'); await pressKey(page, 'keyup', 'Digit1');
await page.waitForTimeout(1500);
note('orbit:back-to-walk', { s: await k.shot('orbit-back-to-walk'), hud: await k.hud(), pos: await k.pos() });

// D. Storefront: capture, face one, F for the card.
await page.evaluate(() => { const pl = window.__TWIN__.controls.pointerLock; pl.isLocked = true; pl.dispatchEvent({ type: 'lock' }); });
const shop = await page.evaluate(async () => {
  const { ctx, controls } = window.__TWIN__;
  const { getInteractive } = await import('/src/core/registry.js');
  const V = ctx.camera.position.constructor;
  const lets = getInteractive().filter((o) => o.userData.payload?.category && o.userData.payload.category !== 'vacant');
  for (const vol of lets.slice(0, 80)) {
    const p = vol.getWorldPosition(new V());
    const nn = new V(0, 0, 1).applyQuaternion(vol.getWorldQuaternion(ctx.camera.quaternion.clone())); nn.y = 0;
    if (nn.lengthSq() < 1e-6) continue; nn.normalize();
    controls.setMode('walk');
    ctx.camera.position.set(p.x + nn.x * 6, Math.max(p.y, 1.7), p.z + nn.z * 6);
    controls.setLevelByY(ctx.camera.position.y - 1.7);
    ctx.camera.lookAt(p.x, p.y, p.z);
    await new Promise((r) => setTimeout(r, 450));
    const hint = document.querySelector('.hud-hint');
    if (hint && !hint.hidden) return { tenant: vol.userData.payload.tenant, tried: lets.indexOf(vol) + 1, total: lets.length };
  }
  return null;
});
note('shop:found', { shop, s: await k.shot('shop-hint') });
await pressKey(page, 'keydown', 'KeyF'); await pressKey(page, 'keyup', 'KeyF');
await page.waitForTimeout(700);
note('shop:card', { s: await k.shot('shop-card'), hud: await k.hud() });
await pressKey(page, 'keydown', 'Escape'); await pressKey(page, 'keyup', 'Escape');
await page.evaluate(() => { const pl = window.__TWIN__.controls.pointerLock; pl.isLocked = false; pl.dispatchEvent({ type: 'unlock' }); });

// E. Minimap: click the forecourt dot from Front & Bay.
await k.tp('front-bay-west');
await page.waitForTimeout(300);
const target = await page.evaluate(async () => {
  const { ctx } = window.__TWIN__;
  const { worldToMap, headingOf, VIEW_METRES } = await import('/src/ui/minimapPlan.js');
  const { getViewpoint } = await import('/src/data/references.js');
  const vp = getViewpoint('union-forecourt');
  const c = document.querySelector('.hud-minimap canvas'); const r = c.getBoundingClientRect();
  const dir = ctx.camera.getWorldDirection(ctx.camera.up.clone());
  const m = worldToMap(vp.position.x, vp.position.z, { x: ctx.camera.position.x, z: ctx.camera.position.z }, r.width, VIEW_METRES, headingOf(dir.x, dir.z));
  const inside = m.x >= 0 && m.y >= 0 && m.x <= r.width && m.y <= r.height;
  return { x: r.left + m.x, y: r.top + m.y, inside, vp: vp.position };
});
if (target.inside) await page.mouse.click(target.x, target.y);
await page.waitForTimeout(800);
const at = await k.pos();
note('minimap:click', { inside: target.inside, missBy: +Math.hypot(at[0] - target.vp.x, at[2] - target.vp.z).toFixed(1), s: await k.shot('minimap-click'), hud: await k.hud() });

// F. Every Go-to destination from Front & Bay: guide text and route length.
await k.tp('front-bay-west');
const opts = await page.evaluate(() => [...document.querySelectorAll('.hud-goto option')].map((o) => o.value).filter(Boolean));
const gotos = [];
for (const v of opts) {
  await page.selectOption('.hud-goto', v);
  await page.waitForTimeout(500);
  gotos.push(await page.evaluate(async (val) => {
    const { getRoute } = await import('/src/ui/wayfinding.js');
    return { v: val, text: document.querySelector('.hud-guide .guide-text')?.textContent ?? null, points: getRoute()?.length ?? 0 };
  }, v));
}
note('goto:all', gotos);
note('goto:shot', await k.shot('goto-last'));

// G. Share link: cold open on a hash.
const base = page.url().split('#')[0];
await page.goto(`${base}#v=great-hall&mode=walk&t=21`);
await page.waitForFunction(() => Boolean(window.__TWIN__), null, { timeout: 60_000 });
await page.waitForTimeout(2500);
note('share:great-hall-21h', { s: await k.shot('share-great-hall-21h'), hud: await k.hud(), vp: await page.evaluate(() => window.__TWIN__.controls.viewpoint), hour: await page.evaluate(() => window.__TWIN__.time.getHour?.()) });
note('desktop-console-errors', errors);
await world.close();

// ---------------- Phone ----------------
const perrors = [];
world = await openWorld({ consoleErrors: perrors, intro: true, contextOptions: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } });
page = world.page;
k = kit(page, 'm');
await page.waitForTimeout(1500);
note('phone:cold', { s: await k.shot('cold'), hud: await k.hud() });
const cta = page.getByText(/tap|click to walk|start/i).first();
if (await cta.count()) await cta.tap().catch((e) => note('phone:cta-tap-fail', String(e)));
else await page.touchscreen.tap(195, 500);
await page.waitForTimeout(1200);
note('phone:after-start', { s: await k.shot('after-start'), hud: await k.hud() });
for (const id of ['union-forecourt', 'great-hall', 'path-corridor']) {
  await k.tp(id);
  note(`phone:${id}`, { s: await k.shot(id), hud: await k.hud() });
}
await page.evaluate(() => window.__TWIN__.tour.start());
await page.waitForTimeout(6000);
note('phone:tour', { s: await k.shot('tour'), hud: await k.hud() });
await page.evaluate(() => window.__TWIN__.tour.stop());
await page.evaluate(() => window.__TWIN__.reference.toggle());
await page.waitForTimeout(2500);
note('phone:reference', { s: await k.shot('reference'), hud: await k.hud() });
note('phone-console-errors', perrors);
await world.close();

writeFileSync(OUT + 'log.json', JSON.stringify(log, null, 2));
