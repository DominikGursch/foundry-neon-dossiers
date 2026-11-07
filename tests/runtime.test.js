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
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.value = "";
    this.isConnected = true;
    this.clientWidth = this.clientHeight = this.scrollLeft = this.scrollTop = 0;
    this.textContent = "";
    if (tag === "form") this.elements = { namedItem: name => this.find(node => node.attributes.name === name) };
  }
  setAttribute(key, value) { this.attributes[key] = value; if (key === "value") this.value = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  focus() {}
  append(...children) { for (const child of children) child.parentElement = this; this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(event, action) { (this.events[event] ??= []).push(action); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 800 }; }
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
    for (const listener of this.events[event] ?? []) await listener({ preventDefault() {}, stopPropagation() {}, target: this, ...extra });
    await new Promise(resolve => setImmediate(resolve));
  }
}

const hooks = new Map();
const settings = new Map([["mapImage", DEFAULT_MAP]]);
const registered = new Map();
const notifications = [];
const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url))).ND;
const documentEvents = new Map();
globalThis.document = {
  body: new Node("body"),
  createElement: tag => new Node(tag), createElementNS: (_namespace, tag) => new Node(tag),
  addEventListener: (name, action) => documentEvents.set(name, action),
  removeEventListener: name => documentEvents.delete(name)
};
globalThis.Application = class {
  static get defaultOptions() { return {}; }
  render() { this.rendered = true; return this; }
  activateListeners() {}
  async close() {}
};
globalThis.FormApplication = class extends Application {};
globalThis.foundry = { utils: {
  mergeObject: (base, extra) => ({ ...base, ...extra }),
  randomID: () => crypto.randomUUID().replaceAll("-", "").slice(0, 16)
} };
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

const { DossierBoard, SceneDossierBoard } = await import("../scripts/module.js");
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
  assert.equal(registered.get("mapImage").default, COMMUNITY_MAP);
  assert.deepEqual(registered.get("atlas").default, {}, "unsaved presets must not shadow future road updates");
  assert.equal(registered.get("open").restricted, false);
  assert.ok(registered.get("open").type.prototype instanceof FormApplication);
  const controls = [{ name: "notes", tools: [] }];
  hooks.get("getSceneControlButtons")(controls);
  assert.equal(typeof controls[0].tools[0].onClick, "function");
  assert.equal(typeof module.api.open, "function");

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
  const atlas = presetAtlas(DEFAULT_MAP);
  const start = { ...EXAMPLES[0], x: atlas.nodes[0].x, y: atlas.nodes[0].y };
  const end = { ...EXAMPLES[2], x: atlas.nodes.at(-1).x, y: atlas.nodes.at(-1).y };
  const a = await JournalEntry.create({ name: "Start", ownership: { default: 2 }, flags: { [ID]: { place: start } } });
  const b = await JournalEntry.create({ name: "End", ownership: { default: 2 }, flags: { [ID]: { place: end } } });
  game.user = { id: "player", isGM: false };
  const board = newBoard();
  board.selected = b.id;
  board.origin = { id: a.id, ...start };
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
  assert.equal(form.querySelector("textarea"), null, "configuration does not expose structured data");
  form.elements.namedItem("kmAcross").value = "14";
  await form.elements.namedItem("kmAcross").fire("input");
  assert.notEqual(settings.get("atlases")?.[CITY_MAP]?.kmAcross, 14, "edits remain a draft until saved");
  await form.fire("submit");
  assert.equal(settings.get("atlases")[CITY_MAP].kmAcross, 14);
  settings.set("mapImage", COMMUNITY_MAP);
  board.draw();
  await findButton(board.root, en.examples).fire("click");
  assert.equal(game.journal.contents.filter(entry => entry.getFlag(ID, "place")?.mapImage === COMMUNITY_MAP).length, 7);
  await findButton(board.root, en.configureAtlas).fire("click");
  form = board.root.querySelector("form");
  form.elements.namedItem("kmAcross").value = "21";
  await form.elements.namedItem("kmAcross").fire("input");
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

test("districts can be added and drawn on the map without structured-data editing", async () => {
  game.user = { id: "gm", isGM: true };
  settings.set("mapImage", DEFAULT_MAP);
  settings.delete("atlases");
  const board = newBoard();
  board.draw();
  await findButton(board.root, en.configureAtlas).fire("click");
  await findButton(board.root, en.addDistrict).fire("click");
  board.pickPoint({ x: 0.1, y: 0.1 });
  board.pickPoint({ x: 0.2, y: 0.1 });
  board.pickPoint({ x: 0.2, y: 0.2 });
  await findButton(board.root, en.finishDistrictShape).fire("click");
  assert.equal(settings.get("atlases"), undefined, "district remains a draft until saved");
  await board.root.querySelector("form").fire("submit");
  const district = settings.get("atlases")[DEFAULT_MAP].districts.at(-1);
  assert.equal(district.name, en.newDistrict);
  assert.equal(district.polygon.length, 3);
  await board.close();
  settings.delete("atlases");
});

test("GM draws roads and explicit access paths without editing JSON", async () => {
  game.user = { id: "gm", isGM: true };
  settings.delete("atlases");
  const board = newBoard();
  board.draw();
  await findButton(board.root, en.editNetwork).fire("click");
  await findButton(board.root, en.drawRoad).fire("click");
  await board.root.find(node => node.className?.includes("nd-road-editor-node")).fire("click");
  board.pickPoint({ x: 0.3, y: 0.2 });
  assert.equal(settings.get("atlases"), undefined, "drawing must not save before confirmation");
  await findButton(board.root, en.saveNetwork).fire("click");
  const atlas = settings.get("atlases")[DEFAULT_MAP];
  assert.equal(atlas.nodes.length, presetAtlas(DEFAULT_MAP).nodes.length + 1);
  assert.deepEqual(atlas.edges.at(-1).modes, ["walk", "bike", "car"]);
  assert.equal(board.networkDraft, null);

  await findButton(board.root, en.addPlace).fire("click");
  const title = board.root.querySelector("form").elements.namedItem("title");
  title.value = "Traced place";
  await title.fire("input");
  board.pickPoint({ x: 0.25, y: 0.3 });
  await findButton(board.root, en.traceAccess).fire("click");
  board.pickPoint({ x: 0.22, y: 0.3 });
  await findButton(board.root, "r0c0").fire("click");
  assert.equal(board.tracingAccess, false);
  assert.equal(board.editing.access.length, 3);
  const form = board.root.querySelector("form");
  assert.equal(board.editing.roadNode, "r0c0");
  await form.fire("submit");
  const saved = game.journal.get(board.selected).flags[ID].place;
  assert.equal(saved.title, "Traced place");
  assert.equal(saved.roadNode, "r0c0");
  assert.deepEqual(saved.access, [{ x: 0.25, y: 0.3 }, { x: 0.22, y: 0.3 }, { x: 0.18, y: 0.1875 }]);
  await findButton(board.root, en.edit).fire("click");
  assert.notEqual(board.editing.access, saved.access, "editing uses an isolated access draft");
  const coordinate = board.root.querySelector("form").elements.namedItem("x");
  coordinate.value = "0.3";
  await coordinate.fire("input");
  assert.equal(board.editing.access, undefined);
  assert.equal(board.editing.roadNode, undefined);
  assert.equal(board.root.querySelector("form").elements.namedItem("roadNode"), null);
  assert.equal(saved.access.length, 3, "unsaved movement cannot change the stored access path");
  await board.close();
  settings.delete("atlases");
});

test("dossier markers do not obstruct street editing and dossier movement stays a draft until saved", async () => {
  game.user = { id: "gm", isGM: true };
  settings.set("mapImage", DEFAULT_MAP);
  settings.delete("atlases");
  const node = presetAtlas(DEFAULT_MAP).nodes[0];
  const place = { ...EXAMPLES[0], x: 0.25, y: 0.3, roadNode: node.id,
    access: [{ x: 0.25, y: 0.3 }, { x: node.x, y: node.y }] };
  const entry = await JournalEntry.create({ name: place.title, ownership: { default: 2 },
    flags: { [ID]: { place: structuredClone(place) } } });
  const board = newBoard();
  board.selected = entry.id;
  board.draw();
  const markerLayer = () => board.root.find(item => item.className === "nd-markers" &&
    item.children.some(child => child.className?.includes("nd-marker")));
  assert.ok(markerLayer());
  await findButton(board.root, en.editNetwork).fire("click");
  assert.equal(markerLayer().attributes.hidden, "", "dossier markers cannot intercept street editing");
  await findButton(board.root, en.cancel).fire("click");
  board.selected = entry.id;
  board.draw();
  await findButton(board.root, en.edit).fire("click");
  const draftMarker = () => board.root.find(item => item.className?.includes("nd-dossier-draft"));
  assert.ok(draftMarker(), "the editable position is visible on the map");
  assert.equal(markerLayer().attributes.hidden, "", "saved marker does not obstruct the editing draft");
  await draftMarker().fire("pointerdown", { button: 0, pointerId: 6, clientX: 250, clientY: 240 });
  documentEvents.get("pointermove")({ pointerId: 6, clientX: 350, clientY: 320 });
  documentEvents.get("pointercancel")({ pointerId: 6 });
  assert.equal(board.editing.x, place.x, "cancelling a drag retains the original draft position");
  assert.deepEqual(board.editing.access, place.access, "a cancelled drag preserves access");
  assert.equal(documentEvents.has("pointermove"), false, "cancel removes drag listeners");
  await draftMarker().fire("pointerdown", { button: 0, pointerId: 7, clientX: 250, clientY: 240 });
  documentEvents.get("pointermove")({ pointerId: 7, clientX: 350, clientY: 320 });
  documentEvents.get("pointerup")({ pointerId: 7, clientX: 350, clientY: 320 });
  assert.equal(board.editing.x, 0.35);
  assert.ok(Math.abs(board.editing.y - 0.4) < 1e-12);
  assert.equal(board.editing.access, undefined);
  assert.deepEqual(entry.getFlag(ID, "place"), place, "stored position and access remain unchanged before saving");
  await findButton(board.root, en.cancel).fire("click");
  assert.deepEqual(entry.getFlag(ID, "place"), place, "cancel restores the original position and access");

  await findButton(board.root, en.edit).fire("click");
  await draftMarker().fire("keydown", { key: "ArrowRight", shiftKey: true });
  assert.equal(board.editing.x, 0.26);
  const form = board.root.querySelector("form");
  form.elements.namedItem("description").value = "Updated description";
  await form.elements.namedItem("description").fire("input");
  await form.fire("submit");
  const saved = entry.getFlag(ID, "place");
  assert.equal(saved.x, 0.26);
  assert.equal(saved.description, "Updated description");
  assert.equal(saved.access, undefined);
  assert.equal(saved.roadNode, undefined);
  assert.equal(entry.ownership.default, 2, "editing preserves sharing");
  game.user = { id: "player", isGM: false };
  board.draw();
  assert.equal(board.root.find(item => item.className?.includes("nd-dossier-draft")), null);
  assert.equal(board.root.find(item => item.textContent === en.edit), null);
  game.user = { id: "gm", isGM: true };
  await entry.delete();
  await board.close();
});

test("scene HUD auto-mounts, follows the canvas, handles picks and drops revoked routes without journal windows", async () => {
  game.user = { id: "gm", isGM: true };
  const atlas = presetAtlas(DEFAULT_MAP);
  const start = { ...EXAMPLES[0], x: atlas.nodes[0].x, y: atlas.nodes[0].y };
  const end = { ...EXAMPLES[2], x: atlas.nodes.at(-1).x, y: atlas.nodes.at(-1).y };
  const a = await JournalEntry.create({ name: "Canvas start", ownership: { default: 0, player: 2 },
    flags: { [ID]: { place: start } } });
  const b = await JournalEntry.create({ name: "Canvas end", ownership: { default: 2 },
    flags: { [ID]: { place: end } } });
  game.user = { id: "player", isGM: false };
  const ticks = new Set(), pans = [];
  globalThis.canvas = {
    ready: true, scene: { getFlag: (_id, name) => name === "atlasScene", initial: { scale: 0.8 }, background: { src: DEFAULT_MAP } },
    dimensions: { sceneX: 100, sceneY: 80, sceneWidth: 1000, sceneHeight: 800 },
    app: { view: new Node("canvas"), ticker: { add: tick => ticks.add(tick), remove: tick => ticks.delete(tick) } },
    stage: { scale: { x: 0.5 }, worldTransform: { a: 0.5, b: 0, c: 0, d: 0.5, tx: 30, ty: -20 } },
    async animatePan(data) { pans.push(data); }
  };
  hooks.get("canvasReady")();
  const board = await module.api.open({ placeId: b.id });
  new (registered.get("open").type)().render(true);
  assert.equal(board.sceneMode, true);
  assert.equal(ticks.size, 1, "opening repeatedly does not add tickers");
  assert.ok(board.mapElement.children.every(node => node.tag !== "img"), "native canvas background is not duplicated");
  assert.equal(board.root.find(node => node.textContent === en.edit), null);
  const origin = board.root.find(node => node.tag === "select" && node.attributes["aria-label"] === en.start);
  origin.value = a.id;
  await origin.fire("change");
  assert.ok(board.routeSummary);
  assert.ok(board.root.find(node => node.attributes["data-route-mode"] === "walk"));
  canvas.stage.worldTransform.tx = 90;
  for (const tick of ticks) tick();
  assert.equal(board.mapElement.style.transform, "matrix(0.5,0,0,0.5,140,20)");
  assert.equal(board.mapElement.style["--nd-inverse-scale"], "2");
  await findButton(board.root, "+").fire("click");
  assert.equal(pans.at(-1).scale, 0.625);
  await findButton(board.root, en.pickStart).fire("click");
  let intercepted = false;
  documentEvents.get("pointerdown")({
    button: 0, target: canvas.app.view, clientX: 240, clientY: 120,
    preventDefault() {}, stopImmediatePropagation() { intercepted = true; }
  });
  assert.equal(intercepted, true);
  assert.deepEqual(board.origin, { x: 0.2, y: 0.25 });
  board.origin = { id: a.id, ...start };
  board.draw();
  a.ownership = { default: 0 };
  hooks.get("updateJournalEntry")(a);
  assert.equal(board.origin, null);
  assert.equal(board.routeSummary, "");
  const note = { document: { getFlag: () => a.id }, visible: true };
  hooks.get("refreshNote")(note);
  assert.equal(note.visible, false, "core icons are replaced by the HUD markers");
  hooks.get("canvasTearDown")();
  assert.equal(ticks.size, 0);
  assert.equal(documentEvents.has("pointerdown"), false);
  assert.equal(board.root, null);
  canvas.scene.getFlag = () => false;
  hooks.get("canvasReady")();
  assert.equal(ticks.size, 0, "ordinary scenes do not get a HUD");
  assert.equal(await module.api.open(), null, "players cannot create scenes or fall back to a journal window");
  assert.equal(notifications.at(-1)[0], "warn");
  canvas.scene.getFlag = () => true;
  hooks.get("canvasReady")();
  const reopened = await module.api.open();
  assert.notEqual(reopened, board);
  assert.equal(reopened.origin, null);
  assert.equal(reopened.selected, null);
  assert.equal(ticks.size, 1, "repeated scene loads do not accumulate listeners");
  hooks.get("canvasTearDown")();
  assert.equal(ticks.size, 0);
  delete globalThis.canvas;
});

test("dossier canvas gestures pan without moving the draft and click places it", async () => {
  game.user = { id: "gm", isGM: true };
  settings.set("mapImage", DEFAULT_MAP);
  const pans = [];
  globalThis.canvas = {
    ready: true, scene: { background: { src: DEFAULT_MAP } },
    dimensions: { sceneX: 100, sceneY: 80, sceneWidth: 1000, sceneHeight: 800 },
    app: { view: new Node("canvas") },
    stage: { scale: { x: 0.5 }, worldTransform: { a: 0.5, b: 0, c: 0, d: 0.5, tx: 30, ty: -20 } },
    pan(value) { pans.push(value); }
  };
  const board = new SceneDossierBoard();
  board.root = new Node("div");
  board.editing = { ...EXAMPLES[0], x: 0.3, y: 0.3 };
  const pointer = (x, y) => ({ button: 0, target: canvas.app.view, pointerId: 7, clientX: x, clientY: y,
    preventDefault() {}, stopImmediatePropagation() {} });
  board.pick(pointer(240, 120));
  documentEvents.get("pointermove")(pointer(340, 170));
  documentEvents.get("pointerup")(pointer(340, 170));
  assert.deepEqual(pans.at(-1), { x: 740, y: 740, scale: 0.5 });
  assert.equal(board.editing.x, 0.3, "panning does not reposition the dossier");
  assert.equal(board.editing.y, 0.3);
  assert.equal(documentEvents.has("pointermove"), false);
  board.pick(pointer(240, 120));
  documentEvents.get("pointerup")(pointer(240, 120));
  assert.deepEqual({ x: board.editing.x, y: board.editing.y }, { x: 0.32, y: 0.25 });
  board.pick(pointer(240, 120));
  documentEvents.get("pointercancel")(pointer(240, 120));
  assert.equal(documentEvents.has("pointerup"), false);
  await board.close();
  delete globalThis.canvas;
});

test("network editor drafts per-mode directions and confirms preset replacement", async () => {
  game.user = { id: "gm", isGM: true };
  settings.set("mapImage", DEFAULT_MAP);
  const customized = presetAtlas(DEFAULT_MAP);
  customized.kmAcross = 17;
  customized.districts[0].name = "Custom district";
  customized.nodes.push({ id: "custom-node", x: 0.1, y: 0.1 });
  settings.set("atlases", { [DEFAULT_MAP]: customized, [CITY_MAP]: { ...presetAtlas(CITY_MAP), kmAcross: 19 } });
  const journalCount = game.journal.contents.length;
  const board = newBoard();
  board.draw();
  await findButton(board.root, en.editNetwork).fire("click");
  assert.ok(board.networkDraft);
  await findButton(board.root, en.showNetworkCheck).fire("click");
  assert.ok(contains(board.root, en.components));
  const firstLine = () => board.root.find(node => node.attributes.class?.startsWith("nd-road-review"));
  await firstLine().fire("click");
  await new Promise(resolve => setTimeout(resolve, 450));
  const bike = board.root.find(node => node.tag === "select" && node.attributes["aria-label"] === en.bike);
  bike.value = "reverse";
  await bike.fire("change");
  assert.deepEqual(settings.get("atlases")[DEFAULT_MAP], customized, "direction changes stay in the draft");
  assert.ok(board.networkDraft.atlas.edges.some(edge => edge.oneWay && edge.modes.includes("bike")));
  const originalConfirm = Dialog.confirm;
  Dialog.confirm = async () => false;
  await findButton(board.root, en.loadPresetRoads).fire("click");
  assert.equal(settings.get("atlases")[DEFAULT_MAP], customized, "cancel leaves custom data untouched");
  Dialog.confirm = async () => true;
  try { await findButton(board.root, en.loadPresetRoads).fire("click"); }
  finally { Dialog.confirm = originalConfirm; }
  assert.equal(settings.get("atlases")[DEFAULT_MAP], customized, "preset also remains a draft");
  await findButton(board.root, en.saveNetwork).fire("click");
  const updated = settings.get("atlases")[DEFAULT_MAP];
  assert.equal(updated.kmAcross, 17);
  assert.equal(updated.districts[0].name, "Custom district");
  assert.deepEqual(updated.nodes, presetAtlas(DEFAULT_MAP).nodes);
  assert.deepEqual(updated.edges, presetAtlas(DEFAULT_MAP).edges);
  assert.equal(settings.get("atlases")[CITY_MAP].kmAcross, 19);
  assert.equal(game.journal.contents.length, journalCount, "loading a street preset must never seed places");
  game.user = { id: "player", isGM: false };
  board.draw();
  assert.equal(board.root.find(node => node.textContent === en.editNetwork), null);
  await board.close();
  settings.delete("atlases");
});

test("moving an access node requires confirmation and preserves the network when declined", async () => {
  game.user = { id: "gm", isGM: true };
  settings.set("mapImage", DEFAULT_MAP);
  settings.delete("atlases");
  const atlas = presetAtlas(DEFAULT_MAP);
  const node = atlas.nodes[0];
  const place = { ...EXAMPLES[0], title: "Access test", x: 0.1, y: 0.1,
    roadNode: node.id, access: [{ x: 0.1, y: 0.1 }, { x: node.x, y: node.y }] };
  const entry = await JournalEntry.create({ name: place.title, ownership: { default: 0 },
    flags: { [ID]: { place } } });
  const board = newBoard();
  board.draw();
  await findButton(board.root, en.editNetwork).fire("click");
  board.networkApply(board.networkDraft.moveNode(node.id, { x: node.x + 0.01, y: node.y }));
  const originalConfirm = Dialog.confirm;
  let warning;
  Dialog.confirm = async options => { warning = options; return false; };
  try {
    await findButton(board.root, en.saveNetwork).fire("click");
    assert.equal(settings.get("atlases"), undefined);
    assert.match(warning.content, /Access test/);
    assert.ok(board.networkDraft, "the draft remains available after declining");
    Dialog.confirm = async () => true;
    await findButton(board.root, en.saveNetwork).fire("click");
    assert.equal(settings.get("atlases")[DEFAULT_MAP].nodes[0].x, node.x + 0.01);
    assert.deepEqual(entry.getFlag(ID, "place").access, place.access, "access is never silently rewritten");
    assert.equal(notifications.at(-1)[0], "warn");
  } finally {
    Dialog.confirm = originalConfirm;
    await entry.delete();
    await board.close();
    settings.delete("atlases");
  }
});
