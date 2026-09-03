#!/usr/bin/env node
/**
 * Runtime metric sink.
 *
 * The scene only produces FPS, draw calls and crowd sizes once it is actually
 * rendering in a browser, which no Node process can do without a headless
 * browser dependency this project does not need. So the capture is done by
 * driving the running page and evaluating:
 *
 *   JSON.stringify({ ...window.__TWIN__.stats(), registry: window.__TWIN__.registry() })
 *
 * then piping that JSON in here:
 *
 *   node qa/capture.mjs < metrics.json
 *   npm run qa
 *
 * This validates the shape and writes qa/runtime-metrics.json, which run-qa.mjs
 * folds into FINAL_QA_REPORT.md. Missing figures render as "not captured"
 * rather than as invented numbers.
 */
import { writeFile } from 'node:fs/promises';

const NUMERIC = ['fps', 'triangles', 'drawCalls', 'programs', 'pedestrians', 'vehicles', 'trains', 'interiors', 'screenshotPasses'];

const raw = await new Promise((resolve, reject) => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { buf += d; });
  process.stdin.on('end', () => resolve(buf));
  process.stdin.on('error', reject);
});

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error('qa/capture: stdin is not valid JSON —', err.message);
  process.exit(1);
}

for (const key of NUMERIC) {
  if (key in data && !Number.isFinite(Number(data[key]))) {
    console.error(`qa/capture: "${key}" is present but not a number (${data[key]})`);
    process.exit(1);
  }
  if (key in data) data[key] = Math.round(Number(data[key]) * 10) / 10;
}

await writeFile(new URL('./runtime-metrics.json', import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
console.log(`qa/capture: wrote ${Object.keys(data).length} runtime metric group(s)`);
