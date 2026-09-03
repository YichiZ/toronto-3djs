# Module contract (internal build doc)

Every world / landmark / interior / system module in `src/` exports exactly:

```js
/** @param {import('../core/context.js').Context} ctx */
export function build(ctx) { /* ... */ return group; }  // THREE.Object3D or null
```

`ctx` = `{ renderer, scene, camera, clock, onFrame, onResize, stats, start, stop }`.
Push per-frame work with `ctx.onFrame.push((dt, elapsed) => {...})`. Never call
`renderer.render` yourself. Never add to `ctx.scene` directly — return your group;
`src/world/index.js` parents it.

## Coordinate system — read `src/core/geo.js` first

- `+X` = **grid east** (Front Street heading toward Yonge/Church)
- `-Z` = **grid north** (Bay Street heading toward Wellington/King)
- `+Y` = up, metres. `Y = 0` is the Front & Bay street datum.
- The whole scene is already rotated into the grid frame. **Do not apply the
  16.7° rotation yourself** — only `geoToLocal` and the sun do.

Named positions come from `src/data/grid.js`: `NS` (north-south street X
offsets), `EW` (east-west street Z offsets), `LEVELS` (the vertical layering),
`CORRIDOR` (rail corridor Z extent), `UNDERPASSES`.

Footprints come from `src/data/buildings.js` — call `getBuilding(id)` and use
`b.x, b.z, b.w, b.d, b.height, b.floors`. Do not re-guess a footprint that is
already in the database; if you believe a figure is wrong, change the database
record and say so in a code comment.

## Materials and geometry

Pull every material from `src/core/materials.js` (`M.limestone()`, `M.copper()`,
`M.goldGlass()`, `facadeMaterial(...)`). Do not construct `MeshStandardMaterial`
inline for anything that could reuse a shared one — draw calls and program
compiles are budgeted.

Reuse `src/world/buildingKit.js`: `massing`, `prism`, `cornice`, `plinth`,
`colonnade`, `storefrontBand`, `awning`, `doorway`, `windowGrid`, `roofPlant`,
`ringGeometry`, `setbackTower`.

Textures are procedural only (`src/core/textures.js`). **Never** load an external
image, never fetch a remote URL at runtime, never embed scraped brand artwork.
Wordmarks that matter architecturally are drawn as original canvas/vector
geometry from photographic proportion.

## Registration

Every reconstructed entity registers itself:

```js
import { register, registerInteractive } from '../core/registry.js';
register({ id, name, kind, object, confidence, source, note, data });
```

`kind` ∈ `building | landmark | interior | frontage | street | infrastructure | prop | system`.
`confidence` ∈ `surveyed | reference | inferred | approximated`.
`note` is where uncertainty goes — it lands in FINAL_QA_REPORT.md verbatim.

`registerInteractive(mesh, { tenant, category, building, address, note })` marks
a raycast target. Interaction meshes must be invisible
(`new THREE.MeshBasicMaterial({ visible: false })`) and thin.

`id` must be globally unique — a duplicate throws at build time.

## Performance budget

- Repeated geometry (columns, windows, benches, trees, pedestrians, vehicles,
  lights) **must** be `InstancedMesh`.
- Interiors must be built inside a group that starts `visible = false` and is
  switched on by proximity — see `src/world/index.js` `registerInterior`.
- Shadow casting: massing and landmark silhouettes yes; window instances,
  small props and interior clutter no.
- Target: 60 fps at 1080p on a mid-range discrete GPU, < 1800 draw calls.

## Hallucination traps (verified constraints — do not violate)

- No surface streetcar track on Front Street. Streetcars reach Union through the
  **Bay Street tunnel** into the below-grade **Union Station Loop**. King Street
  has streetcars; Front does not.
- The rail corridor is **elevated on a viaduct**. Bay, York, Yonge and **Lower
  Simcoe** pass underneath. Simcoe Street itself **ends at Front**.
- The corridor is **not electrified** — no catenary anywhere.
- The **Gardiner** is elevated over **Lake Shore Boulevard**, south of the rail
  corridor. Not over Front Street.
- Union Station's exterior entablature carries **incised railway names only**.
  The carved frieze of Canadian destination cities is **inside the Great Hall**.
- The Hockey Hall of Fame's stained-glass dome is **interior**. The street
  roofline is a plain skylight enclosure over carved Ohio freestone.
- Scotiabank Arena incorporates the 1941 Toronto Postal Delivery Building
  façades on **both** the Bay Street and Lake Shore elevations.
- "The Park at CIBC SQUARE" is the elevated park over the tracks. Rail Deck Park
  was a different, cancelled proposal.
- Union Station's Great Hall and its three concourses (York, Bay, VIA) are
  **different spaces at different levels**.
