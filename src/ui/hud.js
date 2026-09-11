/**
 * Heads-up overlay.
 *
 * Restrained on purpose: this is an architectural reconstruction, not a game.
 * The overlay answers four questions and then gets out of the way — where am
 * I, which way am I facing, what is this thing, and how sure are we about it.
 *
 * THE CONFIDENCE GRADE IS NOT OPTIONAL. Every information card shows how well
 * attested its subject is, because a reconstruction that hides its own
 * uncertainty is worse than one that has some.
 */
import * as THREE from 'three';
import { all, getInteractive } from '../core/registry.js';
import { gridDirectionToBearing } from '../core/geo.js';
import { VIEWPOINTS } from '../data/references.js';
import { INTERSECTIONS } from '../data/grid.js';
import { pickPlace, nearestIntersection } from './placeLabel.js';
import { aimAt } from './aim.js';
import { browserStorage } from './lookSpeed.js';
import { DESTINATIONS, guide, getTarget, setTarget, setRoute } from './wayfinding.js';
import { route, nextWaypoint, buildWalkGraph, routable } from './route.js';
import { PATH_SEGMENTS } from '../interiors/path.js';
import { isTyping } from './typing.js';
import { nearbyPlaces, nearestAccess, accessText, arrowFor } from './nearby.js';

const CONFIDENCE_CLASS = {
  surveyed: 'c-surveyed',
  reference: 'c-reference',
  inferred: 'c-inferred',
  approximated: 'c-approximated',
};

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compassPoint = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
};

/**
 * @param {import('../core/context.js').Context} ctx
 * @param {{controls?:object, tour?:object, time?:object, reference?:object, failures?:Array}} deps
 */
export function install(ctx, { controls, tour, time, reference, footsteps, failures = [] } = {}) {
  const { camera, renderer, scene, stats } = ctx;

  const hud = el('div', 'hud');
  document.body.appendChild(hud);

  // --- top left: place and bearing ---------------------------------------
  const place = el('div', 'hud-panel hud-place',
    '<div class="place-name">—</div><div class="place-near"></div>' +
    '<div class="place-meta"><span class="bearing">—</span><span class="level"></span></div>' +
    '<ul class="place-nearby" hidden></ul>');
  hud.appendChild(place);
  const placeName = place.querySelector('.place-name');
  const placeNear = place.querySelector('.place-near');
  const bearingEl = place.querySelector('.bearing');
  const levelEl = place.querySelector('.level');

  // --- nearby strip (#15) --------------------------------------------------
  // Inside the place panel, so it grows that panel rather than floating over
  // anything. The access tags are static once the world is built, which it is
  // by the time the HUD installs.
  const nearbyEl = place.querySelector('.place-nearby');
  // The strip makes this panel's height vary; the help panel is capped on it,
  // as panels above the bar sit on --hud-bar-h (#29).
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--hud-place-h', `${place.offsetHeight}px`);
  }).observe(place);
  const accessPoints = [];
  scene.traverse((o) => { if (o.userData?.access) accessPoints.push(o.userData.access); });
  const nearbyDir = new THREE.Vector3();
  const nearbyPt = new THREE.Vector3();
  const NEARBY_EYE = 1.7;
  /** Every place's box distance, as last measured by nearestEntity(). */
  let lastEntries = [];

  function updateNearby(headline) {
    if (controls?.mode !== 'walk') { nearbyEl.hidden = true; return; }
    camera.getWorldDirection(nearbyDir);
    const turnTo = (p) => arrowFor(guide(camera.position, nearbyDir, p).turn);
    // The headline's own parts are not "nearby": on the forecourt both lines
    // were Union Station's colonnade and entablature.
    const head = headline?.record?.object ?? null;
    const within = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
    const partOfHeadline = (e) => Boolean(head && e.record.object
      && (within(e.record.object, head) || within(head, e.record.object)));
    const lines = nearbyPlaces(lastEntries, {
      exclude: headline?.record ?? null, belowGrade: camera.position.y < 0, skip: partOfHeadline,
    })
      .map((e) => `${turnTo(e.box.clampPoint(camera.position, nearbyPt))} ${e.record.name} · ${e.distance.toFixed(0)} m`);
    const way = nearestAccess(accessPoints, camera.position, camera.position.y - NEARBY_EYE);
    if (way) lines.push(`${turnTo(way.access)} ${accessText(way)} · ${way.distance.toFixed(0)} m`);
    nearbyEl.innerHTML = lines.map((l) => `<li>${escape(l)}</li>`).join('');
    nearbyEl.hidden = lines.length === 0;
  }

  // --- top right: renderer stats -----------------------------------------
  const statsPanel = el('div', 'hud-panel hud-stats',
    '<span class="fps">–</span><span class="calls">–</span><span class="tris">–</span>');
  hud.appendChild(statsPanel);
  const fpsEl = statsPanel.querySelector('.fps');
  const callsEl = statsPanel.querySelector('.calls');
  const trisEl = statsPanel.querySelector('.tris');

  // --- level toast --------------------------------------------------------
  /*
   * Q/E can be refused outright (nothing above the Gardiner deck) or fall back
   * onto a level with no floor at this spot, and grounding then pulls you off
   * it within the second. Both used to be silent: the level chip simply kept
   * saying what it already said, so the key read as broken. controls.js
   * dispatches `twin:level` rather than calling in here, the same decoupling
   * `twin:crowd-density` uses in the other direction.
   */
  const toast = el('div', 'hud-panel hud-toast');
  toast.hidden = true;
  hud.appendChild(toast);
  let toastTimer = 0;
  function onLevel(e) {
    const { name, outcome, delta } = e.detail ?? {};
    const refused = outcome !== 'ok';
    toast.textContent = outcome === 'refused'
      ? `no level ${delta > 0 ? 'above' : 'below'}`
      : outcome === 'fallback' ? `${name} — none modelled here` : name;
    toast.classList.toggle('warn', refused);
    toast.hidden = false;
    // Restart the flash rather than letting a second press inherit a
    // half-finished animation, which showed as no flash at all.
    levelEl.classList.remove('flash');
    if (refused) { void levelEl.offsetWidth; levelEl.classList.add('flash'); }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 1600);
  }
  window.addEventListener('twin:level', onLevel);

  // --- failure chip -------------------------------------------------------
  if (failures.length) {
    const chip = el('div', 'hud-panel hud-fail',
      `<b>${failures.length} module${failures.length > 1 ? 's' : ''} failed</b><span>${
        failures.map((f) => f.module).join(', ')}</span>`);
    chip.title = failures.map((f) => `${f.module}: ${f.error}`).join('\n');
    hud.appendChild(chip);
  }

  // --- bottom bar ---------------------------------------------------------
  const bar = el('div', 'hud-panel hud-bar');
  hud.appendChild(bar);

  const modeGroup = el('div', 'hud-group');
  const modeButtons = {};
  for (const [name, label, key] of [['walk', 'Walk', '1'], ['orbit', 'Orbit', '2'], ['cinematic', 'Tour', '3']]) {
    const b = el('button', 'hud-btn', `${label}<kbd>${key}</kbd>`);
    b.addEventListener('click', () => selectMode(name));
    modeButtons[name] = b;
    modeGroup.appendChild(b);
  }
  bar.appendChild(modeGroup);

  const timeGroup = el('div', 'hud-group hud-slider');
  timeGroup.appendChild(el('label', null, 'Time'));
  const timeInput = el('input');
  timeInput.type = 'range';
  timeInput.min = '0'; timeInput.max = '24'; timeInput.step = '0.25';
  timeInput.value = String(time?.getHour?.() ?? 17);
  const timeValue = el('output', 'hud-value');
  timeGroup.append(timeInput, timeValue);
  bar.appendChild(timeGroup);

  const crowdGroup = el('div', 'hud-group hud-slider');
  crowdGroup.appendChild(el('label', null, 'Crowd'));
  const crowdInput = el('input');
  crowdInput.type = 'range';
  crowdInput.min = '0'; crowdInput.max = '1'; crowdInput.step = '0.05';
  crowdInput.value = '0.6';
  const crowdValue = el('output', 'hud-value', '60%');
  crowdGroup.append(crowdInput, crowdValue);
  bar.appendChild(crowdGroup);

  const refButton = el('button', 'hud-btn', 'Reference<kbd>R</kbd>');
  bar.appendChild(refButton);

  const jump = el('select', 'hud-select');
  jump.appendChild(el('option', null, 'Jump to…'));
  jump.firstChild.value = '';
  for (const vp of VIEWPOINTS) {
    const opt = el('option', null, vp.name);
    opt.value = vp.id;
    jump.appendChild(opt);
  }
  bar.appendChild(jump);

  // --- wayfinding (#11) ---------------------------------------------------
  // The guide is a full-width row inside the bar, not a floating panel: the
  // bar grows by a row and --hud-bar-h lifts everything above it, so it can
  // never land on another panel.
  const goTo = el('select', 'hud-select hud-goto');
  goTo.appendChild(el('option', null, 'Go to…'));
  goTo.firstChild.value = '';
  for (const group of ['Places', 'Corners']) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const d of DESTINATIONS) {
      if (d.group !== group) continue;
      const opt = el('option', null, d.name);
      opt.value = d.id;
      og.appendChild(opt);
    }
    goTo.appendChild(og);
  }
  bar.appendChild(goTo);
  const guideEl = el('div', 'hud-guide',
    '<span class="guide-arrow" aria-hidden="true">↑</span><span class="guide-text"></span>' +
    '<button class="hud-btn small guide-clear" type="button" aria-label="Clear destination">✕</button>');
  guideEl.hidden = true;
  bar.prepend(guideEl);
  const guideArrow = guideEl.querySelector('.guide-arrow');
  const guideText = guideEl.querySelector('.guide-text');
  const guideDir = new THREE.Vector3();
  let arrivedUntil = 0;

  /** Arrow and distance to the destination; walk mode only, like the level chip. */
  /** Street and PATH joined by their stairs and lifts, built on first use. */
  let walkGraph = null;
  function updateGuide() {
    const dest = getTarget();
    const walking = controls?.mode === 'walk';
    if (!dest) {
      guideEl.hidden = !(walking && performance.now() < arrivedUntil);
      return;
    }
    guideEl.hidden = !walking;
    if (!walking) return;
    camera.getWorldDirection(guideDir);
    const g = guide(camera.position, guideDir, dest);
    const floor = camera.position.y - 1.7;
    // Arrived means on its floor too: the PATH corridor viewpoint is 7 m from
    // Front & Bay in plan and 6.5 m straight down.
    if (g.arrived && Math.abs(floor - dest.y) < 2) {
      guideArrow.textContent = '✓';
      guideArrow.style.transform = '';
      guideText.textContent = `Arrived · ${dest.name}`;
      setTarget(null);
      arrivedUntil = performance.now() + 2500;
      return;
    }
    // On the street or in the PATH, to somewhere on either: walk it -
    // sidewalks, corridors and the stairs between - aiming at the next corner.
    // Anywhere else (the concourses, the SkyWalk), the straight line.
    let aim = dest;
    let distance = g.distance;
    if (routable(floor) && routable(dest.y)) {
      walkGraph ??= buildWalkGraph({ pathSegments: PATH_SEGMENTS, access: accessPoints });
      const r = route(walkGraph, camera.position, dest, { fromY: floor, toY: dest.y });
      setRoute(r.points);
      aim = nextWaypoint(r.points, camera.position);
      distance = r.length;
    } else {
      setRoute(null);
    }
    const turn = guide(camera.position, guideDir, aim).turn;
    guideArrow.textContent = '↑';
    guideArrow.style.transform = `rotate(${turn.toFixed(0)}deg)`;
    guideEl.dataset.turn = turn.toFixed(0);
    guideEl.dataset.aim = `${aim.x.toFixed(2)},${aim.z.toFixed(2)}`;
    guideText.textContent = `${dest.name} · ${distance.toFixed(0)} m`;
  }
  goTo.addEventListener('change', () => {
    if (!goTo.value) return;
    setTarget(goTo.value);
    goTo.value = '';
    arrivedUntil = 0;
    updateGuide();
  });
  guideEl.querySelector('.guide-clear').addEventListener('click', () => {
    setTarget(null);
    arrivedUntil = 0;
    updateGuide();
  });

  const helpButton = el('button', 'hud-btn', 'Help<kbd>H</kbd>');
  bar.appendChild(helpButton);
  // The bar wraps to one, two or three rows with the width; panels that float
  // above it (tour caption, help) sit on its real height, not a guess (#29).
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--hud-bar-h', `${bar.offsetHeight}px`);
  }).observe(bar);

  // --- help panel ---------------------------------------------------------
  const help = el('div', 'hud-panel hud-help', `
    <h2>Controls</h2>
    <dl>
      <dt>W A S D / arrows</dt><dd>walk</dd>
      <dt>Mouse / drag</dt><dd>look (click the view to capture the pointer)</dd>
      <dt>Shift</dt><dd>run</dd>
      <dt>Space</dt><dd>jump</dd>
      <dt>Q / E, PgDn / PgUp</dt><dd>change level — PATH, concourse, street, viaduct, platform, SkyWalk, Gardiner</dd>
      <dt>1 / 2 / 3</dt><dd>walk / orbit / tour</dd>
      <dt>R</dt><dd>reference mode (labels, x-ray, grid, section)</dd>
      <dt>T</dt><dd>start or stop the cinematic tour</dd>
      <dt>H</dt><dd>this panel</dd>
      <dt>Esc</dt><dd>close panels, release the pointer</dd>
      <dt>Click a storefront</dt><dd>tenant, category, address and confidence grade</dd>
      <dt>F</dt><dd>open the storefront under the reticle (walking, pointer captured)</dd>
      <dt>M</dt><dd>hide or show the minimap — it is on while walking; click a dot to jump to that viewpoint</dd>
      <dt>Go to…</dt><dd>pick a destination: an arrow and the distance to it, and a ring on the minimap</dd>
    </dl>
    <div class="hud-look"><label>Look speed<input type="range" min="0.25" max="3" step="0.05"><output></output></label></div>
    <div class="hud-sound"><label><input type="checkbox">Footsteps</label></div>
    <div class="hud-reflayers"></div>
    <p class="hud-note">The jump is a hop &mdash; enough for a bollard, not for a
    storey. Height is still a level change, because the layering &mdash; PATH under
    the street, tracks on a viaduct above it, the SkyWalk above that &mdash; is what
    this place actually is.</p>`);
  help.hidden = true;
  hud.appendChild(help);

  // Footstep sound (#12): the master mute. footsteps.js remembers it.
  const soundBox = help.querySelector('.hud-sound input');
  if (footsteps) {
    soundBox.checked = !footsteps.muted;
    soundBox.addEventListener('change', () => footsteps.setMuted(!soundBox.checked));
  } else {
    help.querySelector('.hud-sound').hidden = true;
  }

  // First visit: the help panel doubles as a click-to-start card (#26). Pointer
  // lock needs a user gesture anyway, so the click that dismisses the card is
  // the one that captures the pointer. Storage that refuses shows it again.
  const INTRO_KEY = 'twin.introSeen';
  const storage = browserStorage();
  let introSeen = false;
  try { introSeen = storage?.getItem(INTRO_KEY) != null; } catch { /* show it */ }
  function dismissIntro() {
    if (!help.classList.contains('hud-intro')) return false;
    help.classList.remove('hud-intro');
    help.querySelector('.hud-intro-go')?.remove();
    help.hidden = true;
    try { storage?.setItem(INTRO_KEY, '1'); } catch { /* shown again next visit */ }
    return true;
  }
  if (!introSeen) {
    help.classList.add('hud-intro');
    help.insertAdjacentHTML('beforeend', '<button class="hud-btn hud-intro-go" type="button">Click to walk</button>');
    help.hidden = false;
    help.addEventListener('click', (e) => {
      if (!dismissIntro()) return;
      selectMode('walk');
      if (e.pointerType !== 'touch') {
        try { controls?.pointerLock?.lock(); } catch { /* refused: keys still walk */ }
      }
    });
  }

  // Look speed, for touch drags and the mouse alike (#14). Controls owns and
  // remembers it; this is only the knob.
  {
    const row = help.querySelector('.hud-look');
    const input = row.querySelector('input');
    const out = row.querySelector('output');
    if (controls?.setLookSpeed) {
      const show = () => { out.textContent = `${controls.lookSpeed.toFixed(2)}×`; };
      input.value = String(controls.lookSpeed);
      show();
      input.addEventListener('input', () => { controls.setLookSpeed(Number(input.value)); show(); });
    } else {
      row.hidden = true;
    }
  }

  if (reference?.setLayer) {
    const box = help.querySelector('.hud-reflayers');
    box.appendChild(el('h2', null, 'Reference layers'));
    for (const layer of (reference.layers?.() ?? [])) {
      const b = el('button', 'hud-btn small', layer.name);
      b.addEventListener('click', () => {
        const on = reference.setLayer(layer.name);
        b.classList.toggle('on', on);
      });
      b.classList.toggle('on', layer.visible);
      box.appendChild(b);
    }
  }

  // --- info card ----------------------------------------------------------
  const card = el('div', 'hud-panel hud-card');
  card.hidden = true;
  hud.appendChild(card);

  function showCard(payload, record) {
    const confidence = payload.confidence ?? record?.confidence ?? 'inferred';
    card.innerHTML = `
      <button class="hud-close" aria-label="close">×</button>
      <h3>${escape(payload.tenant ?? record?.name ?? 'Frontage')}</h3>
      <dl>
        ${row('Category', payload.category)}
        ${row('Building', payload.building ?? record?.name)}
        ${row('Address', payload.address)}
        ${row('Source', payload.source ?? record?.source)}
      </dl>
      <div class="confidence ${CONFIDENCE_CLASS[confidence] ?? ''}">confidence: ${escape(confidence)}</div>
      ${payload.note || record?.note ? `<p class="hud-note">${escape(payload.note || record.note)}</p>` : ''}`;
    card.hidden = false;
    card.querySelector('.hud-close').addEventListener('click', () => { card.hidden = true; });
  }
  const row = (k, v) => (v ? `<dt>${escape(k)}</dt><dd>${escape(String(v))}</dd>` : '');
  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // --- interactions -------------------------------------------------------
  function selectMode(name) {
    try {
      if (name === 'cinematic') {
        if (tour?.isRunning?.()) tour.stop();
        else tour?.start?.();
      } else {
        if (tour?.isRunning?.()) tour.stop();
        controls?.setMode?.(name);
      }
    } catch (err) {
      console.warn('[hud] mode switch failed', err);
    }
    refreshModeButtons();
  }

  function refreshModeButtons() {
    const active = tour?.isRunning?.() ? 'cinematic' : (controls?.mode ?? 'walk');
    for (const [name, button] of Object.entries(modeButtons)) {
      button.classList.toggle('on', name === active);
    }
  }
  refreshModeButtons();

  timeInput.addEventListener('input', () => {
    const h = Number(timeInput.value);
    timeValue.textContent = formatHour(h);
    try { time?.setHour?.(h); } catch (err) { console.warn('[hud] setHour failed', err); }
  });
  timeValue.textContent = formatHour(Number(timeInput.value));

  crowdInput.addEventListener('input', () => {
    const v = Number(crowdInput.value);
    crowdValue.textContent = `${Math.round(v * 100)}%`;
    // Broadcast and let the crowd systems listen: they are built after the HUD
    // and are not reachable from here by reference. (A direct
    // `__TWIN__.pedestrians.setDensity` call used to sit here and was always a
    // no-op - __TWIN__ has no `pedestrians` key - which made this dispatch look
    // redundant. It is not; it is the only path.)
    ctx.crowdDensity = v;
    window.dispatchEvent(new CustomEvent('twin:crowd-density', { detail: v }));
  });

  refButton.addEventListener('click', () => {
    const on = reference?.toggle?.();
    refButton.classList.toggle('on', !!on);
  });

  jump.addEventListener('change', () => {
    if (!jump.value) return;
    if (tour?.isRunning?.()) tour.stop();
    controls?.teleport?.(jump.value);
    jump.value = '';
    refreshModeButtons();
  });

  helpButton.addEventListener('click', () => { help.hidden = !help.hidden; });

  // --- picking ------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const PICK_RANGE = 40;   // metres; a frontage further off is not what you meant
  // The aim's occlusion pass: the walker's collision index when there is one -
  // a whole-scene ray walks every city-wide instanced set, 7 ms a probe - and
  // the scene itself otherwise. See src/ui/aim.js.
  const castBlockers = controls?.collision
    ? (rc) => controls.collision.intersect(rc)
    : (rc) => rc.intersectObject(scene, true);
  let downAt = null;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    // A drag is a look, not a click.
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    pick(e.clientX, e.clientY);
  });

  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    // Pointer-locked walking has no cursor: aim from screen centre instead.
    const locked = controls?.pointerLock?.isLocked;
    ndc.x = locked ? 0 : ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = locked ? 0 : -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = aimAt(raycaster, getInteractive(), castBlockers, PICK_RANGE);
    if (hit) openCard(hit.node);
  }

  const openCard = (node) => showCard(node.userData.payload ?? {}, findRecordFor(node));

  // --- aiming while pointer-locked (issue #9) -------------------------------
  // Pointer-locked walking has no cursor, so the reticle marks where a click
  // or F lands, and the hint names what is there before you commit to it.
  const reticle = el('div', 'hud-reticle');
  reticle.hidden = true;
  hud.appendChild(reticle);
  const hint = el('div', 'hud-hint');
  hint.hidden = true;
  hud.appendChild(hint);
  /**
   * The interaction volumes are invisible boxes just in front of each bay; the
   * highlight shows the one under the reticle as a faint tint. One shared
   * material swapped in and back out, never a mutation of the volume's own.
   */
  const HIGHLIGHT = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc, transparent: true, opacity: 0.16, depthWrite: false,
  });
  let aimed = null;                       // { node, material }: what to put back
  const screenCentre = new THREE.Vector2(0, 0);

  function setAimed(node) {
    if ((aimed?.node ?? null) === node) return;
    if (aimed) aimed.node.material = aimed.material;
    aimed = node ? { node, material: node.material } : null;
    if (node) {
      node.material = HIGHLIGHT;
      hint.innerHTML = `${escape(node.userData.payload?.tenant ?? 'Frontage')} <kbd>F</kbd>`;
    }
    hint.hidden = !node;
    reticle.classList.toggle('on', !!node);
  }

  /** Runs on the HUD's 0.25 s tick, and at once when the pointer locks or unlocks. */
  function updateAim() {
    const locked = !!controls?.pointerLock?.isLocked && controls?.mode === 'walk';
    reticle.hidden = !locked;
    if (!locked) { setAimed(null); return; }
    raycaster.setFromCamera(screenCentre, camera);
    setAimed(aimAt(raycaster, getInteractive(), castBlockers, PICK_RANGE)?.node ?? null);
  }
  controls?.pointerLock?.addEventListener?.('lock', updateAim);
  controls?.pointerLock?.addEventListener?.('unlock', updateAim);

  function findRecordFor(node) {
    let n = node;
    while (n) {
      if (n.userData?.registryId) return all().find((r) => r.id === n.userData.registryId) ?? null;
      n = n.parent;
    }
    return null;
  }

  // --- keyboard -----------------------------------------------------------
  function onKey(e) {
    const t = e.target;
    if (isTyping(t)) return;
    switch (e.code) {
      case 'Digit1': selectMode('walk'); break;
      case 'Digit2': selectMode('orbit'); break;
      case 'Digit3': selectMode('cinematic'); break;
      case 'KeyR': refButton.click(); break;
      case 'KeyT': selectMode('cinematic'); break;
      case 'KeyH': help.hidden = !help.hidden; break;
      // Open whatever the reticle is on. F, not Enter: Enter would also press
      // any HUD button that happens to have focus.
      case 'KeyF': if (aimed) openCard(aimed.node); break;
      case 'Escape':
        dismissIntro();
        help.hidden = true;
        card.hidden = true;
        if (tour?.isRunning?.()) { tour.stop(); refreshModeButtons(); }
        break;
      default: break;
    }
  }
  window.addEventListener('keydown', onKey);

  // --- per-frame readouts -------------------------------------------------
  // Throttled: nearest-entity search walks the registry, and nobody reads a
  // location label sixty times a second.
  const dir = new THREE.Vector3();
  let accum = 0;
  let cachedRecords = null;
  let cachedCount = -1;

  function nearestEntity() {
    const records = all();
    if (cachedCount !== records.length) {
      cachedCount = records.length;
      cachedRecords = records
        .filter((r) => r.object && r.kind !== 'system')
        .map((r) => {
          const b = new THREE.Box3().setFromObject(r.object);
          // Nothing built under it yet: measure from where the object is.
          if (b.isEmpty()) b.setFromCenterAndSize(r.object.getWorldPosition(new THREE.Vector3()), new THREE.Vector3());
          const size = b.getSize(new THREE.Vector3());
          return { record: r, box: b, footprint: size.x * size.z };
        });
    }
    // To the box, 0 when inside - not to its centre, which is 100 m off on
    // Union Station's 229 m face. See src/ui/placeLabel.js for the ranking.
    const entries = cachedRecords.map((e) => ({
      record: e.record,
      distance: e.box.distanceToPoint(camera.position),
      footprint: e.footprint,
      box: e.box,
    }));
    lastEntries = entries;
    return pickPlace(entries, camera.position.y < 0);
  }

  ctx.onFrame.push((dt) => {
    accum += dt;
    if (accum < 0.25) return;
    accum = 0;

    camera.getWorldDirection(dir);
    const bearing = gridDirectionToBearing(dir.x, dir.z);
    bearingEl.textContent = `${bearing.toFixed(0)}° ${compassPoint(bearing)} true`;
    levelEl.textContent = controls?.level ? `· ${controls.level}` : '';
    // The level is where the walker stands; orbit and the tour have no walker,
    // and the chip read "SkyWalk" over an aerial (#29).
    levelEl.hidden = controls?.mode !== 'walk';
    updateGuide();

    const near = nearestEntity();
    if (near) {
      const cls = CONFIDENCE_CLASS[near.record.confidence] ?? '';
      placeName.innerHTML =
        `${escape(near.record.name)} <em class="${cls}">${near.record.confidence}</em>` +
        ` <span class="dist">${near.distance.toFixed(0)} m</span>`;
    } else {
      placeName.textContent = 'downtown Toronto';
    }
    const corner = nearestIntersection(camera.position.x, camera.position.z, INTERSECTIONS);
    placeNear.textContent = corner ? `near ${corner.name} · ${corner.distance.toFixed(0)} m` : '';
    updateNearby(near);

    fpsEl.textContent = `${stats.fps.toFixed(0)} fps`;
    callsEl.textContent = `${stats.drawCalls} calls`;
    trisEl.textContent = `${(stats.triangles / 1000).toFixed(0)}k tris`;

    if (time?.getHour) {
      const h = time.getHour();
      if (document.activeElement !== timeInput) timeInput.value = String(h);
      timeValue.textContent = `${formatHour(h)} · ${time.state?.().phase ?? ''}`;
    }
    refreshModeButtons();
    updateAim();
  });

  function formatHour(h) {
    const hh = Math.floor(((h % 24) + 24) % 24);
    const mm = Math.round((h - Math.floor(h)) * 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  return {
    element: hud,
    showCard,
    toggleHelp: () => { help.hidden = !help.hidden; return !help.hidden; },
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('twin:level', onLevel);
      clearTimeout(toastTimer);
      hud.remove();
    },
  };
}
