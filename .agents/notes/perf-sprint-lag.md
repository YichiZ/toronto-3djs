# Working notes: sprint lag

Append-only log. Newest run at the bottom. Numbers or it did not happen.

## Run 1 — 2026-09-10 (commits e800106, bc69df8, 7e04c42)

### What the symptom actually was

Not a leak, not a decline. **Periodic freezes**: two frames of **283–316 ms**
per 60 s sprint across fresh ground, plus 7–9 hitches of 26–46 ms. They stop
once the city has been drawn once (second and third 60 s passes over the same
ground: **zero** hitches), which is why it feels like "needs a reload" — a
reload brings them all back.

Cause: three.js keys its **shader program cache on the number of *visible*
lights**. `src/world/index.js:160` streams interiors by setting
`it.group.visible`, and each interior carries 1–2 `PointLight`s
(`greatHall.js:594`, `galleria.js:395`, `hhofInterior.js:356` and `:498`,
`concourses.js:387`). Every room streaming in or out changed the visible
point-light count (9 vs 3), so every material drawn that frame needed a program
it had never compiled — 43–44 programs in one frame, ~300 ms on the main thread.
Confirmed by diffing the new programs' `cacheKey` against the existing ones:
exactly one field differed, the point-light count.

Fix (bc69df8, +31 lines in `src/world/index.js`): `root.attach()` the nine point
lights out of the streamed groups (world position preserved), and set
`intensity = 0` instead of hiding them.

| | before | after |
|---|---|---|
| max frame, 60 s sprint | 302.8 ms | 22.7 ms |
| frames over 100 ms | 1–2 | 0 |
| hitches over 25 ms, 2 × 60 s | 11 | 0 |
| programs during the run | 156 → 215 | 62 → 62 |
| distinct programs in session | 267–318 | 62 |
| max frame, mode switching ×10 | 197.1 ms | 62.6 ms |

Cost: +0.25 ms/frame for the permanently wider light loop (5.66 → 5.91 ms per
render at street level). No visual change; `qa/night.e2e.mjs` passes.

### Baseline numbers (pre-fix, 60 s sprint, production build, headless 1280×800)

3567 frames of 3600; p50 16.7 / p95 17.5 / max 302.8 ms; quintile means
17.1 / 16.7 / 16.7 / 16.7 / 16.7 ms — **no drift**; geometries 1125 → 1470;
textures 112 → 163; programs 156 → 215; scene objects flat at 2935; heap
90 → 73 MB.

### Dead ends — do not re-run these blind

| Hypothesis | Why it died |
|---|---|
| Objects added and never removed (pedestrians / vehicles / trains) | Scene object count flat at **2935** through every 60 s sprint. All three are **fixed-count `InstancedMesh`** (`pedestrians.js:329`, `vehicles.js:399`, `trains.js:304`) — density changes `im.count`, never the scene graph. Spawn growth is structurally impossible here. |
| A JS leak | `performance.memory` sawtooths (90 → 73, 200 → 68 MB), no trend over three consecutive 60 s sprints |
| LOD swaps rebuilding geometry/materials | `src/systems/lod.js` only writes `obj.visible`; geometry plateaus at 1472 and stays there over two further minutes |
| Per-frame allocations in controls.js / collision.js / walkMath.js | Per-callback CPU in 10 s buckets over 60 s: controls 0.077–0.086 ms, whole `onFrame` list ~0.33 ms/frame, no drift first bucket to last |
| Listeners added on mode change | `ctx.onFrame.length` identical before/after ten walk/tour/reference cycles; `setMode` binds nothing |
| Shadow map / minimap re-render frequency | One directional light rendered per frame throughout; minimap on its own throttle and hidden by default. Neither varies with speed |
| Day/night transition stall | Clock stepped 12 → 23 → 12 → 23 → 6 → 22: worst frame 17–18 ms, programs 62 → 62 |

### Discarded fix: boot-time shader warm-up

Tried compiling the full program set at boot by cycling light visibility during
load (a `renderer.compile()` sweep). Cost **+0.5–1.3 s of load time** and gained
nothing the `attach()` fix did not gain more cheaply — the cache still had to be
re-keyed the moment the real count changed. Dropped. Do not retry unless the
light count genuinely has to vary.

### Harness facts learned

- `openWorld({ preview: true })` (added to `qa/e2eHarness.mjs` in e800106) runs
  `vite preview` over `dist/` with `--port 0`, so the OS picks the port and a
  busy 4173 is not a failure. Perf must be measured on the production bundle;
  the dev server's module graph is not the thing that lags. The harness
  refuses a missing or stale `dist/`; `npm run e2e:perf` builds then runs
  the `qa/*.perf.mjs` suites, which are kept out of `npm run e2e`.
- `qa/perfProbe.mjs` holds the in-page probe (`SAMPLE`, passed as source and
  eval'd because a scenario driver cannot cross `page.evaluate` as a closure)
  plus `summarise` / `growth` / `report`. Point it at any scenario; a trend only
  means something if every scenario is measured identically.
- `qa/perf-sprint.perf.mjs` runs four scenarios (60 s sprint + 20 s second pass,
  Great Hall idle, street walk, ten mode switches) and asserts p95 < 20 ms, no
  frame > 100 ms, `delta.programs === 0`, `delta.objects === 0`, and
  geometry/texture growth < 5 % on the second pass.

### Open items for the next run

1. **LOD reveal budget** — `src/systems/lod.js:62` reveals every newly-near
   object in one tick. First-visit upload bursts were `+177 geometries /+43
   textures` in a single frame at t=6.1 s, `+151/+33` at 15.1 s, `+126/+4` at
   21.4 s, giving 26–46 ms hitches pre-fix. After the light fix the worst
   first-pass frame is 22.7 ms, so there is no number left to justify a fix on
   this hardware — but on a slower machine these return, and the lever is a
   per-tick reveal budget at that line.
2. **Reference mode first toggle** — `src/ui/referenceMode.js:227` builds a label
   sprite (own canvas texture) and an x-ray cage per registered entity:
   objects 2935 → 3377, textures 175 → 356 in one frame. Was 197.1 ms, now
   **62.6 ms**. One-off, guarded by `builtEntities`, on a deliberate user
   action. Still the largest remaining single frame in the suite.

---

## Run 2 — 2026-09-10 (from 517bb21, the merged tip)

Mode: investigate and file issues, no fixes to `src/`.
Issues filed: **#60 (P1)**, **#61 (P2)**, **#62 (P3)**.

### Baseline on an unmodified origin/main — the suite is RED

`npm run e2e:perf`, twice, no code change between runs:

| scenario | run 1 | run 2 |
|---|---|---|
| sprint 60 s | p50 16.7 / p95 17.6 / max 24.4, **pass** | same, **pass** |
| great hall idle 20 s | p50 16.7 / p95 **25.7** / max 46.5, **fail** | p50 28.0 / p95 **34.1**, **fail** |
| street walk 20 s | p95 17.5, pass | p95 31.6, **fail** (machine load) |
| mode switching x10 | p95 24.3 / max 35.1, **fail** | p95 31.0 / max 55.4, **fail** |

Sprint 60 s, run 2: geometries 1125 -> 1474, textures 112 -> 165, programs 62 -> 62,
lights 11 -> 11, objects 2935 -> 2935, **heap 74.3 -> 213.6 MB**, draw calls 1271 -> 1233.

Round 1's fix holds: programs and the visible-light count are still constant.
The new failures are steady per-frame cost, not streaming or recompiles.

### What it was: double-sided transmissive glazing (#60)

`onFrame` JS in the Great Hall totals **0.21 ms a frame** - so the cost was inside
`renderer.render`. Trapping `Material.version` in the page: **3 of 920 materials
are re-versioned 6720 times in 2 s (56 a frame)**, and the stack is three's own
`renderTransmissionPass` -> `set needsUpdate`. three r171 draws a **double-sided**
transmissive material twice, flipping `side` and setting `needsUpdate` each time,
per object per frame; every bump re-derives the program parameters and clones the
uniforms.

| material | bumps / 2 s | declared at |
|---|---|---|
| `glazingClear` | 5760 | `src/core/materials.js:89` |
| `conc:balGlass` | 480 | `src/interiors/concourses.js:176` |
| `path:liftGlass` | 480 | `src/interiors/path.js:404` |

A/B/A paired in one session, Great Hall, production build:

| | KB/frame | GC/s | p50 | p95 | max | >20 ms | calls |
|---|---|---|---|---|---|---|---|
| DoubleSide (shipped) | 2106 | 6.2 | 19.8 | **25.8** | 29.8 | **225/490** | 1305 |
| FrontSide | 1846 | 6.7 | 16.6 | **17.5** | 18.5 | **0/599** | 1261 |
| DoubleSide again | 2100 | 6.5 | 18.3 | 24.2 | 30.2 | 172/521 | 1305 |

Three lines in three files. `qa/perf-sprint.perf.mjs:120` already fails before and
passes after - no new assertion needed.

### The heap climb, explained and closed (#61)

The 80 -> 200 MB climb the sprint run shows is **not** an app leak and **not** app
code. Per-frame `performance.memory` sampling (the committed probe's 5 s interval
hides it - sample every frame):

| | calls | KB/frame | MB/s | major GC/s |
|---|---|---|---|---|
| forecourt | 1335 | 1878 | 115 | 7.5 |
| great-hall | 1305 | 2106 | 106 | 6.2 |
| world root hidden | 1 | 40 | 2.5 | - |

**~1.35 KB of JS garbage per draw call per frame**, all inside three's
`WebGLRenderer`. CDP `HeapProfiler.startSampling` (interval 1024 B, unminified
build) top frames: `onAnimationFrame` 16%, `setValueV1f` 10%, `setProgram` 8%,
lights `setup` 7%, `update` 6.5%, `cloneUniforms` 5.6%,
`getProgramCacheKeyParameters` 5.6%. App code totals **under 3%** (`hud.js` 2.1%,
`controls.js` 0.5%). **There is no per-frame allocator in src/ worth naming.**

Setting `transmission = 0` on the ten transmissive materials halves it: draw calls
1335 -> **676**, garbage 1878 -> 1127 KB/frame, GC 7.5 -> **3.0/s**. So three's
transmission pass is a second full opaque render of the city, ~640 of the 1335
calls - and that is the lever, not any allocation in app code.

### Ruled out this run, with numbers

| Hypothesis | Evidence |
|---|---|
| Per-frame allocators in app code | CDP allocation sampling over a 20 s sprint: app code < 3% of samples; 97% is three's `WebGLRenderer`. The heap climb is 1.35 KB per draw call per frame |
| Sidewalk routing / wayfinding costs per tick | Whole `onFrame` list forced at dt = 0.26: **0.155 ms** with no destination, **0.18-0.25 ms** with one set (5 destinations, nearest to farthest). Dijkstra at 4 Hz over a few hundred nodes is free |
| Footsteps probing the surface per frame | `src/ui/footsteps.js` reads `controls.strideDistance` per frame and calls `surfaceFor` only on a stride boundary; it does not appear above 0.002 ms in the per-callback probe |
| Nearby strip / HUD DOM churn per frame | The HUD writes DOM on its own 0.25 s tick, not per frame; the whole tick is 0.155 ms. In the per-callback probe the HUD callback is 0.015 ms a frame amortised |
| Pedestrians sidestepping the walker (`crowdPush.js`) | The pedestrian callback is the most expensive one at **0.090 ms a frame** for ~900 agents; `clearance()` is scalar maths with no allocation |
| `frustumCulled = false` meshes drawn out of view | 22-38 draw calls at three viewpoints; paired render-cost delta **0.05-0.11 ms**. All of them are the moving InstancedMesh sets, which is correct |
| Shadow map frequency | Paired render-cost delta of turning the shadow map off: **0.89-1.08 ms** per render at three viewpoints. One directional light, one pass; nothing varies with speed or mode |
| The 9 hoisted point lights (round 1's stated cost) | Paired delta **0.02-0.38 ms** per render - round 1's "+0.25 ms a frame" claim is confirmed, not a regression |
| Minimap re-render frequency | Hidden by default, on its own throttle; 0.002 ms a frame in the per-callback probe |
| Startup / slow `build()` modules | `window.__TWIN__` at **288-336 ms** over three cold loads, 309 KB transferred, DCL 30-54 ms. Slowest module is `buildings` at 23-25 ms; nothing else is over 22 ms |
| Bundle / three tree-shaking | 545 kB min, **141 kB gzip**, one chunk. No loaders, no DRACO/KTX2, no WebGPU, no PMREMGenerator, no AnimationMixer. The app touches 59 distinct `THREE.*` symbols. Nothing actionable |
| LOD reveal budget (round 1 open item) | Still no number to justify a fix: worst first-pass frame in a 45 s sprint is **21.0 ms** (+182 geometries / +45 textures at t = 6.0 s), then 19.4 ms, then 18.2 ms. Under the 25 ms hitch threshold. Closed until someone measures it on slower hardware |

### Measurement technique - read this before Phase 1

**Frame gaps cannot resolve render cost under vsync.** The first two attempts at an
A/B were worthless: at 60 Hz every healthy condition reads exactly 16.7 ms, so the
delta is 0.0 whatever you change, and the only numbers that *did* move were this
machine's own background load drifting upward through the run (the same condition
measured 16.7 ms early and 36.6 ms late).

Two things fixed it, and both are worth keeping:

1. **Measure render cost directly.** Render the same view K times in one go and
   `gl.finish()` at the end; divide. That is CPU submit + GPU work per render,
   with no vsync floor. Steady-state cost is **5.6-7.8 ms a render** at 1305-1335
   calls, so the app has real headroom and is nowhere near GPU-bound here.
2. **Pair everything A/B/A/B and report the median of per-round differences.**
   This machine had other applications on it all run (load average 4.5-8.2, the
   user's own Chrome at 40% of a core). Paired medians survive that; a sequence of
   single measurements does not. Absolute p95 from `npm run e2e:perf` is only
   trustworthy when it agrees across two runs - here "street walk" passed at
   17.5 ms and failed at 31.6 ms with no code change, while the Great Hall failed
   both times and then reproduced cleanly under pairing.

**Finding a per-frame shader re-derivation:** snapshot every material's `version`,
`Object.defineProperty` a trap on the setter, and read back the stack. That is what
found #60 in one shot after the per-callback CPU probe had ruled out all of app
code. `renderer.info.programs` stays flat through this - the program is *re-derived
and re-looked-up*, not recompiled - so round 1's `delta.programs === 0` assertion
cannot catch it.

### Harness facts learned

- **A fresh worktree has no `node_modules`.** `npm run build` then resolves `three`
  from a parent directory's copy and fails with a Rolldown "failed to resolve
  import" - run `npm install` first.
- `npm run e2e:perf` exits non-zero on a failed assertion or build (`node --test`
  returns 1; verified after this run). The "exits 0" seen during the run was the
  exit code of the `| tail` / `| grep` it was piped through, which hides both
  the build failure and the assertion failure.
- Don't pipe it through `tail -60`: the first scenario's four report lines scroll
  off, and the 60 s sprint is the one you most want.
- `npx vite build --minify false` gives real function names in a CDP allocation
  profile, and the harness's staleness check is happy with it. Rebuild with
  `npm run build` afterwards.

---

## Run 3 — 2026-09-11 (sprint-2026-09-11; fixes #60 and #62, #61 deferred)

Machine loaded all run (load average 5.3-5.6): a single absolute p95 is a claim
here, not a fact — read the paired numbers.

### #60 — FrontSide on the three transmissive glass materials (3 lines)

Paired A/B in the Great Hall, production build, render K = 30 + `gl.finish()`,
6 alternating rounds, flipping `side` on the three materials at runtime (probe
only):

| | ms / render | `version` bumps / render | draw calls |
|---|---|---|---|
| FrontSide (shipped) | 5.61-7.12 | **0** | 1261 |
| DoubleSide (old) | 7.03-8.69 | **88** | 1305 |
| median paired diff | **+1.44 ms** (6/6 rounds positive, 1.11-1.57) | | |

`renderer.info` before -> after (`teleport`, 2 s settle):

| viewpoint | draw calls | programs |
|---|---|---|
| boot | 1335 -> **1307** | 62 -> **58** |
| great-hall | 1305 -> **1261** | 62 -> **58** |
| union-forecourt | 1122 -> **1090** | 62 -> **58** |
| galleria-interior | 835 -> 823 | 65 -> 63 |
| york-concourse | 1318 -> 1278 | 65 -> 63 |

Programs fell because the DoubleSide variants no longer exist. Visual: Great Hall
indistinguishable; Galleria roof glazing slightly clearer/bluer (one glass layer
tints it, not two).

**The Great Hall p95 did not go under 20 ms here.** `npm run e2e:perf`: 42.6 ms
before (loaded), 29.2 ms after (quintiles 20.6 -> 26.1 while the sprint in the
same run was flat at 16.7). The paired render cost says #60's share is gone
(5.6-7.1 ms a render), so what is left is the transmission pass itself (#61:
~640 of 1261 calls) meeting a loaded machine. Not closed by #60 alone on this
hardware.

### #62 — reference-mode labels drained 40 a tick

- Before: first toggle builds all 221 labels + cages in one call (13.9 ms sync
  JS here) and the first frame is **110 ms**.
- After: labels per frame 40 80 120 160 200 221; sync JS 0.0 ms; frames 2-5 are
  10-15 ms each.
- **The first shown frame is still 59-77 ms (3 fresh loads) and it is not the
  build.** Split: `renderer.compile(root)` + `gl.finish()` 1.8-2.1 ms,
  `initTexture` over all 23 reference maps 0.2 ms, 8 new programs, next frame
  59-76 ms. Inferred: first-use program linking under parallel shader compile.
  Lever: `compileAsync` on first toggle. Unfiled; measure it first.
- **The suite's mode-switching scenario could never see #62**: its 3 s warm-up
  does the first toggle, unmeasured. Added `reference mode builds its labels
  over several frames, not one (#62)`, which counts labels per frame (fails
  before: 221 in one frame; passes after: 40).
- Mode switching x10 after: p50 16.7 / p95 19.7 / max 38.3, **pass** (before,
  loaded: p95 25.9 / max 33.9, fail). The max is steady reference-mode cost
  with 221 labels on, not the build.

### Dead ends / facts

- `git archive` of main into the scratchpad plus `node` there is refused under
  worktree isolation. Do fails-before checks in the worktree (recipe in prompt).
- Fails-before check for the new #62 test, run in the worktree against main's
  four files: `221 of 221 labels were built in one frame` — **fails**. After the
  fix: 40 per frame — **passes**.
- `qa/footsteps.e2e.mjs` "once captured, one footfall per 1.2 m stride" failed
  twice with `no AudioContext after the pointer lock`, both times beside other
  heavy processes. Bisected: passes with only `referenceMode.js` reverted, with
  only the three material files reverted, on main's code (4/4), and on HEAD in
  4 consecutive quiet runs (HEAD total 4/6). **Load-sensitive flake, not a
  regression.** `qa/crowd.e2e.mjs` sidestep: failed once under contention,
  passed alone.
