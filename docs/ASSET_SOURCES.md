# Asset sources and modifications

Source verification: **6 November 2026**. Maps are served locally from this
module, including its GitHub Pages demo; no third-party map is hotlinked at
runtime. Atlas image credits remain embedded. Credits and policy text removed
from the community map's sidebars are reproduced here and in the installed
`THIRD_PARTY_NOTICES.md`, as well as the map's visible source link.

## Night City Atlas: included

Publisher: **R. Talsorian Games**. Cartography: **Saga MacKenzie**.
Writing/design: **J Gray**. Copyright © 2025 R. Talsorian Games, Inc.
Cyberpunk is a registered trademark of CD Projekt Red S.A.

- Official download index: https://rtalsoriangames.com/downloadable-content/
- User-supplied Atlas v1.01:
  https://rtalsoriangames.com/wp-content/uploads/2025/01/RTG-CPR-DLC-NightCityAtlasv1.01.pdf
- Official map archive linked on that index:
  https://rtalsoriangames.com/wp-content/uploads/2025/01/Night-City-2045-Atlas-Maps-1.01.zip

| Bundled file | Original file inside the archive | Modification |
| --- | --- | --- |
| `assets/night-city-atlas-districts.webp` | `Night City 2045 Atlas Maps/Night City 2045 Atlas w District Names.jpg` | 6600 × 10200 JPG resized to 3600 × 5564 and encoded as WebP, quality 88 |
| `assets/night-city-atlas-streets.webp` | `Night City 2045 Atlas Maps/Night City 2045 Atlas Street Names Only.jpg` | Same resize and encoding |

Neither file is cropped, repainted or rebranded. These two variants share
geometry and therefore share the module's POI coordinates and map configuration.
The source PDF and map archive are not bundled in their entirety.

## Community map: included

Post: **“Night City 2045 Map, cleaned and updated.”**, **u/Ced23Ric**:
https://www.reddit.com/r/cyberpunkred/comments/z1744r/night_city_2045_map_cleaned_and_updated/

Attribution chain stated by the post and retained in the image:

- **Ced23Ric / Ced Riggs** — cleanup, revisions, layout and overlays.
- **u/Rodhlann** — preceding combined map / zone-overlay version.
- **u/writerscthulhu / The Writer's Cthulhu** — detailed base map.
- **J. Gray / R. Talsorian Games** — original Night City 2045 cartography
  from the Cyberpunk RED core book, p. 296.
- **R. Talsorian Games and CD Projekt Red** — underlying game IP and the
  publisher/game imagery in the original image's sidebars, removed from the
  bundled crop.

The post links the author's marker-free JPG:
https://www.ced23ric.de/cpr-pbp/CyberpunkRed_NightCity2045_full_map_rework_blind.jpg

The author's host could not be reached during this session. The included file
was obtained from the **exact marker-free Reddit image selected by the user**:

<https://preview.redd.it/night-city-2045-map-cleaned-and-updated-v0-jj4tfvo5l52a1.jpg?width=3615&format=pjpg&auto=webp&s=4620a4587b171a6b594a93a6f54a45bb6e4c4a7a>

| Bundled file | Source dimensions | Modification |
| --- | --- | --- |
| `assets/night-city-community-unmarked.webp` | 3615 × 2408 | Cropped at x=549, y=0 to 2519 × 2408; no resize; encoded as WebP, quality 90 |

At the user's request, both black side panels and their red separator lines
were removed. The central map, title, district names, road shields, zone key
and scale bar remain; there are **no printed POI markers**. This exact image
depicts an intact City Center, unlike the previously bundled Hot Zone variant.
The community district card reflects this difference; its campaign threat
rating is still editable and not an official historical claim.
The old marked map is no longer bundled. The GM can add POIs manually;
seven optional example dossiers are created only on explicit request.

The removed source credit reads: **Overlay Map by J Gray · Detail Map by
The Writer's Cthulhu · Layout by Ced Riggs**. Copyright © 2022 R. Talsorian
Games, Inc. Cyberpunk is a registered trademark of CD Projekt Red S.A.
The removed policy text is preserved here:

**This map is unofficial content provided under the Homebrew Content Policy
of R. Talsorian Games and is not approved or endorsed by RTG. This content
references materials that are the property of R. Talsorian Games and its
licensees.**

The browser initially encountered Reddit's human verification. After the user
completed that verification, the post and its original links were inspected
directly. The previously documented unresolved-author status is superseded.

## Rights boundary for third-party maps

The repository owner explicitly requested use of both map sources and
confirmed that they may be used with attribution on 6 November 2026.
The community post also states that its files were updated to comply with
RTG's Homebrew Content Policy. The integration records that basis; it does
**not** assert that these maps are MIT, Creative Commons, public domain, or
licensed by this repository for unrestricted reuse.

Publisher policy: https://rtalsoriangames.com/homebrew-content-policy/

All third-party rights remain with their respective holders. Anyone
redistributing or adapting these maps, especially for commercial purposes,
must independently check the upstream terms and any needed permissions.
The repository's MIT code license and CC BY license for original SVGs cannot
grant rights to these third-party maps. This record is provenance, not a
legal opinion or a claim of publisher endorsement.

## Original module assets

| Included file | Author/source | License |
| --- | --- | --- |
| `assets/harbor-grid.svg` | DominikGursch, original fictional schematic map | CC BY 4.0 |
| `assets/exchange.svg` | DominikGursch, original Lantern Exchange illustration | CC BY 4.0 |
| `assets/commons.svg` | DominikGursch, original Tidal Commons illustration | CC BY 4.0 |
| `assets/relay.svg` | DominikGursch, original Relay Nine illustration | CC BY 4.0 |

Original asset source repository:
https://github.com/DominikGursch/foundry-neon-dossiers/tree/main/assets

Scope, license link and suggested attribution: `LICENSES/ASSETS.md`.
These SVGs are unchanged. They depict original fiction, not Night City.

## District, POI and route annotations

`scripts/city.js` contains independently written short district/POI summaries,
district names and faction facts referenced to the Atlas. Eight starter POIs
reference Atlas identifiers/pages in their descriptions; seven have separate
anchors on the community map. This is **not the full Atlas location catalog**.
The Atlas `Full.jpg` variant was consulted to position its POI labels but is
not bundled. The community anchors were read from the earlier labeled image,
then transformed to the marker-free crop: x=(oldX×3615−549)/2519, y=oldY.
The same transform applies to district polygons and road nodes. Its distinct
asset path prevents old full-image settings/POIs from being reused on the crop.

District polygons and street nodes were manually positioned on **each** map
and are approximate overview annotations, not surveyed or exhaustive GIS
data. The two maps have different geography and **do not** share coordinates.
The Atlas preset includes 24 district annotations; the community preset
includes 17. Community districts may not match the later Atlas's boundaries.

**Threat levels are editable campaign defaults, not official Atlas ratings.**
The preset horizontal spans (Atlas: 12 km; cropped community: approximately
12.54 km, computed as 18×2519/3615 to preserve the earlier full-image scale)
are campaign assumptions, not a canonical geographic scale. The Atlas itself explains on
p. 3 that Night City is not assigned fixed dimensions.
Roads cover a selection of streets and bridges, not every street.
`scripts/community-roads.js` expands this specific marker-free image's
network to 696 nodes and 995 segments, including local streets in Watson,
Little Europe/University, South Night City, City Center/Bank Block/Med Center,
the Glen/Japantown, Westbrook, mainland Heywood, Rancho Coronado and Pacifica.
Street bends and intersections were read from enlarged local image crops;
overlaid lines and a water-color heuristic were used as review aids, not
as an authoritative obstacle detector. Explicit at-grade junction decisions
split reviewed crossing segments; unreviewed crossings are never joined
automatically. Northern/southern bridge alignments and legacy street anchors
were corrected against this image, independently of unchanged POI positions.
The Lake Park paths permit walking/cycling only as a campaign assumption.
Other included roads default to bidirectional walking/cycling/driving:
the source image does not establish traffic rules or access permissions.
Morro Rock and Executive Zone interiors and many minor streets remain
unmapped. The data are hand-positioned campaign approximations, **not an
exhaustive street survey or a claim that every visible way was recognized**.
No bundled image or district/POI coordinate was changed for this extension.
Endpoints only snap within 20 m of a mapped street. Longer access paths must
be traced explicitly by the GM and are separately marked in amber; legacy
POI anchors and their road-node assignments do not certify a walkable entrance.
Neither card descriptions nor routing replaces the original books.

`scripts/atlas.js` and the Harbor Grid starter prose retain their original
fictional demo data. No external fonts, icon packs or JavaScript/CDN
dependencies are required by the runtime or preview.

## Interface reference

https://github.com/samroaleksej-bit/night-city-map

The README, metadata and overview/district screenshots were consulted for the
requested map-first layout: compact header, category strip, numbered markers
and a right-hand dossier. No repository license was declared in the metadata
when checked. No source code, map files, road masks, POI art, datasets or
screenshots from that repository are bundled. Maps here were obtained from
the original sources above. The red/black terminal UI is independently authored,
not a pixel-identical clone or a claim of affiliation.
