# game-director notes

Append-only log. No runs yet.

## Sprint 1 — 2026-09-11

### Phase 1 — state of the build
- Open issues: #60 (P1), #61 (P2), #62 (P3), all perf, all unlabelled. No
  product / fidelity / art issues: those three specialists had never run.
  Nothing raised by two specialists yet.
- PR #63 (perf round-2 notes + prompt revisions) open, marked "do not merge
  yet". The perf prompt on main is one round stale without it.
- Labels `perf`, `fidelity`, `art` did not exist; `product` did. The
  specialists' `gh issue create --label` would have failed.
- The four new prompts and notes existed only uncommitted in the
  prompt-optimizer-agent-3fae39 worktree; copied in here.
- `npm test` 148/148 on 9dccfde.
- Walk (scratch walk.mjs, `controls.teleport(id)` + 120 frames): boot 1335
  calls / 62 programs / 60 fps; great-hall 1305 / 62 / 50 fps; forecourt 1122
  / 62 / 60 fps; no console errors. Great Hall at 50 fps confirms #60 by eye.
- Time: ~15 min, most of it finding the prompt files.

### Phase 2 — sprint set
- Sprint: #60, #62 (perf), product-review / technical-artist / historian
  scouting runs. #61 deferred (L, visual, no frame-time gain at 60 Hz here).
- Labels `perf`, `fidelity`, `art` created; #60-#62 labelled; milestone 1
  `sprint-2026-09-11` holds #60 and #62. Prompts + SPRINT.md merged as #71
  (0e4dfeb) so specialists branch from a main that has their prompts.

### Phase 3 — dispatch
- Perf dispatch 1 stopped after 78 s: it started the baseline `e2e:perf` in
  the background and ended its turn "waiting for a notification" that never
  comes to a subagent. SendMessage is disabled in this session, so it could
  not be resumed; a second agent was launched into the same worktree
  (claude/perf-60-62-5e0558) with an explicit "never stop on a background
  wait; poll in the foreground" line. Cost: one agent start, no lost work.
- Wrong: dispatch 1 had NOT stopped — its "completed" notification fired
  when its background command returned, and it kept writing. Dispatch 2
  collided with it in the same worktree, noticed foreign edits, and stopped
  without committing. Lesson: a subagent's "completed" can be premature;
  check worktree mtimes for 2 min before relaunching into the same tree.
- Meanwhile product-review (#73), historian (#75) and technical-artist (in
  progress) ran in the user's other sessions, in parallel with perf — the
  parallelism rule was broken outside the director's control, and perf's
  baseline ran at load 5.0–5.5. Director switched items 3–5 from dispatch to
  gate. Heavy gates (e2e) held until perf returns to keep its numbers clean.

### Gates
- #73 product-review: add/add conflict with #71 on its prompt + notes
  (#71 shipped the initial versions; the run's branch had evolved ones).
  Resolved by merging main into the branch keeping the branch side, no
  force-push. Gate: `git diff --stat origin/main -- src qa` empty (advisory
  only), 43 JPEG evidence shots are not runtime assets. PASSED, merged
  6a27230.
- #75 historian: same conflict, same resolution (cbc0713). `npm test`
  148/148, `npm run qa` 0 errors on its tip. `npm run e2e` pending — held
  until perf returns. Its own run saw share-link.e2e flake once.
- #75 was then squash-merged by the historian's own session (04:36:46,
  4b71a03) before the e2e gate ran. My merge-main push onto its branch made
  that session's review-fix push non-fast-forward, so the fixes landed as a
  separate PR #81 (4c79fac): a module ignoring its record's downgraded grade
  (mapleLeafSquare.js) and a QA report regenerated without runtime metrics.
  Both slipped past #75's own test plan; #81 caught them, not a director
  gate. Post-merge `npm run e2e` on main is the remaining gate for both.
- Lesson for Phase 3: never push to a branch another live session owns;
  post the conflict resolution as a PR comment, or wait for it to go idle.
- #87 perf (#60 + #62, supersedes #63): diff matched the report (three
  `side` lines; referenceMode queue of 40/tick, drained from the existing
  onFrame). Galleria vault still reads from inside after FrontSide (before/
  after pair checked by eye). Director re-ran `npm run e2e:perf` on its tip
  at load ~2: 6/6, Great Hall p95 17.6 ms, mode switching max 20.2 ms. Draw
  calls down (boot 1335 → 1307, great-hall 1305 → 1261), programs 62 → 58.
  PASSED, merged fb7e6b3; #63 closed as superseded.
- Post-merge `npm run e2e` on fb7e6b3 (covers #75, #81, #87): 110/111 at
  load 3.8 → 6.1. The one failure, boot.e2e "first frame shows Union
  Station", read the HUD place card once before its throttled tick filled
  it ("—"). Passed 3/3 alone at load 5.5. Test race, not a regression; the
  director fixed the read to wait for the label (verification fix).
### Phase 4 — retrospective
- Shipped: #60 + #62 (#87), product review (#73), historian pass (#75,
  #81). Milestone closed 4/4 with summary.
- Slipped: technical-artist — running in its own session, no PR at close;
  its uncommitted materials.js edit will need a rebase over #87's
  glazingClear `side` change, and its prompt/notes will add/add-conflict
  with #71's copies. Carry to sprint 2 and gate it there.
- Deferred: #61.
- Most correction needed: historian — #75 shipped a module ignoring its
  record's downgrade and a QA report with its runtime metrics stripped; #81
  (its own session) fixed both. Perf needed the most director time, but
  from a dispatch problem (premature "completed"), not its prompt.
- Specialist prompt change this run: historian gets a "Start here" (the
  forecourt "UNION STATION" band vs the entablature invariant, Maple Leaf
  Square grades, #74, #69's registration angle). Logged in its Changelog.
- Dispatch order that worked: perf alone, then gates. The parallel scouts
  were not my dispatch and pushed perf's baseline to load 5+; the director
  re-running `e2e:perf` at a quiet moment is what made the gate trustworthy.
- Time: Phase 1 ~15 min, Phase 2 ~5 min, Phase 3 ~40 min (mostly waiting
  on perf, ~25 min), Phase 4 ~10 min.
- Sprint 2 candidates: #68 and #69 (each raised by product-review and the
  director's walk independently), technical-artist's gate, #61 after the
  look-dev survey of glass.
- Lesson for Phase 2: do not ship a specialist's prompt/notes in the
  director's sprint PR while that specialist may be running elsewhere —
  every such run then conflicts with main.
