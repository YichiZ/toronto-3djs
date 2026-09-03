/**
 * Semantic QA: the hallucination traps, checked against the source.
 *
 * These are the errors a model that "knows Toronto" from stereotypes makes.
 * Each check is deliberately literal - it reads the files that would contain the
 * mistake and asserts the mistake is not there, or that the correct thing IS.
 * A check that cannot find its file reports 'skipped', not 'passed', so a module
 * that failed to be written never silently passes the bar.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const p = join(dir, entry);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

async function read(rel) {
  try {
    return await readFile(join(SRC, rel), 'utf8');
  } catch {
    return null;
  }
}

const CANADIAN_DESTINATIONS = ['HALIFAX', 'MONTREAL', 'WINNIPEG', 'VANCOUVER', 'EDMONTON', 'CALGARY', 'SASKATOON', 'REGINA', 'VICTORIA'];

/** Strip comments so a check does not trip on prose describing the trap. */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Strip comments AND string literals. Negative checks about GEOMETRY use this:
 * a registry note that says "the dome is interior, not on the facade" is the
 * reconstruction documenting the trap, not falling into it, and must not fail.
 */
function codeNoStrings(src) {
  return codeOnly(src)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

const CHECKS = [
  {
    id: 'no-streetcar-on-front',
    trap: 'Streetcars laid down Front Street because "Toronto has streetcars".',
    async run() {
      const files = await walk(SRC);
      const offenders = [];
      for (const f of files) {
        const src = codeNoStrings(await readFile(f, 'utf8'));
        if (!/streetcar|tram/i.test(src)) continue;
        // A streetcar reference is only legitimate below grade or on King.
        const legitimate = /below.?grade|tunnel|loop|LEVELS\.path|EW\.king|king/i.test(src);
        if (!legitimate) offenders.push(f.replace(SRC, ''));
      }
      return offenders.length
        ? { status: 'fail', detail: `streetcar geometry with no below-grade or King Street context: ${offenders.join(', ')}` }
        : { status: 'pass', detail: 'streetcar references are confined to the Bay Street tunnel, the Union Loop and King Street' };
    },
  },
  {
    id: 'no-catenary',
    trap: 'Overhead wire strung over a corridor that runs diesel.',
    async run() {
      const files = await walk(SRC);
      const offenders = [];
      for (const f of files) {
        const src = codeNoStrings(await readFile(f, 'utf8'));
        if (/catenary|pantograph|overhead ?wire|contact ?wire/i.test(src)) offenders.push(f.replace(SRC, ''));
      }
      return offenders.length
        ? { status: 'fail', detail: `catenary geometry found in ${offenders.join(', ')}` }
        : { status: 'pass', detail: 'no catenary, pantograph or contact wire geometry anywhere in the runtime' };
    },
  },
  {
    id: 'gardiner-over-lakeshore',
    trap: 'The Gardiner deck placed over Front Street instead of Lake Shore.',
    async run() {
      const src = await read('world/gardiner.js');
      if (!src) return { status: 'skipped', detail: 'world/gardiner.js not present' };
      const code = codeOnly(src);
      const overLakeShore = /lakeShore|lake ?shore/i.test(code);
      const overFront = /EW\.front\b/.test(code);
      if (!overLakeShore) return { status: 'fail', detail: 'gardiner.js does not reference Lake Shore Boulevard' };
      if (overFront) return { status: 'fail', detail: 'gardiner.js positions geometry off EW.front' };
      return { status: 'pass', detail: 'deck is positioned off EW.lakeShore only' };
    },
  },
  {
    id: 'exterior-entablature-railway-names',
    trap: 'Canadian destination cities carved onto Union Station\'s Front Street facade. The brief calls this the single most likely error in the build.',
    async run() {
      const src = await read('landmarks/unionStation.js');
      if (!src) return { status: 'skipped', detail: 'landmarks/unionStation.js not present' };
      const code = codeOnly(src).toUpperCase();
      const found = CANADIAN_DESTINATIONS.filter((c) => code.includes(c));
      if (found.length) return { status: 'fail', detail: `destination city names on the exterior: ${found.join(', ')}` };
      const railway = /RAILWAY|GRAND TRUNK|CANADIAN NATIONAL/i.test(codeOnly(src));
      return railway
        ? { status: 'pass', detail: 'entablature carries incised railway names, no city names' }
        : { status: 'warn', detail: 'no city names (good) but no incised railway names found either' };
    },
  },
  {
    id: 'great-hall-frieze-interior',
    trap: 'The destination frieze omitted from the Great Hall, where it actually is.',
    async run() {
      const src = await read('interiors/greatHall.js');
      if (!src) return { status: 'skipped', detail: 'interiors/greatHall.js not present' };
      const up = src.toUpperCase();
      const found = CANADIAN_DESTINATIONS.filter((c) => up.includes(c));
      return found.length >= 5
        ? { status: 'pass', detail: `interior frieze carries ${found.length} destination names` }
        : { status: 'fail', detail: `interior frieze has only ${found.length} destination names` };
    },
  },
  {
    id: 'hhof-dome-is-interior',
    trap: 'A stained-glass dome modelled on the Hockey Hall of Fame\'s exterior.',
    async run() {
      const ext = await read('landmarks/hockeyHallOfFame.js');
      const int = await read('interiors/hhofInterior.js');
      if (!ext) return { status: 'skipped', detail: 'landmarks/hockeyHallOfFame.js not present' };
      const extCode = codeNoStrings(ext);
      const extDome = /SphereGeometry|dome/i.test(extCode);
      const intDome = int ? /dome|stained/i.test(int) : false;
      if (extDome) return { status: 'fail', detail: 'dome geometry present on the exterior module' };
      if (!intDome) return { status: 'warn', detail: 'exterior is clean, but no interior dome found either' };
      return { status: 'pass', detail: 'exterior shows a plain skylight enclosure; the dome is in the interior module' };
    },
  },
  {
    id: 'four-underpasses-lower-simcoe',
    trap: 'Simcoe Street drawn through the rail corridor. Simcoe ends at Front; Lower Simcoe runs south through the 2009 tunnel.',
    async run() {
      const { UNDERPASSES, getStreet } = await import('../src/data/grid.js');
      const streets = UNDERPASSES.map((u) => u.street).sort();
      const expected = ['bay', 'lower-simcoe', 'yonge', 'york'];
      if (JSON.stringify(streets) !== JSON.stringify(expected)) {
        return { status: 'fail', detail: `underpass set is ${streets.join(', ')}, expected ${expected.join(', ')}` };
      }
      const simcoe = getStreet('lower-simcoe');
      if (simcoe.from !== 0) return { status: 'fail', detail: 'Lower Simcoe does not start at Front Street' };
      if (getStreet('simcoe')) return { status: 'fail', detail: 'a full-length Simcoe Street exists in the grid' };
      return { status: 'pass', detail: 'four underpasses, and Simcoe exists only as Lower Simcoe south of Front' };
    },
  },
  {
    id: 'arena-heritage-facades',
    trap: 'Scotiabank Arena modelled as a freestanding bowl without the 1941 postal building facades.',
    async run() {
      const src = await read('landmarks/scotiabankArena.js');
      if (!src) return { status: 'skipped', detail: 'landmarks/scotiabankArena.js not present' };
      const postal = /postal/i.test(src);
      const both = /bay/i.test(src) && /lake ?shore/i.test(src);
      const relief = /relief|temporale/i.test(src);
      if (!postal || !both) return { status: 'fail', detail: 'no preserved postal-building elevations on both Bay and Lake Shore' };
      return { status: relief ? 'pass' : 'warn', detail: relief ? 'heritage facades on both elevations with bas-relief panels' : 'facades present but no bas-relief panels' };
    },
  },
  {
    id: 'park-not-rail-deck-park',
    trap: 'The Park at CIBC SQUARE conflated with the cancelled Rail Deck Park.',
    async run() {
      const src = await read('landmarks/cibcSquare.js');
      if (!src) return { status: 'skipped', detail: 'landmarks/cibcSquare.js not present' };
      const code = codeNoStrings(src);
      if (/rail ?deck ?park/i.test(code)) return { status: 'fail', detail: 'Rail Deck Park named in executable code' };
      return { status: 'pass', detail: 'the elevated park is named as The Park at CIBC SQUARE' };
    },
  },
  {
    id: 'three-distinct-concourses',
    trap: 'The Great Hall treated as a concourse. There are three - York, Bay and VIA - and none of them is the Great Hall.',
    async run() {
      const src = await read('interiors/concourses.js');
      if (!src) return { status: 'skipped', detail: 'interiors/concourses.js not present' };
      const has = ['york', 'bay', 'via'].filter((n) => new RegExp(`union-${n}-concourse`, 'i').test(src));
      const hall = /union-great-hall/.test(src) && !/registerInterior[\s\S]{0,200}union-great-hall/.test(src);
      if (has.length < 3) return { status: 'fail', detail: `only ${has.length} of the three concourses are registered` };
      return { status: 'pass', detail: 'York, Bay and VIA concourses registered as separate spaces at concourse level' };
    },
  },
  {
    id: 'grid-rotation-applied',
    trap: 'The downtown grid built axis-aligned to true north.',
    async run() {
      const { GRID_ROTATION_DEG, gridDirectionToBearing } = await import('../src/core/geo.js');
      if (GRID_ROTATION_DEG < 16 || GRID_ROTATION_DEG > 18) {
        return { status: 'fail', detail: `grid rotation is ${GRID_ROTATION_DEG} deg, measured bearings run 16-18` };
      }
      const front = gridDirectionToBearing(1, 0);
      return { status: 'pass', detail: `Front Street bears ${front.toFixed(2)} deg true, ${GRID_ROTATION_DEG} deg off the axis` };
    },
  },
  {
    id: 'no-shared-material-mutation',
    trap: 'Writing to a material from the shared M library. They are cached and shared, so one module setting .side or .transparent silently changes every other mesh using it.',
    async run() {
      const files = await walk(SRC);
      const offenders = [];
      const PROPS = 'side|transparent|opacity|depthWrite|depthTest|blending|wireframe|emissive';
      for (const f of files) {
        if (f.endsWith('core/materials.js')) continue;
        const src = codeNoStrings(await readFile(f, 'utf8'));
        // Only meshes whose material demonstrably came out of the shared library
        // count. Helpers (ArrowHelper, Box3Helper) build their own material and
        // may be tuned freely, which is why this is not a blanket .material ban.
        const shared = new Set();
        for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*new THREE\.Mesh\([\s\S]{0,260}?\bM\.\w+\s*\(/g)) {
          shared.add(m[1]);
        }
        for (const name of shared) {
          const re = new RegExp(`\\b${name}\\.material\\.(?:${PROPS})\\s*=`);
          if (re.test(src)) offenders.push(`${f.replace(SRC, '')} (${name})`);
        }
      }
      return offenders.length
        ? { status: 'fail', detail: `shared material mutated in ${offenders.join(', ')} - use variant() from core/materials.js` }
        : { status: 'pass', detail: 'no module writes render state onto a shared material; overrides go through variant()' };
    },
  },
  {
    id: 'no-external-assets',
    trap: 'Shipping scraped Google Earth geometry, imagery or brand asset packages.',
    async run() {
      const files = await walk(SRC);
      const offenders = [];
      for (const f of files) {
        const src = codeNoStrings(await readFile(f, 'utf8'));
        if (/TextureLoader|GLTFLoader|fetch\(|XMLHttpRequest|https?:\/\/(?!localhost)/.test(src)) {
          offenders.push(f.replace(SRC, ''));
        }
      }
      return offenders.length
        ? { status: 'fail', detail: `runtime asset loading found in ${offenders.join(', ')}` }
        : { status: 'pass', detail: 'no loaders, no fetches, no remote URLs - every texture is generated in-process' };
    },
  },
];

export async function runTrapQA() {
  const results = [];
  for (const c of CHECKS) {
    try {
      const r = await c.run();
      results.push({ id: c.id, trap: c.trap, ...r });
    } catch (err) {
      results.push({ id: c.id, trap: c.trap, status: 'error', detail: String(err?.message ?? err) });
    }
  }
  return results;
}
