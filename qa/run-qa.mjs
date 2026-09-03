#!/usr/bin/env node
/**
 * QA orchestrator.
 *
 * Runs every static check, folds in runtime metrics captured from a live page
 * (qa/runtime-metrics.json, written by qa/capture.mjs) when they are available,
 * and writes FINAL_QA_REPORT.md. Exits non-zero if any check is an error, so it
 * can gate a build.
 *
 *   npm run qa
 */
import { writeFile, readFile } from 'node:fs/promises';
import { runGeometryQA } from './geometry.mjs';
import { runTrapQA } from './traps.mjs';
import { runRegistryIdQA } from './registryIds.mjs';
import { runViewpointQA } from './viewpoints.mjs';
import { BUILDINGS } from '../src/data/buildings.js';
import { identifiedTenants, uncertainTenants } from '../src/data/tenants.js';
import { STREETS, INTERSECTIONS, UNDERPASSES } from '../src/data/grid.js';

const ROOT = new URL('../', import.meta.url).pathname;

/** Optional imports: modules written by other agents may not exist yet. */
async function optional(path, pick) {
  try {
    const m = await import(path);
    return pick(m);
  } catch {
    return null;
  }
}

async function runtimeMetrics() {
  try {
    return JSON.parse(await readFile(new URL('./runtime-metrics.json', import.meta.url), 'utf8'));
  } catch {
    return null;
  }
}

/** Two-column markdown table. Needs the header row or nothing renders as a table. */
function table(rows, head = ['', '']) {
  return [
    `| ${head[0]} | ${head[1]} |`,
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n');
}

const NA = '_not captured_';

async function main() {
  const geo = runGeometryQA();
  const traps = await runTrapQA();
  const ids = await runRegistryIdQA();
  const views = await runViewpointQA();
  const runtime = await runtimeMetrics();

  const viewpoints = await optional('../src/data/references.js', (m) => m.VIEWPOINTS ?? []);
  const pathMetres = await optional('../src/interiors/path.js', (m) => m.PATH_TOTAL_METRES ?? null);
  const pathSegments = await optional('../src/interiors/path.js', (m) => m.PATH_SEGMENTS?.length ?? null);

  const tenants = identifiedTenants();
  const uncertain = uncertainTenants();
  const verified = tenants.length - uncertain.length;

  const errors = [
    ...geo.findings.filter((f) => f.severity === 'error'),
    ...ids.findings.filter((f) => f.severity === 'error'),
    ...views.findings.filter((f) => f.severity === 'error'),
    ...traps.filter((t) => t.status === 'fail' || t.status === 'error').map((t) => ({ severity: 'error', check: t.id, message: t.detail })),
  ];
  const warnings = [
    ...geo.findings.filter((f) => f.severity === 'warn'),
    ...ids.findings.filter((f) => f.severity === 'warn'),
    ...views.findings.filter((f) => f.severity === 'warn'),
    ...traps.filter((t) => t.status === 'warn' || t.status === 'skipped').map((t) => ({ severity: t.status, check: t.id, message: t.detail })),
  ];

  const confidence = BUILDINGS.reduce((acc, b) => {
    acc[b.confidence ?? 'approximated'] = (acc[b.confidence ?? 'approximated'] ?? 0) + 1;
    return acc;
  }, {});

  const report = `# FINAL QA REPORT
### Union Station / downtown Toronto digital twin

Generated ${new Date().toISOString().slice(0, 10)} by \`npm run qa\`.
Static checks run against the source and the geospatial database; runtime figures
come from a live page capture (\`node qa/capture.mjs\`).

---

## Reconstruction boundary

| | |
|---|---|
| north | King Street West / King Street East |
| south | Lake Shore Boulevard West, with the Gardiner deck above |
| west | Lower Simcoe Street, extended to John Street for the Rogers Centre |
| east | Church Street |
| highest-fidelity core | Front Street York→Yonge, the Union Station block, the Royal York block, Bay Street Front→King |
| grid rotation applied | ${geo.metrics.gridRotationDeg}° west of true north |
| Front Street true bearing | ${geo.metrics.frontStreetBearing}° |
| world origin | Front & Bay, ${geo.metrics.origin.lat.toFixed(6)} N ${Math.abs(geo.metrics.origin.lon).toFixed(6)} W |

---

## Counts

${table([
  ['buildings in the database', BUILDINGS.length],
  ['— reconstructed by a dedicated landmark module', BUILDINGS.filter((b) => b.landmark).length],
  ['— built by the generic façade builder', BUILDINGS.filter((b) => !b.landmark).length],
  ['streets reconstructed as full streets', STREETS.length],
  ['named intersections', INTERSECTIONS.length],
  ['rail underpasses', UNDERPASSES.length],
  ['identified tenants', tenants.length],
  ['— verified as long-standing anchors', verified],
  ['— uncertain (see below)', uncertain.length],
  ['interactive frontages', runtime?.registry?.interactive ?? NA],
  ['full interiors', runtime?.interiors ?? NA],
  ['metres of PATH reconstructed', pathMetres ?? NA],
  ['PATH segments', pathSegments ?? NA],
  ['reference viewpoints', viewpoints?.length ?? NA],
  ['screenshot comparison passes', runtime?.screenshotPasses ?? NA],
  ['registered scene entities', runtime?.registry?.total ?? `${ids.literalIds} (static count)`],
], ['what', 'count'])}

### Building confidence grades

${table(Object.entries(confidence), ['grade', 'buildings'])}

---

## Runtime performance

${table([
  ['average FPS', runtime?.fps ?? NA],
  ['triangles', runtime?.triangles ?? NA],
  ['draw calls', runtime?.drawCalls ?? NA],
  ['geometries resident', runtime?.memory?.geometries ?? NA],
  ['textures resident', runtime?.memory?.textures ?? NA],
  ['programs compiled', runtime?.programs ?? NA],
  ['pedestrians', runtime?.pedestrians ?? NA],
  ['vehicles', runtime?.vehicles ?? NA],
  ['trains', runtime?.trains ?? NA],
], ['metric', 'value'])}

---

## Hallucination-trap audit

Each check reads the module that would contain the mistake and asserts the
mistake is absent, or that the correct thing is present. A check whose file is
missing reports \`skipped\`, never \`pass\`.

| check | status | detail |
|---|---|---|
${traps.map((t) => `| \`${t.id}\` | **${t.status}** | ${t.detail} |`).join('\n')}

---

## Geometric QA

${geo.findings.length === 0
  ? 'No findings. No building stands in a roadway, no two footprints overlap outside the documented podium/deck cases, every intersection lies on a real centreline pair, and the geo transforms round-trip.'
  : geo.findings.map((f) => `- **${f.severity}** \`${f.check}\` — ${f.message}`).join('\n')}

Orientation cross-check: the CN Tower stands **${geo.metrics.cnTowerDistanceFromUnion} m** from Union
Station's Front Street entrance on a true bearing of **${geo.metrics.cnTowerBearingFromUnion}°** — the brief's
stated cue is roughly 600 m near 240–250°.

---

## Reference viewpoints

${views.count} named viewpoints in \`src/data/references.js\`, each with a position, a
look-at target and a description of what a photograph from that spot would show.
${views.findings.length === 0
  ? 'None stands inside a solid building footprint, none frames a point less than 2 m away, and the SkyWalk interior viewpoint the brief asks for is present.'
  : views.findings.map((f) => `- **${f.severity}** \`${f.check}\` — ${f.message}`).join('\n')}

---

## Registry integrity

${ids.findings.length === 0
  ? `No duplicate ids. ${ids.literalIds} literal registry ids across the source.`
  : ids.findings.map((f) => `- **${f.severity}** \`${f.check}\` — ${f.message}`).join('\n')}

---

## Tenant verification coverage

**${verified} of ${tenants.length}** identified tenants (${Math.round((verified / tenants.length) * 100)}%) are graded
\`reference\` — long-standing anchors stable across years. The rest are listed
below. Downtown ground-floor retail turns over on a scale of months, so the
reconstruction renders a **generic category word** rather than a wordmark for any
frontage the census did not verify. That is a deliberate honesty rule, not a gap
in the modelling.

### Known uncertain tenants

| tenant | building | grade | note |
|---|---|---|---|
${uncertain.map((t) => `| ${t.name} | \`${t.buildingId}\` | ${t.confidence} | ${t.note || '—'} |`).join('\n')}

---

## Remaining known discrepancies

${(runtime?.discrepancies ?? []).concat(
  BUILDINGS.filter((b) => b.note).map((b) => `\`${b.id}\` — ${b.note}`)
).map((d) => `- ${d}`).join('\n')}

---

## Verdict

${errors.length === 0
  ? `**PASS** — ${warnings.length} warning(s), no errors.`
  : `**FAIL** — ${errors.length} error(s), ${warnings.length} warning(s).`}

${errors.length ? `### Errors\n\n${errors.map((e) => `- \`${e.check}\` — ${e.message}`).join('\n')}\n` : ''}
${warnings.length ? `### Warnings\n\n${warnings.map((e) => `- \`${e.check}\` (${e.severity}) — ${e.message}`).join('\n')}` : ''}
`;

  await writeFile(`${ROOT}FINAL_QA_REPORT.md`, report);
  console.log(`FINAL_QA_REPORT.md written — ${errors.length} error(s), ${warnings.length} warning(s)`);
  for (const e of errors) console.error(`  ERROR ${e.check}: ${e.message}`);
  process.exitCode = errors.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
