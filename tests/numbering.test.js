import { test } from "node:test";
import assert from "node:assert/strict";
import { ID } from "../scripts/model.js";
import { EXAMPLES } from "./fixtures.js";
import { migratePlaceNumbers, createNumberedPlace, updateNumberedPlace } from "../scripts/numbering.js";

function setup(places = [], counters = {}) {
  const settings = new Map([["markerCounters", counters]]);
  let serial = 0;
  const entry = place => ({
    id: `place-${++serial}`, name: place.title, ownership: { default: 0 },
    flags: { [ID]: { place: structuredClone(place), note: "Keep private notes" } },
    getFlag(namespace, key) { return this.flags[namespace][key]; },
    async update(changes) {
      if (changes.name) this.name = changes.name;
      for (const [key, value] of Object.entries(changes[`flags.${ID}.place`])) {
        if (key.startsWith("-=")) delete this.flags[ID].place[key.slice(2)];
        else this.flags[ID].place[key] = structuredClone(value);
      }
      return this;
    }
  });
  globalThis.game = {
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    settings: { get: (_id, name) => settings.get(name), set: async (_id, name, value) => settings.set(name, value) },
    journal: { contents: places.map(entry) }, folders: { contents: [] },
    i18n: { localize: key => key }
  };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
  globalThis.foundry = { utils: { randomID: () => `place-${++serial}` } };
  globalThis.Folder = { async create(data) {
    const folder = { ...data, id: "folder", getFlag: (ns, key) => data.flags?.[ns]?.[key] };
    game.folders.contents.push(folder); return folder;
  } };
  globalThis.JournalEntry = { async create(data) {
    if (data.flags[ID].collection) {
      const journal = { ...data, id: `journal-${++serial}`, pages: { contents: [] },
        getFlag: (ns, key) => data.flags?.[ns]?.[key],
        testUserPermission: user => user.isGM || data.ownership.default >= 2,
        async createEmbeddedDocuments(_type, docs) {
          return docs.map(doc => {
            const page = { ...structuredClone(doc), id: `page-${++serial}`, parent: journal,
              getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
              testUserPermission(user) { return journal.testUserPermission(user); },
              async update(update) { this.name = update.name; this.text = update.text; this.flags[ID].place = structuredClone(update.flags[ID].place); },
              async delete() { journal.pages.contents = journal.pages.contents.filter(p => p !== this); }
            };
            journal.pages.contents.push(page); return page;
          });
        }
      };
      game.journal.contents.push(journal); return journal;
    }
    const created = entry(data.flags[ID].place);
    game.journal.contents.push(created);
    return created;
  } };
  return settings;
}

test("legacy migration assigns persistent numbers, keeps existing numbers and includes private retained maps", async () => {
  const settings = setup([
    { ...EXAMPLES[0], category: "community", markerNumber: 3 },
    { ...EXAMPLES[0], category: "community" },
    { ...EXAMPLES[0], category: "community", mapImage: "worlds/legacy/map.webp" },
    { ...EXAMPLES[0], category: "commerce" }
  ]);
  await migratePlaceNumbers();
  const numbers = () => game.journal.contents.map(entry => entry.getFlag(ID, "place").markerNumber);
  assert.deepEqual(numbers(), [3, 4, 5, 1]);
  assert.deepEqual(settings.get("markerCounters"), { community: 5, commerce: 1 });
  assert.ok(game.journal.contents.every(entry => entry.flags[ID].note === "Keep private notes"));
  await migratePlaceNumbers();
  assert.deepEqual(numbers(), [3, 4, 5, 1], "reloading never renumbers dossiers");
  game.journal.contents = game.journal.contents.filter((_, index) => index !== 1);
  const created = await createNumberedPlace({ ...EXAMPLES[0], category: "community" });
  assert.equal(created.getFlag(ID, "place").markerNumber, 6, "a deletion leaves a gap");
});

test("moving a place deletes stale access and preserves other flags under Foundry merge semantics", async () => {
  const place = { ...EXAMPLES[0], markerNumber: 7, district: "old-district", roadNode: "road",
    access: [{ x: EXAMPLES[0].x, y: EXAMPLES[0].y }, { x: 0.1, y: 0.2 }] };
  setup([place]);
  const entry = game.journal.contents[0];
  const { district, roadNode, access, ...rest } = place;
  await updateNumberedPlace(entry, { ...rest, x: 0.5, y: 0.5 });
  assert.equal(entry.getFlag(ID, "place").access, undefined);
  assert.equal(entry.getFlag(ID, "place").roadNode, undefined);
  assert.equal(entry.getFlag(ID, "place").district, undefined);
  assert.equal(entry.getFlag(ID, "place").markerNumber, 7);
  assert.equal(entry.getFlag(ID, "note"), "Keep private notes");
  await updateNumberedPlace(entry, { ...entry.getFlag(ID, "place"), description: "Second save" });
  assert.equal(entry.getFlag(ID, "place").description, "Second save");
});

test("concurrent creations are serialized, counters survive deletion and holes are reused only after 99", async () => {
  const settings = setup([], { commerce: 97 });
  const entries = await Promise.all([createNumberedPlace(EXAMPLES[0]), createNumberedPlace(EXAMPLES[0])]);
  assert.deepEqual(entries.map(entry => entry.getFlag(ID, "place").markerNumber), [98, 99]);
  game.journal.contents = [];
  const reused = await createNumberedPlace(EXAMPLES[0]);
  assert.equal(reused.getFlag(ID, "place").markerNumber, 1);
  assert.equal(settings.get("markerCounters").commerce, 99);
  const next = await createNumberedPlace(EXAMPLES[0]);
  assert.equal(next.getFlag(ID, "place").markerNumber, 2);
});

test("editing preserves an assigned number, moving category allocates a new one and full categories fail explicitly", async () => {
  const full = Array.from({ length: 99 }, (_, index) => ({ ...EXAMPLES[0], category: "full", markerNumber: index + 1 }));
  setup([{ ...EXAMPLES[0], markerNumber: 7 }, ...full], { commerce: 7, full: 99 });
  const entry = game.journal.contents[0];
  await updateNumberedPlace(entry, { ...EXAMPLES[0], title: "Renamed", markerNumber: 50 });
  assert.equal(entry.getFlag(ID, "place").markerNumber, 7, "the submitted number cannot override a permanent number");
  const old = structuredClone(entry.getFlag(ID, "place"));
  await assert.rejects(updateNumberedPlace(entry, { ...old, category: "full" }), /categoryFull/);
  assert.deepEqual(entry.getFlag(ID, "place"), old);
  await assert.rejects(createNumberedPlace({ ...EXAMPLES[0], category: "full" }), /categoryFull/);
  assert.equal(game.journal.contents.length, 100);
  await updateNumberedPlace(entry, { ...old, category: "empty" });
  assert.equal(entry.getFlag(ID, "place").markerNumber, 1);
  assert.equal(entry.getFlag(ID, "place").category, "empty");
});

test("migration repairs duplicate numbers without changing the first owner's number", async () => {
  setup([{ ...EXAMPLES[0], markerNumber: 2 }, { ...EXAMPLES[0], markerNumber: 2 }, EXAMPLES[0]]);
  await migratePlaceNumbers();
  assert.deepEqual(game.journal.contents.map(entry => entry.getFlag(ID, "place").markerNumber), [2, 3, 4]);
});

test("oversized legacy categories fail before writing and failed writes do not poison the queue", async () => {
  const settings = setup(Array.from({ length: 100 }, () => EXAMPLES[0]));
  await assert.rejects(migratePlaceNumbers(), /categoryFull/);
  assert.deepEqual(settings.get("markerCounters"), {});
  assert.ok(game.journal.contents.every(entry => entry.getFlag(ID, "place").markerNumber === undefined));
  setup();
  const create = JournalEntry.create;
  JournalEntry.create = async () => { throw new Error("Write failed"); };
  await assert.rejects(createNumberedPlace(EXAMPLES[0]), /Write failed/);
  JournalEntry.create = create;
  const next = await createNumberedPlace(EXAMPLES[0]);
  assert.equal(next.getFlag(ID, "place").markerNumber, 2, "a failed create never reuses a reserved ID before 99");
});

test("overfull legacy categories can be repaired by moving a dossier without blocking other categories", async () => {
  setup(Array.from({ length: 100 }, () => EXAMPLES[0]));
  await assert.rejects(migratePlaceNumbers(), /categoryFull/);
  const entry = game.journal.contents[0];
  await updateNumberedPlace(entry, { ...EXAMPLES[0], category: "community" });
  assert.equal(entry.getFlag(ID, "place").markerNumber, 1);
  assert.equal(entry.getFlag(ID, "place").category, "community");
  await migratePlaceNumbers();
  assert.deepEqual(game.journal.contents.slice(1).map(entry => entry.getFlag(ID, "place").markerNumber),
    Array.from({ length: 99 }, (_, index) => index + 1));
  const created = await createNumberedPlace({ ...EXAMPLES[0], category: "community" });
  assert.equal(created.getFlag(ID, "place").markerNumber, 2);
});

test("players cannot allocate and secondary GMs cannot race the numbering authority", async () => {
  setup([{ ...EXAMPLES[0], markerNumber: 7 }]);
  game.user = { id: "player", isGM: false };
  await migratePlaceNumbers();
  await assert.rejects(createNumberedPlace(EXAMPLES[0]), /gmOnly/);
  await assert.rejects(updateNumberedPlace(game.journal.contents[0], EXAMPLES[0]), /gmOnly/);
  game.user = { id: "other-gm", isGM: true };
  await migratePlaceNumbers();
  await assert.rejects(createNumberedPlace(EXAMPLES[0]), /numberingActiveGM/);
  const entry = game.journal.contents[0];
  await updateNumberedPlace(entry, { ...EXAMPLES[0], description: "Normal edit" });
  assert.equal(entry.getFlag(ID, "place").markerNumber, 7);
  await assert.rejects(updateNumberedPlace(entry, { ...EXAMPLES[0], category: "other" }), /numberingActiveGM/);
});
