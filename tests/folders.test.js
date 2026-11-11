import { test } from "node:test";
import assert from "node:assert/strict";
import { ID } from "../scripts/model.js";
import { organizeDossiers } from "../scripts/folders.js";

function setup() {
  let serial = 0;
  const gm = { id: "gm", isGM: true }, player = { id: "player", isGM: false };
  const users = new Map([[gm.id, gm], [player.id, player]]);
  users.activeGM = gm;
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { LIMITED: 1, OBSERVER: 2 } };
  globalThis.game = {
    user: gm, users, i18n: { localize: key => key },
    folders: { contents: [] },
    journal: { contents: [], get(id) { return this.contents.find(entry => entry.id === id); } }
  };
  globalThis.Folder = { async create(data) {
    const folder = { ...data, id: `folder${++serial}`, getFlag: (namespace, key) => data.flags?.[namespace]?.[key] };
    game.folders.contents.push(folder);
    return folder;
  } };
  const entry = (id, ownership, flags = { place: {} }, folder = null) => {
    const record = {
      id, ownership, folder, flags: { [ID]: flags }, updates: [],
      getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
      async update(data) { this.updates.push(data); this.folder = data.folder; }
    };
    game.journal.contents.push(record);
    return record;
  };
  return { entry, gm, player };
}

test("existing and new dossiers are organized without changing permissions or unrelated journals", async () => {
  const { entry } = setup();
  const unrelated = entry("other", { default: 2 }, {}, "own-folder");
  const notes = entry("notes", { default: 0 }, { noteFor: "private" }, "own-folder");
  const privateEntry = entry("private", { default: 0, gm: 3 }, { place: {} }, "old-folder");
  const publicEntry = entry("public", { default: 2 });
  const individual = entry("individual", { default: 0, player: 1 });
  const unknown = entry("unknown", { default: 0, departed: 2 });
  const before = game.journal.contents.map(item => structuredClone(item.ownership));
  await Promise.all([organizeDossiers(), organizeDossiers("private"), organizeDossiers("public")]);
  const folders = Object.fromEntries(game.folders.contents.map(folder => [folder.getFlag(ID, "dossierFolder"), folder]));
  assert.equal(game.folders.contents.length, 2);
  assert.equal(privateEntry.folder, folders.private.id);
  assert.equal(publicEntry.folder, folders.shared.id);
  assert.equal(individual.folder, folders.shared.id);
  assert.equal(unknown.folder, folders.shared.id);
  assert.equal(unrelated.folder, "own-folder");
  assert.equal(notes.folder, "own-folder");
  assert.deepEqual(game.journal.contents.map(item => item.ownership), before);
  await organizeDossiers();
  assert.equal(privateEntry.updates.length, 1, "repeated reconciliation is idempotent");
  publicEntry.ownership = { default: 0 };
  await organizeDossiers(publicEntry.id);
  assert.equal(publicEntry.folder, folders.private.id);
  privateEntry.ownership = { default: 0, player: 2 };
  await organizeDossiers(privateEntry.id);
  assert.equal(privateEntry.folder, folders.shared.id);
});

test("only the active GM organizes, reuses flagged folders, and reports write failures", async () => {
  const { entry, gm, player } = setup();
  const privateEntry = entry("private", { default: 0 });
  game.user = player;
  await organizeDossiers();
  assert.equal(game.folders.contents.length, 0);
  game.user = { id: "other-gm", isGM: true };
  await organizeDossiers();
  assert.equal(game.folders.contents.length, 0);
  game.user = gm;
  const create = Folder.create;
  Folder.create = async () => { throw new Error("folder creation failed"); };
  await assert.rejects(organizeDossiers(), /folder creation failed/);
  Folder.create = create;
  await organizeDossiers();
  assert.equal(game.folders.contents.length, 2);
  const original = privateEntry.update;
  privateEntry.folder = null;
  privateEntry.update = async () => { throw new Error("folder move failed"); };
  await assert.rejects(organizeDossiers("private"), /folder move failed/);
  privateEntry.update = original;
  await organizeDossiers("private");
  assert.equal(privateEntry.folder, game.folders.contents[0].id);
});

test("permission changes during folder creation do not move a dossier to an outdated folder", async () => {
  const { entry } = setup();
  const dossier = entry("private", { default: 0 });
  const create = Folder.create;
  let resume;
  Folder.create = async data => {
    await new Promise(resolve => { resume = resolve; });
    return create(data);
  };
  const pending = organizeDossiers("private");
  await new Promise(resolve => setImmediate(resolve));
  dossier.ownership = { default: 2 };
  resume();
  await pending;
  assert.equal(dossier.folder, null);
  Folder.create = create;
  await organizeDossiers("private");
  assert.equal(game.folders.contents.find(folder => folder.id === dossier.folder).getFlag(ID, "dossierFolder"), "shared");
});
