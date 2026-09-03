/**
 * Storefront and tenant census inside the reconstruction boundary.
 *
 * HONESTY NOTE. Ground-floor retail downtown turns over on a scale of months.
 * Entries are graded:
 *   'reference'    long-standing anchor tenants, stable across years
 *   'inferred'     the use is certain, the operator may have changed
 *   'approximated' a plausible unit of the right category holding a real
 *                  frontage that exists on the street but whose current
 *                  occupant was not verified
 *
 * Anything not marked 'reference' is listed in FINAL_QA_REPORT.md as an
 * uncertain tenant. The reconstruction never claims a brand it did not verify;
 * approximated units render with a generic category sign, not a wordmark.
 */

/** @typedef {{name:string, category:string, confidence:'reference'|'inferred'|'approximated', note?:string, hours?:string}} Tenant */

const t = (name, category, confidence = 'approximated', note = '') => ({ name, category, confidence, note });

/**
 * Keyed by `${buildingId}` then by face direction. `*` matches any face.
 * @type {Record<string, Record<string, Tenant[]>>}
 */
export const TENANTS = {
  'union-station': {
    north: [
      t('Union Station Front Street entrance', 'transit', 'reference'),
      t('Pilot Coffee Roasters', 'cafe', 'inferred', 'Union Station kiosk; operator stable since the revitalisation.'),
      t('Danish Pastry House', 'bakery', 'inferred'),
      t('Shoppers Drug Mart', 'pharmacy', 'inferred'),
      t('LCBO', 'liquor', 'inferred'),
      t('Cinnabon', 'bakery', 'approximated'),
      t('Union Station Visitor Information', 'services', 'reference'),
    ],
    east: [
      t('Bay Concourse entrance', 'transit', 'reference'),
      t('Tim Hortons', 'cafe', 'inferred'),
      t('Union Station Market', 'food hall', 'inferred'),
    ],
    west: [
      t('York Concourse entrance', 'transit', 'reference'),
      t('Amano Pasta', 'restaurant', 'inferred'),
      t('UP Express platform access', 'transit', 'reference'),
    ],
  },
  'royal-york': {
    south: [
      t('Fairmont Royal York porte-cochere', 'hotel', 'reference'),
      t('REIGN Restaurant + Bar + Bakery', 'restaurant', 'inferred', 'Occupies the former Epic space on the Front Street frontage.'),
      t('Clockwork Champagne & Cocktails', 'bar', 'inferred'),
      t('Library Bar', 'bar', 'reference'),
      t('Royal York gift shop', 'retail', 'approximated'),
    ],
    east: [t('Fairmont Royal York Bay Street entrance', 'hotel', 'reference'), t('Cafe', 'cafe', 'approximated')],
    west: [t('Fairmont Royal York York Street entrance', 'hotel', 'inferred')],
  },
  'hockey-hall-of-fame': {
    south: [
      t('Hockey Hall of Fame - Esso Great Hall', 'museum', 'reference',
        'The visitor entrance is NOT here - it is in the Brookfield Place concourse behind and below.'),
    ],
    east: [t('Hockey Hall of Fame heritage facade', 'museum', 'reference')],
  },
  'allen-lambert-galleria': {
    south: [
      t('Hockey Hall of Fame visitor entrance', 'museum', 'reference'),
      t('Brookfield Place concourse retail', 'retail', 'inferred'),
      t('Aroma Espresso Bar', 'cafe', 'approximated'),
      t('Kupfert & Kim', 'restaurant', 'approximated'),
      t('GoodLife Fitness', 'fitness', 'inferred'),
    ],
  },
  'maple-leaf-square-w': {
    south: [
      t('Real Sports Bar & Grill', 'restaurant', 'reference'),
      t("Real Sports Apparel", 'retail', 'reference'),
      t("Longo's", 'grocery', 'reference'),
      t('e11even', 'restaurant', 'inferred'),
    ],
  },
  'scotiabank-arena': {
    north: [t('Scotiabank Arena - Gate 1', 'venue', 'reference'), t('Box office', 'venue', 'reference')],
    east: [t('Toronto Postal Delivery Building facade', 'heritage', 'reference',
      'Preserved 1941 Art Deco elevation with Louis Temporale bas-reliefs.')],
    south: [t('Toronto Postal Delivery Building facade - Lake Shore elevation', 'heritage', 'reference')],
  },
  'meridian-hall': {
    north: [t('Meridian Hall box office', 'venue', 'reference'), t('Meridian Hall lobby', 'venue', 'reference')],
  },
  'gooderham-flatiron': {
    south: [t('Flatiron & Firkin', 'pub', 'inferred'), t('Gooderham Building offices', 'office', 'reference')],
  },
  'cibc-square-81': {
    north: [t('Union Station Bus Terminal', 'transit', 'reference', 'Replaced the old GO terminal at 141 Bay in 2020-21.')],
    west: [t('CIBC SQUARE lobby', 'office', 'reference'), t('Cafe', 'cafe', 'approximated')],
  },
  'ripleys-aquarium': {
    north: [t("Ripley's Aquarium of Canada", 'attraction', 'reference'), t('Ripley\'s gift shop', 'retail', 'inferred')],
  },
  'rogers-centre': {
    north: [t('Rogers Centre Gate 5', 'venue', 'reference'), t('Blue Jays Shop', 'retail', 'reference')],
  },
  'john-st-roundhouse': {
    north: [
      t('Steam Whistle Brewing', 'brewery', 'reference', 'Occupies the west end of the roundhouse.'),
      t('Toronto Railway Museum', 'museum', 'reference'),
      t('The Rec Room', 'entertainment', 'inferred'),
    ],
  },
  'mtcc-north': {
    north: [
      t('Metro Toronto Convention Centre - North Building entrance', 'venue', 'reference'),
      t('MTCC box office', 'venue', 'inferred'),
      t('Convention centre cafe', 'cafe', 'approximated'),
    ],
  },
  'mtcc-south': {
    north: [t('Metro Toronto Convention Centre - South Building entrance', 'venue', 'reference')],
  },
  'cn-tower': {
    north: [
      t('CN Tower base entrance', 'attraction', 'reference'),
      t('360 The Restaurant at the CN Tower', 'restaurant', 'reference', 'Revolving restaurant at the main pod, not at grade.'),
      t('Horizons Restaurant', 'restaurant', 'inferred'),
      t('Le Cafe', 'cafe', 'inferred'),
      t('EdgeWalk ticketing', 'attraction', 'reference'),
      t('CN Tower gift shop', 'retail', 'inferred'),
    ],
  },
  'royal-bank-plaza-s': {
    south: [
      t('RBC Royal Bank branch', 'bank', 'reference'),
      t('Royal Bank Plaza concourse retail', 'retail', 'inferred'),
      t('Cafe', 'cafe', 'approximated'),
    ],
    east: [t('Royal Bank Plaza Bay Street lobby', 'office', 'reference')],
  },
  'bay-wellington-tower': {
    north: [t('Brookfield Place lobby', 'office', 'reference'), t('GoodLife Fitness', 'fitness', 'inferred')],
  },
  'td-canada-trust-tower': {
    south: [t('TD Canada Trust branch', 'bank', 'inferred'), t('Brookfield Place Front Street lobby', 'office', 'reference')],
  },
  'td-tower': {
    north: [t('TD Bank branch', 'bank', 'inferred'), t('Toronto-Dominion Centre lobby', 'office', 'reference')],
  },
  'rogers-centre': {
    north: [
      t('Rogers Centre Gate 5', 'venue', 'reference'),
      t('Blue Jays Shop', 'retail', 'reference'),
      t('Against the Grain Urban Tavern', 'restaurant', 'inferred'),
      t('Rogers Centre box office', 'venue', 'reference'),
    ],
  },
  'front-w-hotel-1': {
    south: [
      t('Hotel lobby', 'hotel', 'approximated'),
      t('Cafe', 'cafe', 'approximated'),
      t('Convenience', 'retail', 'approximated'),
    ],
  },
  'front-w-retail-2': {
    south: [
      t('Pub', 'pub', 'approximated', 'The Front Street West blocks between York and Simcoe are dense with pubs and casual dining; the individual operators were not verified.'),
      t('Quick-service restaurant', 'restaurant', 'approximated'),
      t('Sports bar', 'pub', 'approximated'),
    ],
  },
  'one-front-e-block': {
    north: [
      t('Restaurant', 'restaurant', 'approximated'),
      t('Cafe', 'cafe', 'approximated'),
      t('Bank branch', 'bank', 'approximated'),
      t('Convenience', 'retail', 'approximated'),
    ],
  },
  'berczy-tower': {
    north: [t('Ground-floor retail', 'retail', 'approximated'), t('Cafe', 'cafe', 'approximated')],
  },
  'l-tower': {
    north: [t('Residential lobby', 'residential', 'inferred')],
  },
  'one-york': {
    north: [t('Office lobby', 'office', 'inferred'), t('Cafe', 'cafe', 'approximated')],
  },
  'cibc-square-141': {
    north: [t('CIBC SQUARE 141 Bay lobby', 'office', 'reference'), t('Cafe', 'cafe', 'approximated')],
  },
  'meridian-hall-esplanade': {
    south: [t('The Esplanade restaurants', 'restaurant', 'approximated')],
  },
};

/** Category fallbacks used when a real frontage exists but the tenant is unverified. */
const GENERIC_BY_CATEGORY = [
  t('Cafe', 'cafe'), t('Sandwich counter', 'restaurant'), t('Convenience', 'retail'),
  t('Bank branch', 'bank'), t('Pharmacy', 'pharmacy'), t('Dry cleaner', 'services'),
  t('Barber', 'services'), t('Bakery', 'bakery'), t('Optician', 'retail'),
  t('Mobile phone store', 'retail'), t('Quick-service restaurant', 'restaurant'),
  t('Juice bar', 'cafe'), t('Print shop', 'services'), t('Shoe repair', 'services'),
];

/**
 * Tenants for a building face. Falls back to generic units so a real frontage is
 * never rendered as a blank wall, but never invents a brand name.
 * @param {string} buildingId
 * @param {string} face 'north' | 'south' | 'east' | 'west'
 * @returns {Tenant[]}
 */
export function tenantsFor(buildingId, face) {
  const b = TENANTS[buildingId];
  const listed = b ? (b[face] ?? b['*'] ?? []) : [];
  if (listed.length) return listed;
  // Deterministic generic mix, so the same frontage shows the same unit every load.
  const seed = [...`${buildingId}:${face}`].reduce((a, c) => a + c.charCodeAt(0), 0);
  const out = [];
  for (let i = 0; i < 5; i++) out.push(GENERIC_BY_CATEGORY[(seed + i * 5) % GENERIC_BY_CATEGORY.length]);
  return out;
}

/** Flat list of every explicitly identified tenant, for the QA count. */
export function identifiedTenants() {
  const out = [];
  for (const [buildingId, faces] of Object.entries(TENANTS)) {
    for (const [face, list] of Object.entries(faces)) {
      for (const tn of list) out.push({ buildingId, face, ...tn });
    }
  }
  return out;
}

export const uncertainTenants = () => identifiedTenants().filter((x) => x.confidence !== 'reference');
