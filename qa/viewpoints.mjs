/**
 * Reference-viewpoint QA.
 *
 * A viewpoint buried inside a building footprint renders a black frame, which is
 * exactly the failure that makes screenshot comparison useless. Interior
 * viewpoints are legitimate, so the check is: an exterior viewpoint at street
 * level must not stand inside a solid footprint, and every viewpoint must look
 * at something other than itself.
 */
import { footprint, BUILDINGS, getBuilding } from '../src/data/buildings.js';

/** Viewpoints that are meant to be inside a building, keyed to the building. */
const INTERIOR_VIEWPOINTS = /great-hall|concourse|galleria|path|hhof|interior|skywalk|inside/i;

export async function runViewpointQA() {
  const findings = [];
  let viewpoints = [];
  try {
    ({ VIEWPOINTS: viewpoints = [] } = await import('../src/data/references.js'));
  } catch {
    return { findings: [{ severity: 'warn', check: 'viewpoints', message: 'src/data/references.js not present' }], count: 0 };
  }

  const ids = new Set();
  for (const v of viewpoints) {
    if (!v.id || ids.has(v.id)) {
      findings.push({ severity: 'error', check: 'viewpoint-id', message: `duplicate or missing viewpoint id near "${v.name ?? '?'}"` });
      continue;
    }
    ids.add(v.id);

    for (const key of ['position', 'lookAt']) {
      const p = v[key];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        findings.push({ severity: 'error', check: 'viewpoint-coords', message: `${v.id}.${key} is not a finite {x,y,z}` });
      }
    }
    if (!v.position || !v.lookAt) continue;

    const d = Math.hypot(v.lookAt.x - v.position.x, v.lookAt.z - v.position.z);
    if (d < 2) {
      findings.push({ severity: 'error', check: 'viewpoint-target', message: `${v.id} looks at a point ${d.toFixed(1)} m away - the camera has nothing to frame` });
    }

    const interior = INTERIOR_VIEWPOINTS.test(`${v.id} ${v.name ?? ''} ${v.description ?? ''}`);
    if (interior) continue;

    for (const b of BUILDINGS) {
      const fp = footprint(b);
      const inside = v.position.x > fp.minX && v.position.x < fp.maxX && v.position.z > fp.minZ && v.position.z < fp.maxZ;
      if (inside && v.position.y < b.height) {
        findings.push({
          severity: 'error', check: 'viewpoint-inside-building',
          message: `${v.id} stands inside ${b.id}'s footprint at y=${v.position.y}`,
        });
      }
    }
  }

  const required = ['skywalk'];
  for (const r of required) {
    if (![...ids].some((id) => id.includes(r))) {
      findings.push({ severity: 'warn', check: 'viewpoint-coverage', message: `no viewpoint covering "${r}"` });
    }
  }
  if (viewpoints.length < 20) {
    findings.push({ severity: 'warn', check: 'viewpoint-coverage', message: `${viewpoints.length} viewpoints; the brief asks for at least 20` });
  }

  return { findings, count: viewpoints.length };
}
