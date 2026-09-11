# FINAL QA REPORT
### Union Station / downtown Toronto digital twin

Generated 2026-09-03 by `npm run qa`.
Static checks run against the source and the geospatial database; runtime figures
come from a live page capture (`node qa/capture.mjs`).

---

## Reconstruction boundary

| | |
|---|---|
| north | King Street West / King Street East |
| south | Lake Shore Boulevard West, with the Gardiner deck above |
| west | Lower Simcoe Street, extended to John Street for the Rogers Centre |
| east | Church Street |
| highest-fidelity core | Front Street York→Yonge, the Union Station block, the Royal York block, Bay Street Front→King |
| grid rotation applied | 16.7° west of true north |
| Front Street true bearing | 73.3° |
| world origin | Front & Bay, 43.645727 N 79.379287 W |

---

## Counts

| what | count |
|---|---|
| buildings in the database | 59 |
| — reconstructed by a dedicated landmark module | 24 |
| — built by the generic façade builder | 35 |
| streets reconstructed as full streets | 13 |
| named intersections | 16 |
| rail underpasses | 4 |
| identified tenants | 90 |
| — verified as long-standing anchors | 40 |
| — uncertain (see below) | 50 |
| interactive frontages | 417 |
| full interiors | 12 |
| metres of PATH reconstructed | 675.4 |
| PATH segments | 8 |
| reference viewpoints | 24 |
| screenshot comparison passes | 24 |
| registered scene entities | 234 |

### Building confidence grades

| grade | buildings |
|---|---|
| reference | 25 |
| inferred | 5 |
| approximated | 29 |

---

## Runtime performance

| metric | value |
|---|---|
| average FPS | 156.4 |
| triangles | 1562402 |
| draw calls | 1949 |
| geometries resident | 1975 |
| textures resident | 211 |
| programs compiled | 269 |
| pedestrians | 902 |
| vehicles | 158 |
| trains | 5 |

---

## Hallucination-trap audit

Each check reads the module that would contain the mistake and asserts the
mistake is absent, or that the correct thing is present. A check whose file is
missing reports `skipped`, never `pass`.

| check | status | detail |
|---|---|---|
| `no-streetcar-on-front` | **pass** | streetcar references are confined to the Bay Street tunnel, the Union Loop and King Street |
| `no-catenary` | **pass** | no catenary, pantograph or contact wire geometry anywhere in the runtime |
| `gardiner-over-lakeshore` | **pass** | deck is positioned off EW.lakeShore only |
| `exterior-entablature-railway-names` | **pass** | entablature carries incised railway names, no city names |
| `great-hall-frieze-interior` | **pass** | interior frieze carries 9 destination names |
| `hhof-dome-is-interior` | **pass** | exterior shows a plain skylight enclosure; the dome is in the interior module |
| `four-underpasses-lower-simcoe` | **pass** | four underpasses, and Simcoe exists only as Lower Simcoe south of Front |
| `arena-heritage-facades` | **pass** | heritage facades on both elevations with bas-relief panels |
| `park-not-rail-deck-park` | **pass** | the elevated park is named as The Park at CIBC SQUARE |
| `three-distinct-concourses` | **pass** | York, Bay and VIA concourses registered as separate spaces at concourse level |
| `grid-rotation-applied` | **pass** | Front Street bears 73.30 deg true, 16.7 deg off the axis |
| `no-shared-material-mutation` | **pass** | no module writes render state onto a shared material; overrides go through variant() |
| `sourced-tower-figures` | **pass** | 5 towers match their cited height and storey count |
| `no-external-assets` | **pass** | no loaders, no fetches, no remote URLs - every texture is generated in-process |

---

## Geometric QA

No findings. No building stands in a roadway, no two footprints overlap outside the documented podium/deck cases, every intersection lies on a real centreline pair, and the geo transforms round-trip.

Orientation cross-check: the CN Tower stands **597 m** from Union
Station's Front Street entrance on a true bearing of **237.8°** — the brief's
stated cue is roughly 600 m near 240–250°.

---

## Reference viewpoints

24 named viewpoints in `src/data/references.js`, each with a position, a
look-at target and a description of what a photograph from that spot would show.
None stands inside a solid building footprint, none frames a point less than 2 m away, and the SkyWalk interior viewpoint the brief asks for is present.

---

## Registry integrity

- **info** `landmark-registered-dynamically` — "royal-bank-plaza-s" is registered through a computed id rather than a literal; verified present in the source but not statically provable here
- **info** `landmark-registered-dynamically` — "royal-bank-plaza-n" is registered through a computed id rather than a literal; verified present in the source but not statically provable here
- **info** `landmark-registered-dynamically` — "td-canada-trust-tower" is registered through a computed id rather than a literal; verified present in the source but not statically provable here
- **info** `landmark-registered-dynamically` — "bay-wellington-tower" is registered through a computed id rather than a literal; verified present in the source but not statically provable here

---

## Tenant verification coverage

**40 of 90** identified tenants (44%) are graded
`reference` — long-standing anchors stable across years. The rest are listed
below. Downtown ground-floor retail turns over on a scale of months, so the
reconstruction renders a **generic category word** rather than a wordmark for any
frontage the census did not verify. That is a deliberate honesty rule, not a gap
in the modelling.

### Known uncertain tenants

| tenant | building | grade | note |
|---|---|---|---|
| Pilot Coffee Roasters | `union-station` | inferred | Union Station kiosk; operator stable since the revitalisation. |
| Danish Pastry House | `union-station` | inferred | — |
| Shoppers Drug Mart | `union-station` | inferred | — |
| LCBO | `union-station` | inferred | — |
| Cinnabon | `union-station` | approximated | — |
| Tim Hortons | `union-station` | inferred | — |
| Union Station Market | `union-station` | inferred | — |
| Amano Pasta | `union-station` | inferred | — |
| REIGN Restaurant + Bar + Bakery | `royal-york` | inferred | Occupies the former Epic space on the Front Street frontage. |
| Clockwork Champagne & Cocktails | `royal-york` | inferred | — |
| Royal York gift shop | `royal-york` | approximated | — |
| Cafe | `royal-york` | approximated | — |
| Fairmont Royal York York Street entrance | `royal-york` | inferred | — |
| Brookfield Place concourse retail | `allen-lambert-galleria` | inferred | — |
| Aroma Espresso Bar | `allen-lambert-galleria` | approximated | — |
| Kupfert & Kim | `allen-lambert-galleria` | approximated | — |
| GoodLife Fitness | `allen-lambert-galleria` | inferred | — |
| e11even | `maple-leaf-square-w` | inferred | — |
| Flatiron & Firkin | `gooderham-flatiron` | inferred | — |
| Cafe | `cibc-square-81` | approximated | — |
| Ripley's gift shop | `ripleys-aquarium` | inferred | — |
| Against the Grain Urban Tavern | `rogers-centre` | inferred | — |
| The Rec Room | `john-st-roundhouse` | inferred | — |
| MTCC box office | `mtcc-north` | inferred | — |
| Convention centre cafe | `mtcc-north` | approximated | — |
| Horizons Restaurant | `cn-tower` | inferred | — |
| Le Cafe | `cn-tower` | inferred | — |
| CN Tower gift shop | `cn-tower` | inferred | — |
| Royal Bank Plaza concourse retail | `royal-bank-plaza-s` | inferred | — |
| Cafe | `royal-bank-plaza-s` | approximated | — |
| GoodLife Fitness | `bay-wellington-tower` | inferred | — |
| TD Canada Trust branch | `td-canada-trust-tower` | inferred | — |
| TD Bank branch | `td-tower` | inferred | — |
| Hotel lobby | `front-w-hotel-1` | approximated | — |
| Cafe | `front-w-hotel-1` | approximated | — |
| Convenience | `front-w-hotel-1` | approximated | — |
| Pub | `front-w-retail-2` | approximated | The Front Street West blocks between York and Simcoe are dense with pubs and casual dining; the individual operators were not verified. |
| Quick-service restaurant | `front-w-retail-2` | approximated | — |
| Sports bar | `front-w-retail-2` | approximated | — |
| Restaurant | `one-front-e-block` | approximated | — |
| Cafe | `one-front-e-block` | approximated | — |
| Bank branch | `one-front-e-block` | approximated | — |
| Convenience | `one-front-e-block` | approximated | — |
| Ground-floor retail | `berczy-tower` | approximated | — |
| Cafe | `berczy-tower` | approximated | — |
| Residential lobby | `l-tower` | inferred | — |
| Office lobby | `one-york` | inferred | — |
| Cafe | `one-york` | approximated | — |
| Cafe | `cibc-square-141` | approximated | — |
| The Esplanade restaurants | `meridian-hall-esplanade` | approximated | — |

---

## Remaining known discrepancies

- Draw calls peak at 1949 on the aerial establishing viewpoint, above the 1800 budget. Every street-level viewpoint is inside it (median 1516).
- The absolute geo anchor is a hypothesis. Block spacing and street widths are authored in metres and internally consistent; an anchor error offsets the scene rigidly rather than distorting it.
- The CN Tower stands 597 m from Union Station's Front Street entrance on a true bearing of 238 deg; the brief states 'roughly 600 m, near 240-250 deg'.
- Berczy Park sits just north-east of its real position inside the Front/Wellington/Church wedge - the Gooderham footprint leaves no room immediately east of it.
- PATH traversal, measured by walking each segment end to end: all eight now run 100%. Before this work only one did - junctions were walled off, the forecourt stair shafts were driven across the corridors they land in, the subway mezzanine straddled the Bay Street run's centreline and the Hockey Hall of Fame's galleries sat on the Brookfield-Yonge spine.
- Pedestrians do not collide with the player. They are instanced and non-reactive, so a solid crowd stalled the walker at random - a 14 s promenade walk covered 18 m one run and 40 m the next purely on who was standing there.
- Pedestrians are not skinned; crossing waits are random rather than tied to the vehicle signal phase. Vehicles do not turn at intersections.
- Vegetation is late spring / summer foliage only.
- 675 m of PATH is reconstructed - the spine only. The real network is roughly 30 km citywide.
- Three review passes fixed 21 defects. The most serious: walk mode never moved (a hand-built Raycaster with no camera throws inside THREE.Sprite.raycast, swallowed by the frame loop); a shared material mutated to BackSide flipped the global ground plane so the walker fell 6.7 m through the street; a zero-height viewport made the camera projection NaN, killing rendering and picking silently; and the PATH's junctions were walled off, so the 'network' was eight disconnected tubes.
- Walking costs about 13 fps on the densest block (105 idle vs 92 moving, measured on the Union Station forecourt) - the collision raycasts against the full scene. A dedicated collision layer would recover it.
- `union-station` — Head house runs 229 m west from Bay and stops short of York; plaza and vehicle ramps fill the gap. Only the train shed spans the full Bay-York block.
- `union-trainshed` — Bush-type shed with the glass atrium roof over the centre bays. Not electrified - GO, VIA and UP Express run diesel here.
- `royal-york` — Directly across Front Street from the station, north side. Chateau-style green copper roof.
- `royal-bank-plaza-s` — Triangular plan, gold-fused glazing. 71 kg of gold in the curtain wall.
- `royal-bank-plaza-n` — The original open atrium between the two towers was built over in the 1990s.
- `td-canada-trust-tower` — CORRECTION to the brief: 161 Bay is the SOUTHERN and TALLER Brookfield tower (Bay addresses rise northward from the lake). The brief calls it "the north tower".
- `bay-wellington-tower` — Named for the Bay/Wellington corner it occupies - the northern tower of the pair.
- `allen-lambert-galleria` — Santiago Calatrava. Eight pairs of white parabolic steel tree supports, glazed roof, six floors tall.
- `hockey-hall-of-fame` — Former Bank of Montreal, NW corner of Front and Yonge, Ohio freestone. The stained-glass dome is INTERIOR; from the street the roofline reads as a plain skylight enclosure. Only the Esso Great Hall is in this building - the rest of the museum is in the Brookfield concourse behind and below.
- `brookfield-heritage-facades` — Commercial Bank of the Midland District (1845) and neighbouring bank fronts, dismantled and rebuilt into the Galleria wall.
- `scotiabank-arena` — Not a freestanding bowl: incorporates the 1941 Art Deco Toronto Postal Delivery Building facades and Louis Temporale bas-reliefs on BOTH the Bay Street and Lake Shore Boulevard elevations.
- `cibc-square-81` — Podium holds the replacement GO bus terminal.
- `the-park-cibc` — The elevated park bridging the tracks. NOT Rail Deck Park, which was a separate, larger City proposal further west, cancelled in 2021.
- `maple-leaf-square-w` — Height and storeys unverified: published figures conflict (40/44, 49 and 65 storeys; 181-186 m).
- `maple-leaf-square-e` — Shared podium with the public square and its outdoor screen faces the arena. Height and storeys unverified: published figures conflict.
- `cn-tower` — Main pod 342-351 m, SkyPod 447 m, antenna to 553.33 m. Roughly 600 m from Union Station on a true bearing near 245 deg - the strongest orientation cue in the scene.
- `rogers-centre` — Retractable roof: three moving panels plus one fixed, parked stacked over the north side when open.
- `ripleys-aquarium` — Low wave-form roof at the foot of the CN Tower, east side.
- `john-st-roundhouse` — 32-bay curved roundhouse in Roundhouse Park, with the surviving turntable to its north. The record was moved south and the arc trimmed so the turntable pit, which must sit at the centre of the bay arc, clears the Bremner roadway.
- `mtcc-north` — Built over the rail corridor. The SkyWalk connects it east to Union Station.
- `mtcc-south` — Largely sunk below the Bremner sidewalk behind a glazed entrance pavilion; only part of the section reads above grade.
- `meridian-hall` — Formerly the O'Keefe Centre and the Sony Centre. Cantilevered canopy over the Front Street entrance.
- `gooderham-flatiron` — Wedge plan at the Front/Wellington/Church convergence, rounded west prow, red brick with a copper turret.
- `l-tower` — Daniel Libeskind curve; reconstructed here as a tapered slab. Height and storeys verified; the footprint is not.
- `first-canadian-place` — Skyline anchor just beyond the King Street boundary; white marble replaced with glass 2011-13.
- `scotia-plaza` — Napoleon red granite cladding.
- `td-tower` — Mies van der Rohe black steel and bronze glass.
- `td-south-tower` — Height, storeys and year verified; the footprint is not.
- `ritz-carlton` — Height and storeys verified; the footprint is not.

---

## Verdict

**PASS** — 0 warning(s), no errors.



