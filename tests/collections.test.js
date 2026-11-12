import { test } from "node:test";
import assert from "node:assert/strict";
import { ID } from "../scripts/model.js";
import { EXAMPLES } from "./fixtures.js";
import { initializeCollections, createCollectionPlace, collectionPlace, collectionPlaces,
  saveCollectionNote, noteForCollectionPlace, shareCollectionPlace, deleteCollectionPlace,
  updateCollectionPlace, cleanupCollectionNote } from "../scripts/collections.js";

test("separate journals isolate private content and preserve place identity on share and revoke", async () => {
  let serial = 0;
  const users = new Map([["gm", { id: "gm", isGM: true }], ["player", { id: "player", isGM: false }]]);
  users.activeGM = users.get("gm");
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
  globalThis.foundry = { utils: { randomID: () => `id${++serial}` } };
  globalThis.game = {
    user: users.get("gm"), users, i18n: { localize: key => key },
    folders: { contents: [] }, journal: { contents: [] }
  };
  globalThis.Folder = { async create(data) {
    const folder = { ...data, id: `folder${++serial}`, getFlag: (ns, key) => data.flags?.[ns]?.[key] };
    game.folders.contents.push(folder); return folder;
  } };
  globalThis.JournalEntry = { async create(data) {
    const journal = {
      ...data, id: `journal${++serial}`, pages: { contents: [] },
      getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
      testUserPermission(user) { return user.isGM || this.ownership.default >= 2; },
      async createEmbeddedDocuments(_type, documents) {
        return documents.map(data => {
          const page = {
            ...structuredClone(data), id: `page${++serial}`,
            getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
            testUserPermission(user) { return journal.testUserPermission(user); },
            async update(data) { Object.assign(this, structuredClone(data)); },
            async delete() { journal.pages.contents = journal.pages.contents.filter(item => item !== this); }
          };
          journal.pages.contents.push(page); return page;
        });
      }
    };
    game.journal.contents.push(journal); return journal;
  } };
  await initializeCollections();
  assert.equal(game.folders.contents.length, 1);
  assert.equal(game.journal.contents.length, 3);
  const id = await createCollectionPlace(EXAMPLES[0]);
  await saveCollectionNote(id, "GM secret");
  assert.equal(noteForCollectionPlace(id), "GM secret");
  assert.ok(game.journal.contents.find(j => j.getFlag(ID, "collection") === "notes").pages.contents[0].text.content.includes("GM secret"));
  game.user = users.get("player");
  assert.equal(collectionPlaces().length, 0);
  assert.throws(() => noteForCollectionPlace(id), /gmOnly/);
  game.user = users.get("gm");
  const record = collectionPlace(id);
  const originalDelete = record.page.delete;
  record.page.delete = async () => { throw new Error("delete failed"); };
  await assert.rejects(shareCollectionPlace(id, true), /delete failed/);
  assert.equal(collectionPlaces().length, 1, "failed transfer removes its copy");
  assert.equal(collectionPlace(id).kind, "private");
  record.page.delete = originalDelete;
  record.page.ownership = { default: -1, player: 2 };
  await assert.rejects(shareCollectionPlace(id, true), /collectionPermissions/);
  record.page.ownership = { default: -1 };
  record.page.text.content = "<p>external edit</p>";
  await assert.rejects(updateCollectionPlace(id, EXAMPLES[0]), /collectionPageEdited/);
  record.page.text.content = `<p>${EXAMPLES[0].description}</p>`;
  await updateCollectionPlace(id, { ...EXAMPLES[0], description: "Line 1\nLine 2" });
  record.page.text.content = record.page.text.content.replace("<br>", "<br />");
  await updateCollectionPlace(id, { ...EXAMPLES[0], description: "Changed" });
  await shareCollectionPlace(id, true);
  assert.equal(collectionPlace(id).kind, "shared");
  game.user = users.get("player");
  assert.equal(collectionPlace(id).id, id);
  game.user = users.get("gm");
  await shareCollectionPlace(id, false);
  game.user = users.get("player");
  assert.equal(collectionPlaces().length, 0);
  game.user = users.get("gm");
  await deleteCollectionPlace(id);
  assert.equal(noteForCollectionPlace(id), "");
  assert.equal(collectionPlaces().length, 0);
  const orphanId = await createCollectionPlace(EXAMPLES[0]);
  await saveCollectionNote(orphanId, "To remove");
  await collectionPlace(orphanId).page.delete();
  await cleanupCollectionNote(orphanId);
  assert.equal(noteForCollectionPlace(orphanId), "");
});
