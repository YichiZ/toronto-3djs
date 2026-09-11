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
