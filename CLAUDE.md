# CLAUDE.md

## Commands

```bash
npm run dev      # vite dev server, http://127.0.0.1:5173
npm run build    # production bundle
npm test         # unit tests: node --test "qa/*.test.mjs"
npm run e2e      # Playwright e2e, one file at a time
npm run e2e:perf # builds, then the qa/*.perf.mjs frame-time suites (~3 min)
npm run qa       # static QA -> FINAL_QA_REPORT.md; exits non-zero on any error
```

No TypeScript, no linter. Vanilla ES modules, Three.js 0.171, Vite 6.

## Architecture

- Every world / landmark / interior / system module exports exactly `build(ctx)` returning a `THREE.Object3D` or `null`. UI modules (`src/ui/*`) and `src/systems/{lod,timeOfDay}.js` export `install(ctx)` and are wired from `src/main.js`, not `MODULES`.
- `ctx = { renderer, scene, camera, clock, onFrame, onResize, stats, start, stop, resize }`; push per-frame work to `ctx.onFrame`; never call `renderer.render` yourself.
- Never add to `ctx.scene` — return the group; `src/world/index.js` parents it from its `MODULES` list (a new module must be added there; one that throws is skipped, not fatal).
- Interiors go through `registerInterior({ id, group, centre, radius })` — hidden until proximity.
- Every entity calls `register(...)` from `src/core/registry.js`; duplicate `id` throws at build time.

## Coordinate frame

- `+X` = grid east (Front St), `-Z` = grid north (Bay St), `+Y` = up in metres, `Y = 0` = the Front & Bay street datum.
- The 16.7° grid rotation lives only in `src/core/geo.js` (and the sun). **Never apply the 16.7° rotation yourself.**

## Toronto invariants (each one is a check in `qa/traps.mjs`; the grid-rotation check is covered above)

`qa/traps.mjs` reads the SOURCE. Where an invariant is about geometry, the source check is a
first pass and the guarantee is an e2e check on the built scene — `qa/front-street-track.e2e.mjs`
for the streetcar one. A trap can be walked straight past in code that never names it (#133).

- No surface streetcar track on Front Street; streetcars reach Union via the Bay Street tunnel into the below-grade Loop.
- No catenary anywhere — the corridor is not electrified.
- The Gardiner is elevated over Lake Shore, not over Front.
- Union Station's exterior entablature carries incised railway names only.
- The carved Canadian-destinations frieze is inside the Great Hall.
- The Hockey Hall of Fame's stained-glass dome is interior; the street roofline is a plain skylight enclosure.
- Four underpasses under the viaduct: Bay, York, Yonge, Lower Simcoe. Simcoe Street itself ends at Front.
- Scotiabank Arena keeps the 1941 postal building façades on both the Bay and Lake Shore elevations.
- "The Park at CIBC SQUARE" is not the cancelled Rail Deck Park.
- There are exactly three concourses — York, Bay, VIA — at concourse level. The Great Hall is not a concourse; never register it as one.
- Never write to a material from the shared `M` library (`.side`, `.transparent`, …) — they are cached and shared.
- No external assets: no loaders, no runtime fetch, no remote URLs, no scraped brand artwork. Textures are procedural (`src/core/textures.js`).

## Conventions

- Materials come from `src/core/materials.js` (`M.limestone()`, `facadeMaterial(...)`); no inline `MeshStandardMaterial` where a shared one exists.
- Footprints come from `src/data/buildings.js` via `getBuilding(id)`. Do not re-guess a footprint — change the database record and say so in a comment.
- Reuse `src/world/buildingKit.js` (`massing`, `prism`, `cornice`, `colonnade`, `storefrontBand`, `windowGrid`, `setbackTower`, …) before writing new geometry.
- Repeated geometry (columns, windows, trees, pedestrians, vehicles) must be `InstancedMesh`; budget is < 1800 draw calls at 60 fps.
- Branch `<topic>-<issue#>` (e.g. `hud-29`) when there is an issue; agent branches use `claude/<topic>-<hash>`. Commit `type: lowercase summary`, append `(#issue)` when one exists; types per conventional commits (feat/fix/perf/test/docs/refactor/chore/ci). Merge via PR, squash only (`gh pr merge --squash`).

## Pointers

- See `MODULE_CONTRACT.md` for the full build contract, registration and performance budget.
- See `qa/traps.mjs` for the machine-checked invariants, and `qa/front-street-track.e2e.mjs` for the one checked against the built scene.
- See `README.md` for controls and provenance.
