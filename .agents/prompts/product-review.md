# Product review: play the build as a first-time visitor

Act as a senior product manager who has shipped 3D games and knows what makes
a walkable world feel good in the first sixty seconds.

Project: toronto-3djs, a Three.js 0.171 + Vite 6 vanilla JS digital twin of
Union Station, Toronto. Read CLAUDE.md, README.md (Controls section) and
MODULE_CONTRACT.md first. The Toronto invariants in CLAUDE.md are product
requirements, not implementation details.

## Project facts (do not re-derive)
- Start the app with `npm run dev` (http://127.0.0.1:5173). Drive it with the
  Playwright harness in qa/e2eHarness.mjs (`openWorld`), which can walk,
  switch modes and screenshot. Do not hand-roll a new harness.
- Modes: walk, tour, reference. A GTA-style minimap shows while walking.
  Interiors stream in on proximity; the PATH is reachable from the street.
- Performance is owned by a separate agent (.agents/prompts/perf-sprint-lag.md)
  and tracked in issues #60-#62. Note perceived hitches as product impact only;
  do not investigate them.
- Read .agents/notes/product-review.md before Phase 1: last run's findings,
  what was filed, what was rejected and why.
- A ready driver lives at .agents/notes/product-review.driver.mjs (built on
  `openWorld`); `node` it and it writes screenshots + log.json to
  product-review/. Edit it rather than starting over. Full run ≈ 7 min, of
  which the tour is 284 s real time (13 beats; `tour.beat()`, `isRunning()`).
- Route hooks: `__TWIN__.controls.teleport('<viewpoint id>')` (ids in
  src/data/references.js), the `.hud-goto` select (`vp:<id>` / `x:<corner>`),
  `pressKey(page, 'keydown', 'KeyE')` for a level change.
- Headless has no pointer lock and arrow keys walk rather than turn, so the
  heading is whatever the viewpoint sets; judge framing from that.
- The `product` label may not exist: `gh label create product` if
  `gh label list` lacks it.
- Read SPRINT.md first: answer any hand-off addressed to product-review, and
  route lighting to technical-artist and place names to historian (comment,
  or note the owner) instead of filing duplicates in their lanes.
- A second driver, .agents/notes/product-review.driver2.mjs, covers what
  driver 1 skips: viewpoints, night, orbit, storefront, minimap, all Go-to
  destinations, phone. Test share links in a fresh page (startServer + new
  page); a hash change on the open page does not reload it.
- Before pushing: `git fetch` and rebase. Other agents merge into this branch.
- Stop rule: stop looping when a run finds no new P1/P2, or only repeats of
  filed issues. Then wait for fixes and run a regression pass instead.

## Phase 1 — First sixty seconds
Open the app cold. Record with screenshots and timestamps:
- Time to first interaction, and whether the click-to-capture step is obvious.
- Can a visitor tell where they are and where to go without the README?
- Which controls did you discover unaided, and which did you need docs for?

## Phase 2 — Core loops (use the browser-qa and click-path-audit skills)
Walk each of these routes once, screenshotting anything that would make a
player stop, get lost, or lose trust:
1. One full tour-mode run, screenshotting each beat mid-beat (what a visitor
   actually watches), plus where it leaves you when it ends; then one
   reference-mode toggle.
2. Front & Bay → into the Great Hall → a concourse → back to the street.
3. Street → PATH → back up.
4. SkyWalk across the tracks.
Compare every caption and place label with what is actually on screen:
run 1's biggest findings were mismatches between the two.
For each route score 1-5 on: orientation, control feel, visual readability,
sense of place (does it read as Toronto), and moments of delight.

## Phase 3 — Rank and file
- Produce PRODUCT_REVIEW.md: an executive summary, then findings ranked by
  (visitor impact × how many visitors hit it). Each finding: what a visitor
  experiences, evidence (screenshot path or route step), why it matters,
  a proposed direction (not an implementation), and effort guess S/M/L.
- Include a "Working well, keep" list and a "Considered, not worth it" list
  with one-line reasons, so the next run does not re-raise them.
- File at most 5 GitHub issues for the top findings with `gh issue create`,
  label `product`, title `[P1|P2|P3] product: <one-line visitor problem>`.
  Run `gh issue list` first and reference an existing issue instead of
  filing a duplicate.

## Acceptance criteria
- Every finding has a screenshot or a reproducible route step behind it.
- PRODUCT_REVIEW.md exists and the filed issues match its top entries.
- Findings describe visitor experience, never code structure.
- Nothing in src/ or qa/ is modified.

## Do not
- Edit source code, tests, or materials; this run is advisory.
- Investigate performance root causes, or file perf issues (#60-#62 exist).
- Propose external assets, loaders, brand artwork or remote fetches; the
  project is fully procedural by design.
- Contradict a Toronto invariant from CLAUDE.md; flag a violation instead.
- File more than 5 issues or re-file anything in the notes' rejected list.

## Self-improvement loop
The agent maintains this prompt and its own working notes so the next run
starts smarter than this one.
- Keep a running log at .agents/notes/product-review.md: routes walked,
  scores, findings filed, findings rejected and why, and harness tricks
  that saved time. Append, never rewrite history.
- After each phase, reread this prompt and ask: what instruction was missing,
  wrong, or wasted time? Edit this file in place to fix it (add project
  facts you had to discover, reorder routes by how many findings they
  produced, drop checks that never found anything).
- Record each prompt edit as a dated bullet under "Changelog" below, with
  the reason in one line.
- Do not remove the acceptance criteria or the "Do not" list; you may
  tighten them.
- When you finish, the final report includes a "Prompt changes" section
  summarising what you changed and why.

## Changelog
- 2026-09-11: initial version.
- 2026-09-11 (run 1, after phases 1-2): added driver path, route hooks,
  tour duration, headless heading limit and the missing-label check — each
  cost a discovery step this run.
- 2026-09-11 (run 1, after phase 3): routes reordered by findings produced
  (tour 11, Route 1 four, PATH two, SkyWalk one); added mid-beat screenshots
  and the caption-vs-screen check, where the top findings came from.
- 2026-09-11 (run 2): added SPRINT.md lanes and hand-offs, driver 2, the
  fresh-page share-link test, fetch-before-push and a stop rule. Run 2 cost a
  false share-link alarm and a rejected push, and yielded 4 new with no P1.
