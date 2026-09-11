# Product review notes

Append-only log. No runs yet.

## Run 1 — 2026-09-11 (branch claude/product-review-prompt-89d498)

Driver: .agents/notes/product-review.driver.mjs -> product-review/*.png + log.json.

### Phase 1 — first sixty seconds
- Intro card is a 13-row controls table; "Click to walk" is obvious, but only
  WASD + mouse matter in minute one (01-cold-open).
- Spawn (front-bay-west) faces the Monument to Multiculturalism plinth, which
  renders as a pale translucent box; 2.5 s of W walks face-first into it (05, 06).
- Two look-alike selects, "Jump to…" and "Go to…", side by side (01).
- Place label badges REFERENCE / INFERRED and "252° WSW true" read as dev jargon.
- Perf counter (fps / calls / tris) is on screen for visitors.

### Phase 2 — routes (orientation / control / readability / place / delight)
- R1 Front&Bay -> Great Hall -> York Concourse -> street: 2/3/3/4/3.
  Forecourt is the best frame in the build (07). Great Hall is labelled
  "Union Station east and west wings" (09). York Concourse is an empty grey
  box (11). E from the concourse lands facing a blank wall, guide 87 -> 141 m (13, 14).
- R2 street -> PATH -> up: 2/3/2/2/2. Guide says 241 m to a corridor ~10 m
  below (15). Arrival frame is a grey void with a pedestrian's back (16).
  E up works, lands at RBP (18).
- R3 SkyWalk: 3/2/4/4/4. Strong place read (19). Label on entry says
  "Metro Toronto Convention Centre" not SkyWalk.
- Extras: Bay underpass and Lake Shore under Gardiner read well (22, 26);
  HHOF viewpoint cranes up at a corner pier from 6 m (24).
- R4 tour: mid-beat frames pass through solid geometry — beat 2 is a stone
  wall, 3 is shot from inside the facade, 4 "Inside the Great Hall" shows grey
  planes (29-31). Beat 1 caption names the CN Tower; it is out of frame (28).
- R4 tour, beats 7-11: 7 Galleria OK (fps dipped to 36, perf-owned), 8 "HHOF"
  shows Galleria cladding, 9 Bay Street OK, 10 "underpass" wedged by a stone
  mass, 11 "SkyWalk nine metres up" is at ground level (34-38). Cause visible
  from src/ui/tour.js: a caption shows while the camera travels to the NEXT
  knot, on a straight spline through buildings.
- Harness trick: screenshot mid-beat (min(seconds/2, 12) s), not at the
  knot. That is what a visitor watches for most of the tour.
- R4 tour, beats 12-13: 12 "Arena… Postal facade" shows the train platforms;
  13 sunset down Front with the CN Tower is the best frame in the build (39, 40).
  Tour total: 10 of 13 captions mismatched (only 7, 9 and 13 match).
- log.json facts: interactive at 2.1 s; walk 3.4 m/s on every surface;
  SkyWalk walk 17 m / 5 s (movement fine); T starts the tour (294 s);
  0 console errors; 41 "Go to…" destinations.
- Tour end drops the walker at the last knot, 16 m over Front, level chip
  "Gardiner deck" (41). Reference mode: labels pile up and a giant pink
  "ORIGIN · Front & Bay · 0,0" covers the HUD (42).
- Screenshots converted to JPEG q70 before commit (18 MB of PNGs otherwise).
- Harness trick: a parallel Bash `cd` persists; use absolute paths.

### Filed (run 1, label `product`, created this run)
- #67 [P1] tour films the inside of walls; 10/13 captions mismatched
- #68 [P1] first frame opens on the ghosted plinth; first step walks into it
- #69 [P2] interior place label names the wrong place, in jargon
- #70 [P2] concourse and PATH arrival are empty grey boxes
- #72 [P2] level change leaves you facing a wall, goal receding

### Not filed (in PRODUCT_REVIEW.md only) — do not re-raise unless it worsens
- 6 onboarding card and Jump to / Go to look-alikes (P3), 7 HHOF viewpoint
  framing (P3), 8 reference-mode label pile-up and ORIGIN banner (P3).
- Rejected: forecourt lamp post (#28 already nudged), fps dip on tour beat 7
  (perf-owned), arrow keys walk rather than turn (documented), 3.4 m/s walk
  speed (right for the map), "day" time label.

### Update 2026-09-11: the user asked for every finding to be filed
- The "Not filed" findings above are now filed: #78 onboarding card and
  look-alike menus, #79 HHOF viewpoint framing, #80 reference-mode clutter
  (all P3, label `product`). The rejected list stands.

## Run 2 — 2026-09-11 (surfaces run 1 skipped)

Driver: .agents/notes/product-review.driver2.mjs -> product-review/run2/ (JPEG
straight from Playwright, no conversion step). Scope: 15 unvisited viewpoints,
night at 22:30, orbit mode, storefront card, minimap click, all 41 Go-to
destinations, share link, phone (390x844 touch). No tour re-run (#67 open).
Cap: 5 new issues; skip anything already in #67-#80.
- Viewpoints (run2/01-11): good = galleria-interior, bremner-lower-simcoe
  (CN Tower view), the-park-cibc, roundhouse-park. Bad framing = royal-york-
  porte-cochere (on top of the canopy), cn-tower-base (straight up), arena-bay-
  heritage (wall close-up), maple-leaf-square (podium wall); with #79 that is a
  pattern. front-york-east: lamp post dead centre, walk stops at 3.3 m.
  bay-concourse is as empty as York (adds to #70). The Park at CIBC's level
  chip reads "Gardiner deck" for a park over the rail corridor.
- gooderham-flatiron: faces a brick wall 4 m off, labelled "Front Street East
  retail block"; the Flatiron is not in frame (run2/12). 5 of the 15 skipped
  viewpoints are framed on a close wall.
- Orbit (run2/13-15, 20-21): aerials look good; drag + zoom work. Pressing 1
  from orbit drops the walker in a white void near the viaduct at (-125, 65),
  not where they were (run2/22).
- Night 22:30 (run2/16-19): station facade unlit; Great Hall skylight still
  daylight-white; PATH is a grey void at night too (adds to #70).
- Storefront (run2/23-24): hint + F card work; the first of 417 shops is named
  "Quick-service restaurant", and the card shows "massing from block geometry".
- Minimap dot click: lands exactly (missBy 0). Keep.
- Go-to (all 41 from Front & Bay): no-route destinations are the concourses,
  The Park at CIBC and the SkyWalk (straight line only); PATH 241 m already
  covered by #72. Nothing new.
- Share link: my in-page hash change did not reload (harness artefact). In a
  fresh tab #v=great-hall&t=21 works. Lesson: test share links with
  startServer + a new page, not page.goto on the same document.
- Phone 390x844 (run2/28-34): the intro card is keyboard-only (WASD, Shift,
  PgUp, F, M) and the minimap draws over it; after start, the HUD bar covers
  the move stick at bottom-left and the place label truncates. 0 console errors.
