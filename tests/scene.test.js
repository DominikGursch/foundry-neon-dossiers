import { test } from "node:test";
import assert from "node:assert/strict";
import { ID, DEFAULT_MAP, CITY_MAP, CITY_STREETS, COMMUNITY_MAP, EXAMPLES } from "../scripts/model.js";
import { DEFAULT_ATLAS } from "../scripts/atlas.js";
import { CITY_EXAMPLES, COMMUNITY_EXAMPLES } from "../scripts/city.js";
import { currentAtlas, synchronizeScene } from "../scripts/scene.js";

test("scene lifecycle publishes only globally shared places and preserves unrelated notes", async () => {
  const settings = new Map([["mapImage", DEFAULT_MAP], ["atlas", structuredClone(DEFAULT_ATLAS)]]);
  const makeEntry = (id, ownership) => ({
    id, ownership, getFlag: () => EXAMPLES[0],
    testUserPermission: user => user.isGM || ownership.default >= 2
  });
  const shared = makeEntry("shared", { default: 2 });
  const hidden = makeEntry("hidden", { default: 0 });
  const individual = makeEntry("individual", { default: 0, player: 2 });
  const limited = makeEntry("limited", { default: 1 });
  const excludedPlayer = makeEntry("excluded-player", { default: 2, player: 0 });
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
  globalThis.ui = { notifications: { warn() { assert.fail("unexpected invalid place"); } } };
  globalThis.game = {
    user: { isGM: true }, settings: { get: (_id, name) => settings.get(name) },
    scenes: { contents: [] },
    journal: { contents: [shared, hidden, individual, limited, excludedPlayer], get(id) { return this.contents.find(entry => entry.id === id); } }
  };
  let serial = 0, creations = 0;
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

  shared.ownership = { default: 2 };
  shared.getFlag = () => CITY_EXAMPLES[0];
  const community = makeEntry("community", { default: 2 });
  community.getFlag = () => COMMUNITY_EXAMPLES[0];
  game.journal.contents.push(community);
  settings.set("mapImage", CITY_MAP);
  await synchronizeScene();
  assert.deepEqual(scene.notes.contents.filter(note => note.entryId).map(note => note.entryId), ["shared"]);
  settings.set("mapImage", COMMUNITY_MAP);
  await synchronizeScene();
  assert.deepEqual(scene.notes.contents.filter(note => note.entryId).map(note => note.entryId), ["community"],
    "switching maps removes notes anchored to the previous geography");
  settings.set("mapImage", CITY_STREETS);
  await synchronizeScene();
  assert.deepEqual(scene.notes.contents.filter(note => note.entryId).map(note => note.entryId), ["shared"],
    "both official Atlas variants reuse the same POIs");

  settings.set("mapImage", "worlds/test/custom.webp");
  const replacement = currentAtlas();
  assert.equal(replacement.image, "worlds/test/custom.webp");
  assert.deepEqual(replacement.nodes, [], "original road graph cannot leak onto a different map");
  assert.deepEqual(replacement.districts, []);
  await synchronizeScene();
  assert.equal(scene.background.src, "worlds/test/custom.webp");
  game.user.isGM = false;
  await assert.rejects(synchronizeScene(true), /Only a GM/);
  game.user.isGM = true;
  assert.equal(await synchronizeScene(), scene, "a rejected request does not poison the sync queue");
});
