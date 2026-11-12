import { ID, placeData, noteText } from "./model.js";

const kinds = ["private", "shared", "notes"];
let pending = Promise.resolve();

function serialized(action) {
  const result = pending.then(action);
  pending = result.catch(() => {});
  return result;
}

function requireActiveGM() {
  if (!game.user.isGM) throw new Error("gmOnly");
  if (game.users?.activeGM && game.users.activeGM.id !== game.user.id) throw new Error("numberingActiveGM");
}

const escapeText = text => text.replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function journalFor(kind) {
  const matches = game.journal.contents.filter(entry => entry.getFlag(ID, "collection") === kind);
  if (matches.length > 1) throw new Error("collectionDuplicate");
  return matches[0];
}

function validateJournal(entry, kind) {
  const expected = kind === "shared" ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : 0;
  if (entry.ownership?.default !== expected || Object.entries(entry.ownership ?? {}).some(([id, value]) =>
    id !== "default" && value !== -1 && !game.users?.get?.(id)?.isGM)) throw new Error("collectionPermissions");
}

function validatePage(page, kind) {
  const expected = kind === "shared" ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : 0;
  if (Object.entries(page.ownership ?? {}).some(([id, value]) =>
    id === "default" ? value !== -1 && value !== expected : value !== -1 && !game.users?.get?.(id)?.isGM)) {
    throw new Error("collectionPermissions");
  }
}

function sameContent(actual, expected) {
  const normalize = value => value?.replace(/\r\n/g, "\n").replace(/<br\s*\/?>/gi, "<br>");
  return normalize(actual) === normalize(expected);
}

async function ensureJournal(kind) {
  requireActiveGM();
  let entry = journalFor(kind);
  if (!entry) {
    let folder = game.folders.contents.find(item => item.getFlag(ID, "collectionFolder"));
    if (!folder) folder = await Folder.create({ name: "Neon Dossiers", type: "JournalEntry",
      flags: { [ID]: { collectionFolder: true } } });
    entry = await JournalEntry.create({
      name: game.i18n.localize(`ND.collection${kind[0].toUpperCase()}${kind.slice(1)}`),
      folder: folder.id, ownership: { default: kind === "shared" ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : 0 },
      flags: { [ID]: { collection: kind } }
    });
  }
  validateJournal(entry, kind);
  return entry;
}

function pages(kind) {
  const journal = journalFor(kind);
  if (!journal) return [];
  return journal.pages.contents.filter(page => page.getFlag(ID, "collectionPlaceId"));
}

export function collectionRecords() {
  const seen = new Set();
  return collectionPlaces().filter(record => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  }).map(record => ({
    id: record.id,
    getFlag: (_namespace, key) => record.page.getFlag(ID, key),
    update: async changes => updateCollectionPlace(record.id, changes[`flags.${ID}.place`]),
    page: record.page, journal: record.journal, kind: record.kind
  }));
}

function pageFor(kind, id) {
  const matches = pages(kind).filter(page => page.getFlag(ID, "collectionPlaceId") === id);
  if (matches.length > 1) throw new Error("collectionDuplicate");
  return matches[0];
}

function pageData(id, place, example) {
  return {
    name: place.title, type: "text", text: { format: 1, content: `<p>${escapeText(place.description).replace(/\n/g, "<br>")}</p>` },
    flags: { [ID]: { collectionPlaceId: id, place, ...(example ? { example } : {}) } }
  };
}

export function collectionPlaces() {
  const output = [];
  for (const kind of ["private", "shared"]) {
    const journal = journalFor(kind);
    if (!journal || !journal.testUserPermission(game.user, "OBSERVER")) continue;
    for (const page of pages(kind)) {
      if (!page.testUserPermission(game.user, "OBSERVER")) continue;
      output.push({ id: page.getFlag(ID, "collectionPlaceId"), page, journal, kind });
    }
  }
  return output;
}

export function collectionPlace(id, strict = false) {
  const matches = collectionPlaces().filter(item => item.id === id);
  if (strict && matches.length > 1) throw new Error("collectionDuplicate");
  return matches[0];
}

export function createCollectionPlace(input) {
  return serialized(async () => {
    requireActiveGM();
    const place = placeData(input);
    const journal = await ensureJournal("private");
    const id = foundry.utils.randomID();
    if (collectionPlace(id)) throw new Error("collectionDuplicate");
    await journal.createEmbeddedDocuments("JournalEntryPage", [pageData(id, place)]);
    return id;
  });
}

export function updateCollectionPlace(id, input) {
  return serialized(async () => {
    requireActiveGM();
    const record = collectionPlace(id, true);
    if (!record) throw new Error("missingPlace");
    validateJournal(record.journal, record.kind);
    validatePage(record.page, record.kind);
    const place = placeData(input);
    const previous = pageData(id, placeData(record.page.getFlag(ID, "place")), record.page.getFlag(ID, "example"));
    if (!sameContent(record.page.text?.content, previous.text.content) || record.page.name !== previous.name) throw new Error("collectionPageEdited");
    const data = pageData(id, place, record.page.getFlag(ID, "example"));
    const old = record.page.getFlag(ID, "place");
    for (const key of ["district", "roadNode", "access", "mapImage"]) {
      if (old[key] !== undefined && place[key] === undefined) data.flags[ID].place[`-=${key}`] = null;
    }
    await record.page.update(data);
  });
}

export function setCollectionExample(id, example) {
  return serialized(async () => {
    requireActiveGM();
    const record = collectionPlace(id, true);
    if (!record) throw new Error("missingPlace");
    await record.page.setFlag(ID, "example", example);
  });
}

export function shareCollectionPlace(id, shared) {
  return serialized(async () => {
    requireActiveGM();
    const record = collectionPlace(id, true);
    if (!record) throw new Error("missingPlace");
    const targetKind = shared ? "shared" : "private";
    if (record.kind === targetKind) return;
    validateJournal(record.journal, record.kind);
    validatePage(record.page, record.kind);
    const target = await ensureJournal(targetKind);
    if (pageFor(targetKind, id)) throw new Error("collectionDuplicate");
    const data = pageData(id, placeData(record.page.getFlag(ID, "place")), record.page.getFlag(ID, "example"));
    if (!sameContent(record.page.text?.content, data.text.content) || record.page.name !== data.name) throw new Error("collectionPageEdited");
    const [copy] = await target.createEmbeddedDocuments("JournalEntryPage", [data]);
    try { await record.page.delete(); }
    catch (error) {
      try { await copy.delete(); } catch (rollback) {
        console.error(`${ID}: failed to roll back journal transfer`, rollback);
        throw new Error("collectionTransferConflict");
      }
      throw error;
    }
  });
}

export function noteForCollectionPlace(id) {
  if (!game.user.isGM) throw new Error("gmOnly");
  return pageFor("notes", id)?.getFlag(ID, "note") ?? "";
}

export function saveCollectionNote(id, value) {
  return serialized(async () => {
    requireActiveGM();
    const text = noteText(value);
    const record = collectionPlace(id, true);
    if (!record) throw new Error("missingPlace");
    const existing = pageFor("notes", id);
    if (!text && !existing) return;
    const journal = await ensureJournal("notes");
    if (existing) {
      validatePage(existing, "notes");
      const previous = noteText(existing.getFlag(ID, "note") ?? "");
      if (!sameContent(existing.text?.content, `<p>${escapeText(previous).replace(/\n/g, "<br>")}</p>`)) throw new Error("collectionPageEdited");
    }
    const data = { name: record.page.name, type: "text", text: { format: 1, content: `<p>${escapeText(text).replace(/\n/g, "<br>")}</p>` },
      flags: { [ID]: { collectionPlaceId: id, note: text } } };
    if (existing) await existing.update(data);
    else await journal.createEmbeddedDocuments("JournalEntryPage", [data]);
  });
}

export function deleteCollectionPlace(id) {
  return serialized(async () => {
    requireActiveGM();
    const record = collectionPlace(id, true);
    if (!record) throw new Error("missingPlace");
    const note = pageFor("notes", id);
    await record.page.delete();
    if (note) await note.delete();
  });
}

export function cleanupCollectionNote(id) {
  return serialized(async () => {
    requireActiveGM();
    if (collectionPlace(id)) return;
    const note = pageFor("notes", id);
    if (note) await note.delete();
  });
}

export async function initializeCollections() {
  return serialized(async () => {
    requireActiveGM();
    for (const kind of kinds) await ensureJournal(kind);
  });
}
