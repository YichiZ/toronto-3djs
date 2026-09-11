# Fidelity report — historian run 1, 2026-09-11

Scope: 10 records picked from the 119 entities graded below `reference`.
I picked named towers whose height and storey count can be checked against
published figures. Every change below is a database edit in
`src/data/buildings.js`, with its citation in a code comment. No module ignored
its record, so no geometry code changed.

**Counts:** 6 records corrected, 2 verified unchanged, 2 downgraded,
3 grade upgrades (`reference`), 1 new trap, 1 issue filed.

## Corrected

| Record | Old | New | Source | Grade | Screenshot |
|---|---|---|---|---|---|
| `td-south-tower` (79 Wellington W) | 178 m, 46 fl | 153.6 m, 39 fl, 1985 | Cadillac Fairview, *TD South Tower Technical Specification*, 2022; Wikipedia, *Toronto-Dominion Centre* | inferred → **reference** | `fidelity/front-street-establishing.png` |
| `ice-condos-w` (12 York) | 234 m, 67 fl | 202 m, 57 fl, 2014 | Wikipedia, *ICE Condominiums*; *List of tallest buildings in Toronto* | approximated (unchanged; position unverified) | `fidelity/the-park-cibc.png` |
| `ice-condos-e` (14 York) | 208 m, 57 fl | 234 m, 67 fl, 2015 | same | approximated (unchanged) | `fidelity/the-park-cibc.png` |
| `one-york` (1 York) | 150 m, 35 fl | 174 m, 35 fl, 2016 | SKYDB, *One York Street*; Menkes, *1 York Street* (storeys only) | inferred (unchanged; height single-source) | `fidelity/the-park-cibc.png` |
| `yonge-front-se` (1 Yonge) | 92 m | 101 m, 1970 | Wikipedia, *One Yonge Street* | approximated (unchanged; single source) | `fidelity/front-street-establishing.png` |
| `front-w-condo-1` (300 Front W) | 172 m | 156 m | UrbanToronto project database; CondoInvestments | approximated (unchanged; footprint unverified) | `fidelity/front-street-establishing.png` |

The ICE figures were swapped between the two addresses: the taller tower is
14 York (ICE II), not 12 York.

## Verified unchanged

| Record | Figure | Source | Grade |
|---|---|---|---|
| `l-tower` | 205 m, 58 fl | Wikipedia, *L Tower*; *List of tallest buildings in Toronto* (205 m, 59 fl) | inferred → **reference** |
| `ritz-carlton` | 209 m, 53 fl | Wikipedia, *Ritz-Carlton Toronto* (209.8 m, 53); *List of tallest buildings* (209.5 m) | approximated → **reference** |

## Downgraded

| Record | Figure | Why | Grade |
|---|---|---|---|
| `maple-leaf-square-w` | 176 m, 54 fl | Published counts conflict (40/44 per Lanterra, 49 at 181 m, 65 at 186 m per Wikipedia); none match. | inferred → approximated |
| `maple-leaf-square-e` | 163 m, 50 fl | same | inferred → approximated |

## Could not verify

- **Maple Leaf Square, both towers.** Needs the City of Toronto building-permit
  record or the Lanterra/Page + Steele drawings for per-tower storeys.
- **ICE positions.** `ice-condos-w` sits east of `ice-condos-e` (x −330 vs −382).
  Which tower stands where needs City 3D Massing (OGL, cite; do not embed).
- **1 York and 1 Yonge heights.** Each has one source. CTBUH Skyscraper Center
  would settle both, but it returns 403 to automated fetches; check it by hand.
- **union-trainshed, brookfield-heritage-facades, mtcc-north/south,
  ripleys-aquarium.** Need drawings or City 3D Massing, not published headline
  figures. Not attempted this run.

## New traps

- `sourced-tower-figures` in `qa/traps.mjs` pins the five towers whose height
  and storeys now cite two sources or the owner. Failing case (verified): set
  `ice-condos-w` back to 234 m → `fail - ice-condos-w height 234 (published 202)`.

## Issues filed

- [#74](https://github.com/YichiZ/toronto-3djs/issues/74) `[P3] fidelity: l-tower`:
  modelled as a tapered slab; the real tower is Libeskind's curved sail. Needs
  geometry, not data.

## Screenshots

Taken with the Playwright harness (`qa/e2eHarness.mjs`) from the named
viewpoints that frame the changed towers. None of the ten records is framed
by a hero-block street viewpoint; the aerial and park views are the only named
spots that show them. That gap is recorded in the prompt. Both frames show the towers west of the
station in the right order of height, but at this distance the render does
not label which tower is which. They confirm nothing looks broken, not which
building is which.

## Test results

- `npm test`: 148/148 pass.
- `npm run qa`: 0 errors, 0 warnings; `sourced-tower-figures` passes.
- `npm run e2e`: 110/111. The failure is `share-link.e2e.mjs` "a copied link
  opens at its viewpoint" (stood 134.4 m from the Great Hall viewpoint). The
  test does not read tower records, and the file passed twice when re-run on
  its own. Treated as flaky, not caused by this change.

## Prompt changes

See the Changelog in `.agents/prompts/historian.md`. In short:
- Added a source ranking (owner spec sheets > Wikipedia list > per-building
  article > developer marketing), and noted that CTBUH returns 403.
- Said where screenshots and helper scripts go, because the file allowlist
  had no place for them.
- Noted that street viewpoints rarely frame the non-landmark towers: before
  picking, check which viewpoint shows each candidate.
