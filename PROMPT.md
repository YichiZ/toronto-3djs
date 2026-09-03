# AUTONOMOUS BUILD PROMPT — PHOTOREALISTIC INTERACTIVE DOWNTOWN TORONTO / UNION STATION DIGITAL TWIN

Build a complete, high-quality, interactive **3D reconstruction of Union Station, Toronto and its immediately surrounding downtown blocks**.

This is not a toy scene and not a handful of representative buildings.

The goal is to create a convincing **browser-scale urban digital twin** where a user can walk along Front Street, recognize the real streets and buildings, see the actual storefronts and station entrances, enter the Great Hall, descend into the PATH, watch pedestrians and vehicles move through the environment, and immediately recognize the location as present-day downtown Toronto.

The shipped runtime must use:

**Three.js only.**

You may use **BPL / Blender Python Library as an offline procedural asset-generation and reconstruction tool**, but Blender must not be part of the runtime.

The final deliverable must run as a Three.js web application.

---

# PRIMARY EXPERIENCE

When the application loads, the viewer should immediately see:

**Union Station and the Front Street canyon.**

The reconstruction should include the station, its forecourt and its interiors, plus a surrounding area large enough that the environment feels like a real downtown rather than an isolated landmark floating in space.

The reconstruction boundary is the box:

```text
north   King Street West / King Street East
south   Lake Shore Boulevard West, including the Gardiner deck above it
west    Lower Simcoe Street, extending to John Street for the Rogers Centre
east    Church Street
```

Within it, the highest-fidelity core is **Front Street from York to Yonge**, the Union Station block, the Royal York block, and **Bay Street from Front north to King** — which is the final walkthrough's approach route.

Streets that must be reconstructed as full streets:

* **Front Street West / Front Street East** — the spine
* **Bay Street**, **York Street**, **Yonge Street**
* **Wellington Street West**
* **Bremner Boulevard**
* **Lake Shore Boulevard West**

The scene must prominently include accurate representations of major anchors such as:

* Union Station (exterior, forecourt, Great Hall, concourses, train shed)
* Fairmont Royal York
* CN Tower
* Brookfield Place and the Allen Lambert Galleria
* Hockey Hall of Fame
* Royal Bank Plaza
* Scotiabank Arena
* CIBC Square and The Park at CIBC SQUARE
* Metro Toronto Convention Centre and the SkyWalk
* Rogers Centre
* Ripley's Aquarium of Canada
* Roundhouse Park / John Street Roundhouse
* Maple Leaf Square
* the rail viaduct and its street underpasses
* the PATH below-grade network
* hotels, restaurants, street-level retail
* transit infrastructure
* sidewalks, intersections, street furniture

**Hockey Hall of Fame** must be reconstructed at its real location: **30 Yonge Street**, at the northwest corner of **Front and Yonge**. Its Esso Great Hall occupies the former Bank of Montreal building (1885); the rest of the museum — and the visitor entrance — sits in the Brookfield Place concourse behind and below it.

**Union Station** must be reconstructed at **65 Front Street West**. The head house runs west from **Bay Street** for roughly 229 m along Front and stops short of **York Street** — plaza and vehicle ramps fill the gap. Only the train shed spans the full Bay–York block. The Front Street colonnade has 22 unfluted Roman Tuscan Bedford limestone columns roughly 12 m tall; the entablature above carries incised railway names, **not** city names.

**Brookfield Place** must be reconstructed on the block bounded by Bay, Front, Yonge and Wellington — Bay Wellington Tower at **181 Bay Street**, the north tower at **161 Bay Street** — including Santiago Calatrava's Allen Lambert Galleria and the two reassembled heritage bank façades.

Do not treat these as generic boxes with logos.

They should be recognizable architectural spaces.

---

# CORE QUALITY TARGET

The result should look substantially closer to:

> an explorable Google Earth / AAA open-world urban block

than:

> a procedural Three.js city demo.

A person familiar with downtown Toronto should be able to orient themselves without a minimap.

They should recognize:

* the Union Station colonnade
* the Royal York's green copper roof across the street
* the CN Tower's position and bearing on the skyline
* the gold glass of Royal Bank Plaza
* building silhouettes
* street widths
* the rail viaduct and its underpasses
* storefront ordering
* intersections
* architectural façades
* prominent signs
* entrances
* major interior spaces
* the vertical layering of PATH / street / rail deck / Gardiner
* recognizable surrounding structures

---

# REFERENCE-GATHERING PHASE

Before writing significant scene code, perform a dedicated reconstruction phase.

Use multiple parallel research agents.

Use public web resources, official building and transit pages, public photographs, available maps, and Google Earth / Google Maps / Street View as **visual and spatial references**.

Toronto additionally publishes usable open geospatial data. Prefer it over eyeballing where it exists:

```text
City of Toronto Open Data — 3D Massing
City of Toronto Open Data — Topographic Mapping – Building Outlines
City of Toronto Open Data — Toronto Centreline (TCL)
City of Toronto Open Data — Sidewalk Inventory
City of Toronto Open Data — the street-furniture family (Bench, Litter Receptacle,
                            Transit Shelter, Poster Board, Publication Structure,
                            Information Pillar – Wayfinding Structure, and others —
                            these are ~9 separate datasets, not one)
Bike Share Toronto — GBFS feed, live rather than static portal geometry
OpenStreetMap — building footprints, heights, transit, PATH segments
```

Verify the licence terms of anything you ingest and record them in the reference inventory. The Open Government Licence – Toronto permits use with attribution; record the attribution. **OpenStreetMap is ODbL 1.0 with share-alike** — deriving a shipped database from it carries obligations the City data does not. Reconstruct from OSM rather than redistributing it, and keep the provenance traceable.

**Every figure in this brief — dimension, count, height, distance, date, address, dataset title — is a starting hypothesis, not ground truth.** They were written from reference, not from survey. Verify each before building on it, and correct this document where you find it wrong.

Do not blindly hallucinate geography.

Do not extract, redistribute, or ship proprietary Google Earth 3D meshes or textures.

Instead:

1. inspect real-world imagery;
2. cross-check against open geospatial data;
3. infer geometry;
4. reconstruct it procedurally or through custom authored assets;
5. independently verify the reconstruction against multiple views.

Treat Google Earth as a **ground-truth visual reference**, not as an asset package.

Where a brand mark or wordmark is needed for architectural recognition, reconstruct it as original vector geometry sized and placed from photographic reference. Do not ship scraped brand asset packages.

---

# KNOWN HALLUCINATION TRAPS

An agent that "knows Toronto" from stereotypes will get these wrong. Verify every one against imagery before building it.

* **Front Street has no surface streetcar track** — within this boundary no streetcar track runs along Front or crosses it. The Harbourfront and Spadina cars reach Union through the **Bay Street streetcar tunnel** into the **underground Union Station Loop**, entirely below grade. Which route numbers actually terminate at Union shifts with the TTC board period and with diversions, so check the current one before placing any car. Do not lay rails down Front Street because "Toronto has streetcars."
* **The rail corridor is elevated on a viaduct.** Four streets pass *underneath* it: Bay, York, Yonge and **Lower Simcoe** — the last through the Simcoe Street Tunnel, opened 2009. **Simcoe Street itself ends at Front** and becomes Lower Simcoe south of it; do not draw Simcoe through the corridor. Platforms sit above concourse level.
* **The corridor is not electrified.** GO, VIA and UP Express are diesel here, and catenary does not fit under the heritage train shed. Do not string wire.
* **The Gardiner Expressway is elevated over Lake Shore Boulevard, south of the rail corridor** — not over Front Street.
* **The downtown grid is rotated roughly 16.7° west of true north** — measured street bearings run 16–18°. It follows the original township survey (Augustus Jones, 1793–97), laid parallel to the Lake Ontario shoreline; magnetic declination is not the cause. Do not build it axis-aligned to true north; sun angles, shadow direction and the sunset alignment down the street canyons all depend on this.
* **The CN Tower is roughly 600 m west-southwest of Union Station**, on a true bearing near 240–250°. It is not adjacent, not north, and is very easy to mis-scale. Its position on the skyline is the single strongest orientation cue in the scene.
* **The carved frieze of Canadian destinations is inside the Great Hall, not on the façade.** The Front Street entablature carries incised railway names only. Carving city names onto the exterior is the single most likely error in this build.
* **The Hockey Hall of Fame's stained-glass dome is interior.** From the street the roofline shows a plain skylight enclosure above carved Ohio freestone façades. Do not model an exterior dome.
* **Only the Esso Great Hall occupies the 1885 bank building.** The bulk of the Hockey Hall of Fame's ~50,000 sq ft sits in the Brookfield Place concourse behind and below it — it is neither a standalone modern museum nor a museum filling the bank.
* **Scotiabank Arena is not a freestanding bowl.** It incorporates the 1941 Art Deco Toronto Postal Delivery Building façades and their Louis Temporale bas-reliefs on **both** the Bay Street and Lake Shore Boulevard elevations.
* **"The Park at CIBC SQUARE" is the elevated park over the tracks.** *Rail Deck Park* was a separate, larger City proposal further west, cancelled in 2021. Do not conflate them.
* **Union Station's Great Hall and its concourses are different spaces at different levels.** There are three concourses — **York**, **Bay** and **VIA** — and none of them is the Great Hall.
* **The Fairmont Royal York is directly across Front Street from the station, on the north side.**
* Do not place a coffee chain on every corner. The census agent decides what is there.

Add to this list as reconnaissance discovers more.

---

# PARALLEL RECONSTRUCTION SWARM

The first major phase must use **aggressive parallel subagents**.

Do not have a single agent manually investigate every building.

Launch independent agents for geographic sectors and domains.

## GEO AGENT A — UNION STATION EXTERIOR & FRONT STREET FORECOURT

Research and reconstruct:

* exact head-house footprint — where it meets Bay, where it stops short of York, what fills the gap
* the Front Street colonnade — 22 columns; verify spacing, diameter, height and order
* the entablature above and its incised railway names — **no carved city names on the exterior**
* the east and west wings
* forecourt / pedestrian promenade geometry after the revitalization
* Monument to Multiculturalism (verify its exact placement)
* taxi and passenger pickup geometry
* subway, PATH and streetcar-loop entrances
* curb geometry, bollards, planters, paving patterns
* the Bay Street and York Street elevations

Produce:

* dimensions
* reference images
* object list
* spatial coordinates
* uncertainty notes

---

## GEO AGENT B — NORTH SIDE / FAIRMONT ROYAL YORK & FRONT STREET WEST

Research every visible façade and ground-floor business facing the station.

Record for the Royal York:

* footprint and massing
* storey count and setbacks
* the château roofline, dormers and copper patina
* arched base windows and the porte-cochère
* signage placement
* ground-floor retail and restaurant frontages

Then the same for the Front Street West blocks toward Simcoe, including the Metro Toronto Convention Centre north building and the SkyWalk connection.

---

## GEO AGENT C — EAST / BAY–YONGE, BROOKFIELD PLACE, HOCKEY HALL OF FAME

Reconstruct independently:

* Royal Bank Plaza's two gold-glass triangular towers (south ~180 m, north ~114 m); the original atrium between them was built over in the 1990s
* Brookfield Place massing — Bay Wellington Tower (181 Bay) and the north tower (161 Bay)
* the Allen Lambert Galleria — Santiago Calatrava, six floors, roughly eight pairs of white parabolic steel tree supports, glazed roof
* the reassembled heritage bank façades
* the Bank of Montreal building at Front and Yonge
* Meridian Hall at 1 Front Street East
* the Front/Wellington/Church wedge — Gooderham Flatiron and Berczy Park — where the boundary reaches it

---

## GEO AGENT D — WEST / YORK–SIMCOE, MAPLE LEAF SQUARE, SKYWALK

Prioritize:

* York Street rail underpass
* Maple Leaf Square and its public plaza + outdoor screen
* hotel and condo towers on York and Bremner
* the SkyWalk elevated corridor — exterior **and** interior; reference viewpoint 19 is inside it
* sidewalks, intersections, wayfinding

---

## GEO AGENT E — RAIL CORRIDOR, GARDINER, SCOTIABANK ARENA, CIBC SQUARE

Prioritize:

* the rail viaduct structure, its retaining walls and the street underpass portals
* train shed and the glass atrium roof
* Scotiabank Arena including the preserved postal-building façades and friezes on the Bay and Lake Shore elevations
* CIBC Square towers and The Park at CIBC SQUARE bridging the tracks
* the GO bus terminal at 81 Bay
* the Gardiner Expressway deck and Lake Shore Boulevard beneath

---

## GEO AGENT G — BREMNER SOUTHBANK / CN TOWER

Prioritize:

* CN Tower — base, hexagonal core, main pod, SkyPod; correct height, distance and bearing
* Ripley's Aquarium of Canada
* Rogers Centre and its retractable-roof massing
* Roundhouse Park, the John Street Roundhouse and the turntable
* the Bremner Boulevard streetscape

---

## GEO AGENT F — PATH & BELOW-GRADE NETWORK

Toronto's downtown is a two-level city. Reconstruct:

* PATH segments connecting Union Station, Royal York, Royal Bank Plaza, Brookfield Place, CIBC Square and Scotiabank Arena
* concourse widths, ceiling heights, level changes
* stairs, escalators, elevators
* PATH wayfinding signage and its four-colour letterforms
* retail frontage along the concourses
* the Union subway station and streetcar loop mezzanines

This layer is what makes the reconstruction Toronto rather than generic North American downtown. Do not treat it as optional.

---

## TENANT CENSUS AGENT

Build a current storefront and tenant database.

Walk every street edge, every station concourse and every PATH segment within the reconstruction boundary.

For each visible business determine:

```text
business name
street address or concourse location
business category
building
approximate storefront width
logo/signage
entrance location
window arrangement
open/closed status where verifiable
confidence
source
```

Do not silently invent uncertain businesses. Union Station's retail and the PATH concourses turn over frequently — treat any tenant list older than a year as unverified.

Mark uncertainty.

---

## UNION STATION INTERIOR AGENT

Study the station interiors independently.

Reconstruct recognizable features including:

* the Great Hall — length, width, ceiling height, Guastavino tile vault
* the carved destination frieze naming Canadian cities
* the tall arched windows at the east and west ends
* the ticket-counter wall and departure boards
* the York, Bay and VIA concourses and their level changes
* the "moat" circulation and stairs to platform level
* the train shed, platforms and the glass atrium roof
* the retail promenades and food-hall spaces
* the connection down to the TTC and out to the PATH

Build a simplified but convincing explorable interior across all three levels.

---

## HOCKEY HALL OF FAME AGENT

Study the Hockey Hall of Fame independently.

Reconstruct:

* real entrance position — through the Brookfield Place concourse, with the historic Front/Yonge corner entrance above
* the 1885 bank exterior — carved Ohio freestone, two pedimented façades meeting at a chamfered corner bay; **no dome on the roofline**
* the Esso Great Hall interior under the 45 ft McCausland stained-glass dome
* the trophy display and Lord Stanley's Vault
* artifact display cases and large screens
* interactive game and simulator stations
* the retail store

Reconstruct the zones that actually exist — at the time of writing these include a world-of-hockey zone, a broadcast set, the Montreal Canadiens dressing-room replica, the NHLPA Game Time simulators, a theatre, and the Spirit of Hockey store. Verify the current lineup and its sponsor naming rather than assuming; both change.

---

## BROOKFIELD PLACE GALLERIA AGENT

Study the Allen Lambert Galleria independently.

Reconstruct:

* Santiago Calatrava's parabolic white steel tree-arch structure and its rhythm — roughly eight pairs
* the six-storey height (~26 m) and the length of the arcade (~110–130 m)
* the glazed roof and the light quality it produces
* the two reassembled heritage bank façades, relocated from Wellington Street West
* floor materials and level changes
* retail frontage and the concourse entrances

---

# BPL PROCEDURAL ASSET PIPELINE

Use BPL aggressively for offline asset creation where it improves quality.

BPL should generate reusable high-quality urban components such as:

* windows
* cornices
* façade trims
* doors and revolving doors
* columns, pilasters, capitals
* balconies
* awnings
* storefront frames
* streetlights
* traffic signals — vertical three-section heads with backboards on angled bracket arms, frequently off wooden poles with overhead wiring, plus pedestrian countdown heads. This is unusual hardware for a major city and a strong recognition cue; get it right
* parking meters and Green P signage
* utility boxes
* benches
* tree planters and grates
* signs
* bollards
* litter and recycling bins — Toronto's street-furniture program design
* street barriers and construction hoarding
* bus and streetcar shelters
* Bike Share Toronto docking stations
* TTC subway entrance markers
* GO Transit and PATH wayfinding pylons
* Toronto street-name blades
* retail shelving
* product tables
* display pedestals
* museum vitrines and plinths

Use procedural parameters rather than manually modeling hundreds of nearly identical objects.

Example conceptual interface:

```python
create_storefront(
    width=8.4,
    height=5.2,
    bays=3,
    frame_material="black_metal",
    glazing="clear",
    sign_type="fascia",
)
```

BPL output may be exported as optimized GLB/GLTF.

The browser must load these assets through Three.js.

---

# ASSET GENERATION SUBAGENTS

Launch additional parallel agents.

## BPL ARCHITECTURE AGENT

Build reusable façade modules — Beaux-Arts limestone bays, château hotel bays, Miesian curtain-wall bays, 1980s reflective-glass bays, modern floor-to-ceiling glazing.

## BPL STREET-FURNITURE AGENT

Build:

* lamps
* signs
* hydrants
* bollards
* benches
* bins
* newspaper and publication boxes
* traffic infrastructure
* transit shelters and wayfinding

## BPL RETAIL & EXHIBIT AGENT

Build:

* shelving
* counters
* tables
* display racks
* checkout stations
* product stand-ins
* museum cases, plinths, trophy stands
* kiosk and simulator enclosures

## BPL VEHICLE AGENT

Create optimized vehicle families:

* sedans
* SUVs
* taxis
* rideshare vehicles
* delivery vans
* TTC buses
* GO double-decker coaches
* TTC low-floor streetcars
* GO bilevel train sets and locomotives
* UP Express train sets
* bicycles and Bike Share bikes

## BPL VEGETATION AGENT

Build low-cost but convincing:

* street trees in grates
* planters
* shrubs
* the elevated rail-deck park planting
* Roundhouse Park and Berczy Park greenery

Run these agents simultaneously.

---

# GEOGRAPHIC COORDINATE SYSTEM

Do not place buildings by eye in arbitrary scene coordinates.

Create a consistent geospatial mapping.

Suggested origin — the Front Street entrance of Union Station:

```text
lat  43.6453 N
lon  79.3806 W
```

Verify this and every other coordinate in this brief against real data. Treat the numbers here as starting hypotheses, not ground truth.

Convert:

```text
latitude
longitude
elevation
```

into local Three.js coordinates.

```ts
world = geoToLocal(lat, lon, elevation)
```

Maintain real relative:

* building positions
* street widths
* sidewalk widths
* intersections
* forecourt dimensions
* rail-corridor width and viaduct height
* Gardiner deck height
* PATH depth below grade

**Apply the ~16.7° grid rotation.** The downtown street grid is not aligned to true north, and every shadow, sunset alignment and skyline bearing in the scene depends on getting this right. Verify the exact figure before committing to it.

Downtown Toronto is gently sloped, not dramatic — the land falls southward toward Lake Ontario, whose surface sits near 74 m. The vertical interest here is *layering*, not topography:

```text
PATH concourse      — below grade
street level        — Front, Bay, York, Yonge
rail viaduct deck   — above the street underpasses
platform level      — above the concourses
SkyWalk             — elevated pedestrian
Gardiner deck       — elevated highway
```

Get the layering right and the scene reads as Toronto. Flatten it and it reads as anywhere.

---

# BUILDING RECONSTRUCTION

Buildings must have multiple levels of geometric fidelity.

## LEVEL 1 — MASSING

Correct:

* footprint
* height
* setbacks
* roofline

## LEVEL 2 — FAÇADE STRUCTURE

Add:

* window spacing
* floor divisions
* major columns
* façade bays
* entrances
* cornices

## LEVEL 3 — STREET-LEVEL DETAIL

Street level receives the highest fidelity.

Model:

* storefront glazing
* doors
* awnings
* logos
* display windows
* vestibules
* façade materials
* signage
* lighting
* underpass portals and their tiling, lighting and grime

Humans perceive this environment primarily from street level and concourse level.

Allocate geometry accordingly.

---

# ALL VISIBLE STOREFRONTS

Every storefront directly facing Front Street, and every unit along the reconstructed PATH and station concourses, must have an identity where it can be verified.

Avoid:

```text
SHOP
STORE
RETAIL
CAFE
```

generic placeholder signage.

A real storefront should display the real business identity where current information is available.

The Tenant Census Agent must validate this.

If a unit's current occupancy cannot be confidently determined:

* recreate the architecture accurately;
* use visually neutral treatment;
* mark it internally as unresolved.

Do not hallucinate a famous brand into an unknown location.

---

# STOREFRONT INTERACTION

Storefronts and station entrances should be selectable.

When the player looks at or approaches one:

* subtle highlight
* name
* category
* interaction affordance

Selected major spaces must support entry.

At minimum:

**Union Station** (Great Hall, concourses, train shed)

**Hockey Hall of Fame**

**Brookfield Place / Allen Lambert Galleria**

**a continuous PATH segment** linking Union Station to Brookfield Place

must be explorable.

Add further accessible interiors if references and time permit — the Royal York lobby is the strongest candidate.

---

# HOCKEY HALL OF FAME INTERIOR

The Hall should feel dramatically different from the street — from the daylight of the Galleria into a dark, spotlit, theatrical space.

Build an interior containing recognizable zones such as:

* the Great Hall under the stained-glass dome, with the trophies
* team and franchise displays
* an international/world-of-hockey zone
* a broadcast set
* a replica dressing room
* shooting and goaltending simulator stations
* a large screen showing generated highlight content
* the retail store

Interactions can include:

* activate a display screen
* inspect an artifact
* rotate a trophy model
* trigger a simulator station
* read a plaque
* collect an optional virtual souvenir

Do not make this simply a static showroom.

---

# UNION STATION INTERIOR

Union Station should emphasize:

* monumental scale
* the vaulted tile ceiling
* daylight raking through the tall arched end windows
* stone and terrazzo materials
* the destination frieze
* long sightlines down the hall
* the descent to the concourses
* the ascent to the platforms
* the shift in character from ceremonial hall to working transit concourse

Interactions:

* read the departure boards
* move between the three levels
* sit on a bench
* board a platform and watch a train arrive
* pass through into the PATH
* enter the retail promenade

Focus on architectural recognizability rather than reproducing every retail unit.

---

# THE FORECOURT AND FRONT STREET

The station forecourt should be an active environment.

Include:

* commuters
* tourists
* photographers
* people waiting
* taxi and rideshare pickup activity
* pigeons and gulls
* street trees and planters
* buskers where appropriate
* the Monument to Multiculturalism
* plaza furniture

Different NPCs should behave differently.

```text
commuter   → exits station → checks phone → walks north on Bay quickly

tourist    → stops → photographs the colonnade → photographs the CN Tower

pair       → sits on a bench → talks

traveller  → arrives with luggage → queues at the taxi rank

visitor    → studies the station façade → enters the Great Hall

pedestrian → waits for the signal → crosses Front Street
```

---

# PEDESTRIAN SYSTEM

Create a lightweight crowd system directly in Three.js.

No external game engine.

Construct a navigation graph covering:

* sidewalks
* crosswalks
* the forecourt
* underpasses
* station concourses
* PATH segments
* platforms
* entrances
* interior routes

Agents follow graph paths.

Implement local avoidance approximately.

NPC state:

```ts
interface Pedestrian {
  currentNode;
  destination;
  speed;
  behavior;
  waitTime;
  animationState;
}
```

Density should vary by location and time — heavy at the station mouths and the Bay Street underpass, lighter on Bremner.

Use many visually varied pedestrians.

Avoid obvious synchronized movement.

---

# VEHICLE SYSTEM

Populate surrounding streets.

Include:

* passenger vehicles
* rideshare vehicles
* taxis
* delivery vans
* TTC buses
* GO coaches around the CIBC Square bus terminal
* bicycles
* streetcars **only where they actually run**

Vehicles should follow street splines.

Respect:

* lanes
* one-way segments
* intersections
* traffic signals
* pedestrian crossings
* the underpass clearances

Cars should not simply loop through each other.

---

# RAIL AND TRANSIT CONTEXT

The rail corridor is the reason this place exists. Reproduce it accurately.

Represent:

* the multi-track corridor across the viaduct
* platforms and canopies under the train shed
* GO bilevel trains arriving and departing
* VIA and UP Express equipment where correct
* wayside signals — but no catenary; this corridor is diesel-operated
* the TTC subway platforms below
* the underground streetcar loop and the Bay Street tunnel portal
* the GO bus terminal at CIBC Square

Do not add transit merely for decoration if it is geographically incorrect. Re-read the hallucination-trap list before placing any track.

---

# INTERACTIVE CITY SYSTEMS

Make the environment reactive.

Support:

* doors opening
* traffic signals cycling with pedestrian countdowns
* pedestrians crossing
* departure boards updating
* trains arriving and departing
* escalators and elevators where implemented
* screens playing locally generated content
* vehicles stopping
* streetlights switching on at night
* interiors illuminating dynamically

---

# TIME OF DAY

Support at least:

```text
DAY
SUNSET
NIGHT
```

Day mode is the primary reference-validation mode.

Sunset must respect the rotated grid — the alignment of low sun down the street canyons is a real and recognizable Toronto effect.

Night mode should create:

* illuminated station colonnade
* lit hotel and office windows
* the CN Tower's lighting
* streetlights
* traffic signals
* visible interiors
* glowing retail signage
* the Gardiner's headlight stream

Union Station should remain recognizable under all conditions.

An overcast / wet-pavement variant is optional polish, not a requirement.

---

# MATERIAL FIDELITY

Do not rely on flat colors.

Build a reusable urban material library:

* Bedford limestone
* granite
* concrete — smooth, board-formed, and weathered viaduct concrete
* painted plaster
* brick — red and buff
* Guastavino / glazed structural tile
* clear glass
* tinted glass
* gold-tinted reflective glass
* brushed aluminum
* stainless steel
* weathered copper
* painted structural steel
* brass
* asphalt
* painted road markings
* sidewalk concrete and pavers
* terrazzo
* Tennessee marble — the Great Hall floor, laid herringbone
* polished retail flooring
* wood
* fabric awnings
* rail ballast and steel rail

Use:

```text
roughness
metalness
normal variation
environment reflection
texture scale
```

appropriately.

---

# SIGNAGE

Signs are essential to recognition.

Use high-resolution text or vector-like signage where possible.

Reconstruct with correct proportion and placement:

* the Great Hall's carved destination frieze (interior) and the entablature's incised railway names (exterior)
* TTC, GO, UP Express and VIA wayfinding
* PATH signage — the four-colour letterforms encode compass headings (P south, A west, T north, H east), and are being progressively replaced by TO360 wayfinding; verify what is actually installed
* Toronto street-name blades
* Ontario regulatory and warning signs
* Green P parking signage
* building addresses and entrance lettering
* retail fascias

Logos must:

* face the correct direction
* have plausible proportions
* occupy the correct façade location

Avoid blurry billboard-style textures pasted over entire façades.

---

# PLAYER EXPERIENCE

Support:

## WALK MODE

Human-scale WASD navigation.

Approximate eye height:

```text
1.65–1.75 meters
```

Include:

* collision against buildings
* sidewalk movement
* building and station entry
* stairs, escalators and level changes between PATH, street, concourse and platform

## ORBIT MODE

Inspect the entire environment.

## CINEMATIC TOUR

Automatically visit:

1. aerial over the rail corridor
2. Front Street forecourt and the colonnade
3. the Great Hall
4. the train shed at platform level
5. the PATH concourse
6. Brookfield Place galleria
7. Hockey Hall of Fame great hall
8. Bay Street canyon looking north
9. Bremner Boulevard and the CN Tower base
10. sunset skyline from the south

---

# VISUAL REFERENCE MODE

Implement a developer-only validation mode.

For important camera positions:

```text
reference image
rendered scene
```

should be compared side by side or via overlay.

Support an opacity slider if practical:

```text
REFERENCE 50%
RENDER 50%
```

Use this to verify reconstruction.

This mode is critical.

---

# CAMERA-MATCH VALIDATION

Create at least **20 known reference viewpoints**. For example:

1. Front & Bay, looking west along the colonnade
2. Front & York, looking east along the colonnade
3. Centre of the forecourt facing south at the station façade
4. Same point facing north at the Fairmont Royal York
5. Great Hall, west end facing east
6. Great Hall, centre facing the ticket wall and destination frieze
7. Bay concourse looking toward the platform stairs
8. Platform level under the train-shed atrium
9. Bay Street at Front looking north — Royal Bank Plaza, Brookfield, the skyline beyond
10. Front & Yonge looking northwest at the Bank of Montreal dome
11. Allen Lambert Galleria looking along the arcade
12. Hockey Hall of Fame great hall under the dome
13. Front & Simcoe looking southwest at the CN Tower
14. Bremner at Lower Simcoe — CN Tower base, Ripley's, Rogers Centre
15. Maple Leaf Square looking north to the York Street underpass
16. Bay Street underpass looking south to Scotiabank Arena
17. Scotiabank Arena's Bay Street elevation and the preserved postal-building frieze
18. PATH concourse beneath Royal Bank Plaza
19. SkyWalk interior looking west
20. Front & Church — Gooderham Flatiron and Berczy Park
21. Elevated overview at ~250 m looking northeast across the rail corridor

For each:

1. reproduce approximate camera position;
2. reproduce field of view;
3. render screenshot;
4. compare against reference;
5. identify major disagreement.

---

# GEOMETRIC QA AGENT

Launch a dedicated independent geometry reviewer.

It should look for:

* wrong building height
* wrong footprint
* wrong street width
* missing setback
* wrong façade spacing
* misplaced storefront
* incorrect intersection
* incorrect forecourt or Great Hall dimensions
* wrong viaduct or Gardiner clearance
* wrong grid rotation
* CN Tower mis-scaled or mis-bearing

It should not modify the scene initially.

It should produce an error report.

Then correction agents fix those errors.

---

# SEMANTIC QA AGENT

Independently verify:

> Is the correct business actually in the correct location?

Inspect every street-facing and concourse-facing business.

Create:

```text
✓ verified
? uncertain
✗ incorrect
```

report.

A high-visibility frontage carrying a confidently asserted but wrong identity is a blocking issue. A frontage honestly marked unresolved is not.

---

# VISUAL QA AGENTS

Run multiple independent reviewers.

## QA-A — ARCHITECT

Judge proportions and architecture.

## QA-B — TORONTO LOCAL / GEO REVIEWER

Judge whether the scene feels geographically correct to someone who commutes through Union Station.

## QA-C — TECHNICAL ARTIST

Judge:

* materials
* lighting
* texture repetition
* LOD
* geometry artifacts

## QA-D — GAME ENVIRONMENT ARTIST

Judge:

* visual density
* street-level storytelling
* composition
* environmental believability

## QA-E — INTERACTION REVIEWER

Walk through the environment and test every accessible interior, level change and interactive object.

Run them in parallel.

---

# SCREENSHOT-DRIVEN SELF-VERIFICATION

At every major milestone:

```text
BUILD
→ RUN
→ CAPTURE SCREENSHOTS
→ COMPARE TO REFERENCES
→ IDENTIFY TOP 10 DISCREPANCIES
→ FIX
→ CAPTURE AGAIN
```

Repeat.

Do not trust source code inspection.

The final artifact is visual.

Visual verification is mandatory.

---

# PIXEL / FEATURE COMPARISON

Where possible, compute approximate image similarity metrics.

Do not optimize blindly for pixel-perfect reproduction because:

* lighting differs
* imagery dates differ
* traffic differs
* vegetation differs
* construction hoarding moves constantly downtown

Instead compare structural features:

* skyline
* building edges
* façade proportions
* road boundaries
* colonnade rhythm
* monument location
* storefront placement
* major color regions

Automated metrics should complement visual review, not replace it.

---

# COMPLETENESS AUDIT

Create a spatial checklist.

Divide the map into cells — including below-grade and above-grade cells, not just street level.

For each cell inspect:

```text
terrain
building
façade
storefront
signage
road
sidewalk
street furniture
vegetation
lighting
interaction
```

No visible central-area cell should remain obviously unfinished.

---

# NO EMPTY BACK SIDES

A common failure of generated urban environments is excellent façades facing the camera but empty geometry elsewhere.

Do not do that.

A user must be able to walk:

* around buildings
* behind the station
* under the viaduct
* down into the PATH
* onto side streets
* around corners

without immediately exposing unfinished geometry.

---

# LEVEL OF DETAIL

Use distance-dependent fidelity.

## NEAR

Full storefront and interior detail.

## MID

Simplified façade geometry.

## FAR

Building massing and baked detail. The waterfront towers, and the financial district away from Bay Street, exist mainly as silhouette — treat them accordingly.

**Exception:** Bay Street from Front north to King is the final walkthrough's approach route and must carry full street-level fidelity on both frontages regardless of distance from the station.

Use:

```text
THREE.LOD
InstancedMesh
shared geometry
texture atlases
```

as appropriate.

---

# PERFORMANCE TARGET

This is a dense environment but it must remain usable.

Target:

```text
1920×1080
modern desktop GPU
60 FPS preferred
45 FPS minimum sustained
```

Measure:

* draw calls
* triangles
* visible meshes
* texture memory
* JS frame time
* GPU frame time where available

Avoid optimizing merely by destroying scene fidelity.

---

# STREAMING

Divide the environment into spatial sectors.

```text
union-station-core
union-trainshed
front-west
front-east
bay-street-canyon
financial-district-north     (Wellington to King — the walkthrough approach)
york-street
yonge-front
church-berczy               (the Front / Wellington / Church wedge)
skywalk-mtcc
bremner-southbank
lakeshore-gardiner          (Scotiabank Arena, Maple Leaf Square, the Gardiner deck)
path-network
interiors-great-hall
interiors-hhof
interiors-brookfield
```

Load expensive assets based on distance.

Major landmark silhouettes — the CN Tower above all — must remain resident at all times.

---

# PARALLEL PERFORMANCE AUDIT

Have a performance subagent inspect independently for:

* excessive materials
* duplicated geometry
* excessive textures
* overdraw
* expensive transparency — the Galleria and train-shed glazing are the obvious risks
* too many shadow casters
* unnecessary animations
* expensive pedestrian updates

Fix measured bottlenecks.

Do not prematurely degrade visual quality.

---

# DEVELOPMENT MILESTONES

## MILESTONE 0 — RECONNAISSANCE

Before implementation:

* map area
* identify every building
* inventory visible tenants
* map the PATH and rail layers
* collect references
* establish the coordinate system and grid rotation

Use at least **8 parallel research/reconstruction agents**.

Do not proceed until the geographic inventory is coherent.

---

## MILESTONE 1 — GEO BLOCKOUT

Build:

* terrain and the vertical layering
* roads and underpasses
* rail corridor and viaduct
* forecourt
* building massing

Nothing else.

Render reference viewpoints.

Correct geometry until recognizable.

---

## MILESTONE 2 — ARCHITECTURE

Replace boxes with real building façades.

Use parallel agents by block.

---

## MILESTONE 3 — STREET-LEVEL DETAIL

Reconstruct every visible ground-floor frontage and station entrance.

Prioritize correctness over interiors.

---

## MILESTONE 4 — HERO BUILDINGS

Bring:

* Union Station
* Fairmont Royal York
* Brookfield Place
* Hockey Hall of Fame
* CN Tower

to substantially higher detail.

---

## MILESTONE 5 — INTERIORS

Create accessible hero interiors, including the PATH layer.

---

## MILESTONE 6 — URBAN PROPS

Add:

* traffic infrastructure
* lamps
* signage
* furniture
* vegetation
* utilities
* road markings
* transit wayfinding

---

## MILESTONE 7 — LIFE

Implement:

* pedestrians
* traffic
* trains and transit
* building behavior
* ambient animation

---

## MILESTONE 8 — INTERACTIVITY

Implement:

* walk mode
* selectable buildings and businesses
* doors
* displays
* level changes

---

## MILESTONE 9 — LIGHTING / MATERIAL POLISH

Perform a dedicated technical-art pass.

---

## MILESTONE 10 — OPTIMIZATION

Profile and optimize.

---

## MILESTONE 11 — FINAL ADVERSARIAL QA

Have independent agents attempt to find:

* geographic errors
* visual errors
* interaction bugs
* performance problems
* unfinished viewpoints

Continue repairing until the QA threshold is met.

---

# SUBAGENT EXECUTION POLICY

Parallelism is mandatory.

At each milestone ask:

> Which tasks can proceed without waiting for another task?

Launch all of them concurrently.

For example, after GEO BLOCKOUT:

```text
Agent 1  → Union Station façade
Agent 2  → Royal York façade
Agent 3  → Brookfield Place + Galleria
Agent 4  → Hockey Hall of Fame
Agent 5  → CN Tower + Bremner southbank
Agent 6  → Front Street tenant census
Agent 7  → PATH concourse census
Agent 8  → forecourt props
Agent 9  → traffic and rail assets
Agent 10 → pedestrians
Agent 11 → material library
Agent 12 → reference-camera QA
```

Do not wait for Agent 1 to finish before starting Agent 2.

The lead agent is an **orchestrator and integrator**, not the sole implementer.

---

# SUBAGENT TOKEN CONTROL

Give each subagent:

```text
scope
files allowed to modify
expected deliverable
verification method
maximum token budget
```

Prefer narrow, parallel jobs over enormous open-ended subagent sessions.

Terminate agents that wander outside scope.

---

# CROSS-AGENT REVIEW

Agents must not grade only their own work.

Use:

```text
Builder Agent
↓
Independent Reviewer
↓
Correction Agent
↓
Independent Re-review
```

for important components.

Union Station, the Hockey Hall of Fame and the Allen Lambert Galleria require at least two independent visual review cycles each.

---

# REQUIRED SELF-VERIFICATION LOOP

Every milestone must follow:

```text
IMPLEMENT
↓
RUN
↓
NAVIGATE THE REAL APPLICATION
↓
CAPTURE
↓
COMPARE
↓
MEASURE
↓
LIST ERRORS
↓
FIX
↓
RUN AGAIN
```

Repeat until convergence.

Never mark a milestone complete merely because:

* code compiles;
* assets load;
* no console error appears.

Those are minimum conditions, not quality verification.

---

# FINAL QA BAR

Before completion, independently score:

```text
Geographic accuracy
9/10 target

Building recognizability
9/10

Union Station reconstruction
9/10

Tenant accuracy — verified, or explicitly marked unresolved
9/10

Hockey Hall of Fame reconstruction
9/10

Brookfield Place reconstruction
9/10

CN Tower placement, scale and bearing
9/10

Fairmont Royal York reconstruction
8.5/10

Vertical layering (PATH / street / rail / Gardiner)
9/10

Street-level detail
8.5/10

Visual fidelity
8.5/10

Materials
8.5/10

Lighting
8.5/10

Pedestrian believability
8/10

Traffic and transit believability
8/10

Interaction quality
8.5/10

Navigation
9/10

Performance
8.5/10

Completeness
9/10
```

No category may remain below its stated target.

If it does, continue iterating.

Do not reduce the expected score to justify unfinished work.

---

# FINAL WALKTHROUGH TEST

Perform a real user walkthrough:

Start two blocks north, at King and Bay.

Walk south down Bay Street toward Union Station.

Confirm that the user can:

1. recognize the Toronto streetscape from inside the Bay Street canyon;
2. cross functioning intersections at Wellington and at Front;
3. arrive at the Front Street forecourt;
4. turn west and see the CN Tower correctly placed, scaled and bearing-accurate once Front Street opens the view;
5. identify the Monument to Multiculturalism;
6. read the station colonnade and the incised railway names above it;
7. enter the Great Hall and find the carved destination frieze inside it;
8. descend to a concourse and find a PATH entrance;
9. follow the PATH to Brookfield Place and back;
10. reach the train shed and see a train;
11. return to Front Street;
12. walk south through the Bay Street rail underpass to Scotiabank Arena and back;
13. locate the Hockey Hall of Fame without a minimap;
14. enter it and interact with several displays;
15. exit through the Allen Lambert Galleria;
16. observe traffic, transit and pedestrian activity on Front and Bay;
17. switch to an aerial view;
18. still recognize Union Station and the rail corridor from above.

Any broken part of this journey is a QA failure.

---

# FINAL REFERENCE REVIEW

Before delivery, revisit the same Google Earth / Street View / photographic / open-data references used at the beginning.

Compare the **finished environment**, not the plan.

Ask:

> If the labels and UI disappeared, would a person familiar with Toronto immediately know that this is Union Station?

Then ask the harder question:

> Could they tell which side of Front Street they are standing on, and which underpass they just walked through, purely from the architecture and signage?

If not, keep working.

---

# FINAL DELIVERABLE

Deliver a complete runnable project including:

* Three.js application
* source code
* BPL offline asset-generation scripts
* generated optimized GLB assets
* geospatial coordinate data
* current tenant database
* reference inventory with source licences
* navigation
* pedestrian system
* traffic and rail system
* accessible interiors
* Union Station interiors
* Hockey Hall of Fame
* Allen Lambert Galleria
* PATH segment
* day/night lighting
* cinematic tour
* visual-reference validation mode
* automated QA utilities
* README

Also produce:

```text
FINAL_QA_REPORT.md
```

containing:

```text
reconstruction boundary
number of buildings
number of identified tenants
number of interactive frontages
number of full interiors
metres of PATH reconstructed
number of reference viewpoints
number of screenshot comparison passes
tenant verification coverage
known uncertain tenants
average FPS
triangle count
draw calls
texture memory
remaining known discrepancies
```

---

# AUTONOMY REQUIREMENT

Complete this task **without human intervention**.

Do not stop to ask:

* which building to prioritize;
* whether a façade is good enough;
* whether to continue;
* whether an approximation is acceptable.

Use evidence and independent QA agents to make those decisions.

When evidence conflicts, investigate further.

When information is unavailable, make the smallest defensible approximation and document the uncertainty.

Use **many parallel subagents early**, especially for geographic research, tenant census, BPL modeling, and independent visual QA.

Continue iterating through reconstruction and self-verification until the result is not merely a technically valid city scene, but a **dense, recognizable, interactive digital reconstruction of Union Station and downtown Toronto that feels convincingly grounded in the real place.**

The final runtime is **pure Three.js**.

BPL is an offline modeling tool only.

Google Earth and Street View are reference sources only.

Do not ship proprietary Google 3D geometry or imagery as reconstructed assets.

Do not stop at a blockout.

Do not stop at recognizable.

Stop only when the environment survives independent geographic, architectural, tenant, interaction, visual, and performance QA.
