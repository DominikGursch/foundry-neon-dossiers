# Neon Dossiers

An original, system-independent **places and dossiers** module for Foundry VTT.
Unofficial compatibility with Cyberpunk RED; no rules or statblocks are
included. No third-party map is included. Select your own locally hosted,
authorized map image in Foundry's module settings.

**Neon Dossiers is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees.**

## City navigation: v0.5.0

Browse a map you provide, search places, filter
GM-defined categories and open dossiers from markers or the place list. GMs can create,
edit and delete places, select local dossier images, position markers by
dragging them in the dossier editor, clicking the map or entering coordinates, and share or revoke
dossier access. English and German interface translations are included.
While editing, drag the map background to pan without moving the marker;
click the background to place it. Moving a place clears any previously drawn
street access; after saving, draw a new access path if needed.

The module overlays the **actual Foundry map scene**, not a separate dossier
window. Numbered places open compact dossier cards directly over the map;
players never need to open a journal. District cards, personal route controls,
and route lines are on the scene too. The GM uses the same interface with a
collapsible tool menu and a side-card editor. Journal pages also show each
description in Foundry's journal directory; illustrations remain local files.
The independently authored red/black terminal layout has a
compact header, color-coded category strip, large draggable map, numbered
markers, full-height sidebands and a separate slide-out dossier. The left band
uses its upper half for districts and lower half for places, independently
scrollable. The right band includes routes, with zoom, counts and expandable
sources aligned to its right edge at the bottom.
Compact rectangular dossier tags reinforce the RED terminal look. In the
standalone board, a subtle monitor frame, static grain and scanlines do not
intercept input, animate, distort map coordinates or cover the dossier/editor
cards. The scene HUD adds faint scanlines, low-intensity signal flicker and a
slow rolling scan band across the full canvas, without clipping at HUD edges or
intercepting input. Reduced-motion preferences disable the scene screen effects
and stop the district border animation; high-contrast preferences hide screen overlays.

**No map is bundled.** The blank background is a neutral placeholder, with
no districts, places or roads. Upload a map you have permission to use through
Foundry's file browser and select it under **Module Settings > Neon Dossiers >
Custom map image**. Set its real-world width under **GM TOOLS > Map and
districts**, then draw districts and roads as desired.
For a new image the active GM's client detects its pixel dimensions automatically.
Existing saved dimensions are preserved; to correct an earlier configuration,
use **Detect image dimensions** in that editor and save the configuration.
Map geometry remains associated with the image, so review existing district and
road alignment after changing dimensions.
The map must be a local relative path; remote URLs are not supported.

An upgrade from the formerly bundled community image switches to the blank
background. Stored dossiers, notes and map configurations are not deleted or
automatically moved to a different image. Untagged legacy places are not shown
on new maps. Coordinates, districts and roads must be recreated or explicitly
restored for the selected image. You are responsible for rights and attribution
for images you supply.

**Target: Foundry VTT v12 only.** This module uses core v12 Application,
JournalEntry and ownership APIs. Unit tests and mocked lifecycle/UI checks are
not real-engine certification: this release has **not been run in a licensed
Foundry instance**. No `verified` compatibility claim is made. Other versions
are deliberately excluded pending engine testing. No game system is required;
integration with `cyberpunk-red-core` has not been runtime-tested.

## Install

In Foundry's **Add-on Modules > Install Module**, paste the latest-release URL:

```text
https://github.com/DominikGursch/foundry-neon-dossiers/releases/latest/download/module.json
```

The previous v0.2.0 manifest was pinned to that release and cannot discover newer
versions. To move from v0.2.0, use the new URL to reinstall/update the module
once; back up your world first. Future releases use the stable URL above.
Alternatively,
download the source/release files into `Data/modules/neon-dossiers/` so that
`module.json` is directly inside that directory, then restart Foundry.
Enable **Neon Dossiers** in your world.

Upload and select your own authorized image via **Game Settings > Configure
Settings > Module Settings > Neon Dossiers > Custom map image**. The module
starts with a blank 1000 × 800 placeholder until a map is selected.

Open **Game Settings > Configure Settings > Module Settings > Neon Dossiers >
Open Neon Dossiers**, use its map button under Journal Notes scene controls,
press **Shift+M**, or run a script macro:

```js
game.modules.get("neon-dossiers").api.open();
```

The GM's first open creates/views the managed scene. Activate it through
Foundry's scene navigation for players. Its interface appears automatically
when the scene loads; players do not need a hotkey, journal directory or window.
On entering the scene the image is fitted between the sidebands. Use **Fit map**
to restore this view after panning or zooming.
Opening the module from another scene as a player reports that the GM must
activate the map; it does not force a scene switch.

As GM, create a dossier with **GM TOOLS > Add place** and click **Share with
all players** when ready. Each player opens
their dossier cards independently; selection and routes are not broadcast.

## Test directly from GitHub

**Deutsch: [GitHub Pages Schritt für Schritt](docs/GITHUB_PAGES_DE.md)** —
what Pages does, where to click, why local edits are not yet online, and where
GitHub displays the published URL. Pages hosts only the demo, not Foundry.

The repository includes a static **GitHub Pages browser demo**, using the
**same scene HUD, data validation and route engine**, with a small
simulated canvas/Foundry adapter. It does not contain or require licensed Foundry
server software. Fresh demos start with a blank background and **without dossiers**.
The browser demo cannot upload a custom map; use Foundry for local image selection.
Add your own places, then share/revoke
as GM and switch to Player. Toggle Deutsch/English. In the fixed right **Route** band, choose a starting POI
and a destination, or click **Set start on map**.
Choose a district to open its card. The background canvas, panning and scene
lifecycle are adapter simulations, not the licensed Foundry engine.
For ground routes, first draw streets and connect places to them.
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
permissions. Reset clears only this demo's saved data. Image uploads require
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
(e.g. `v0.5.0`). The **Publish module release** workflow checks the version,
runs tests, builds the ZIP and attaches the ZIP and `module.json` to that tag's
release. CI artifacts alone do not make the manifest's release URL live.

## Working with places

**GM TOOLS > Manage categories** lets the GM add, rename and color categories
and set unique marker prefixes (1–4 uppercase letters/digits, starting with a letter).
The four original categories are editable starting defaults, not a fixed list.
Changes apply on **Save categories** and are shared with players in the world
(stored locally in the browser demo). Names and colors are public metadata;
do not put GM secrets in them. Stable internal IDs preserve dossier assignments
when names or colors change. A category cannot be deleted while any dossier,
including private or retained legacy dossiers, uses it; reassign those dossiers
first. At least one category must remain. Optional examples use the first
configured category if their original category has been removed.
The GM tool menu closes automatically after selecting an action.

Place codes combine that prefix with a permanent per-category number:
**Public Services**, prefix **PU**, produces **PU01**, **PU02**, etc.
Changing a prefix updates every corresponding label without changing numbers.
Searching, filtering, changing permissions or reloading never renumbers places.
New places receive the next unused higher number; deleted numbers remain gaps
until the category has reached **99**, then the lowest free number is reused.
A category can contain at most 99 places, including private and retained legacy
map dossiers. Moving a place to another category allocates a new number there.
Only Foundry's active GM can create or change collection dossiers and allocate
their numbers.
Existing dossiers receive numbers automatically when the active GM opens the
module. If a legacy category exceeds 99 places, a visible error asks the GM to
reassign/delete places; the board stays usable for that repair. Unassigned
numbers appear as `??` until migration succeeds. Counters survive deletion and
failed writes can leave reserved gaps.

**Add place** opens the editor with a centered marker position. Fill in a title,
category and plain-text description. Click the map while editing, or set X/Y
between 0 and 1 (left/top = 0, right/bottom = 1). Save creates a journal page
in the private collection. Choose a marker/list item to read or edit its dossier.
Its description is also readable in the journal directory.

**Dossier illustration** uses Foundry's file picker. Upload your permitted images
using Foundry's own file browser, then select them. Accepted formats are PNG,
JPEG, GIF, WebP, AVIF and SVG. Paths must be relative to Foundry's served
user-data root, e.g. `worlds/my-world/maps/district.webp`. Remote URLs, data
URLs, traversal, backslashes, query strings and encoded paths are rejected.
Use simple filenames with letters, digits, spaces, `_`, `-`, parentheses or `+`.
For hosted storage that only supplies absolute cloud URLs, copy an authorized
image into local user-data storage instead; external storage URLs are not
supported in this foundation.

New dossiers are associated with the selected image. Tagged or untagged legacy
dossiers remain stored but are not automatically placed on another map.
There is one active world map, with one module-managed scene. Custom sockets,
bulk dossier import/export and compendiums are not included.
Each image retains its own customized scale, district and road settings.

## Foundry scene and player access

Opening the module as GM, or clicking **Create / open map scene**, creates or updates the dedicated
scene, sets the background, disables token vision and opens it **only for the GM**.
Activate it through Foundry's scene navigation to bring players there.
The HUD mounts on scene load and follows Foundry's pan/zoom transform.
Click a coded place or a district for its slide-out dossier alongside the left
band. A short cyan-edged terminal reveal opens a readable card up to 420 px wide
and 720 px tall, with its own scrolling; reduced-motion disables the animation.
On narrower screens it overlaps the directory instead of squeezing the text.
Closing it preserves the selected district filter. GM editors use this same
drawer. District codes are directory-only, never drawn on the map. Selecting a
district filters the place directory and map markers by polygon geometry
(including boundary points), not stale dossier district assignments. Search
and category filters further narrow those results; **All districts** clears the
district filter without renumbering. Small place tags scale with map zoom.
The right **Route** band selects
start, destination and travel mode; the personal route appears directly on
the map. Walking is cyan, Bike green, driving blue, AV dashed violet.
Directional pulses and a destination arrow show travel from the chosen start
to the destination. Reduced-motion preferences disable the pulses. Normal
dossiers use Agent-style status text; technical guidance stays in GM editors
and this documentation.
GM-traced walking access is dashed amber. Foundry's usual canvas pan/zoom
controls remain available; the HUD also supplies zoom/center buttons.
Leaving the scene removes the HUD, pointer handlers and personal route.
No journal window or Journal Notes visibility toggle is required.

Only globally shared POIs get public scene notes: private locations must not
leak coordinates through the scene document. Retained legacy dossiers with
individual grants receive client-only HUD markers for authorized players.
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

New custom images begin with an empty street network. Draw the streets and
access paths required by your campaign; no routes are inferred from the image.

In the editor, **Check network** shows component counts for a chosen mode,
amber endpoints and red crossings without a shared node. A crossing warning
is not proof of an error: overpasses must stay disconnected. Component
counts ignore direction; try both travel directions when reviewing one-way
roads.

Existing saved street graphs are not automatically transferred between images.

Use **Map and districts** as GM to edit dimensions and scale with form fields
and to create, edit or remove districts and draw their boundaries on the map.
District corners move live while dragging. Small midpoint handles insert corners;
select a corner and press Delete or use **Delete corner** to remove it. Undo/redo
and Ctrl/Cmd+Z (Shift to redo) restore shape edits. While drawing, click adds a
corner and drag pans. Click the first corner or **Finish boundary** to close,
with at least three corners. Redrawing requires confirmation and remains undoable.
Saving applies the draft; cancelling preserves the original boundaries.
Selected districts have a subtle neon-yellow fill and an animated yellow/black
perimeter inspired by police barrier tape, distinct from the map's red zones.
Set `kmAcross` to the campaign horizontal span; the default 10 km is an editable
placeholder, not an official distance. All atlas fields are public; never put
GM secrets in districts, road IDs or descriptions.

District filtering uses each place's position within the district polygon.
District edits are saved for the selected map image.

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
Auto/Bike endpoints on mapped pedestrian paths can now walk along that graph
to a vehicle street, then travel by vehicle and walk the final approach.
Amber legs are actual mapped paths (or explicitly traced access), included
in distance/time at 5 km/h. This does not extend the 20 m snap distance, invent
water crossings or allow vehicles onto pedestrian paths. Such mixed trips
minimize estimated travel time while respecting each leg's direction rules.

**Bike means motorcycle**, not bicycle: urban estimates use 35 km/h for
both motorcycles and cars. Legacy configurations without `transportVersion: 2`
derive motorcycle permissions from car permissions, retaining one-way rules
and removing the old bicycle permissions. A formerly bicycle-only segment
with no other permitted mode is removed; paths that also allow walking remain
walkable. The marker prevents later
GM-authored motorcycle restrictions from being overwritten. Saved map
coordinates, districts, scale and dossiers are preserved.

Edges are **bidirectional by default**, straight street segments between nodes; place
additional nodes at bends and actual junctions. Connect bridges explicitly and
do not add edges through water, buildings or other barriers. Crossed lines are
not connected unless they share a node ID. Mode restrictions can represent
pedestrian-only streets. Optional `"oneWay": true` permits only `from` → `to`
for all modes listed on that edge. Use separate mode-specific edges if
pedestrians may travel both ways. Roads can be drawn and inspected on the map. There is
no automatic runtime map-image road extractor.

Routing uses Dijkstra's shortest-distance path over mode-compatible edges,
accounting for image aspect ratio and scale. The estimate uses 5/35/35 km/h for
walking/motorcycle/car. Amber dashed **walking access legs** are included in
distance and walked at 5 km/h even for car/bike.
Unconnected places and disconnected/unconfigured roads produce a visible error, **never a
straight-line driving fallback**. AV is explicitly a 100 km/h straight-line
flight estimate without airspace/landing checks. No traffic, encounters, game
clock advancement, current GPS position or Google Maps service is included.
Routes and start positions are personal to each client/scene and not persisted
or broadcast. Private/revoked POIs cannot remain as cached starts/destinations.

## Permissions and private information

The active GM creates a **Neon Dossiers** folder containing three core
JournalEntry documents: private places, shared places, and private GM notes.
Each place is a separate page; its optional GM notes are on a page of the same
name in the notes journal. Foundry enforces journal permissions on the server.
New places are private. Sharing moves the page to the shared journal for all
players; making it private moves it back. Individual player grants are not
supported for collection dossiers. Renaming the folder or journals is safe,
but do not alter their ownership or page permissions.

Edit dossiers and notes in Neon Dossiers, not in the journal directory: the
module stores structured data in page flags and displays descriptions as journal
text. External edits to generated page text are not automatically imported and
block module updates to avoid overwriting them. Back up any such edits before
restoring the generated text. Deleting a place in the module removes its note
page as well. If a place page is deleted in the directory, the active GM cleans
up its corresponding note page; check for orphans if no active GM is online.

Existing individual journals are **not migrated** into the collections. Back up
your world before updating or deleting old places and journals. Old journals
can be removed manually after preserving any data you need.
Foundry does not document a fixed journal-count limit; large worlds can still
affect performance. [The Forge's world-size guidance](https://forums.forge-vtt.com/t/world-size-check/12105)
suggests roughly 2,000 world documents as a performance guideline, not an
engine limit. Collections reduce the number of top-level journal documents.

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

The four former original SVG assets have been removed; their historical CC BY 4.0
attribution remains in [`LICENSES/ASSETS.md`](LICENSES/ASSETS.md).
No publisher fan-policy restrictions are added to the MIT software license.
No third-party map artwork is included. The user must verify permissions and
attribution for any image they add.

[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) records provenance and the
license boundary. [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) explains the
official DLC links and why free downloads are not redistribution licenses.
The module makes no automatic third-party map requests at runtime.

## Development and verification

Node.js 22+; no npm dependencies or installation step:

```text
npm test
npm run build
npm run build:preview
```

The builder creates `dist/neon-dossiers-0.5.0.zip` with `module.json` at the
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
