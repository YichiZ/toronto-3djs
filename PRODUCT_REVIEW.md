# Product review — run 1, 2026-09-11

Played cold as a first-time visitor at 1280×800 in headless Chrome, driven by
`.agents/notes/product-review.driver.mjs` (built on `qa/e2eHarness.mjs`).
Screenshots are in `product-review/`; the run log is `product-review/log.json`.

## Executive summary

The street is the product's strength. The Front Street forecourt, the Bay Street
underpass, Lake Shore under the Gardiner and the SkyWalk all read as Toronto
within a second. The build loses visitors in two places: **the cinematic tour**,
its designated showcase, spends most of its 4½ minutes filming the inside of
walls and floors while the captions describe rooms that aren't on screen; and
**the station interior below the street**, where the place label names the
wrong thing, the concourse is an empty grey box, and level changes leave you
facing a blank wall. The first frame also opens on a ghosted plinth that the
first step walks into. Fix the tour and the opening frame first: every visitor
hits both, and neither needs new content.

## Route scores (1–5)

| Route | Orientation | Control feel | Readability | Sense of place | Delight |
|---|---|---|---|---|---|
| 1. Front & Bay → Great Hall → York Concourse → street | 2 | 3 | 3 | 4 | 3 |
| 2. Street → PATH → back up | 2 | 3 | 2 | 2 | 2 |
| 3. SkyWalk across the tracks | 3 | 3 | 4 | 4 | 4 |
| 4. Tour, then reference toggle | 1 | n/a | 1 | 3 | 3 |

## Findings, ranked by visitor impact × reach

### 1. The tour films the inside of walls, and the captions describe rooms that aren't in frame — P1, M · #67
- **What a visitor sees:** press Tour; captions say "Dropping onto the
  promenade", "The colonnade", "Inside the Great Hall… the carved frieze",
  "Down to the York Concourse", "Into the PATH… no daylight anywhere", while
  the frame is, in order, a stone wall, the facade from inside at a tilt,
  abstract grey planes, a PATH corridor, and the street seen from under the
  ground with blue sky above. Later, "Front and Yonge… 1885 Bank of Montreal"
  shows the Galleria's dark cladding, "Under the viaduct on Bay" is wedged
  against a stone mass, "The SkyWalk, nine metres up" is at ground level under
  the train shed, and "Scotiabank Arena… the Postal Delivery facade" shows the
  train platforms. Beat 1 still names the CN Tower, which is out of frame.
  When the tour ends, you're dropped into walk mode where the camera stopped,
  16 m above Front Street, with the level chip reading "Gardiner deck"
  (`41-r4-tour-end`, log `r4:tour-ended`). The Gardiner is over Lake Shore,
  not Front.
- **Evidence:** `28`–`40` (`r4-tour-1…13`), each taken mid-beat. Only beats 7
  (Galleria), 9 (Bay Street) and 13 (sunset) match their captions.
- **Why it matters:** the tour is the hands-off way to see the build and the
  one path a non-gamer takes. Ten of its thirteen captions describe something
  that isn't on screen, so the showcase reads as broken, even though its
  closing sunset (`40`) is the best frame in the build.
- **Direction:** each caption shows while the camera is still *travelling* to
  the next stop, and the straight line between stops cuts through buildings.
  Hold on each hero frame while its caption is up, and route between interior
  stops through doorways and stairs, or cut (fade) rather than fly through
  solid ground. End the tour back on the street where it started. Related to
  closed #25 (beat 1 only).

### 2. The first frame opens on a ghosted plinth, and the first step walks into it — P1, S · #68
- **What a visitor sees:** after the controls card, the view is dominated by a
  pale, semi-transparent box (the Monument to Multiculturalism plinth) dead
  ahead, with "CONCOU…" signage cropped at the left. Holding W for 2½ s ends
  nose-to-stone, with the plinth filling the screen.
- **Evidence:** `01-cold-open`, `03-after-first-click`, `05`/`06-r1-front-bay`.
- **Why it matters:** 100% of visitors get this frame, and the first thing
  they try (walk forward) is blocked. The translucency reads as a rendering bug.
- **Direction:** open on a frame with a clear walkable line and Union Station
  as the hero; the forecourt viewpoint (`07`) already does this. Make the
  plinth read as solid stone. Follows on from closed #23.

### 3. Inside the station, the place label names the wrong place, in jargon — P2, S · #69
- **What a visitor sees:** standing in the Great Hall, the label reads "Union
  Station east and west wings · INFERRED · street". Entering the SkyWalk it
  reads "Metro Toronto Convention Centre". During the concourse beat it reads
  "PATH". Every label carries REFERENCE / INFERRED / APPROXIMATED badges and a
  "252° WSW true" line.
- **Evidence:** `09-r1-great-hall`, `19-r3-skywalk`, `32-r4-tour-5-concourse`, `01`.
- **Why it matters:** the label is how a visitor confirms they've arrived.
  In the building's most famous room it says something else; the badges are
  provenance metadata a visitor can't act on.
- **Direction:** when you're inside a named room (Great Hall, a concourse, the
  SkyWalk), that room wins over the building it sits in. Move confidence
  badges and the true bearing to reference mode. Distinct from closed #10
  (street-side labels).

### 4. Below the street, the spaces are empty grey boxes — P2, L · #70
- **What a visitor sees:** the York Concourse is a bare grey room: no gates,
  departure boards, signage, people or trains (`11`, `12`). Arriving in the
  PATH shows a flat grey void with a pedestrian's back filling the frame (`16`)
  before the corridor appears.
- **Evidence:** `11`/`12-r1-york-concourse`, `16-r2-path-corridor`.
- **Why it matters:** CLAUDE.md makes the three concourses a product
  requirement; right now they are the least Toronto-feeling spaces in the build,
  and the PATH arrival looks like a failure to load.
- **Direction:** procedural wayfinding (GO/VIA gate signs, departure-board
  slabs, the platform stair banks) and a crowd in the concourse. Stand the PATH
  viewpoint where the corridor is already in view and no pedestrian spawns on
  the camera. (Perceived stream-in delay is perf's; noted only as impact.)

### 5. Changing level leaves you facing a wall, farther from where you were going — P2, M · #72
- **What a visitor sees:** in the York Concourse with "Go to Front & York"
  set (87 m), pressing E lands facing a blank stone wall, and the guide jumps
  to 141 m (`13` → `14`). From Front & Bay, "Go to PATH corridor under Bay"
  says 241 m for a corridor roughly 10 m below the visitor's feet (`15`).
- **Evidence:** `13-r1-guide-back-to-street`, `14-r1-level-up`, `15-r2-guide-to-path`.
- **Why it matters:** level change is how you move between the street, the
  PATH and the concourses; landing disoriented with the goal receding breaks
  trust in both the level keys and the guide.
- **Direction:** after a level change, face the visitor along the walkable
  direction (or toward the active destination) and land them on the stair or
  exit they would have used. Have the guide point to the nearest way down
  rather than a long street detour.

### 6. Onboarding is a wall of text, with two look-alike menus — P3, S · #78
- **What a visitor sees:** a 13-row controls card, of which only WASD + mouse
  matter in the first minute; "Jump to…" and "Go to…" dropdowns side by side
  with no hint of the difference; an fps/draw-call counter on screen.
- **Evidence:** `01-cold-open`, `03-after-first-click`.
- **Direction:** lead with move and look, and reveal the rest in context (level
  keys the first time you stand near a stair). Rename to "Teleport to…" and
  "Guide me to…". Hide the counter outside reference mode or a debug flag.

### 7. The Hockey Hall of Fame viewpoint cranes up at a corner pier from 6 m — P3, S · #79
- **Evidence:** `24-x-hhof`. The street roofline and the building can't be
  read from here. **Direction:** step the viewpoint back across Front and
  level the gaze.

### 8. Reference mode is a wall of overlapping labels, with a giant banner over the HUD — P3, S · #80
- **What a visitor sees:** press R and dozens of labels stack on top of each
  other across the skyline, while a huge pink "ORIGIN · Front & Bay · 0,0"
  runs across the lower third, over the HUD bar (`42-r4-reference-on`).
- **Why it matters:** fewer visitors reach this, but those who do are exactly
  the people checking provenance, and they can't read any of it.
- **Direction:** declutter by distance and screen overlap, and keep the
  origin marker small and in world space, clear of the HUD.

## Run 2 — surfaces run 1 skipped (2026-09-11)

Covered 15 unvisited viewpoints, night at 22:30, orbit mode, a storefront card,
a minimap click, all 41 Go-to destinations, a share link, and a 390×844 touch
pass. Evidence is in `product-review/run2/`. No console errors on desktop or
phone.

### 9. Jump-to landmarks open on a wall or a lamp post — P2, S–M · #82
Porte-cochère, CN Tower base, Arena Bay elevation, Maple Leaf Square and
Gooderham Flatiron are each framed on a close wall. Front & York has a lamp
post dead centre (`run2/03`, `06`, `08`, `10`, `12`, `04`). Same pattern as #79.

### 10. On a phone, the HUD covers the move stick, and the intro teaches keys you don't have — P2, M · #83
The keyboard-only intro has the minimap drawn over it, and the HUD bar sits
on the move stick (`run2/28`, `29`, `31`).

### 11. Orbit → Walk drops you in a white void near the viaduct — P2, S · #84
`run2/22`.

### 12. At night the station facade goes dark, and the Great Hall skylight stays white — P3, M · #85
`run2/16`–`18`. Technical-artist lane.

Added to existing issues: an empty Bay Concourse and a night PATH void → #70;
"Gardiner deck" at The Park at CIBC and the Gooderham label → #69.

## Working well, keep
- **Allen Lambert Galleria interior:** the steel-tree vault, framed on the
  Hockey Hall of Fame (`run2/02`).
- **Aerial orbit viewpoints**, and orbit drag and zoom (`run2/13`, `20`, `21`).
- **Bremner & Lower Simcoe's CN Tower view, The Park at CIBC, and the Roundhouse**
  (`run2/07`, `09`, `11`).
- **Minimap dot-click teleport:** lands exactly.
- **Share links:** `#v=great-hall&t=21` opens in a fresh tab on the Great Hall
  at 21:00.
- **Storefront hint and the F card** (`run2/23`, `24`).
- **Tour finale, sunset down Front Street:** the CN Tower against an orange sky,
  the Royal York and the gold RBP framing the canyon. The build's money shot (`40`).
- **Union Station forecourt:** the lettering, the colonnade and the "Front Street
  entrance" tag are the strongest frame in the build (`07`).
- **SkyWalk:** arched roof, trains below and Front Street to the left; it reads
  instantly (`19`).
- **Bay Street underpass and Lake Shore under the Gardiner:** correct and
  atmospheric; the Gardiner is over Lake Shore, per the invariant (`22`, `26`).
- **Minimap route line, and the guide's "Arrived" state** (`14`, `16`).
- **E from the PATH:** lands on the street at Royal Bank Plaza, next to a
  café (`18`).
- **The Galleria's steel trees** read clearly in the tour (`34`).

## Considered, not worth it
- **Forecourt lamp post:** still in frame after #28's nudge, but it no longer
  blocks the view.
- **fps dip to 36 on tour beat 7:** perf-owned (#60–#62); product impact only.
- **Arrow keys walk rather than turn:** documented as walk in the README;
  mouse is look.
- **"18:40 · day" time label:** fine in June; not worth a finding.
- **Walk speed 3.4 m/s** (8.5 m per 2.5 s on every surface): brisk for a
  person, but right for a 1 km map with teleports. Keep.
- **Keyboard works before the pointer is captured** (4.9 m walked before the
  first click), so a visitor who ignores the card isn't stuck.
- **Generic shop names ("Quick-service restaurant"):** deliberate. The build
  never shows a brand it hasn't verified (`src/data/tenants.js` honesty note).
- **Go-to destinations with no walking route** (concourses, SkyWalk, The Park
  at CIBC): known gaps in the walking network; the straight-line arrow still
  guides.
- **"UNION STATION" band on the entablature:** already handed to the historian
  in SPRINT.md; not re-filed here.

## Run notes
- World interactive 2.1 s after page load (dev server, headless Chrome).
- Console errors during the whole run: none.
- `T` starts the tour; it ran 294 s. R toggles reference mode on and off cleanly.
- 41 destinations in "Go to…".
