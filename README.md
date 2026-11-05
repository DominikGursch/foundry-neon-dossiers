# Neon Dossiers

An original, system-independent **places and dossiers** module for Foundry VTT.
Unofficial compatibility with Cyberpunk RED; no rules, statblocks, official
maps or publisher artwork are included.

**Neon Dossiers is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees.**

## First foundation: v0.1.0

Browse an original fictional district map, search places, filter four
categories and open dossiers from markers or the place list. GMs can create,
edit and delete places, select local map/dossier images, position markers by
clicking the map or entering normalized coordinates, and share or revoke
dossier access. English and German interface translations are included.
The original English starter fiction is not translated.

**Target: Foundry VTT v12 only.** This prerelease uses core v12 Application,
JournalEntry and ownership APIs. Unit tests and mocked lifecycle/UI checks are
not real-engine certification: this release has **not been run in a licensed
Foundry instance**. No `verified` compatibility claim is made. Other versions
are deliberately excluded pending engine testing. No game system is required;
integration with `cyberpunk-red-core` has not been runtime-tested.

## Install

In Foundry's **Add-on Modules > Install Module**, paste the version-pinned URL:

```text
https://github.com/DominikGursch/foundry-neon-dossiers/releases/download/v0.1.0/module.json
```

This URL requires the v0.1.0 release assets to have been published. Alternatively,
download the source/release files into `Data/modules/neon-dossiers/` so that
`module.json` is directly inside that directory, then restart Foundry.
Enable **Neon Dossiers** in your world.

Open **Game Settings > Configure Settings > Module Settings > Neon Dossiers >
Open Neon Dossiers**, use its map button under Journal Notes scene controls,
or run a script macro:

```js
game.modules.get("neon-dossiers").api.open();
```

As GM, click **Add starter places** once to create three private examples.
Select one and click **Share with all players** when ready. Each player opens
the board separately; it never forces windows open on other clients.

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

Changing the map preserves normalized positions; reposition places if the new
map has different geography/aspect ratio. There is one world map, no scene
linking, drag-to-move, custom sockets, bulk import/export or compendium yet.
The map is intentionally schematic, not a geographical Night City reference.

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
restrictions are added to the MIT software license.

[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) records provenance and the
license boundary. [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) explains the
official DLC links and why free downloads are not redistribution licenses.
The module neither bundles nor automatically fetches official DLC images.

## Development and verification

Node.js 22+; no npm dependencies or installation step:

```text
npm test
npm run build
```

The builder creates `dist/neon-dossiers-0.1.0.zip` with `module.json` at the
archive root and a standalone `dist/module.json`. Only runtime files and
licensing/provenance notices are installed; tests, tools, development docs
and Git metadata are excluded.

Before calling a future release engine-verified, check in a real v12 world:
open both settings menu and toolbar; add/edit/delete; select a local image;
resize the board; check keyboard focus; connect a non-GM; share/revoke a
dossier while it is open on that client; confirm private notes never appear
in that client's journal data/network traffic; reload both clients; and try
the intended game system. This checklist is not a claim those checks ran.
