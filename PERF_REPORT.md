# Sprint lag: measurement, cause, fix

Reported: *"after entering walk mode and sprinting for a while, the app starts to
lag, as if it needs a reload."*

Everything below was measured against the **production build** (`npm run build`
then `vite preview` over `dist/`), driven by `qa/perf-sprint.e2e.mjs` and the
scratch probes it grew out of. Headless Chrome, 1280x800, vsync at 60 Hz, so a
healthy frame reads as 16.7 ms and the interesting signal is in the stalls and
in the resource counters, not in the mean.

## Verdict

**Partly confirmed, and reclassified.** There is no steady decline and no leak.
Sprinting produced **periodic freezes**: two frames of **283-316 ms** in every
60 s run across fresh ground, plus 7-9 smaller hitches of 26-46 ms. They stop
once the whole city has been drawn once - a second and third 60 s sprint over
the same ground had **zero** hitches - which is why it reads as "needs a
reload" (it does not; a reload brings them all back).

| sprint 60 s, before | value |
|---|---|
| frames | 3567 (of 3600 possible) |
| p50 / p95 / max frame | 16.7 / 17.5 / **302.8 ms** |
| frames over 100 ms | 1-2 per run |
| quintile means | 17.1 / 16.7 / 16.7 / 16.7 / 16.7 ms - **no drift** |
| geometries | 1125 -> 1470 (first-visit uploads, plateaus) |
| textures | 112 -> 163 (same) |
| programs | **156 -> 215** |
| scene objects | 2935 -> 2935 |
| JS heap | 90 -> 73 MB (collected; no growth) |

## Findings, ranked by measured impact

### 1. Streaming a room in recompiled every shader in view - 283-316 ms frozen frames

* **Symptom.** One or two frames per sprint at ~300 ms; the app visibly stops.
* **Evidence.** At each stall `renderer.info.programs` jumped by 43-44 in the
  single stalled frame. Diffing the new programs' `cacheKey` against the
  existing ones: exactly one field differs, the **point-light count, 9 against
  3**. Visible lights at the moment of the stall: 1 directional, 1 hemisphere,
  **3 point** - of 9 point lights in the scene.
* **Root cause.** `src/world/index.js:160` - the interior streaming tick sets
  `it.group.visible = near`, and each interior carries 1-2 `PointLight`s
  (`src/interiors/greatHall.js:594`, `galleria.js:395`, `hhofInterior.js:356`
  and `:498`, `concourses.js:387`). three.js keys its shader program cache on
  the number of *visible* lights, so every room that streams in or out changes
  that number and every material drawn in that frame needs a program that has
  never been compiled. Compiling ~43 of them takes ~300 ms on the main thread.
* **Fix.** `src/world/index.js:118-144` - hoist those point lights out of the
  streamed groups with `root.attach()` (world position preserved) and let the
  streaming tick set `intensity` to 0 instead of hiding them. The light count is
  then constant, so the program set is fixed at boot. No visual change: a
  zero-intensity light contributes nothing, and `qa/night.e2e.mjs` (luminance by
  hour) passes unchanged.
* **Cost.** A permanently-lit shader path is 9 point lights instead of 3-4:
  measured 5.66 -> 5.91 ms per render at street level, **+0.25 ms a frame**.
* **Gain (measured).**

  | | before | after |
  |---|---|---|
  | max frame, 60 s sprint | 302.8 ms | **22.7 ms** |
  | frames over 100 ms | 1-2 | **0** |
  | hitches over 25 ms, 2 x 60 s across fresh ground | 11 | **0** |
  | programs during the run | 156 -> 215 | **62 -> 62** |
  | distinct programs in the session | 267-318 | **62** |
  | max frame, mode switching x10 | 197.1 ms | **62.6 ms** |

### 2. First-visit geometry and texture uploads - 26-46 ms hitches

* **Symptom.** A handful of 26-46 ms frames in the first traversal of any part
  of the city.
* **Evidence.** Each coincides with an upload burst: `+177 geometries, +43
  textures` in one frame at t=6.1 s; `+151/+33` at t=15.1 s; `+126/+4` at
  t=21.4 s. Nil on the second pass over the same ground.
* **Status.** After finding 1 these no longer breach 25 ms in the measured runs
  (worst first-pass frame 22.7 ms), so there is nothing left to fix with a
  number behind it. Left open: on slower hardware these would still show, and
  the lever is a per-tick reveal budget in `src/systems/lod.js:62`.

### 3. Reference mode builds 442 objects and 181 textures in one frame

* **Symptom.** A 197 ms frame the first time reference mode is switched on
  (measured in the mode-switching scenario, before finding 1's fix).
* **Evidence.** `objects 2935 -> 3377`, `textures 175 -> 356` across that single
  toggle; `src/ui/referenceMode.js:227` builds a label sprite (its own canvas
  texture) and an x-ray cage per registered entity.
* **Status.** Open, and now 62.6 ms after finding 1. It is one-off, guarded by
  `builtEntities`, and on a deliberate user action - ten cycles do not rebuild
  it (`onFrame` callbacks and object count both stable across ten switches).

## Ruled out, with evidence

| Hypothesis | Evidence |
|---|---|
| Objects added and never removed (pedestrians / vehicles / trains) | Scene object count is flat at **2935** through every 60 s sprint, and all three systems are fixed-count `InstancedMesh` (`pedestrians.js:329`, `vehicles.js:399`, `trains.js:304`) - density changes `im.count`, never the graph |
| A JS leak | `performance.memory` sawtooths (90 -> 73, 200 -> 68 MB) and does not trend up over three consecutive 60 s sprints |
| LOD swaps rebuilding geometry or materials | `src/systems/lod.js` only writes `obj.visible`; geometry counts plateau (1472 after the first pass, unchanged over two further minutes) |
| Per-frame allocations in controls.js / collision.js / walkMath.js | Per-callback CPU, sampled in 10 s buckets over a 60 s sprint, is flat: controls 0.077-0.086 ms, the whole `onFrame` list ~0.33 ms a frame, no drift between the first and last bucket |
| Event listeners added on mode changes | `ctx.onFrame.length` identical before and after ten walk/tour/reference cycles; `setMode` binds nothing |
| Shadow map or minimap re-render frequency | Shadows are one directional light rendered per frame throughout; the minimap redraws on its own throttle and is hidden by default. Neither varies with speed |
| A day/night transition stall | Stepping the clock 12 -> 23 -> 12 -> 23 -> 6 -> 22: worst frame 17-18 ms, programs 62 -> 62 |

## Regression cover

`qa/perf-sprint.e2e.mjs` (production build, via `openWorld({ preview: true })`)
now runs four scenarios and asserts, per scenario: p95 frame time under 20 ms,
no frame over 100 ms, no shader compiled mid-run, no scene growth, and - over a
second pass across ground already covered - geometry and texture counts stable
within 5%. It fails on the pre-fix build (`59 shader programs were compiled
while sprinting (156 -> 215)`, max frame 302.8 ms) and passes after.
