/**
 * Building database for the reconstruction boundary
 *   north  King Street West / East
 *   south  Lake Shore Boulevard West (Gardiner deck above)
 *   west   Lower Simcoe, extending to John Street for the Rogers Centre
 *   east   Church Street
 *
 * Coordinates are grid metres from the Front & Bay origin (see core/geo.js).
 * `x`,`z` are the footprint centroid; `w` is the grid-east extent and `d` the
 * grid-north extent. Heights are metres to the main roof, excluding masts.
 *
 * `landmark: true` means a dedicated module in src/landmarks/ builds the real
 * geometry and the generic builder must skip it; the record still carries the
 * footprint so streets, sidewalks and the QA audit can reason about the block.
 *
 * CONFIDENCE
 *   'reference'    cross-checked against published dimensions or open data
 *   'inferred'     derived from block geometry and photographic proportion
 *   'approximated' plausible massing standing in for an unverified figure
 */

/** @typedef {'curtain'|'punched'} FacadeKind */

export const BUILDINGS = [
  // ---------------------------------------------------------------------------
  // HERO BLOCK - Union Station and the Front Street canyon
  // ---------------------------------------------------------------------------
  {
    id: 'union-station', name: 'Union Station', address: '65 Front Street West',
    x: -128, z: 46, w: 226, d: 44, height: 28, floors: 5,
    landmark: true, confidence: 'reference', year: 1927,
    note: 'Head house runs 229 m west from Bay and stops short of York; plaza and vehicle ramps fill the gap. Only the train shed spans the full Bay-York block.',
  },
  {
    id: 'union-trainshed', name: 'Union Station Train Shed', address: '65 Front Street West',
    x: -137, z: 130, w: 250, d: 124, height: 18, floors: 1,
    landmark: true, confidence: 'inferred',
    note: 'Bush-type shed with the glass atrium roof over the centre bays. Not electrified - GO, VIA and UP Express run diesel here.',
  },
  {
    id: 'royal-york', name: 'Fairmont Royal York', address: '100 Front Street West',
    x: -150, z: -68, w: 140, d: 96, height: 124, floors: 28,
    landmark: true, confidence: 'reference', year: 1929,
    note: 'Directly across Front Street from the station, north side. Chateau-style green copper roof.',
  },
  {
    id: 'royal-bank-plaza-s', name: 'Royal Bank Plaza South Tower', address: '200 Bay Street',
    x: -48, z: -52, w: 46, d: 46, height: 180, floors: 41,
    landmark: true, confidence: 'reference', year: 1976,
    note: 'Triangular plan, gold-fused glazing. 71 kg of gold in the curtain wall.',
  },
  {
    id: 'royal-bank-plaza-n', name: 'Royal Bank Plaza North Tower', address: '200 Bay Street',
    x: -48, z: -118, w: 40, d: 40, height: 114, floors: 26,
    landmark: true, confidence: 'reference', year: 1979,
    note: 'The original open atrium between the two towers was built over in the 1990s.',
  },

  // ---------------------------------------------------------------------------
  // BROOKFIELD PLACE BLOCK - Bay / Front / Yonge / Wellington
  // ---------------------------------------------------------------------------
  {
    id: 'td-canada-trust-tower', name: 'TD Canada Trust Tower', address: '161 Bay Street',
    x: 46, z: -52, w: 44, d: 46, height: 261, floors: 53,
    landmark: true, confidence: 'reference', year: 1990,
    note: 'CORRECTION to the brief: 161 Bay is the SOUTHERN and TALLER Brookfield tower (Bay addresses rise northward from the lake). The brief calls it "the north tower".',
  },
  {
    id: 'bay-wellington-tower', name: 'Bay Wellington Tower', address: '181 Bay Street',
    x: 46, z: -124, w: 46, d: 44, height: 208, floors: 47,
    landmark: true, confidence: 'reference', year: 1992,
    note: 'Named for the Bay/Wellington corner it occupies - the northern tower of the pair.',
  },
  {
    id: 'allen-lambert-galleria', name: 'Allen Lambert Galleria', address: 'Brookfield Place',
    x: 105, z: -88, w: 116, d: 16, height: 27, floors: 6,
    landmark: true, confidence: 'reference', year: 1992,
    note: 'Santiago Calatrava. Eight pairs of white parabolic steel tree supports, glazed roof, six floors tall.',
  },
  {
    id: 'hockey-hall-of-fame', name: 'Hockey Hall of Fame (Esso Great Hall)', address: '30 Yonge Street',
    x: 155, z: -32, w: 32, d: 30, height: 19, floors: 2,
    landmark: true, confidence: 'reference', year: 1885,
    note: 'Former Bank of Montreal, NW corner of Front and Yonge, Ohio freestone. The stained-glass dome is INTERIOR; from the street the roofline reads as a plain skylight enclosure. Only the Esso Great Hall is in this building - the rest of the museum is in the Brookfield concourse behind and below.',
  },
  {
    id: 'brookfield-heritage-facades', name: 'Reassembled heritage bank facades', address: 'Brookfield Place, Yonge Street',
    x: 152, z: -110, w: 34, d: 12, height: 16, floors: 3,
    landmark: true, confidence: 'inferred',
    note: 'Commercial Bank of the Midland District (1845) and neighbouring bank fronts, dismantled and rebuilt into the Galleria wall.',
  },

  // ---------------------------------------------------------------------------
  // SOUTH OF THE CORRIDOR - arena, CIBC Square, Maple Leaf Square
  // ---------------------------------------------------------------------------
  {
    id: 'scotiabank-arena', name: 'Scotiabank Arena', address: '40 Bay Street',
    // CORRECTED west edge -194 -> -171 (w 168 -> 145, x -110 -> -98.5): the old
    // footprint covered Maple Leaf Square's public square (x -205..-171), which is
    // open plaza west of the arena. The towers cannot move west instead - York
    // Street's east curb is at -262 and the podium already starts at -259. The
    // Bay (x -26) and Lake Shore (z 351) faces are unchanged.
    x: -98.5, z: 280, w: 145, d: 142, height: 40, floors: 5,
    landmark: true, confidence: 'reference', year: 1999,
    note: 'Not a freestanding bowl: incorporates the 1941 Art Deco Toronto Postal Delivery Building facades and Louis Temporale bas-reliefs on BOTH the Bay Street and Lake Shore Boulevard elevations.',
  },
  {
    id: 'cibc-square-81', name: 'CIBC Square - 81 Bay Street', address: '81 Bay Street',
    x: 62, z: 262, w: 58, d: 62, height: 241, floors: 49,
    landmark: true, confidence: 'reference', year: 2021,
    note: 'Podium holds the replacement GO bus terminal.',
  },
  {
    id: 'cibc-square-141', name: 'CIBC Square - 141 Bay Street', address: '141 Bay Street',
    x: 60, z: 86, w: 54, d: 54, height: 210, floors: 50,
    landmark: true, confidence: 'reference', year: 2024,
  },
  {
    id: 'the-park-cibc', name: 'The Park at CIBC SQUARE', address: 'over the rail corridor at Bay',
    x: 61, z: 174, w: 66, d: 96, height: 2, floors: 1,
    landmark: true, confidence: 'reference',
    note: 'The elevated park bridging the tracks. NOT Rail Deck Park, which was a separate, larger City proposal further west, cancelled in 2021.',
  },
  {
    id: 'maple-leaf-square-w', name: 'Maple Leaf Square West Tower', address: '15 York Street',
    x: -232, z: 248, w: 40, d: 44, height: 176, floors: 54,
    // Downgraded from 'inferred' (historian 2026-09-11): published storey counts
    // disagree - 40/44 (Lanterra marketing), 49 at 181 m, 65 at 186 m
    // (Wikipedia, "Maple Leaf Square", 2026) - and none matches 54/50 here.
    landmark: true, confidence: 'approximated',
    note: 'Height and storeys unverified: published figures conflict (40/44, 49 and 65 storeys; 181-186 m).',
  },
  {
    id: 'maple-leaf-square-e', name: 'Maple Leaf Square East Tower', address: '15 York Street',
    x: -232, z: 316, w: 40, d: 42, height: 163, floors: 50,
    // Downgraded from 'inferred' (historian 2026-09-11): see maple-leaf-square-w.
    landmark: true, confidence: 'approximated',
    note: 'Shared podium with the public square and its outdoor screen faces the arena. Height and storeys unverified: published figures conflict.',
  },
  {
    id: 'one-york', name: '1 York Street', address: '1 York Street',
    // CORRECTED height 150 -> 174 m (historian 2026-09-11).
    // source: SKYDB, "One York Street", 2026 (174 m, 35 floors);
    // source: Menkes, "1 York Street", 2026 (35 storeys, 2016).
    // Height rests on one source, so the grade stays 'inferred'.
    x: -330, z: 336, w: 50, d: 44, height: 174, floors: 35, year: 2016,
    kind: 'curtain', palette: { glass: '#7d99ab', spandrel: '#2f3a44' },
    confidence: 'inferred',
  },
  // CORRECTED (historian 2026-09-11): the two ICE figures were swapped between
  // the addresses. 12 York (ICE I, 2014) is the shorter, 14 York (ICE II, 2015)
  // the taller. source: Wikipedia, "ICE Condominiums" and "List of tallest
  // buildings in Toronto", 2026. Positions and footprints are still unverified,
  // hence 'approximated'; the ids' west/east labels do not match their x either.
  {
    id: 'ice-condos-w', name: 'ICE Condos West', address: '12 York Street',
    x: -330, z: 213, w: 34, d: 34, height: 202, floors: 57, year: 2014,
    kind: 'curtain', palette: { glass: '#8fb0c4', spandrel: '#39424b' },
    confidence: 'approximated',
  },
  {
    id: 'ice-condos-e', name: 'ICE Condos East', address: '14 York Street',
    x: -382, z: 213, w: 34, d: 34, height: 234, floors: 67, year: 2015,
    kind: 'curtain', palette: { glass: '#8fb0c4', spandrel: '#39424b' },
    confidence: 'approximated',
  },

  // ---------------------------------------------------------------------------
  // SOUTHBANK / BREMNER - CN Tower, Rogers Centre, Roundhouse, aquarium
  // ---------------------------------------------------------------------------
  {
    id: 'cn-tower', name: 'CN Tower', address: '290 Bremner Boulevard',
    x: -690, z: 175, w: 66, d: 66, height: 553.33, floors: 0,
    landmark: true, confidence: 'reference', year: 1976,
    note: 'Main pod 342-351 m, SkyPod 447 m, antenna to 553.33 m. Roughly 600 m from Union Station on a true bearing near 245 deg - the strongest orientation cue in the scene.',
  },
  {
    id: 'rogers-centre', name: 'Rogers Centre', address: '1 Blue Jays Way',
    x: -828, z: 180, w: 200, d: 190, height: 86, floors: 0,
    landmark: true, confidence: 'reference', year: 1989,
    note: 'Retractable roof: three moving panels plus one fixed, parked stacked over the north side when open.',
  },
  {
    id: 'ripleys-aquarium', name: "Ripley's Aquarium of Canada", address: '288 Bremner Boulevard',
    x: -600, z: 200, w: 90, d: 62, height: 16, floors: 2,
    landmark: true, confidence: 'inferred',
    note: 'Low wave-form roof at the foot of the CN Tower, east side.',
  },
  {
    id: 'john-st-roundhouse', name: 'John Street Roundhouse', address: '255 Bremner Boulevard',
    x: -682, z: 338, w: 140, d: 54, height: 12, floors: 1,
    landmark: true, confidence: 'reference', year: 1929,
    note: '32-bay curved roundhouse in Roundhouse Park, with the surviving turntable to its north. The record was moved south and the arc trimmed so the turntable pit, which must sit at the centre of the bay arc, clears the Bremner roadway.',
  },
  {
    id: 'mtcc-north', name: 'Metro Toronto Convention Centre - North Building', address: '255 Front Street West',
    x: -492, z: 80, w: 148, d: 100, height: 30, floors: 4,
    landmark: true, confidence: 'inferred',
    note: 'Built over the rail corridor. The SkyWalk connects it east to Union Station.',
  },
  {
    id: 'mtcc-south', name: 'Metro Toronto Convention Centre - South Building', address: '222 Bremner Boulevard',
    x: -520, z: 318, w: 140, d: 76, height: 34, floors: 3,
    landmark: true, confidence: 'approximated',
    note: 'Largely sunk below the Bremner sidewalk behind a glazed entrance pavilion; only part of the section reads above grade.',
  },

  // ---------------------------------------------------------------------------
  // EAST - Yonge to Church
  // ---------------------------------------------------------------------------
  {
    id: 'meridian-hall', name: 'Meridian Hall', address: '1 Front Street East',
    x: 246, z: -46, w: 84, d: 56, height: 32, floors: 4,
    landmark: true, confidence: 'reference', year: 1960,
    note: 'Formerly the O\'Keefe Centre and the Sony Centre. Cantilevered canopy over the Front Street entrance.',
  },
  {
    id: 'gooderham-flatiron', name: 'Gooderham Building (Flatiron)', address: '49 Wellington Street East',
    x: 332, z: -78, w: 44, d: 30, height: 21, floors: 5,
    landmark: true, confidence: 'reference', year: 1892,
    note: 'Wedge plan at the Front/Wellington/Church convergence, rounded west prow, red brick with a copper turret.',
  },
  {
    id: 'one-front-e-block', name: 'Front Street East retail block', address: '25-45 Front Street East',
    x: 318, z: -30, w: 52, d: 26, height: 17, floors: 4,
    kind: 'punched', palette: { wall: '#8d6a52', glass: '#3a464f' },
    confidence: 'approximated',
  },
  {
    id: 'berczy-tower', name: 'Berczy Condominiums', address: '25 The Esplanade',
    x: 300, z: 44, w: 62, d: 42, height: 47, floors: 13,
    kind: 'punched', palette: { wall: '#a8836a', glass: '#3c4a54' },
    confidence: 'approximated',
  },
  {
    id: 'l-tower', name: 'L Tower', address: '8 The Esplanade',
    // Upgraded to 'reference' (historian 2026-09-11): 205 m / 58 floors.
    // source: Wikipedia, "L Tower", 2026; source: Wikipedia, "List of tallest
    // buildings in Toronto", 2026 (205 m, 59 floors).
    x: 232, z: 62, w: 34, d: 34, height: 205, floors: 58, year: 2015,
    kind: 'curtain', palette: { glass: '#93b2c6', spandrel: '#2b333a' },
    // Libeskind's sail (#74): the north face sweeps out in a concave curve toward
    // the top, the silhouette from Front Street East. Built by sailGeometry().
    shape: 'sail', flare: 18,
    confidence: 'reference', note: 'Daniel Libeskind: the north face sweeps out in a concave curve toward the top. Height and storeys verified; the footprint and the 18 m flare at the crown are approximated.',
  },
  {
    id: 'yonge-front-se', name: '1 Yonge / Toronto Star Building', address: '1 Yonge Street',
    // CORRECTED height 92 -> 101 m (historian 2026-09-11).
    // source: Wikipedia, "One Yonge Street", 2026 (101 m, 25 storeys, 1970).
    // Single source and an unverified footprint: stays 'approximated'.
    x: 232, z: 250, w: 60, d: 70, height: 101, floors: 25, year: 1970,
    kind: 'curtain', palette: { glass: '#6d8798', spandrel: '#4b535a' },
    confidence: 'approximated',
  },

  // ---------------------------------------------------------------------------
  // NORTH - Wellington and King frontage, financial district skyline anchors
  // ---------------------------------------------------------------------------
  {
    id: 'first-canadian-place', name: 'First Canadian Place', address: '100 King Street West',
    x: -60, z: -372, w: 62, d: 62, height: 298, floors: 72,
    kind: 'curtain', palette: { glass: '#d8d5cc', spandrel: '#c9c6bd' },
    confidence: 'reference', note: 'Skyline anchor just beyond the King Street boundary; white marble replaced with glass 2011-13.',
  },
  {
    id: 'scotia-plaza', name: 'Scotia Plaza', address: '40 King Street West',
    x: 40, z: -368, w: 52, d: 52, height: 275, floors: 68,
    kind: 'curtain', palette: { glass: '#8d5548', spandrel: '#6d3b32' },
    confidence: 'reference', note: 'Napoleon red granite cladding.',
  },
  {
    id: 'commerce-court-west', name: 'Commerce Court West', address: '199 Bay Street',
    x: 38, z: -262, w: 44, d: 50, height: 239, floors: 57,
    kind: 'curtain', palette: { glass: '#9aa7ab', spandrel: '#7c878c' },
    confidence: 'reference',
  },
  {
    id: 'td-tower', name: 'Toronto-Dominion Bank Tower', address: '66 Wellington Street West',
    x: -78, z: -262, w: 46, d: 46, height: 223, floors: 56,
    kind: 'curtain', palette: { glass: '#33383c', spandrel: '#22262a' },
    confidence: 'reference', note: 'Mies van der Rohe black steel and bronze glass.',
  },
  {
    id: 'td-south-tower', name: 'TD Centre South Tower', address: '79 Wellington Street West',
    // CORRECTED 178 m / 46 floors -> 153.6 m / 39 (historian 2026-09-11).
    // source: Cadillac Fairview, "TD South Tower / 79 Wellington St. W.
    // Technical Specification", 2022 (39 storeys above ground, 503 ft 10 in;
    // its "151 m" is a typo for 153.6 m); source: Wikipedia,
    // "Toronto-Dominion Centre", 2026 (153.57 m, 1985).
    x: -140, z: -215, w: 42, d: 40, height: 153.6, floors: 39, year: 1985,
    kind: 'curtain', palette: { glass: '#33383c', spandrel: '#22262a' },
    confidence: 'reference', note: 'Height, storeys and year verified; the footprint is not.',
  },
  {
    id: 'wellington-w-infill-1', name: 'Wellington Street West offices', address: '120 Wellington Street West',
    x: -210, z: -196, w: 60, d: 44, height: 62, floors: 16,
    kind: 'curtain', palette: { glass: '#6b8798', spandrel: '#4c545b' },
    confidence: 'approximated',
  },
  {
    id: 'rbc-centre', name: 'RBC Centre', address: '155 Wellington Street West',
    x: -404, z: -206, w: 60, d: 58, height: 200, floors: 43,
    kind: 'curtain', palette: { glass: '#7fa2b6', spandrel: '#3d454c' },
    confidence: 'reference',
  },
  {
    id: 'ritz-carlton', name: 'Ritz-Carlton Toronto', address: '181 Wellington Street West',
    // Upgraded to 'reference' (historian 2026-09-11): 209 m / 53 floors checks.
    // source: Wikipedia, "Ritz-Carlton Toronto", 2026 (209.8 m, 53 storeys);
    // source: Wikipedia, "List of tallest buildings in Toronto", 2026 (209.5 m, 2011).
    x: -474, z: -204, w: 44, d: 44, height: 209, floors: 53, year: 2011,
    kind: 'curtain', palette: { glass: '#93a9b8', spandrel: '#525a61' },
    confidence: 'reference', note: 'Height and storeys verified; the footprint is not.',
  },

  // ---------------------------------------------------------------------------
  // FRONT STREET WEST - north side, York toward Simcoe
  // ---------------------------------------------------------------------------
  {
    id: 'front-w-hotel-1', name: 'Front Street West hotel', address: '225 Front Street West',
    x: -395, z: -50, w: 64, d: 50, height: 78, floors: 21,
    kind: 'curtain', palette: { glass: '#7794a6', spandrel: '#454d55' },
    confidence: 'approximated',
  },
  {
    id: 'front-w-office-1', name: 'Front Street West offices', address: '277 Front Street West',
    x: -460, z: -52, w: 52, d: 50, height: 54, floors: 14,
    kind: 'punched', palette: { wall: '#b3ab98', glass: '#3b4750' },
    confidence: 'approximated',
  },
  {
    id: 'front-w-condo-1', name: 'Front Street West residences', address: '300 Front Street West',
    // CORRECTED height 172 -> 156 m (historian 2026-09-11).
    // source: UrbanToronto, "300 Front Street West" project database, 2026
    // (156.05 m, 49 storeys); CondoInvestments, "300 Front Street West", 2026.
    // Footprint unverified: stays 'approximated'.
    x: -530, z: -54, w: 48, d: 50, height: 156, floors: 49,
    kind: 'curtain', palette: { glass: '#8aa8ba', spandrel: '#3a434a' },
    confidence: 'approximated',
  },
  {
    id: 'front-w-retail-2', name: 'Front Street West retail podium', address: '250 Front Street West',
    x: -320, z: -50, w: 44, d: 44, height: 21, floors: 5,
    kind: 'punched', palette: { wall: '#9c8a72', glass: '#39444d' },
    confidence: 'approximated',
  },
  {
    id: 'front-w-mixed-3', name: 'Front & Simcoe mixed use', address: '350 Front Street West',
    x: -600, z: -54, w: 56, d: 50, height: 118, floors: 33,
    kind: 'curtain', palette: { glass: '#82a0b2', spandrel: '#414951' },
    confidence: 'approximated',
  },
  {
    id: 'front-w-block-4', name: 'John & Front block', address: '400 Front Street West',
    x: -660, z: -54, w: 44, d: 50, height: 66, floors: 18,
    kind: 'punched', palette: { wall: '#a89e88', glass: '#3d4952' },
    confidence: 'approximated',
  },

  // ---------------------------------------------------------------------------
  // BAY STREET - Front to King, the final walkthrough's approach route
  // ---------------------------------------------------------------------------
  {
    id: 'bay-w-infill-1', name: 'Bay Street offices', address: '250 Bay Street',
    x: -46, z: -200, w: 40, d: 44, height: 84, floors: 22,
    kind: 'punched', palette: { wall: '#b0a794', glass: '#3a464f' },
    confidence: 'approximated',
  },
  {
    id: 'bay-e-infill-1', name: 'Bay Street east frontage', address: '212 Bay Street',
    x: 42, z: -200, w: 38, d: 40, height: 70, floors: 18,
    kind: 'curtain', palette: { glass: '#6f8a9b', spandrel: '#4a525a' },
    confidence: 'approximated',
  },
  {
    id: 'wellington-yonge-block', name: 'Wellington & Yonge block', address: '85 Yonge Street',
    x: 152, z: -200, w: 46, d: 42, height: 58, floors: 15,
    kind: 'punched', palette: { wall: '#9a8f7c', glass: '#3a464f' },
    confidence: 'approximated',
  },
  {
    id: 'yonge-e-block-1', name: 'Yonge Street east frontage', address: '80 Yonge Street',
    x: 226, z: -205, w: 54, d: 46, height: 46, floors: 12,
    kind: 'punched', palette: { wall: '#8f7f6a', glass: '#38434c' },
    confidence: 'approximated',
  },
  {
    id: 'church-front-block', name: 'Front & Church block', address: '90 Front Street East',
    x: 330, z: -120, w: 40, d: 40, height: 24, floors: 6,
    kind: 'punched', palette: { wall: '#8b6b55', glass: '#3a464f' },
    confidence: 'approximated',
  },
  {
    id: 'church-wellington-block', name: 'Church & Wellington block', address: '20 Church Street',
    x: 336, z: -215, w: 40, d: 44, height: 52, floors: 14,
    kind: 'curtain', palette: { glass: '#6c8697', spandrel: '#4b535a' },
    confidence: 'approximated',
  },
  {
    id: 'king-e-block', name: 'King Street East frontage', address: '100 King Street East',
    x: 300, z: -336, w: 76, d: 46, height: 40, floors: 10,
    kind: 'punched', palette: { wall: '#93745c', glass: '#38434c' },
    confidence: 'approximated',
  },
  {
    id: 'king-w-block-1', name: 'King Street West frontage', address: '250 King Street West',
    x: -330, z: -338, w: 84, d: 46, height: 44, floors: 11,
    kind: 'punched', palette: { wall: '#a1937c', glass: '#3a464f' },
    confidence: 'approximated',
  },
  {
    id: 'king-w-block-2', name: 'King & John block', address: '350 King Street West',
    x: -560, z: -336, w: 90, d: 48, height: 62, floors: 16,
    kind: 'curtain', palette: { glass: '#7691a3', spandrel: '#464e56' },
    confidence: 'approximated',
  },
  {
    id: 'wellington-w-block-3', name: 'Wellington West mid-block', address: '200 Wellington Street West',
    x: -560, z: -200, w: 76, d: 46, height: 48, floors: 12,
    kind: 'punched', palette: { wall: '#ada490', glass: '#3d4952' },
    confidence: 'approximated',
  },
  {
    id: 'bremner-w-condo', name: 'Bremner Boulevard residences', address: '81 Navy Wharf Court',
    x: -500, z: 185, w: 44, d: 44, height: 160, floors: 46,
    kind: 'curtain', palette: { glass: '#87a5b7', spandrel: '#3c454c' },
    confidence: 'approximated',
  },
  {
    id: 'bremner-e-podium', name: 'Bremner podium retail', address: '10 Bremner Boulevard',
    x: -340, z: 290, w: 60, d: 32, height: 18, floors: 4,
    kind: 'punched', palette: { wall: '#9d9584', glass: '#3a464f' },
    confidence: 'approximated',
  },
  {
    id: 'lakeshore-e-block', name: 'Lake Shore East frontage', address: '10 Yonge Street',
    x: 245, z: 330, w: 54, d: 54, height: 96, floors: 27,
    kind: 'curtain', palette: { glass: '#7a95a7', spandrel: '#454d55' },
    confidence: 'approximated',
  },
  {
    id: 'harbour-st-block', name: 'Harbour Street offices', address: '20 Harbour Street',
    x: 120, z: 330, w: 54, d: 40, height: 88, floors: 24,
    kind: 'curtain', palette: { glass: '#6f8b9c', spandrel: '#484f57' },
    confidence: 'approximated',
  },
];

/** Buildings the generic builder owns (everything without a dedicated module). */
export const genericBuildings = () => BUILDINGS.filter((b) => !b.landmark);

/** Buildings a landmark module is responsible for. */
export const landmarkBuildings = () => BUILDINGS.filter((b) => b.landmark);

export const getBuilding = (id) => BUILDINGS.find((b) => b.id === id) ?? null;

/** Axis-aligned footprint corners in grid metres, for QA overlap checks. */
export function footprint(b) {
  return {
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
  };
}
