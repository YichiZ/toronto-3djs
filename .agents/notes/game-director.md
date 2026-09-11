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
