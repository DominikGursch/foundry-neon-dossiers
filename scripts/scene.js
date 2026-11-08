import { ID, COMMUNITY_MAP, readablePlaces, placesOnMap, mapFamily } from "./model.js";
import { atlasData } from "./atlas.js";
import { presetAtlas } from "./city.js";

export function currentAtlas() {
  const image = COMMUNITY_MAP;
  const stored = game.settings.get(ID, "atlases")?.[mapFamily(image)] ?? game.settings.get(ID, "atlas");
  // Never reinterpret coordinates from a removed map as Community coordinates.
  return atlasData(stored && mapFamily(stored.image) === mapFamily(image)
    ? { ...stored, image } : presetAtlas(image));
}

export async function migrateCommunityMap() {
  if (!game.user.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) return;
  const atlases = game.settings.get(ID, "atlases") ?? {};
  const legacy = game.settings.get(ID, "atlas");
  const removed = Object.keys(atlases).some(image => image !== COMMUNITY_MAP) ||
    (legacy?.image && legacy.image !== COMMUNITY_MAP) || game.settings.get(ID, "mapImage") !== COMMUNITY_MAP;
  const community = atlases[COMMUNITY_MAP] ?? (legacy?.image === COMMUNITY_MAP ? legacy : null);
  if (removed || (community && !atlases[COMMUNITY_MAP])) {
    await game.settings.set(ID, "atlases", community ? { [COMMUNITY_MAP]: community } : {});
  }
  if (legacy?.image) await game.settings.set(ID, "atlas", {});
  if (game.settings.get(ID, "mapImage") !== COMMUNITY_MAP) await game.settings.set(ID, "mapImage", COMMUNITY_MAP);
  const obsolete = game.journal.contents.filter(entry =>
    entry.getFlag(ID, "example") != null && entry.getFlag(ID, "place")?.mapImage !== COMMUNITY_MAP);
  for (const entry of obsolete) {
    for (const note of game.journal.contents.filter(item => item.getFlag(ID, "noteFor") === entry.id)) await note.delete();
    await entry.delete();
  }
  if (removed || obsolete.length) ui.notifications.info(game.i18n.localize("ND.communityOnlyMigrated"));
}

let pending = Promise.resolve();

export function synchronizeScene(create = false) {
  const result = pending.then(() => sync(create));
  // A failed operation must not prevent a later explicit retry.
  pending = result.catch(() => {});
  return result;
}

async function sync(create) {
  if (!game.user.isGM) {
    if (create) throw new Error("Only a GM can synchronize the map scene");
    return null;
  }
  let scene = game.scenes?.contents.find(item => item.getFlag(ID, "atlasScene"));
  if (!scene && !create) return null;
  const atlas = currentAtlas();
  const data = {
    name: "Neon Dossiers",
    background: { src: atlas.image },
    width: atlas.width, height: atlas.height, padding: 0,
    tokenVision: false, globalLight: true, grid: { type: 0 }
  };
  if (!scene) scene = await Scene.create({ ...data, flags: { [ID]: { atlasScene: true } } });
  else {
    const { name: _name, ...managed } = data;
    await scene.update(managed);
  }
  const places = placesOnMap(readablePlaces(game.journal.contents, game.user, (entry, error) => {
    console.error(`${ID}: invalid scene place ${entry.id}`, error);
    ui.notifications.warn(game.i18n.localize("ND.invalidPlace"));
  }), atlas.image).filter(place => {
    const ownership = game.journal.get(place.id).ownership;
    const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    return ownership.default >= observer && Object.entries(ownership).every(([id, level]) =>
      id === "default" || level === -1 || level >= observer || game.users?.get(id)?.isGM);
  });
  const notes = scene.notes.contents.filter(note => note.getFlag(ID, "placeId"));
  const visible = new Set(places.map(place => place.id));
  const removed = notes.filter(note => !visible.has(note.getFlag(ID, "placeId"))).map(note => note.id);
  if (removed.length) await scene.deleteEmbeddedDocuments("Note", removed);
  const creates = [], updates = [];
  for (const place of places) {
    const data = {
      entryId: place.id, x: Math.round((scene.dimensions?.sceneX ?? 0) + place.x * atlas.width),
      y: Math.round((scene.dimensions?.sceneY ?? 0) + place.y * atlas.height),
      texture: { src: "icons/svg/book.svg" }, iconSize: 40, text: place.title, global: true,
      flags: { [ID]: { placeId: place.id } }
    };
    const existing = notes.find(note => note.getFlag(ID, "placeId") === place.id);
    if (existing) updates.push({ ...data, _id: existing.id });
    else creates.push(data);
  }
  if (creates.length) await scene.createEmbeddedDocuments("Note", creates);
  if (updates.length) await scene.updateEmbeddedDocuments("Note", updates);
  return scene;
}
