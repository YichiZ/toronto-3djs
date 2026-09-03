/**
 * Geospatial coordinate system for the downtown Toronto reconstruction.
 *
 * Chain:  WGS84 (lat, lon, elev)  ->  local ENU metres  ->  grid-aligned world.
 *
 * The downtown street grid is rotated ~16.7 degrees west of true north (Augustus
 * Jones' 1793-97 township survey, laid parallel to the Lake Ontario shoreline).
 * We rotate the ENU frame by that amount so that Front Street runs along +X and
 * Bay / York / Yonge run along -Z (grid north). Everything the renderer touches
 * lives in this grid frame; anything that needs a true bearing (sun position,
 * compass) rotates back through `trueToGrid` / `gridToTrue`.
 *
 * Three.js convention used throughout:
 *    +X = grid east   (Front Street, heading toward Yonge/Church)
 *    -Z = grid north  (Bay Street, heading toward Wellington/King)
 *    +Y = up          (metres above the Front & Bay street datum)
 */

/** Measured street bearings downtown run 16-18 deg; 16.7 is the working figure. */
export const GRID_ROTATION_DEG = 16.7;
export const GRID_ROTATION_RAD = (GRID_ROTATION_DEG * Math.PI) / 180;

/**
 * World origin: the centre of the Front Street West / Bay Street intersection.
 *
 * HYPOTHESIS, not survey. Derived by offsetting the brief's suggested origin
 * (Union Station's Front Street entrance, 43.6453 N / 79.3806 W) 115 m grid-east
 * and 15 m grid-north along the reconstructed grid. Absolute error here is a
 * rigid-body offset of the whole scene; relative block geometry is authored in
 * metres and is unaffected. See FINAL_QA_REPORT.md.
 */
export const ORIGIN = Object.freeze({ lat: 43.645727, lon: -79.379287 });

/** Union Station's Front Street entrance in grid metres, for reference/QA. */
export const UNION_ENTRANCE_GRID = Object.freeze({ x: -115, z: 15 });

/** Lake Ontario surface, metres above sea level. Our Y=0 datum sits above it. */
export const LAKE_ONTARIO_ELEV = 74.2;
/** Elevation of the Front & Bay street datum (Y = 0) above sea level. */
export const DATUM_ELEV = 76.5;

const DEG = Math.PI / 180;

/** Metres per degree of latitude at a given latitude (WGS84 series). */
export function metresPerDegLat(lat) {
  const p = lat * DEG;
  return 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p);
}

/** Metres per degree of longitude at a given latitude (WGS84 series). */
export function metresPerDegLon(lat) {
  const p = lat * DEG;
  return 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p);
}

const M_PER_LAT = metresPerDegLat(ORIGIN.lat);
const M_PER_LON = metresPerDegLon(ORIGIN.lat);

// Rotation applied to the ENU frame. Derivation: a street bearing 343.3 deg true
// (Bay Street northbound) must map to grid north, which requires theta = -16.7 deg.
const THETA = -GRID_ROTATION_RAD;
const COS_T = Math.cos(THETA);
const SIN_T = Math.sin(THETA);

/**
 * Rotate an un-rotated world vector (x = true east, z = true south) into the grid frame.
 * @returns {{x:number, z:number}}
 */
export function trueToGrid(x, z) {
  return { x: x * COS_T + z * SIN_T, z: -x * SIN_T + z * COS_T };
}

/** Inverse of {@link trueToGrid}. */
export function gridToTrue(x, z) {
  return { x: x * COS_T - z * SIN_T, z: x * SIN_T + z * COS_T };
}

/**
 * Convert WGS84 to grid-frame world metres.
 * @param {number} lat degrees north
 * @param {number} lon degrees east (negative for Toronto)
 * @param {number} [elev] metres above the Y=0 street datum
 * @returns {{x:number, y:number, z:number}}
 */
export function geoToLocal(lat, lon, elev = 0) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new TypeError(`geoToLocal: expected finite lat/lon, received ${lat}, ${lon}`);
  }
  const east = (lon - ORIGIN.lon) * M_PER_LON;
  const north = (lat - ORIGIN.lat) * M_PER_LAT;
  const g = trueToGrid(east, -north);
  return { x: g.x, y: elev, z: g.z };
}

/**
 * Convert grid-frame world metres back to WGS84.
 * @returns {{lat:number, lon:number, elev:number}}
 */
export function localToGeo(x, z, y = 0) {
  const t = gridToTrue(x, z);
  return {
    lat: ORIGIN.lat + -t.z / M_PER_LAT,
    lon: ORIGIN.lon + t.x / M_PER_LON,
    elev: y,
  };
}

/**
 * True compass bearing (degrees, 0 = north) of a grid-frame direction.
 * Front Street eastbound (+X) should come back near 73.3.
 */
export function gridDirectionToBearing(dx, dz) {
  const t = gridToTrue(dx, dz);
  const deg = (Math.atan2(t.x, -t.z) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Great-circle-ish planar distance between two geo points, in metres. */
export function geoDistance(a, b) {
  const dLat = (b.lat - a.lat) * metresPerDegLat((a.lat + b.lat) / 2);
  const dLon = (b.lon - a.lon) * metresPerDegLon((a.lat + b.lat) / 2);
  return Math.hypot(dLat, dLon);
}

/**
 * Solar position for Toronto, NOAA low-precision algorithm.
 * Returns azimuth/altitude in radians plus a grid-frame unit direction *toward*
 * the sun, so callers can place a directional light without re-deriving the
 * grid rotation.
 *
 * @param {Date} date UTC instant
 * @param {number} [lat] observer latitude
 * @param {number} [lon] observer longitude
 */
export function solarPosition(date, lat = ORIGIN.lat, lon = ORIGIN.lon) {
  const julian = date.getTime() / 86400000 + 2440587.5;
  const n = julian - 2451545.0;
  const meanLong = (280.46 + 0.9856474 * n) % 360;
  const meanAnom = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const eclipticLong =
    (meanLong + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom)) * DEG;
  const obliquity = (23.439 - 0.0000004 * n) * DEG;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLong));
  let rightAsc = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLong),
    Math.cos(eclipticLong)
  );

  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lmst = ((gmst * 15 + lon) * DEG) % (2 * Math.PI);
  let hourAngle = lmst - rightAsc;
  // wrap to [-pi, pi]
  hourAngle = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle));

  const latR = lat * DEG;
  const altitude = Math.asin(
    Math.sin(latR) * Math.sin(declination) +
      Math.cos(latR) * Math.cos(declination) * Math.cos(hourAngle)
  );
  const azimuth = Math.atan2(
    -Math.sin(hourAngle),
    Math.tan(declination) * Math.cos(latR) - Math.sin(latR) * Math.cos(hourAngle)
  );

  // Direction toward the sun in the un-rotated frame, then into grid space.
  const horiz = Math.cos(altitude);
  const trueEast = horiz * Math.sin(azimuth);
  const trueNorth = horiz * Math.cos(azimuth);
  const g = trueToGrid(trueEast, -trueNorth);

  return {
    altitude,
    azimuth: (((azimuth * 180) / Math.PI) + 360) % 360,
    declination,
    direction: { x: g.x, y: Math.sin(altitude), z: g.z },
  };
}
