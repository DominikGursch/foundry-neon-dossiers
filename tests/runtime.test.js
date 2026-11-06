import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ID, DEFAULT_MAP, CITY_MAP, CITY_STREETS, COMMUNITY_MAP, EXAMPLES } from "../scripts/model.js";
import { presetAtlas } from "../scripts/city.js";

class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.events = {};
    this.style = {};
    this.value = "";
    this.isConnected = true;
    this.clientWidth = this.clientHeight = this.scrollLeft = this.scrollTop = 0;
    this.textContent = "";
    if (tag === "form") this.elements = { namedItem: name => this.find(node => node.attributes.name === name) };
  }
  setAttribute(key, value) { this.attributes[key] = value; if (key === "value") this.value = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  remove() {}
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(event, action) { (this.events[event] ??= []).push(action); }
  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const match = child.find(predicate);
      if (match) return match;
    }
    return null;
  }
  querySelector(selector) {
    if (selector === '[type="submit"]') return this.find(node => node.attributes.type === "submit");
    return this.find(node => node.tag === selector);
  }
  async fire(event, extra = {}) {
    for (const listener of this.events[event] ?? []) await listener({ preventDefault() {}, target: this, ...extra });
    await new Promise(resolve => setImmediate(resolve));
  }
}

const hooks = new Map();
const settings = new Map([["mapImage", DEFAULT_MAP]]);
const registered = new Map();
const notifications = [];
const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url))).ND;
globalThis.document = { createElement: tag => new Node(tag), createElementNS: (_namespace, tag) => new Node(tag) };
globalThis.Application = class {
  static get defaultOptions() { return {}; }
  render() { this.rendered = true; return this; }
  activateListeners() {}
  async close() {}
};
globalThis.FormApplication = class extends Application {};
globalThis.foundry = { utils: { mergeObject: (base, extra) => ({ ...base, ...extra }) } };
globalThis.Hooks = {
  on: (name, action) => hooks.set(name, action),
  once: (name, action) => hooks.set(name, action)
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
globalThis.ui = { notifications: Object.fromEntries(["error", "warn", "info"].map(key =>
  [key, message => notifications.push([key, message])])) };
const module = {};
globalThis.game = {
  user: { id: "gm", isGM: true },
  i18n: { localize: key => en[key.replace("ND.", "")] ?? key },
  modules: new Map([[ID, module]]),
  keybindings: { register(_id, _name, config) { assert.deepEqual(config.editable, [{ key: "KeyM", modifiers: ["Shift"] }]); } },
  settings: {
    register: (_id, name, config) => registered.set(name, config),
    registerMenu: (_id, name, config) => registered.set(name, config),
    get: (_id, name) => settings.get(name),
    set: async (_id, name, value) => settings.set(name, value)
  },
  journal: { contents: [], get(id) { return this.contents.find(entry => entry.id === id); } }
};
globalThis.FormData = class {
  constructor(form) {
    this.values = [];
    const visit = node => {
      if (node.attributes.name) this.values.push([node.attributes.name, node.value]);
      for (const child of node.children) visit(child);
    };
    visit(form);
  }
  [Symbol.iterator]() { return this.values[Symbol.iterator](); }
};
let serial = 0;
const updates = [];
globalThis.JournalEntry = {
  async create(data) {
    const entry = {
      ...structuredClone(data), id: `entry${++serial}`,
      getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
      testUserPermission(user) { return user.isGM || (this.ownership[user.id] ?? this.ownership.default) >= 2; },
      async update(change, options) {
        updates.push({ change, options });
        for (const [key, value] of Object.entries(change)) {
          if (key.startsWith("flags.")) this.flags[ID][key.slice(`flags.${ID}.`.length)] = value;
          else this[key] = structuredClone(value);
        }
        hooks.get("updateJournalEntry")?.(this);
        return this;
      },
      async setFlag(namespace, key, value) {
        this.flags[namespace][key] = value;
        hooks.get("updateJournalEntry")?.(this);
      },
      async delete() {
        game.journal.contents = game.journal.contents.filter(item => item !== this);
        hooks.get("deleteJournalEntry")?.(this);
      }
    };
    game.journal.contents.push(entry);
    hooks.get("createJournalEntry")?.(entry);
    return entry;
  }
};
globalThis.Dialog = { confirm: async () => true };
globalThis.DocumentOwnershipConfig = class extends Application {};

const { DossierBoard } = await import("../scripts/module.js");
const newBoard = () => {
  const board = new DossierBoard();
  board.root = new Node("div");
  return board;
};
const findButton = (root, label) => {
  const result = root.find(node => node.tag === "button" && node.textContent === label);
  assert.ok(result, `Missing button: ${label}`);
  return result;
};
const contains = (root, text) => Boolean(root.find(node => node.textContent.includes(text)));

test("v12 lifecycle, GM CRUD, sharing and player revocation with mocked DOM/core", async () => {
  hooks.get("init")();
  assert.equal(registered.get("mapImage").scope, "world");
  assert.equal(registered.get("open").restricted, false);
  assert.ok(registered.get("open").type.prototype instanceof FormApplication);
  new (registered.get("open").type)().render(true);
  const controls = [{ name: "notes", tools: [] }];
  hooks.get("getSceneControlButtons")(controls);
  controls[0].tools[0].onClick();
  assert.ok(module.api.open().rendered);

  const gm = newBoard();
  gm.draw();
  await findButton(gm.root, en.examples).fire("click");
  assert.equal(game.journal.contents.length, 3);
  assert.ok(game.journal.contents.every(entry => entry.ownership.default === 0));
  await findButton(gm.root, en.examples).fire("click");
  assert.equal(game.journal.contents.length, 3, "starter creation is idempotent");

  const place = game.journal.contents[0];
  gm.selected = place.id;
  gm.draw();
  await findButton(gm.root, en.edit).fire("click");
  const form = gm.root.querySelector("form");
  const dangerous = "<img src=x onerror=alert(1)>";
  form.elements.namedItem("title").value = dangerous;
  form.elements.namedItem("notes").value = "GM-only clue";
  await form.fire("submit");
  assert.equal(place.flags[ID].place.title, dangerous);
  assert.equal(place.flags[ID].note, undefined);
  const privateEntry = game.journal.contents.find(entry => entry.flags[ID].noteFor === place.id);
  assert.equal(privateEntry.flags[ID].note, "GM-only clue");
  assert.deepEqual(privateEntry.ownership, { default: 0 });
  assert.ok(contains(gm.root, dangerous), "unsafe-looking title remains literal text");

  await findButton(gm.root, en.share).fire("click");
  assert.deepEqual(place.ownership, { default: 2 });
  assert.equal(updates.at(-1).options.recursive, false);

  game.user = { id: "player", isGM: false };
  const player = newBoard();
  player.selected = place.id;
  player.draw();
  assert.ok(contains(player.root, dangerous));
  assert.ok(!contains(player.root, "GM-only clue"));
  assert.equal(player.root.find(node => node.textContent === en.edit), null);
  assert.equal(privateEntry.testUserPermission(game.user), false);

  // Simulate server ownership update received by a connected player.
  place.ownership = { default: 0 };
  hooks.get("updateJournalEntry")(place);
  assert.equal(player.selected, null);
  assert.ok(!contains(player.root, dangerous), "rendered dossier discarded on revocation");

  game.user = { id: "gm", isGM: true };
  gm.selected = place.id;
  place.ownership = { default: 2, player: 3 };
  gm.draw();
  await findButton(gm.root, en.unshare).fire("click");
  assert.deepEqual(place.ownership, { default: 0 }, "individual grants removed");
  gm.selected = place.id;
  gm.draw();
  await findButton(gm.root, en.delete).fire("click");
  assert.equal(game.journal.get(place.id), undefined);
  assert.equal(game.journal.get(privateEntry.id), undefined);
  assert.equal(notifications.filter(([kind]) => kind === "error").length, 0);

  await gm.close();
  await player.close();
});

test("GM note updates replace grants; a failed note save keeps the form and does not duplicate places", async () => {
  game.user = { id: "gm", isGM: true };
  const gm = newBoard();
  gm.editing = { ...EXAMPLES[0] };
  gm.draw();
  let form = gm.root.querySelector("form");
  form.elements.namedItem("notes").value = "draft";
  const originalCreate = JournalEntry.create;
  JournalEntry.create = async data => {
    if (data.flags[ID].noteFor) throw new Error("simulated storage error");
    return originalCreate(data);
  };
  const before = game.journal.contents.length;
  const originalConsole = console.error;
  console.error = () => {};
  try { await form.fire("submit"); } finally { console.error = originalConsole; JournalEntry.create = originalCreate; }
  assert.equal(game.journal.contents.length, before + 1);
  assert.ok(gm.editing.id);
  assert.equal(gm.root.querySelector("form"), form);
  assert.equal(form.elements.namedItem("notes").value, "draft");
  assert.equal(notifications.at(-1)[0], "error");
  await form.fire("submit");
  assert.equal(game.journal.contents.length, before + 2, "one place and one private note");
  const note = game.journal.contents.find(entry => entry.flags[ID].noteFor === gm.selected);
  note.ownership = { default: 2, player: 3 };
  await findButton(gm.root, en.edit).fire("click");
  form = gm.root.querySelector("form");
  form.elements.namedItem("notes").value = "updated";
  await form.fire("submit");
  assert.deepEqual(note.ownership, { default: 0 });
  assert.equal(note.flags[ID].note, "updated");
  await gm.close();
});

test("districts and route origins respect visibility and drop revoked cached locations", async () => {
  game.user = { id: "gm", isGM: true };
  const a = await JournalEntry.create({ name: "Start", ownership: { default: 2 }, flags: { [ID]: { place: EXAMPLES[0] } } });
  const b = await JournalEntry.create({ name: "End", ownership: { default: 2 }, flags: { [ID]: { place: EXAMPLES[2] } } });
  game.user = { id: "player", isGM: false };
  const board = newBoard();
  board.selected = b.id;
  board.origin = { id: a.id, ...EXAMPLES[0] };
  board.draw();
  assert.ok(board.root.find(node => node.className === "nd-route-summary"));
  const panel = board.root.find(node => node.className === "nd-panel");
  assert.ok(contains(panel, en.routeEstimate), "access disclaimers remain visible when the navigation drawer is closed");
  settings.set("atlases", { [DEFAULT_MAP]: { ...presetAtlas(DEFAULT_MAP), nodes: [], edges: [] } });
  board.draw();
  assert.ok(contains(board.root.find(node => node.className === "nd-panel"), en.noRoads),
    "route errors remain visible in the selected dossier");
  settings.delete("atlases");
  board.district = "relay-ward";
  board.selected = null;
  board.draw();
  assert.ok(contains(board.root, en.threat));
  assert.ok(contains(board.root, "Signal Runners"));
  assert.ok(contains(board.root, EXAMPLES[2].title));
  a.ownership = { default: 0 };
  b.ownership = { default: 0 };
  hooks.get("updateJournalEntry")(a);
  assert.equal(board.origin, null);
  assert.equal(board.selected, null);
  assert.ok(!board.root.find(node => node.className === "nd-route-summary"));
  assert.ok(!contains(board.root, EXAMPLES[2].title));
  await board.close();
});

test("map switching keeps starter creation idempotent and saves separate customized configurations", async () => {
  game.user = { id: "gm", isGM: true };
  const board = newBoard();
  settings.set("mapImage", CITY_MAP);
  board.draw();
  await findButton(board.root, en.examples).fire("click");
  const count = () => game.journal.contents.filter(entry => entry.getFlag(ID, "place")?.mapImage === CITY_MAP).length;
  assert.equal(count(), 8);
  settings.set("mapImage", CITY_STREETS);
  board.draw();
  await findButton(board.root, en.examples).fire("click");
  assert.equal(count(), 8, "Atlas image variants do not duplicate starters");
  await findButton(board.root, en.configureAtlas).fire("click");
  let form = board.root.querySelector("form");
  form.querySelector("textarea").value = JSON.stringify({ ...presetAtlas(CITY_STREETS), kmAcross: 14 });
  await form.fire("submit");
  assert.equal(settings.get("atlases")[CITY_MAP].kmAcross, 14);
  settings.set("mapImage", COMMUNITY_MAP);
  board.draw();
  await findButton(board.root, en.examples).fire("click");
  assert.equal(game.journal.contents.filter(entry => entry.getFlag(ID, "place")?.mapImage === COMMUNITY_MAP).length, 7);
  await findButton(board.root, en.configureAtlas).fire("click");
  form = board.root.querySelector("form");
  form.querySelector("textarea").value = JSON.stringify({ ...presetAtlas(COMMUNITY_MAP), kmAcross: 21 });
  await form.fire("submit");
  assert.equal(settings.get("atlases")[COMMUNITY_MAP].kmAcross, 21);
  assert.equal(settings.get("atlases")[CITY_MAP].kmAcross, 14, "saving another map does not replace prior edits");
  await board.close();
  settings.set("mapImage", DEFAULT_MAP);
});

test("zoom preserves an unsaved dossier draft; invalid map data fails visibly", async () => {
  game.user = { id: "gm", isGM: true };
  const board = newBoard();
  board.editing = { ...EXAMPLES[0] };
  board.draw();
  Object.assign(board.mapScroll, { scrollLeft: 100, scrollTop: 200, clientWidth: 800, clientHeight: 600 });
  const form = board.root.querySelector("form");
  form.elements.namedItem("title").value = "Unsaved title";
  await form.elements.namedItem("title").fire("input");
  form.elements.namedItem("notes").value = "Unsaved private note";
  await form.elements.namedItem("notes").fire("input");
  await findButton(board.root, "+").fire("click");
  assert.equal(board.zoom, 1.25);
  assert.deepEqual(board.viewport, { left: 225, top: 325 }, "zoom preserves the viewport center");
  assert.equal(board.root.querySelector("form").elements.namedItem("title").value, "Unsaved title");
  assert.equal(board.root.querySelector("form").elements.namedItem("notes").value, "Unsaved private note");
  settings.set("mapImage", "https://invalid.example/map.png");
  const originalConsole = console.error;
  console.error = () => {};
  try { board.draw(); } finally { console.error = originalConsole; settings.set("mapImage", DEFAULT_MAP); }
  assert.ok(contains(board.root, en.invalidAtlas));
  assert.ok(!contains(board.root, "Unsaved private note"));
  assert.equal(notifications.at(-1)[0], "error");
  await board.close();
});
