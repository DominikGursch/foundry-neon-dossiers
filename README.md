# Neon Dossiers

An original, system-independent **places and dossiers** module for Foundry VTT.
Unofficial compatibility with Cyberpunk RED; no rules or statblocks are
included. Attributed Night City maps are bundled as separate third-party
assets, not relicensed under the module's MIT license.

**Neon Dossiers is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees.**

## City navigation: v0.2.0

Browse Night City on the supplied Atlas or community map, search places, filter four
categories and open dossiers from markers or the place list. GMs can create,
edit and delete places, select local map/dossier images, position markers by
dragging them in the dossier editor, clicking the map or entering coordinates, and share or revoke
dossier access. English and German interface translations are included.
While editing, drag the map background to pan without moving the marker;
click the background to place it.
Starter descriptions are in English.

The module overlays the **actual Foundry map scene**, not a separate dossier
window. Numbered places open compact dossier cards directly over the map;
players never need to open a journal. District cards, personal route controls,
and route lines are on the scene too. The GM uses the same interface with a
collapsible tool menu and a side-card editor. Journals remain the invisible
storage and permission layer; illustrations remain local files.
The independently authored red/black terminal layout has a
compact header, color-coded category strip, large draggable map, numbered
markers, collapsible navigation and floating right-hand dossier cards.
Compact rectangular dossier tags and a subtle monitor frame, static grain
and scanlines reinforce the RED terminal look. The effects do not intercept
input, animate, distort map coordinates or cover the dossier/editor cards.
High-contrast display preferences disable the monitor overlays.

**Included maps:** Night City Atlas with district names, Atlas with streets
only, and Ced23Ric's community Night City 2045 map. The original Harbor Grid
fictional map remains available. Choose a map from the GM's **Map selection**
dropdown. Atlas presets include 24 district annotations and eight starter
dossiers; the community preset has 17 district annotations and seven
separately positioned starter dossiers. This is not a full Atlas POI import.
The community map is the **default for unconfigured worlds and fresh demos**.
Saved map selections and custom configurations are not overwritten.
The community image is the requested marker-free version, cropped to remove
the black side panels. It starts without POIs; the GM can add dossiers manually.
Starter dossiers are optional and created only via **Add starter places**.
This image depicts an intact City Center rather than the Hot Zone; use the
official Atlas if your campaign needs the later geography.

**Threat levels, preset scales, boundaries and partial roads are campaign
approximations**, not official ratings or complete street data. Sources,
attributions and exact map modifications are recorded in
[`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md). Copyright credits are also
visible beneath the map. Atlas credits remain inside the images; credits
removed from the community sidebars are reproduced in the shipped notices.

**Target: Foundry VTT v12 only.** This prerelease uses core v12 Application,
JournalEntry and ownership APIs. Unit tests and mocked lifecycle/UI checks are
not real-engine certification: this release has **not been run in a licensed
Foundry instance**. No `verified` compatibility claim is made. Other versions
are deliberately excluded pending engine testing. No game system is required;
integration with `cyberpunk-red-core` has not been runtime-tested.

## Install

In Foundry's **Add-on Modules > Install Module**, paste the version-pinned URL:

```text
https://github.com/DominikGursch/foundry-neon-dossiers/releases/download/v0.2.0/module.json
```

This URL requires the v0.2.0 release assets to have been published. Alternatively,
download the source/release files into `Data/modules/neon-dossiers/` so that
`module.json` is directly inside that directory, then restart Foundry.
Enable **Neon Dossiers** in your world.

Open **Game Settings > Configure Settings > Module Settings > Neon Dossiers >
Open Neon Dossiers**, use its map button under Journal Notes scene controls,
press **Shift+M**, or run a script macro:

```js
game.modules.get("neon-dossiers").api.open();
```

The GM's first open creates/views the managed scene. Activate it through
Foundry's scene navigation for players. Its interface appears automatically
when the scene loads; players do not need a hotkey, journal directory or window.
Opening the module from another scene as a player reports that the GM must
activate the map; it does not force a scene switch.

As GM, open **GM TOOLS > Add starter places** once to create private
starter dossiers for the selected map.
Select one and click **Share with all players** when ready. Each player opens
their dossier cards independently; selection and routes are not broadcast.

## Test directly from GitHub

**Deutsch: [GitHub Pages Schritt für Schritt](docs/GITHUB_PAGES_DE.md)** —
what Pages does, where to click, why local edits are not yet online, and where
GitHub displays the published URL. Pages hosts only the demo, not Foundry.

The repository includes a static **GitHub Pages browser demo**, using the
**same scene HUD, data validation and route engine**, with a small
simulated canvas/Foundry adapter. It does not contain or require licensed Foundry
server software. Fresh demos start on the community map **without dossiers**.
Add your own places (or explicitly add optional starters), then share/revoke
as GM and switch to Player. Toggle Deutsch/English. Open **Route / Places**, choose a starting POI
and a destination, or click **Set start on map**.
Choose a district to open its card. The background canvas, panning and scene
lifecycle are adapter simulations, not the licensed Foundry engine.
Starter POI anchors are **not verified street entrances**. For ground routes,
trace their access paths first, or place new POIs directly on mapped streets.
Old distant `roadNode` assignments no longer invent straight access lines.

1. Push these changes to GitHub. Under **Settings > Pages > Build and deployment**,
   select **GitHub Actions** (requires repository admin access).
2. Merge to `main`, or run **Actions > Deploy browser preview > Run workflow**
   on the intended branch. A successful deployment provides its actual URL in
   the run's `github-pages` environment. No live deployment is assumed here.
3. **Actions > Test and package** runs on pushes and PRs. Its artifacts contain
   an installable module ZIP/manifest and a separate static browser preview.

The demo stores changes only in browser localStorage. It is not multiplayer;
the role toggle is a UI simulation, **not an authorization boundary**. Do not
enter secrets in a public demo or rely on it to verify Foundry's server-side
permissions. Reset clears only this demo's saved data. Its file picker offers
bundled sample images; actual uploads and individual ownership dialogs require
Foundry. Blocking browser storage prevents startup and reports an error.

For local use (Node.js 22+, no dependencies):

```text
npm run preview
```

Open `http://127.0.0.1:4173`. On Windows with PowerShell script execution
disabled, use `npm.cmd` instead of `npm`. To stop the server, press Ctrl+C.
Opening the HTML via `file://` is not supported.

To publish a Foundry-installable release, keep `package.json`, `module.json`
version and the manifest/download URLs aligned, then push the matching tag
(e.g. `v0.2.0`). The **Publish module release** workflow checks the version,
runs tests, builds the ZIP and attaches the ZIP and `module.json` to that tag's
release. CI artifacts alone do not make the manifest's release URL live.

## Working with places

**Add place** opens the editor with a centered marker position. Fill in a title,
category and plain-text description. Click the map while editing, or set X/Y
between 0 and 1 (left/top = 0, right/bottom = 1). Save creates a core journal
document. Choose a marker/list item to read or edit its dossier. The journal's
module flags, not its blank core journal page view, hold the public dossier.

**Local map image** uses Foundry's file picker. Upload your permitted images
using Foundry's own file browser, then select them. Accepted formats are PNG,
JPEG, GIF, WebP, AVIF and SVG. Paths must be relative to Foundry's served
user-data root, e.g. `worlds/my-world/maps/district.webp`. Remote URLs, data
URLs, traversal, backslashes, query strings and encoded paths are rejected.
Use simple filenames with letters, digits, spaces, `_`, `-`, parentheses or `+`.
For hosted storage that only supplies absolute cloud URLs, copy an authorized
image into local user-data storage instead; external storage URLs are not
supported in this foundation.

New dossiers are associated with their map family. The two Atlas variants
share coordinates; the community map and Harbor Grid use separate datasets.
Switching presets hides other maps' tagged POIs without deleting them.
Legacy untagged dossiers remain visible for backward compatibility; edit and
save them on the intended map to associate them with it.
There is one active world map, with one module-managed scene. No drag-to-move,
custom sockets, bulk dossier import/export or compendium is included.
Map configurations are saved per map family, so switching away and back
preserves customized scale, district and road settings.

## Foundry scene and player access

Opening the module as GM, or clicking **Create / open map scene**, creates or updates the dedicated
scene, sets the background, disables token vision and opens it **only for the GM**.
Activate it through Foundry's scene navigation to bring players there.
The HUD mounts on scene load and follows Foundry's pan/zoom transform.
Click a numbered place once for its dossier card. **Route / Places** selects
start, destination and travel mode; the personal route appears directly on
the map. Walking is cyan, cycling green, driving blue, AV dashed violet.
GM-traced walking access is dashed amber. Foundry's usual canvas pan/zoom
controls remain available; the HUD also supplies zoom/center buttons.
Leaving the scene removes the HUD, pointer handlers and personal route.
No journal window or Journal Notes visibility toggle is required.

Only POIs whose default journal ownership is **Observer or higher**, with no
explicit lower player grant, get scene
notes: private or individually shared locations must not leak coordinates
through the scene document. Individually shared dossiers receive **client-only
HUD markers** for authorized players, never public note documents.
Core note icons are hidden on the managed scene to avoid duplicate markers.
Core journal permissions remain
authoritative for note access. Public note position/title changes and
share/revoke/delete operations synchronize while an active GM is online;
ready-time synchronization repairs the scene on the next GM connection.
Synchronization errors are reported in notifications and the console; click
the scene button to retry. In a multi-GM world, automatic synchronization uses
Foundry's active GM.

The module only manages its flagged notes; unrelated notes are preserved.
The scene's background, dimensions, vision and grid are module-managed, so do
not repurpose this scene as a tactical map. Change POI positions in the dossier
editor, not by dragging the derived scene notes. Deleting the scene does not
delete dossiers; use the scene button to recreate it.

## Districts, scale and roads

Use **GM TOOLS > Edit street network** to adjust streets on the scene. Drag
points, select a segment to set each mode's allowed direction, double-click
the segment or use **Insert point** to add a bend, or choose **Draw road**
and click existing points to connect new streets. Select a point or segment
and press Delete or use the delete button. Undo/redo is available until
**Save street network**; cancel discards the draft after confirmation.
Moving or deleting points may affect existing place access paths: the GM is
warned before saving and must review affected places. All road geometry is
public and the GM is responsible for tracing traversable streets, not
shortcuts through water or buildings.
Dossier markers are hidden during street editing so they cannot obstruct
street segments or points. Outside that mode, select a dossier and choose
**Edit dossier** to drag its marker; save to keep the new position. Cancelling
leaves the stored dossier and its access path unchanged. A moved dossier's
previous access path is removed when saved and may need to be traced again.

**Community street survey:** `scripts/community-roads.js` records 696
image-positioned junctions/bends and 995 segments. It expands Watson, the
island street grid and City Center rings, the Glen, Westbrook, mainland
Heywood, Rancho Coronado and Pacifica. The northern/southern bridges are
explicit; Lake Park links are restricted to walking/cycling. Coordinates
were inspected against image crops and street overlays; at-grade junction
decisions are explicit, not inferred from every geometric crossing.
This is **still not every visible alley or road**, and is not an automated
image-recognition service. Morro Rock and Executive Zone interiors, many
minor streets, access restrictions and official traffic directions remain
unmapped. Bidirectional access and allowed modes are editable campaign
assumptions, not facts extracted from road signs.

In the editor, **Check network** shows component counts for a chosen mode,
amber endpoints and red crossings without a shared node. A crossing warning
is not proof of an error: overpasses must stay disconnected. Component
counts ignore direction; try both travel directions when reviewing one-way
roads.

Existing saved street graphs are **not automatically replaced** by this
expanded survey. In the editor, **Load current preset streets** requires
confirmation and replaces only this family's
street nodes/edges, not scale, districts, dossiers or other map families.
Corrected street coordinates can invalidate previously traced POI access
paths: check and retrace those after replacing a saved graph.

Use **Map and districts** as GM to edit dimensions and scale with form fields
and to create, edit or remove districts and draw their boundaries on the map.
Choosing a bundled preset loads that map's own configuration.
Choosing an unconfigured custom image deliberately starts with **no roads or
districts**, instead of reusing unrelated geometry. Set `width` and `height` to the image's
pixel dimensions and `kmAcross` to the real horizontal span. The default 10 km
span for Harbor Grid is only a fictional demo scale. The Atlas defaults to a
12 km horizontal span and the cropped community map to approximately 12.54 km
(the earlier full-image 18 km assumption adjusted for the crop); these are explicitly
campaign assumptions, not official distances. The Atlas does not define fixed
dimensions for Night City. All atlas fields are public; never put
GM secrets in districts, road IDs or descriptions.

Assign a district in each POI's editor; membership is explicit, not inferred
from polygon overlap. District edits are saved for the selected map family.

**Connecting a place:** a ground-route endpoint must lie within **20 metres**
of a mode-compatible mapped street segment. It snaps to that segment, not a
distant intersection; no connector is drawn or counted for this tolerance.
Otherwise edit the dossier and choose **Trace access on map**: starting at
the POI, click walkable waypoints and finish by clicking a red street node.
The dossier stores `roadNode` and `access` (2-100 normalized `{x,y}` points,
first at the POI, last at that node). These are explicit GM-authored walking
legs, not automatic obstacle detection. Moving the POI clears its traced
access. A bare legacy `roadNode` is only usable within the same 20 m tolerance;
more distant assignments now report missing access rather than invent a path.
Existing off-road starter anchors need the same review.

Edges are **bidirectional by default**, straight street segments between nodes; place
additional nodes at bends and actual junctions. Connect bridges explicitly and
do not add edges through water, buildings or other barriers. Crossed lines are
not connected unless they share a node ID. Mode restrictions can represent
pedestrian-only streets. Optional `"oneWay": true` permits only `from` → `to`
for all modes listed on that edge. Use separate mode-specific edges if
pedestrians may travel both ways. Roads can be drawn and inspected on the map. There is
no automatic runtime map-image road extractor.

Routing uses Dijkstra's shortest-distance path over mode-compatible edges,
accounting for image aspect ratio and scale. The estimate uses 5/15/35 km/h for
walking/bike/car. Amber dashed **GM-traced access legs** are included in
distance and walked at 5 km/h even for car/bike.
Unconnected places and disconnected/unconfigured roads produce a visible error, **never a
straight-line driving fallback**. AV is explicitly a 100 km/h straight-line
flight estimate without airspace/landing checks. No traffic, encounters, game
clock advancement, current GPS position or Google Maps service is included.
Routes and start positions are personal to each client/scene and not persisted
or broadcast. Private/revoked POIs cannot remain as cached starts/destinations.

## Permissions and private information

Public dossiers are core **JournalEntry documents**. Foundry enforces their
ownership on the server. New places default to no player access. Players see
only documents for which core permissions grant **Observer** or higher.
**Permissions** opens Foundry's ownership dialog for individual access.
**Make private** resets all player grants, not just the default permission.
Permission/document hooks re-check access and discard rendered dossier content.
An external document/user update also closes an unsaved editor to avoid showing
stale access; save your work before changing ownership elsewhere.

**Private GM notes live in separate GM-only JournalEntry documents**, never in
public place flags, world settings or custom socket payloads. These private
documents are named `Private GM notes (place-id)` (localized). Do not manually
grant players access to those documents. Deleting a place through the module
deletes its private note document too. Deleting directly through the core
directory can leave an orphan private note document; remove it there as GM.

Sharing a dossier exposes its entire public description and image path.
Permission revocation removes the current module view; it cannot erase text
already read, screenshots, browser caches or externally downloaded files.
Foundry-served image URLs are **not** access-controlled dossier storage: a
private journal does not make an uploaded image secret. Do not put secret
information in filenames or rely on hidden marker locations for file privacy.
All GMs can read GM notes. Core document ownership remains authoritative; an
Owner grant may allow editing using other Foundry tools.

## Licensing and image rights

Software, translations, documentation and original starter prose: **MIT**,
see the existing [`LICENSE`](LICENSE). Reuse, modification and commercial use
are allowed with the MIT notice retained.

All four original SVG files under `assets/`: **CC BY 4.0**, attributed to
**DominikGursch**. See [`LICENSES/ASSETS.md`](LICENSES/ASSETS.md) for scope,
license links and a ready-to-use attribution. No publisher fan-policy
restrictions are added to the MIT software license. The three
`night-city-*.webp` maps are **third-party assets, not MIT or CC BY**. They are
included following the repository owner's confirmed attribution-based use;
that does not grant downstream users unrestricted reuse rights.

[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) records provenance and the
license boundary. [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) explains the
official DLC links and why free downloads are not redistribution licenses.
The module bundles the documented map variants locally and makes no
automatic third-party map requests at runtime.

## Development and verification

Node.js 22+; no npm dependencies or installation step:

```text
npm test
npm run build
npm run build:preview
```

The builder creates `dist/neon-dossiers-0.2.0.zip` with `module.json` at the
archive root and a standalone `dist/module.json`. Only runtime files and
licensing/provenance notices, including `docs/ASSET_SOURCES.md`, are installed;
tests, tools and other development docs
and Git metadata are excluded. `dist/preview` is a separate static site and is
never installed as part of the Foundry module.

Before calling a future release engine-verified, check in a real v12 world:
open both settings menu and toolbar; add/edit/delete; select a local image;
resize the board; check keyboard focus; connect a non-GM; share/revoke a
dossier while it is open on that client; confirm private notes never appear
in that client's journal data/network traffic; reload both clients; and try
the intended game system. Also create/activate the map scene, single-click HUD markers as a player,
pan/zoom and resize with a route visible, check marker/line alignment, draw
roads and access paths, switch scenes repeatedly, revoke individually shared
places, and verify no stale route/listeners or duplicate core note icons remain.
Configure real image dimensions/scale, test an unconnected place, a
disconnected road and mode restrictions, and inspect a district containing
both public and private places. This checklist
is not a claim those engine checks ran.
