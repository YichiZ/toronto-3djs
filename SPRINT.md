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

## Update — scouts ran in parallel sessions

Items 3–5 were run by separate sessions before the director dispatched them,
so the director gates their output instead of dispatching duplicates:

- 3 product-review → PR #73; filed #67 #68 #69 #70 #72 #78 #79 #80.
- 4 technical-artist → in progress in its own session; filed #76 #77. Its
  uncommitted edits touch `src/core/materials.js`, which #60 also edits —
  merge whichever lands second on top of the first.
- 5 historian → PR #75; filed #74.

Convergence (director's walk and a specialist independently): #69 (Great Hall
place card) and #68 (forecourt/boot spawn) — top candidates for sprint 2.

## Result

| # | Item | Outcome |
|---|---|---|
| 1 | #60 | Shipped in #87 (fb7e6b3). Great Hall p95 17.6 ms, director re-run 6/6 `e2e:perf` |
| 2 | #62 | Shipped in #87. 40 labels/frame instead of 221 in one; new assertion fails on the old code |
| 3 | product-review | Shipped in #73 (6a27230); 8 issues filed |
| 4 | technical-artist | Slipped: still in progress in its own session, no PR at close. Carried to sprint 2 |
| 5 | historian | Shipped in #75 + #81 (self-merged, gated post-merge on main) |

## Deferred

- #61 transmission pass (L, visual change to ten glass materials, no frame-time gain at 60 Hz on this machine). Revisit after the technical artist has surveyed the glass.

## Dispatch order

Perf runs alone (#60 then #62 in one run). Then product-review, historian and
technical-artist in parallel: product-review writes nothing in src/, historian
owns src/data, technical-artist owns src/core — no shared directory.
