# Perf investigation: sprint lag

Act as a senior performance engineer on this project.

Project: toronto-3djs, a Three.js 0.171 + Vite 6 vanilla JS digital twin of
Union Station. Playwright e2e harness lives in qa/ (see qa/e2eHarness.mjs,
run with `npm run e2e`); unit tests run with `npm test`. Sprint input is
handled in src/ui/controls.js with tuning in src/ui/runFeel.js. Dynamic
systems that may grow over time: src/systems/lod.js, pedestrians.js,
vehicles.js, trains.js.

Reported symptom: after entering walk mode and sprinting for a while, the app
starts to lag, as if it needs a reload. Treat "resource growth / leak" as one
hypothesis, not the conclusion.

## Project facts (learned the hard way; do not re-derive)
- **Perf must be measured on the production bundle.** `npm run build`, then
  `openWorld({ preview: true })` in the harness — it runs `vite preview` over
  `dist/` on `--port 0`, so a busy 4173 is not a failure.
- **The perf e2e already exists**: `qa/perf-sprint.e2e.mjs` (four scenarios)
  and `qa/perfProbe.mjs` (in-page rAF probe + `summarise`/`growth`/`report`).
  **Run it first and extend it. Do not rewrite it.**
- **Pedestrians, vehicles and trains are fixed-count `InstancedMesh`**
  (`pedestrians.js:329`, `vehicles.js:399`, `trains.js:304`): density changes
  `im.count`, never the scene graph. Spawn-without-despawn is structurally
  impossible — confirm the scene object count is flat and move on.
- `src/systems/lod.js` only writes `obj.visible`; it never rebuilds geometry
  or materials.
- Read `.agents/notes/perf-sprint-lag.md` before Phase 1. It has the previous
  run's numbers, its dead ends, and its open items.

## Phase 1 — Reproduce and classify (use the systematic-debugging skill)
- `npm run build`, then run the existing `qa/perf-sprint.e2e.mjs`. Add a
  scenario only if the reported symptom is not already covered.
- Report the trend: steady decline, periodic hitches, or one freeze? Give
  p50/p95/max frame time, the count of frames over 100 ms, the quintile means
  (a decline shows there), and the delta in renderer.info counts.
- **Run the same route a second and third time without reloading.** Hitches
  that vanish on the second pass are first-visit work, not degradation — that
  distinction is the whole diagnosis and it cost the last run an hour to find.
- State plainly whether the claim reproduces, and in which of those forms.

## Phase 2 — Root-cause the sprint issue
Use the performance-optimizer agent. Check in this order — ranked by what
actually paid off last time — ruling each in or out with evidence:

1. **Shader program count** (`renderer.info.programs`). Any increase mid-run is
   a frozen frame. three.js keys its program cache on the **number of visible
   lights**, so anything that toggles a light's `visible` — interior streaming,
   LOD, mode switches — recompiles every material drawn that frame. Diff the
   new programs' `cacheKey` against the existing ones to find the field that
   differs. *This was the entire reported lag last run.*
2. **Textures and shaders compiled during movement** — upload bursts in a single
   frame (`+geometries/+textures` between snapshots).
3. **LOD or streaming reveals** that dump a large batch into one tick.
4. **Per-frame allocations** in controls.js / collision.js / walkMath.js —
   sample per-callback CPU in buckets and look for drift, not absolute cost.
5. Scene growth, listener growth on mode change, shadow/minimap re-render
   frequency. All three were flat last run; a one-line check each is enough
   unless something moves.

Name the file and line for each confirmed cause.

## Phase 3 — Broader audit (bounded)
- Re-run the other three scenarios already in the suite (Great Hall idle,
  outdoor street walk, ten walk↔tour↔reference switches).
- List additional findings ranked by measured impact. Skip anything you
  cannot back with a number from these runs.

## Deliverable before any fix
- A findings report (PERF_REPORT.md): for each issue give symptom, evidence
  (numbers), root cause (file:line), proposed fix, and expected gain.
- Include a "Ruled out, with evidence" table — a hypothesis killed with a
  number is a result, and saves the next run from re-testing it.

## Then fix, in ranked order
- /plan the fixes, one phase per finding.
- /tdd: the existing assertions (p95 under 20 ms, no frame over 100 ms,
  `delta.programs === 0`, `delta.objects === 0`, geometry/texture counts stable
  within 5% on a second pass) must fail before the fix and pass after. Add a new
  assertion only for a finding they do not already catch.
- Keep each fix a small diff in the file that owns the behaviour.
- Prefer a fix that makes the expensive work *constant* over one that makes it
  *earlier*: a boot-time shader warm-up was tried and discarded last run
  (+0.5–1.3 s load, no gain).
- /code-review with the typescript-reviewer agent.
- /verify: `npm test` and `npm run e2e` must pass (`npm run build` first).

## Start here
Two findings are open from the last run. Confirm or close them before hunting
for new ones:
- **LOD reveal budget**, `src/systems/lod.js:62` — reveals every newly-near
  object in one tick (bursts of +177 geometries / +43 textures in one frame).
  Worst first-pass frame is now 22.7 ms, so it needs a number from slower
  hardware before it justifies a fix.
- **Reference mode first toggle**, `src/ui/referenceMode.js:227` — builds a
  label sprite and x-ray cage per entity in one frame (objects 2935 → 3377,
  textures 175 → 356). Was 197.1 ms, now **62.6 ms**: the largest single frame
  left in the suite.

## Acceptance criteria
- The sprint claim is confirmed or refuted with frame-time data.
- The perf regression e2e in qa/ passes on the fixed build, and every
  assertion that covers a fix fails on the build before it.
- Every fix has a before/after number, and every stated cost has one too
  (a fix that trades a stall for per-frame work must measure the per-frame work).

## Do not
- Rewrite controls.js, the LOD system, or qa/perf-sprint.e2e.mjs wholesale.
- Change visual output (geometry, materials, lighting) unless the finding
  requires it, and call it out if so.
- Add new dependencies; use renderer.info, performance.*, and the existing
  Playwright harness.
- Report a finding without a measurement behind it.
- Re-test a hypothesis the notes already killed unless you have a reason to
  think it changed.

## Self-improvement loop
The agent maintains this prompt and its own working notes so the next run
starts smarter than this one.
- Keep a running log at .agents/notes/perf-sprint-lag.md: what you tried,
  what worked, what was a dead end, and the numbers behind each. Append,
  never rewrite history.
- After each phase, reread this prompt and ask: what instruction was
  missing, wrong, or wasted time? Edit this file in place to fix it
  (sharpen hypotheses, reorder checks by how often they paid off, drop
  steps that never found anything, add project facts you had to discover).
- Record each prompt edit as a dated bullet under "Changelog" below, with
  the reason in one line.
- Do not remove the acceptance criteria or the "Do not" list; you may
  tighten them.
- When you finish, the final report includes a "Prompt changes" section
  summarising what you changed and why.

## Changelog
- 2026-09-10: initial version.
- 2026-09-10: added a "Project facts" section — the last run had to discover the
  preview harness option, the fixed-count InstancedMesh systems and lod.js's
  visible-only behaviour before it could start.
- 2026-09-10: Phase 1 now runs the committed perf e2e instead of writing one,
  and requires a second and third pass over the same route — first-visit work
  versus degradation was the diagnosis and the old prompt did not ask for it.
- 2026-09-10: reordered the Phase 2 hypothesis list, shader program count and
  the light-count cache key first — that was the entire cause; the old list had
  it fifth and the leak hypothesis first, which was flat all run.
- 2026-09-10: collapsed scene growth, listener growth and shadow/minimap into a
  single low-priority item; all three were flat and each cost a full scenario.
- 2026-09-10: added "prefer constant over earlier" to the fix section — records
  the discarded boot-time shader warm-up (+0.5–1.3 s load, no gain).
- 2026-09-10: added a "Start here" section with the two open findings so the
  next run does not rediscover them.
- 2026-09-10: tightened acceptance criteria (assertions must fail pre-fix; costs
  need numbers too) and the Do-not list (no rewriting the perf e2e; no
  re-testing killed hypotheses).
