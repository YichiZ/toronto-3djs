/**
 * Below-street walk viewpoints stand on a floor - issue #24. `npm test`
 *
 * Checked against the real PATH segments and concourse rooms; the browser test
 * in qa/viewpoints.e2e.mjs asks the same of every walk viewpoint at runtime.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { belowGradeFloor, runViewpointQA } from './viewpoints.mjs';
import { getViewpoint } from '../src/data/references.js';

test("the PATH corridor viewpoint's old spot was solid ground", () => {
  // (-3, -60): about 8 m outside path-rbp-brookfield, the nearest corridor.
  assert.equal(belowGradeFloor(-3, -60), null);
});

test('its new spot is on the Bay Street corridor it describes', () => {
  const v = getViewpoint('path-corridor');
  assert.equal(belowGradeFloor(v.position.x, v.position.z), 'path-bay-north');
});

test('the concourse viewpoints stand in their rooms', () => {
  for (const [id, room] of [['york-concourse', 'union-york-concourse'], ['bay-concourse', 'union-bay-concourse']]) {
    const v = getViewpoint(id);
    assert.equal(belowGradeFloor(v.position.x, v.position.z), room, id);
  }
});

test("a corridor's floor is its rectangle: just past a side wall is solid ground", () => {
  // path-bay-north runs along x -30, 12 m wide: its walls are at x -36 and -24.
  assert.equal(belowGradeFloor(-30 + 5.9, 8), 'path-bay-north');
  assert.equal(belowGradeFloor(-30 + 6.1, 8), null);
});

test('the viewpoint QA flags no walk viewpoint as floorless', async () => {
  const { findings } = await runViewpointQA();
  assert.deepEqual(findings.filter((f) => f.check === 'viewpoint-no-floor'), []);
});
