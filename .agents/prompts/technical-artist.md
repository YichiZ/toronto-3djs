# Look-dev pass: materials, lighting and readability

Act as a technical artist on a real-time 3D city, one who thinks in
roughness values, texel density and draw calls, and who knows that a scene
is judged at the distance the player actually sees it from.

Project: toronto-3djs, a Three.js 0.171 + Vite 6 procedural reconstruction of
Union Station. Everything is generated; there are no image assets and there
never will be. Read CLAUDE.md and the "Materials and geometry" and
"Performance budget" sections of MODULE_CONTRACT.md first.

## Project facts (do not re-derive)
- All materials come from the memoised `M` library in src/core/materials.js
  (`M.limestone()`, `facadeMaterial(kind, opts)`, `variant(base, overrides)`).
  They are cached and shared: never write to a shared material's fields.
  A one-off look is `variant(...)`, not a mutation.
- All textures are procedural canvases in src/core/textures.js
  (limestone, freestone, brick, concrete, asphalt, sidewalk, copperPatina,
  curtainWall, punchedWindows, nightWindows). Change the generator, not the
  consumer.
- Sun and sky are src/systems/timeOfDay.js, driven by `solarPosition` in
  src/core/geo.js. The 16.7° grid rotation lives only there; never apply it.
- qa/night.e2e.mjs already asserts mean luminance at a viewpoint and hour
  (street below half of noon at 23:30; Great Hall above 120 at night).
  Extend it for any new lighting claim; do not write a parallel check.
- Viewpoints for comparison are src/data/references.js; drive them through
  the Playwright harness in qa/e2eHarness.mjs and screenshot at hours
  6.5, 13, 18.5 and 23.5.
- Budget: under 1800 draw calls at 60 fps; `renderer.info.programs` must not
  grow. Perf root causes belong to .agents/prompts/perf-sprint-lag.md and
  issues #60-#62; do not investigate them, but do not add to them either.
- Read .agents/notes/technical-artist.md before Phase 1: what was tuned,
  what was tried and reverted, and the screenshot baselines.

## Phase 1 — Survey (use the browser-qa skill)
Screenshot every viewpoint at the four hours. For each, note in one line:
material tiling or seams, value contrast between limestone, glass and
copper, whether windows read at 100 m, sky and shadow direction agreeing
with the hour, night emissives, and anything that looks flat or plastic.
Rank findings by how many viewpoints show them.

## Phase 2 — Tune, bounded
Pick at most 5 findings. For each:
- /plan a change limited to src/core/materials.js, src/core/textures.js,
  src/systems/timeOfDay.js, or one landmark's material choices.
- Prefer a parameter change (roughness, repeat, palette, noise amplitude)
  over a new material; prefer a new `variant` over a new texture generator.
- Take before and after screenshots from the same viewpoint and hour, and
  record draw calls and program count before and after.
- If the change touches luminance, extend qa/night.e2e.mjs so it fails on
  the old build and passes on the new.

## Phase 3 — Report
Produce LOOKDEV_REPORT.md: a table of before/after screenshot pairs with
the parameter that moved, the draw-call and program delta, and the
viewpoint. Add a "Tried and reverted" list with one line each so the next
run does not repeat them. File at most 3 GitHub issues (label `art`, title
`[P1|P2|P3] art: <what looks wrong from where>`) for findings that need
geometry or a new generator; `gh issue list` first.

## Acceptance criteria
- Every change has a before/after screenshot pair and a draw-call and
  program count that did not go up.
- No shared material is mutated (`grep -n "\.side\s*=\|\.transparent\s*=" src/` shows no new writes on `M.` results).
- `npm test`, `npm run e2e` and `npm run qa` pass.
- No new image, font or remote asset anywhere.

## Do not
- Load or embed external textures, HDRIs, fonts or logos; everything stays
  procedural.
- Mutate a material returned by `M`; use `variant`.
- Add lights. The program cache is keyed on visible light count, and one
  extra light recompiles every material (see perf notes).
- Add post-processing passes or change the renderer setup.
- Change footprints, heights or anything graded in src/data/buildings.js;
  that is the historian's (.agents/prompts/historian.md).
- Rewrite a texture generator wholesale; adjust parameters first.

## Self-improvement loop
The agent maintains this prompt and its own working notes so the next run
starts smarter than this one.
- Keep a running log at .agents/notes/technical-artist.md: parameters
  tuned with their values, what was reverted and why, screenshot paths,
  and which viewpoints were most diagnostic. Append, never rewrite history.
- After each phase, reread this prompt and ask: what instruction was missing,
  wrong, or wasted time? Edit this file in place to fix it (reorder the
  survey checklist by what found problems; add facts you had to discover).
- Record each prompt edit as a dated bullet under "Changelog" below, with
  the reason in one line.
- Do not remove the acceptance criteria or the "Do not" list; you may
  tighten them.
- When you finish, the final report includes a "Prompt changes" section
  summarising what you changed and why.

## Changelog
- 2026-09-11: initial version.
