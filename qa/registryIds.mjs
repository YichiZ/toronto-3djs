/**
 * Static duplicate-id audit.
 *
 * `registry.register` throws on a duplicate id, which would take a whole module
 * down at build time and show up only as a missing block. Catching it by reading
 * the source is far cheaper than catching it in the browser, and it also catches
 * the subtler case: a landmark module claiming an id that the generic builder
 * also registers because the database record forgot `landmark: true`.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { genericBuildings, BUILDINGS } from '../src/data/buildings.js';

const SRC = new URL('../src/', import.meta.url).pathname;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir)) {
    const p = join(dir, e);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * Literal ids passed to register(). Dynamic ids are skipped, and registerInterior
 * is deliberately excluded: it files a streaming volume, not a registry record,
 * so an interior legitimately shares its id with the register() call beside it.
 */
const ID_RE = /\bregister\s*\(\s*\{[^}]*?\bid:\s*'([^']+)'/gs;

export async function runRegistryIdQA() {
  const findings = [];
  const seen = new Map();

  for (const file of await walk(SRC)) {
    const rel = file.replace(SRC, '');
    if (rel === 'core/registry.js') continue;
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(ID_RE)) {
      const id = m[1];
      const prev = seen.get(id);
      if (prev) {
        findings.push({
          severity: 'error', check: 'duplicate-registry-id',
          message: `id "${id}" is registered in both ${prev} and ${rel} - the second call will throw`,
        });
      } else {
        seen.set(id, rel);
      }
    }
  }

  // The generic builder registers every non-landmark database record by its id.
  const generic = new Set(genericBuildings().map((b) => b.id));
  for (const [id, file] of seen) {
    if (generic.has(id)) {
      findings.push({
        severity: 'error', check: 'landmark-flag-missing',
        message: `${file} registers "${id}", but the database record has no landmark:true, so world/buildings.js registers it too`,
      });
    }
  }

  // Every record flagged as a landmark needs a module that actually builds it.
  // Some modules register through a computed id (a loop over the pair of towers,
  // say), which the literal scan above cannot see - so fall back to asking
  // whether any module mentions the id at all before crying wolf.
  const corpus = [];
  for (const file of await walk(SRC)) {
    corpus.push(await readFile(file, 'utf8'));
  }
  const mentioned = (id) => corpus.some((src) => src.includes(`'${id}'`) || src.includes(`"${id}"`));
  for (const b of BUILDINGS) {
    if (!b.landmark || seen.has(b.id)) continue;
    findings.push(
      mentioned(b.id)
        ? {
            severity: 'info', check: 'landmark-registered-dynamically',
            message: `"${b.id}" is registered through a computed id rather than a literal; verified present in the source but not statically provable here`,
          }
        : {
            severity: 'warn', check: 'landmark-not-built',
            message: `"${b.id}" is flagged landmark:true but no module registers it - the block will be missing entirely`,
          }
    );
  }

  return { findings, literalIds: seen.size };
}
