import { ID } from "./model.js";

let pending = Promise.resolve();

function isActiveGM() {
  return game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
}

function sharedWithPlayers(entry) {
  const ownership = entry.ownership ?? {};
  const limited = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
  return (ownership.default ?? 0) >= limited || Object.entries(ownership).some(([id, level]) =>
    id !== "default" && level >= limited && !game.users?.get?.(id)?.isGM);
}

async function folderFor(kind) {
  let folder = game.folders.contents.find(item =>
    item.type === "JournalEntry" && item.getFlag(ID, "dossierFolder") === kind);
  if (!folder) {
    folder = await Folder.create({
      name: game.i18n.localize(`ND.${kind === "shared" ? "sharedFolder" : "privateFolder"}`),
      type: "JournalEntry",
      flags: { [ID]: { dossierFolder: kind } }
    });
  }
  return folder;
}

async function organize(entry) {
  if (!isActiveGM() || !entry?.getFlag(ID, "place")) return;
  const kind = sharedWithPlayers(entry) ? "shared" : "private";
  const folder = await folderFor(kind);
  if (!isActiveGM() || !game.journal.get(entry.id) || (sharedWithPlayers(entry) ? "shared" : "private") !== kind) return;
  const currentId = typeof entry.folder === "string" ? entry.folder : entry.folder?.id;
  if (currentId !== folder.id) await entry.update({ folder: folder.id });
}

export function organizeDossiers(entryId) {
  const result = pending.then(async () => {
    if (!isActiveGM()) return;
    if (entryId) await organize(game.journal.get(entryId));
    else {
      await folderFor("private");
      if (!isActiveGM()) return;
      await folderFor("shared");
      for (const entry of game.journal.contents) await organize(entry);
    }
  });
  pending = result.catch(() => {});
  return result;
}
