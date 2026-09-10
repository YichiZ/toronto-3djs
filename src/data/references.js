/**
 * Named reference viewpoints.
 *
 * WHY THIS FILE EXISTS: a reconstruction is only checkable if you can stand
 * where the photographer stood. Every entry names a real, photographable spot
 * and says what a photograph from there would show, so the render and the
 * reference can be put side by side without re-deriving coordinates.
 *
 * Positions are grid metres (src/core/geo.js): +X grid east, -Z grid north,
 * +Y up from the Front & Bay datum. They are derived from src/data/grid.js
 * street offsets and src/data/buildings.js footprints — walking positions sit
 * on a sidewalk or a floor plate, never inside a massing volume.
 */
import { NS, EW, LEVELS } from './grid.js';

// Eye height for a standing adult; walk-mode viewpoints re-ground themselves
// by raycast, so Y here only has to start on the right storey.
const EYE = 1.7;

/**
 * @typedef {object} Viewpoint
 * @property {string} id
 * @property {string} name
 * @property {{x:number,y:number,z:number}} position
 * @property {{x:number,y:number,z:number}} lookAt
 * @property {'walk'|'orbit'} mode
 * @property {string} description
 * @property {string} realWorld what a photograph from here would show
 */

/** @type {ReadonlyArray<Viewpoint>} */
export const VIEWPOINTS = Object.freeze([
  {
    id: 'front-bay-west',
    name: 'Front & Bay, looking west',
    // Not on the corner itself: from (-16, 16) the Union Station Loop entrance's
    // glazed canopy (x -27.8..-20.3) filled 39% of the frame as a white wash, and
    // every spot east of it on the corner has the canopy or a street tree in the
    // lens. Three metres west of the canopy the view is 29% Union Station and
    // clear (#23). This is also the boot frame.
    position: { x: -31, y: EYE, z: 15 },
    lookAt: { x: -230, y: 10, z: 20 },
    mode: 'walk',
    description: 'South promenade at the Bay end, just west of the Loop entrance, the head house colonnade running away west.',
    realWorld: 'The canonical Union Station photograph: 22 Tuscan columns in raking perspective, the Royal York rising over the roofline on the right, Front Street falling away toward York.',
  },
  {
    id: 'union-forecourt',
    name: 'Union Station forecourt',
    // 2 m west of the portico's axis: on it, a twin-lantern pole stood dead
    // centre of frame; 2 m east puts a wayfinding pylon there instead (#28).
    position: { x: -128, y: EYE, z: 6 },
    lookAt: { x: -126, y: 9, z: 46 },
    mode: 'walk',
    description: 'Centred on the portico from the widened south promenade.',
    realWorld: 'Head-on elevation: stylobate steps, colonnade, the entablature with its incised railway names, taxis and the drop-off ramp mouths either side.',
  },
  {
    id: 'great-hall',
    name: 'Great Hall interior',
    // Inside the hall: its floor runs x -168..-92, z 32..58. At x=-170 this stood
    // 2 m beyond the west wall, on no floor at all, and the walker dropped to the
    // concourse below.
    position: { x: -162, y: EYE, z: 45 },
    lookAt: { x: -40, y: 16, z: 44 },
    mode: 'walk',
    description: 'Standing on the Great Hall floor at the west end, looking east.',
    realWorld: 'The 76 m Guastavino tile vault, tall arched end windows, the carved frieze of Canadian destination cities running along the walls — the frieze is INSIDE, not on the Front Street facade.',
  },
  {
    id: 'york-concourse',
    name: 'York Concourse',
    position: { x: -214, y: LEVELS.unionConcourse + EYE, z: 58 },
    lookAt: { x: -120, y: LEVELS.unionConcourse + 3, z: 58 },
    mode: 'walk',
    description: 'West concourse floor, one level below the Great Hall.',
    realWorld: 'The 2015 revitalisation: pale stone floor, backlit wayfinding, the deep coffered ceiling, escalators up to the platform level.',
  },
  {
    id: 'bay-concourse',
    name: 'Bay Concourse',
    position: { x: -40, y: LEVELS.unionConcourse + EYE, z: 52 },
    lookAt: { x: -140, y: LEVELS.unionConcourse + 3, z: 52 },
    mode: 'walk',
    description: 'East concourse — a different space at a different level from the Great Hall.',
    realWorld: 'Lower, busier and more retail-lined than York: the food hall frontages, GO departure boards, the ramp down to the Union Station Loop.',
  },
  {
    id: 'path-corridor',
    name: 'PATH corridor under Bay',
    // On the centreline of path-bay-north, the corridor it describes. It was at
    // (-3, -60), about 8 m outside every corridor, in solid ground: the visitor
    // saw the street from underneath (#24). From here the corridor runs 54 m
    // clear to the Royal Bank Plaza turn.
    position: { x: -30, y: LEVELS.path + EYE, z: 8 },
    lookAt: { x: -30, y: LEVELS.path + 2, z: -40 },
    mode: 'walk',
    description: 'PATH concourse level on the Bay Street corridor, heading north toward Royal Bank Plaza.',
    realWorld: 'Low 3.6 m ceiling, continuous retail on both sides, the PATH colour-letter wayfinding, no daylight at all.',
  },
  {
    id: 'galleria-interior',
    name: 'Allen Lambert Galleria',
    position: { x: 56, y: EYE, z: -88 },
    lookAt: { x: 160, y: 18, z: -88 },
    mode: 'walk',
    description: 'Inside Brookfield Place, west end, looking east down the arcade.',
    realWorld: 'Calatrava: eight pairs of white parabolic steel trees carrying a glazed roof six storeys up, the reassembled 1845 bank facades forming the north wall.',
  },
  {
    id: 'hhof-front-yonge',
    name: 'Hockey Hall of Fame, Front & Yonge',
    position: { x: 176, y: EYE, z: -11 },
    lookAt: { x: 155, y: 12, z: -32 },
    mode: 'walk',
    description: 'SE corner of Front and Yonge, looking north-west at the old Bank of Montreal.',
    realWorld: 'Carved Ohio freestone, 1885, columned corner entrance. The roofline is a plain skylight enclosure — the stained-glass dome is INTERIOR and not visible from the street.',
  },
  {
    id: 'royal-york-porte-cochere',
    name: 'Royal York porte-cochère',
    position: { x: -150, y: EYE, z: -13 },
    lookAt: { x: -150, y: 10, z: -26 },
    mode: 'walk',
    description: 'North sidewalk of Front, at the hotel entrance drive.',
    realWorld: 'The chateau-style limestone base, the canopy over the entrance drive, doormen and taxis, the green copper roof twenty-eight storeys up and mostly out of frame.',
  },
  {
    id: 'front-york-east',
    name: 'Front & York, looking east',
    position: { x: -262, y: EYE, z: 16 },
    lookAt: { x: 20, y: 8, z: 12 },
    mode: 'walk',
    description: 'South promenade at York, the whole Front Street canyon ahead.',
    realWorld: 'The 229 m limestone wall of the head house on the right, Royal York opposite, Royal Bank Plaza gold glass closing the view at Bay.',
  },
  {
    id: 'bay-north-of-front',
    name: 'Bay Street north of Front',
    position: { x: -11.5, y: EYE, z: -104 },
    lookAt: { x: -40, y: 16, z: 40 },
    mode: 'walk',
    description: 'West sidewalk of Bay between Wellington and Front, looking south.',
    realWorld: 'The financial-district canyon funnelling down to the station: Royal Bank Plaza gold on the left, the head house closing the bottom of the frame, CN Tower off to the right.',
  },
  {
    id: 'cn-tower-base',
    name: 'CN Tower base',
    position: { x: -704, y: EYE, z: 132 },
    lookAt: { x: -704, y: 340, z: 200 },
    mode: 'walk',
    description: 'North side of the tower base, looking up the shaft.',
    realWorld: 'The hexagonal concrete shaft with its three legs, the main pod at 342-351 m, SkyPod at 447 m, mast to 553.33 m — from here the top is hard to hold in one frame.',
  },
  {
    id: 'bremner-lower-simcoe',
    name: 'Bremner & Lower Simcoe',
    position: { x: -450, y: EYE, z: 258 },
    lookAt: { x: -700, y: 180, z: 210 },
    mode: 'walk',
    description: 'Bremner Boulevard at Lower Simcoe, looking west.',
    realWorld: 'The CN Tower foreshortened above the aquarium roof, the Rogers Centre dome to the right, Bremner running out toward Navy Wharf.',
  },
  {
    id: 'bay-underpass',
    name: 'Bay Street rail underpass',
    position: { x: -4, y: EYE, z: 118 },
    lookAt: { x: -4, y: 4, z: 30 },
    mode: 'walk',
    description: 'Under the rail viaduct on Bay, looking north back to Front.',
    realWorld: 'Riveted steel plate girders low overhead at about 6.5 m, the sodium-lit tunnel walls, daylight and the station beyond. No catenary — the corridor is not electrified.',
  },
  {
    id: 'lakeshore-under-gardiner',
    name: 'Lake Shore under the Gardiner',
    position: { x: -60, y: EYE, z: 372 },
    lookAt: { x: 240, y: 6, z: 374 },
    mode: 'walk',
    description: 'Lake Shore Boulevard West, looking east beneath the elevated deck.',
    realWorld: 'The Gardiner deck at about 12 m on its repeating concrete bents, eight lanes of Lake Shore below, the arena and the postal building facades to the north.',
  },
  {
    id: 'arena-bay-heritage',
    name: 'Scotiabank Arena, Bay Street elevation',
    position: { x: -11, y: EYE, z: 286 },
    lookAt: { x: -30, y: 16, z: 282 },
    mode: 'walk',
    description: 'West sidewalk of Bay, facing the incorporated 1941 postal building front.',
    realWorld: 'Art Deco stone of the Toronto Postal Delivery Building with Louis Temporale bas-reliefs, the modern arena volume rising behind it. The same treatment continues on the Lake Shore elevation.',
  },
  {
    id: 'the-park-cibc',
    name: 'The Park at CIBC SQUARE',
    position: { x: 61, y: LEVELS.gardinerDeck + EYE, z: 208 },
    lookAt: { x: -140, y: 24, z: 120 },
    mode: 'walk',
    description: 'On the elevated park deck over the rail corridor, looking west.',
    realWorld: 'Lawn and planting on a deck above live tracks, the two CIBC SQUARE towers either side, trains passing underneath, Union Station train shed to the west. Not Rail Deck Park — that proposal was cancelled.',
  },
  {
    id: 'maple-leaf-square',
    name: 'Maple Leaf Square',
    position: { x: -232, y: EYE, z: 283 },
    lookAt: { x: -110, y: 24, z: 283 },
    mode: 'walk',
    description: 'The public square between the two towers, facing the arena.',
    realWorld: 'The outdoor screen on the podium wall, the paved square that fills for playoff games, the arena bulk directly east.',
  },
  {
    id: 'skywalk-east',
    name: 'Inside the SkyWalk, looking east',
    position: { x: -400, y: LEVELS.skywalk + EYE, z: 58 },
    lookAt: { x: -150, y: LEVELS.skywalk + 2, z: 56 },
    mode: 'walk',
    description: 'Enclosed pedestrian bridge from the convention centre back to Union.',
    realWorld: 'A long glazed tube above the tracks: girder rhythm overhead, the corridor and train shed below through the glass, the station drawing closer at the far end.',
  },
  {
    id: 'roundhouse-park',
    name: 'Roundhouse Park',
    position: { x: -678, y: EYE, z: 246 },
    lookAt: { x: -678, y: 8, z: 300 },
    mode: 'walk',
    description: 'North lawn, facing the curved 32-bay roundhouse.',
    realWorld: 'The 1929 John Street Roundhouse arc with its surviving turntable in front, the CN Tower directly behind you, Steam Whistle occupying the west bays.',
  },
  {
    id: 'gooderham-flatiron',
    name: 'Gooderham Flatiron from Front',
    position: { x: 300, y: EYE, z: -12 },
    lookAt: { x: 332, y: 14, z: -78 },
    mode: 'walk',
    description: 'North sidewalk of Front Street East, looking north-east at the wedge.',
    realWorld: 'The rounded red-brick prow where Front, Wellington and Church converge, copper turret above, the financial district towers stacked behind it.',
  },
  {
    id: 'front-street-establishing',
    name: 'Front Street establishing (aerial)',
    position: { x: 40, y: 150, z: 220 },
    lookAt: { x: -300, y: 40, z: 20 },
    mode: 'orbit',
    description: 'High south-east vantage over the corridor, station and Front Street.',
    realWorld: 'A helicopter frame: train shed roof, the head house wall along Front, Royal York behind it, CN Tower and the Rogers Centre closing the west end.',
  },
  {
    id: 'union-trainshed-orbit',
    name: 'Train shed from above',
    position: { x: -137, y: 74, z: 236 },
    lookAt: { x: -137, y: 14, z: 130 },
    mode: 'orbit',
    description: 'Orbit target on the bush-type shed and its glass atrium roof.',
    realWorld: 'Long low shed roofs with the central glazed slot cut through them, diesel GO and VIA consists standing at the platforms.',
  },
  {
    id: 'royal-bank-plaza-orbit',
    name: 'Royal Bank Plaza gold glass',
    position: { x: 40, y: 70, z: 40 },
    lookAt: { x: -48, y: 90, z: -52 },
    mode: 'orbit',
    description: 'Orbit around the triangular south tower.',
    realWorld: 'Serrated triangular plan, the curtain wall fused with 71 kg of gold, going copper-orange when the low sun hits it and near-black when it does not.',
  },
]);

export const getViewpoint = (id) => VIEWPOINTS.find((v) => v.id === id) ?? null;
