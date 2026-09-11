# Sprint 2026-09-11

Milestone: `sprint-2026-09-11`. Set by the game director (.agents/prompts/game-director.md).
First sprint of the studio: only perf has findings on file, so three of the five
slots are specialist scouting runs that turn "no issues" into ranked issues.

| # | Outcome a visitor notices | Owner prompt | Verification | Size |
|---|---|---|---|---|
| 1 | Standing in the Great Hall holds 60 fps instead of dipping to ~50 (#60) | perf-sprint-lag | `npm run e2e:perf` green (Great Hall p95 < 20 ms) + `npm run e2e` | S |
| 2 | The first press of Reference no longer freezes the view for a beat (#62) | perf-sprint-lag | `npm run e2e:perf` mode-switching max < 20 ms + `npm run e2e` | S |
| 3 | The first sixty seconds are reviewed as a visitor and the top problems are filed | product-review | PRODUCT_REVIEW.md exists, ≤ 5 `product` issues match its top entries, `git diff --stat src qa` empty | M |
| 4 | Interiors read as lit stone and glass, not washed-out white (Great Hall at 18:40) | technical-artist | LOOKDEV_REPORT.md before/after pairs; `npm test`, `npm run e2e`, `npm run qa`; draw calls and programs not up | M |
| 5 | Place names and grades a visitor reads match the real building | historian | FIDELITY_REPORT.md; `npm test`, `npm run qa`, `npm run e2e` | M |

## Director's walk (Phase 1, dev server, 1280×800, 18:40)

| viewpoint | draw calls | programs | fps | seen |
|---|---|---|---|---|
| boot (Front & Bay) | 1335 | 62 | 60 | reads as Toronto; minimap and HUD bar cover the lower third |
| great-hall | 1305 | 62 | 50 | washed-out white; place card reads "Union Station east and west wings · INFERRED" inside the hall |
| union-forecourt | 1122 | 62 | 60 | dark "UNION STATION" band on the entablature; eye spawns inside a lamp post |

Hand-offs from the walk (for the specialists to confirm or kill, not work items):
- historian: the forecourt "UNION STATION" band against the invariant "entablature carries incised railway names only"; the Great Hall place card.
- technical-artist: Great Hall exposure at 18:40.
- product-review: forecourt spawn inside street furniture; HUD/minimap coverage.

## Deferred

- #61 transmission pass (L, visual change to ten glass materials, no frame-time gain at 60 Hz on this machine). Revisit after the technical artist has surveyed the glass.

## Dispatch order

Perf runs alone (#60 then #62 in one run). Then product-review, historian and
technical-artist in parallel: product-review writes nothing in src/, historian
owns src/data, technical-artist owns src/core — no shared directory.
