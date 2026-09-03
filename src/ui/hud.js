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
export function install(ctx, { controls, tour, time, reference, failures = [] } = {}) {
  const { camera, renderer, scene, stats } = ctx;

  const hud = el('div', 'hud');
  document.body.appendChild(hud);

  // --- top left: place and bearing ---------------------------------------
  const place = el('div', 'hud-panel hud-place',
    '<div class="place-name">—</div><div class="place-meta"><span class="bearing">—</span><span class="level"></span></div>');
  hud.appendChild(place);
  const placeName = place.querySelector('.place-name');
  const bearingEl = place.querySelector('.bearing');
  const levelEl = place.querySelector('.level');

  // --- top right: renderer stats -----------------------------------------
  const statsPanel = el('div', 'hud-panel hud-stats',
    '<span class="fps">–</span><span class="calls">–</span><span class="tris">–</span>');
  hud.appendChild(statsPanel);
  const fpsEl = statsPanel.querySelector('.fps');
  const callsEl = statsPanel.querySelector('.calls');
  const trisEl = statsPanel.querySelector('.tris');

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

  const helpButton = el('button', 'hud-btn', 'Help<kbd>H</kbd>');
  bar.appendChild(helpButton);

  // --- help panel ---------------------------------------------------------
  const help = el('div', 'hud-panel hud-help', `
    <h2>Controls</h2>
    <dl>
      <dt>W A S D / arrows</dt><dd>walk</dd>
      <dt>Mouse / drag</dt><dd>look (click the view to capture the pointer)</dd>
      <dt>Shift</dt><dd>run</dd>
      <dt>Q / E, PgDn / PgUp</dt><dd>change level — PATH, concourse, street, viaduct, SkyWalk, Gardiner</dd>
      <dt>1 / 2 / 3</dt><dd>walk / orbit / tour</dd>
      <dt>R</dt><dd>reference mode (labels, x-ray, grid, section)</dd>
      <dt>T</dt><dd>start or stop the cinematic tour</dd>
      <dt>H</dt><dd>this panel</dd>
      <dt>Esc</dt><dd>close panels, release the pointer</dd>
      <dt>Click a storefront</dt><dd>tenant, category, address and confidence grade</dd>
    </dl>
    <div class="hud-reflayers"></div>
    <p class="hud-note">There is no jump. Height is a level change, because the
    layering — PATH under the street, tracks on a viaduct above it, the SkyWalk
    above that — is what this place actually is.</p>`);
  help.hidden = true;
  hud.appendChild(help);

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
  let downAt = null;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    // A drag is a look, not a click.
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    pick(e.clientX, e.clientY);
  });

  /** Nearest ancestor carrying a registry id - the entity a mesh belongs to. */
  function registryRoot(node) {
    let n = node;
    while (n && !n.userData?.registryId) n = n.parent;
    return n;
  }

  /**
   * Is `hit` a solid thing standing between the camera and the frontage?
   *
   * Geometry belonging to the SAME registered entity does not count: the
   * storefront's own glazing sits a few centimetres in front of its interaction
   * volume, and treating that as an occluder would make every frontage
   * unclickable. Invisible, non-colliding and interactive geometry is skipped
   * for the same reason the walker skips it.
   */
  function occludes(hit, ownRoot) {
    if (!hit.face) return false;
    for (let o = hit.object; o; o = o.parent) {
      if (o.visible === false || o.userData?.noCollide || o.userData?.interactive) return false;
      if (ownRoot && o === ownRoot) return false;
    }
    return true;
  }

  function pick(clientX, clientY) {
    const targets = getInteractive();
    if (!targets.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    // Pointer-locked walking has no cursor: aim from screen centre instead.
    const locked = controls?.pointerLock?.isLocked;
    ndc.x = locked ? 0 : ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = locked ? 0 : -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    raycaster.far = PICK_RANGE;
    const hit = raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;
    let node = hit.object;
    while (node && !node.userData?.payload) node = node.parent;
    if (!node) return;

    // The interaction volumes are the only candidates above, so nothing in the
    // world can occlude them on its own - without this second pass, clicking a
    // blank wall opens the card for a frontage on the far side of the building.
    const ownRoot = registryRoot(node);
    raycaster.far = Math.max(0, hit.distance - 0.02);
    const blockers = raycaster.intersectObject(scene, true);
    raycaster.far = PICK_RANGE;
    for (const b of blockers) {
      if (occludes(b, ownRoot)) return;
    }

    const record = findRecordFor(node);
    showCard(node.userData.payload ?? {}, record);
  }

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
    if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
    switch (e.code) {
      case 'Digit1': selectMode('walk'); break;
      case 'Digit2': selectMode('orbit'); break;
      case 'Digit3': selectMode('cinematic'); break;
      case 'KeyR': refButton.click(); break;
      case 'KeyT': selectMode('cinematic'); break;
      case 'KeyH': help.hidden = !help.hidden; break;
      case 'Escape':
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
  const worldPos = new THREE.Vector3();
  const box = new THREE.Box3();
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
          box.setFromObject(r.object);
          const c = box.isEmpty() ? r.object.position.clone() : box.getCenter(new THREE.Vector3());
          return { record: r, centre: c };
        });
    }
    let best = null;
    let bestD = Infinity;
    for (const entry of cachedRecords) {
      const d = camera.position.distanceToSquared(entry.centre);
      if (d < bestD) { bestD = d; best = entry; }
    }
    return best ? { record: best.record, distance: Math.sqrt(bestD) } : null;
  }

  ctx.onFrame.push((dt) => {
    accum += dt;
    if (accum < 0.25) return;
    accum = 0;

    camera.getWorldDirection(dir);
    const bearing = gridDirectionToBearing(dir.x, dir.z);
    bearingEl.textContent = `${bearing.toFixed(0)}° ${compassPoint(bearing)} true`;
    levelEl.textContent = controls?.level ? `· ${controls.level}` : '';

    const near = nearestEntity();
    if (near) {
      const cls = CONFIDENCE_CLASS[near.record.confidence] ?? '';
      placeName.innerHTML =
        `${escape(near.record.name)} <em class="${cls}">${near.record.confidence}</em>` +
        ` <span class="dist">${near.distance.toFixed(0)} m</span>`;
    } else {
      placeName.textContent = 'downtown Toronto';
    }

    fpsEl.textContent = `${stats.fps.toFixed(0)} fps`;
    callsEl.textContent = `${stats.drawCalls} calls`;
    trisEl.textContent = `${(stats.triangles / 1000).toFixed(0)}k tris`;

    if (time?.getHour) {
      const h = time.getHour();
      if (document.activeElement !== timeInput) timeInput.value = String(h);
      timeValue.textContent = `${formatHour(h)} · ${time.state?.().phase ?? ''}`;
    }
    refreshModeButtons();
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
      hud.remove();
    },
  };
}
