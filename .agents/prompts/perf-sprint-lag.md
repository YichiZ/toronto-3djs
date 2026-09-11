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
- **Perf must be measured on the production bundle.** `npm run e2e:perf`
  builds and runs the `qa/*.perf.mjs` suites via `openWorld({ preview: true })`
  (`vite preview` over `dist/` on `--port 0`; the harness refuses a missing or
  stale `dist/`). They are kept out of `npm run e2e`.
- **`npm install` first in a fresh worktree.** Without `node_modules` the build
  resolves `three` from a parent directory and dies with a Rolldown "failed to
  resolve import".
- **`npm run e2e:perf` exits non-zero on a failed assertion or build** (verified:
  `node --test` returns 1). Piping it through `grep`/`tail` replaces that with
  the pipe's exit code, so read the `pass`/`fail` counts too, and do not `tail`
  it: the 60 s sprint's report lines are the first thing to scroll off.
- **The perf e2e already exists**: `qa/perf-sprint.perf.mjs` (four scenarios)
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

## How to measure (learned in run 2; skipping this cost half a day)
- **A frame gap cannot resolve render cost.** Under vsync every healthy
  condition reads 16.7 ms, so an A/B on frame gaps returns 0.0 whatever you
  change. To price a render, call `renderer.render` K times in one go and
  `gl.finish()` at the end, then divide. Steady state is 5.6-7.8 ms a render.
- **Pair every comparison A/B/A/B and report the median of per-round
  differences.** This machine runs other applications; a sequence of single
  measurements just records their load drifting upward. A paired median
  survives it, and A/B/A shows you whether it did.
- **Treat an absolute p95 as a claim, not a fact, until two runs agree.** In
  run 2 the street-walk scenario passed at 17.5 ms and failed at 31.6 ms with
  no code change. A scenario that fails twice is real; then reproduce it under
  pairing before you name a cause.
- **A per-frame shader *re-derivation* is invisible to `renderer.info.programs`.**
  If frame time is high and `onFrame` CPU is not, snapshot every material's
  `version`, trap the setter with `Object.defineProperty`, and read the stack.
  That found run 2's entire cause in one shot.

## Phase 1 — Reproduce and classify (use the systematic-debugging skill)
- `npm run e2e:perf` runs the existing `qa/perf-sprint.perf.mjs`. Add a
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
2. **Per-frame material re-derivation** (`material.version` climbing). Distinct
   from 1: the program is not recompiled, so `renderer.info.programs` is flat and
   the round-1 assertion cannot see it. three re-derives the program parameters
   and clones the uniforms on every bump. A double-sided **transmissive**
   material is the known cause - `renderTransmissionPass` flips `side` and sets
   `needsUpdate` twice per object per frame. *This was the whole of run 2.*
3. **Textures and shaders compiled during movement** — upload bursts in a single
   frame (`+geometries/+textures` between snapshots).
4. **LOD or streaming reveals** that dump a large batch into one tick.
5. **Draw-call count**, which is also the JS-garbage rate: run 2 measured
   ~1.35 KB of three-internal garbage per draw call per frame, so 1335 calls is
   ~1.9 MB a frame and 7 major collections a second.
6. Per-frame allocations in app code; scene growth; listener growth on mode
   change; shadow and minimap re-render frequency. All flat in runs 1 and 2 -
   a one-line check each is enough unless something moves. **Do not re-profile
   app code for allocations**: run 2's CDP sampling put app code under 3%.

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
- /verify: `npm test`, `npm run e2e`, and `npm run e2e:perf` must pass.

## Start here
Three issues are open against `YichiZ/toronto-3djs`, all filed with numbers by
the run-2 audit. Fix them in order; do not re-derive them.
- **#60 [P1]** — `side: THREE.DoubleSide` on the three transmissive glazing
  materials (`src/core/materials.js:89`, `src/interiors/concourses.js:176`,
  `src/interiors/path.js:404`) makes three re-derive their shader 56 times a
  frame. Great Hall p95 25.8 -> 17.5 ms, frames over 20 ms 225/490 -> 0/599.
  Three lines. **`qa/perf-sprint.perf.mjs:120` fails on main today and passes
  after** — this is the one that turns the suite green.
- **#61 [P2]** — the transmission pass is a second full render of the city:
  ~640 of 1335 draw calls and ~800 KB/frame of garbage. Demote the glass that
  does not need refraction to plain `transparent`/`opacity`. Visual change;
  needs a `npm run capture` comparison.
- **#62 [P3]** — reference mode's first toggle builds 442 objects and 125
  textures in one 61 ms frame (`src/ui/referenceMode.js:229`). Drain a fixed
  budget per `onFrame` tick.

Closed by run 2, with numbers in the notes — do not reopen without new hardware:
the LOD reveal budget (worst first-pass frame 21.0 ms), routing/wayfinding cost
(0.155 -> 0.25 ms a tick), footsteps, the nearby strip, `frustumCulled = false`,
the shadow map, the minimap, startup (288-336 ms) and the bundle (141 kB gzip).

## Acceptance criteria
- The sprint claim is confirmed or refuted with frame-time data.
- The perf regression e2e in qa/ passes on the fixed build, and every
  assertion that covers a fix fails on the build before it.
- Every fix has a before/after number, and every stated cost has one too
  (a fix that trades a stall for per-frame work must measure the per-frame work).

## Do not
- Rewrite controls.js, the LOD system, or qa/perf-sprint.perf.mjs wholesale.
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
- 2026-09-10: PR #57 review. Perf suites renamed `*.perf.mjs` and run by
  `npm run e2e:perf` (builds first; harness refuses stale `dist/`). Probe now
  counts visible non-ambient lights and the suite asserts it is constant: that
  is the root-cause check, `programs` is the symptom check.
- 2026-09-10 (run 2): added a "How to measure" section. Two attempts at an A/B
  on frame gaps returned 0.0 ms for everything because vsync floors the gap at
  16.7 ms, and a third recorded only the machine's own load drifting; the
  render-K-times-plus-`gl.finish()` and paired-median techniques are what
  actually resolved the cause.
- 2026-09-10 (run 2): added per-frame material re-derivation as Phase 2 item 2,
  with the material-`version` trap that finds it. It was the entire cause of
  run 2 and `renderer.info.programs` — the round-1 check — is blind to it.
- 2026-09-10 (run 2): added draw-call count to the Phase 2 list as a first-class
  suspect, because it is also the JS-garbage rate (~1.35 KB per call per frame).
- 2026-09-10 (run 2): demoted "per-frame allocations in app code" to a one-line
  check and said explicitly not to re-profile it — CDP allocation sampling put
  app code under 3% of samples, and the last two runs both spent time there.
- 2026-09-10 (run 2): Project facts now warn that a fresh worktree needs
  `npm install`, that a piped `npm run e2e:perf` loses its exit code, and that
  `tail` hides the sprint scenario. Each cost a wasted run.
- 2026-09-10 (run 2): "Start here" now points at issues #60/#61/#62 and lists
  the eleven hypotheses run 2 closed with numbers, so the next run neither
  rediscovers them nor re-tests them.
