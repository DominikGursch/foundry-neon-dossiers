import { ID, COMMUNITY_MAP, readablePlaces, placesOnMap, mapFamily } from "./model.js";
import { atlasData, emptyAtlas } from "./atlas.js";
import { presetAtlas } from "./city.js";

export function currentAtlas() {
  const image = game.settings.get(ID, "mapImage") ?? COMMUNITY_MAP;
  const stored = game.settings.get(ID, "atlases")?.[mapFamily(image)] ?? game.settings.get(ID, "atlas");
  // Never apply the demo's roads or geography to a replacement image.
  return atlasData(stored && mapFamily(stored.image) === mapFamily(image)
    ? { ...stored, image } : presetAtlas(image) ?? emptyAtlas(image));
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
