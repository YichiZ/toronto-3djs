# Historian working notes

Append-only. Newest run at the bottom.

## Run 1 — 2026-09-11

### Sources
| Source | Useful? | Notes |
|---|---|---|
| Wikipedia, "List of tallest buildings in Toronto" | yes | One fetch covers most towers above ~200 m. Misses anything under ~180 m (TD South, 1 York, 300 Front, Maple Leaf Square). |
| Wikipedia per-building articles | yes | Infobox gives height, storeys, year. |
| Cadillac Fairview technical spec PDFs | yes, best | Owner data. WebFetch cannot parse them; Read the saved PDF with `pages`. The TD South sheet says "151 m" next to 503'10" (= 153.6 m); trust the imperial figure. |
| UrbanToronto project database | yes | Height and storeys for residential towers. |
| Developer pages (Menkes, Lanterra) | partly | Storeys yes, heights rarely. Marketing storey counts can disagree with Wikipedia. |
| SKYDB | ok | Only as a second source. |
| skyscrapercenter.com (CTBUH) | no | HTTP 403 from WebFetch. Do not retry. |
| ACO Toronto | no | Heritage context only, no dimensions. |

### Verified
- td-south-tower: 153.6 m, 39 storeys, 1985 (CF spec + Wikipedia). Code had 178/46.
- ice-condos: 12 York = 202 m / 57 (2014), 14 York = 234 m / 67 (2015). Code had them swapped.
- l-tower 205/58 and ritz-carlton 209/53: code already right.
- one-york 174 m / 35 (height single-source). Code had 150.
- yonge-front-se (1 Yonge) 101 m / 25, 1970 (single source). Code had 92.
- front-w-condo-1 (300 Front W) 156 m / 49. Code had 172.

### Rejected / unresolved
- Maple Leaf Square: sources give 40/44, 49 (181 m) and 65 (186 m) storeys. None match 54/50. Downgraded, not changed.
- ICE record ids: `ice-condos-w` sits EAST of `ice-condos-e` (x -330 vs -382). Positions are unsourced; left alone.

### Still open
- union-trainshed extent and height, brookfield-heritage-facades, mtcc-north/south, ripleys-aquarium: need drawings or City 3D Massing, not a quick search.
- Every generic `approximated` infill block: the addresses are real, but no published figures were checked yet.

### Test notes
- `share-link.e2e.mjs` failed once in the full run (Great Hall teleport 134 m off), passed 2/2 alone. Flaky; unrelated to data edits.
- The aerial and park screenshots are too far away to identify single towers. A future run wants a close orbit viewpoint on the York/Bremner cluster.
