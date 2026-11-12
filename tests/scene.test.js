import { test } from "node:test";
import assert from "node:assert/strict";
import { ID, DEFAULT_MAP as BLANK_MAP, COMMUNITY_MAP } from "../scripts/model.js";
import { EXAMPLES, DEFAULT_ATLAS } from "./fixtures.js";
import { COMMUNITY_EXAMPLES } from "../scripts/city.js";
import { currentAtlas, synchronizeScene, migrateCommunityMap } from "../scripts/scene.js";

const DEFAULT_MAP = COMMUNITY_MAP;
test("scene lifecycle publishes only globally shared places and preserves unrelated notes", async () => {
  const settings = new Map([["mapImage", DEFAULT_MAP], ["atlas", structuredClone(DEFAULT_ATLAS)]]);
  const makeEntry = (id, ownership) => ({
    id, ownership, getFlag: () => EXAMPLES[0],
    testUserPermission: user => user.isGM || ownership.default >= 2
  });
  const shared = makeEntry("shared", { default: 2 });
  shared.getFlag = () => ({ ...EXAMPLES[0], category: "gm-defined-category" });
  const hidden = makeEntry("hidden", { default: 0 });
  const individual = makeEntry("individual", { default: 0, player: 2 });
  const limited = makeEntry("limited", { default: 1 });
  const excludedPlayer = makeEntry("excluded-player", { default: 2, player: 0 });
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
  globalThis.ui = { notifications: { warn() { assert.fail("unexpected invalid place"); } } };
  globalThis.game = {
    user: { isGM: true }, settings: { get: (_id, name) => settings.get(name), set: async (_id, name, value) => settings.set(name, value) },
    scenes: { contents: [] },
    journal: { contents: [shared, hidden, individual, limited, excludedPlayer], get(id) { return this.contents.find(entry => entry.id === id); } }
  };
  let serial = 0, creations = 0;
  globalThis.Image = class {
    set src(_path) {
      this.naturalWidth = 1446; this.naturalHeight = 1375;
      queueMicrotask(() => this.onload());
    }
  };
  globalThis.Scene = {
    async create(data) {
      creations++;
      const scene = {
        ...data, dimensions: { sceneX: 0, sceneY: 0 },
        notes: { contents: [{ id: "other-module-note", getFlag: () => undefined }] },
        getFlag(namespace, key) { return this.flags[namespace][key]; },
        async update(data) { Object.assign(this, data); },
        async deleteEmbeddedDocuments(type, ids) {
          assert.equal(type, "Note"); this.notes.contents = this.notes.contents.filter(note => !ids.includes(note.id));
        },
        async createEmbeddedDocuments(type, notes) {
          assert.equal(type, "Note");
          this.notes.contents.push(...notes.map(note => ({
            ...note, id: `note-${++serial}`, getFlag(namespace, key) { return this.flags[namespace][key]; }
          })));
        },
        async updateEmbeddedDocuments(type, notes) {
          assert.equal(type, "Note");
          for (const note of notes) Object.assign(this.notes.contents.find(item => item.id === note._id), note);
        }
      };
      game.scenes.contents.push(scene); return scene;
    }
  };
  assert.equal(await synchronizeScene(), null, "automatic synchronization never creates a scene");
  const [scene, same] = await Promise.all([synchronizeScene(true), synchronizeScene(true)]);
  assert.equal(scene, same);
  assert.equal(creations, 1, "concurrent requests are serialized");
  assert.equal(scene.background.src, DEFAULT_MAP);
  assert.equal(scene.padding, 0);
  assert.equal(scene.notes.contents.length, 2);
  const note = scene.notes.contents.find(note => note.getFlag(ID, "placeId"));
  assert.equal(note.entryId, "shared");
  assert.equal(note.x, EXAMPLES[0].x * 1000);
  assert.equal(note.y, EXAMPLES[0].y * 800);
  assert.equal(note.flags[ID].placeId, "shared");
  assert.equal(note.global, true);
  scene.name = "My campaign map";
  shared.getFlag = () => ({ ...EXAMPLES[0], x: 0.7, title: "Moved" });
  await synchronizeScene();
  assert.equal(scene.notes.contents.length, 2);
  assert.equal(note.x, 700);
  assert.equal(note.text, "Moved");
  assert.equal(scene.name, "My campaign map", "user scene names are preserved");
  shared.ownership = { default: 0, player: 3 };
  await synchronizeScene();
  assert.deepEqual(scene.notes.contents.map(note => note.id), ["other-module-note"], "revocation removes public scene coordinates");

  const page = { id: "page-1", ownership: { default: -1 }, flags: { [ID]: {
    collectionPlaceId: "place-1", place: EXAMPLES[0]
  } }, getFlag(ns, key) { return this.flags[ns]?.[key]; }, testUserPermission: () => true };
  const collection = { id: "collection", ownership: { default: 2 }, pages: { contents: [page] },
    getFlag(_ns, key) { return key === "collection" ? "shared" : undefined; },
    testUserPermission: () => true };
  game.journal.contents.push(collection);
  await synchronizeScene();
  const collectionNote = scene.notes.contents.find(item => item.getFlag(ID, "placeId") === "place-1");
  assert.equal(collectionNote.entryId, "collection");
  assert.equal(collectionNote.pageId, "page-1");
  page.ownership = { default: -1, player: 0 };
  await synchronizeScene();
  assert.equal(scene.notes.contents.some(item => item.getFlag(ID, "placeId") === "place-1"), false,
    "page-level revocation removes publicly readable scene coordinates");
  page.ownership = { default: -1 };
  collection.ownership.default = 0;
  await synchronizeScene();
  assert.equal(scene.notes.contents.some(item => item.getFlag(ID, "placeId") === "place-1"), false,
    "journal-level revocation removes publicly readable scene coordinates");
  game.journal.contents = game.journal.contents.filter(item => item !== collection);

  shared.ownership = { default: 2 };
  shared.getFlag = () => ({ ...COMMUNITY_EXAMPLES[0], mapImage: "worlds/old/map.webp" });
  const community = makeEntry("community", { default: 2 });
  community.getFlag = () => COMMUNITY_EXAMPLES[0];
  game.journal.contents.push(community);
  settings.set("mapImage", "worlds/old/map.webp");
  await synchronizeScene();
  assert.deepEqual(scene.notes.contents.filter(note => note.entryId).map(note => note.entryId), ["shared"]);
  settings.set("mapImage", COMMUNITY_MAP);
  await synchronizeScene();
  assert.deepEqual(scene.notes.contents.filter(note => note.entryId).map(note => note.entryId), ["community"],
    "removed map places never publish coordinates on Community");

  settings.set("mapImage", "worlds/test/custom.webp");
  const replacement = currentAtlas();
  assert.equal(replacement.image, "worlds/test/custom.webp");
  assert.deepEqual(replacement.nodes, [], "new map does not inherit old geography");
  await synchronizeScene();
  assert.equal(scene.background.src, "worlds/test/custom.webp");
  assert.equal(scene.width, 1446);
  assert.equal(scene.height, 1375);
  assert.equal(settings.get("atlases")["worlds/test/custom.webp"].width, 1446);
  const saved = settings.get("atlases")["worlds/test/custom.webp"];
  settings.set("atlases", { ...settings.get("atlases"), [saved.image]: { ...saved, width: 1200, height: 900 } });
  await synchronizeScene();
  assert.equal(scene.width, 1200, "configured dimensions are not replaced");
  assert.equal(scene.height, 900);
  settings.set("mapImage", "worlds/test/broken.webp");
  globalThis.Image = class { set src(_path) { queueMicrotask(() => this.onerror()); } };
  await assert.rejects(synchronizeScene(), /imageError/);
  assert.equal(scene.background.src, saved.image, "failed image detection does not update the scene");
  assert.equal(settings.get("atlases")["worlds/test/broken.webp"], undefined);
  let loading;
  globalThis.Image = class { set src(_path) { loading = this; } };
  settings.set("mapImage", "worlds/test/first.webp");
  const pending = synchronizeScene();
  await new Promise(resolve => setImmediate(resolve));
  settings.set("mapImage", saved.image);
  loading.naturalWidth = 1446; loading.naturalHeight = 1375; loading.onload();
  await assert.rejects(pending, /mapChanged/);
  assert.equal(settings.get("atlases")["worlds/test/first.webp"], undefined);
  game.users = { activeGM: { id: "another-gm" } };
  settings.set("mapImage", "worlds/test/second.webp");
  await assert.rejects(synchronizeScene(), /mapSetupActiveGM/);
  settings.set("mapImage", saved.image);
  delete game.users;
  game.user.isGM = false;
  await assert.rejects(synchronizeScene(true), /Only a GM/);
  game.user.isGM = true;
  assert.equal(await synchronizeScene(), scene, "a rejected request does not poison the sync queue");
});

test("removed default migrates to blank without deleting settings or dossiers", async () => {
  const oldMap = "worlds/old/map.webp";
  const community = { ...structuredClone(DEFAULT_ATLAS), kmAcross: 19 };
  const settings = new Map([["mapImage", COMMUNITY_MAP], ["atlas", { ...community, image: oldMap }],
    ["atlases", { [COMMUNITY_MAP]: community, [oldMap]: { ...community, image: oldMap } }]]);
  const entries = [
    { id: "old-example", flags: { example: 0, place: { ...EXAMPLES[0], mapImage: oldMap } } },
    { id: "old-notes", flags: { noteFor: "old-example" } },
    { id: "own", flags: { place: { ...EXAMPLES[0], mapImage: oldMap } } },
    { id: "community", flags: { example: `${COMMUNITY_MAP}:0`, place: COMMUNITY_EXAMPLES[0] } }
  ].map(data => ({ ...data, getFlag(_id, key) { return this.flags[key]; },
    async delete() { game.journal.contents = game.journal.contents.filter(item => item.id !== this.id); } }));
  const notices = [];
  globalThis.ui = { notifications: { info: text => notices.push(text) } };
  globalThis.game = {
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, journal: { contents: entries },
    i18n: { localize: key => key },
    settings: { get: (_id, key) => settings.get(key), set: async (_id, key, value) => settings.set(key, value) }
  };
  await migrateCommunityMap();
  assert.equal(settings.get("mapImage"), BLANK_MAP);
  assert.deepEqual(settings.get("atlases"), { [COMMUNITY_MAP]: community, [oldMap]: { ...community, image: oldMap } });
  assert.deepEqual(settings.get("atlas"), { ...community, image: oldMap });
  assert.deepEqual(game.journal.contents.map(item => item.id), ["old-example", "old-notes", "own", "community"]);
  assert.equal(notices.length, 1);
  await migrateCommunityMap();
  assert.equal(notices.length, 1, "migration is idempotent");
  game.user = { id: "player", isGM: false };
  settings.set("mapImage", oldMap);
  await migrateCommunityMap();
  assert.equal(settings.get("mapImage"), oldMap, "players do not mutate world settings");
});
