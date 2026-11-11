import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ID, DEFAULT_MAP as BLANK_MAP, COMMUNITY_MAP, DEFAULT_CATEGORIES } from "../scripts/model.js";
import { EXAMPLES, DEFAULT_ATLAS } from "./fixtures.js";
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
    const attribute = selector.match(/^\[([a-z-]+)="([^"]+)"\]$/);
    if (attribute) return this.find(node => node.attributes[attribute[1]] === attribute[2]);
    return this.find(node => node.tag === selector);
  }
  async fire(event, extra = {}) {
    for (const listener of this.events[event] ?? []) await listener({ preventDefault() {}, stopPropagation() {}, target: this, ...extra });
    await new Promise(resolve => setImmediate(resolve));
  }
}

const hooks = new Map();
const DEFAULT_MAP = COMMUNITY_MAP;
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

test("district selection has a matching contrasting outline and credits stay inside the sources panel", async () => {
  const board = newBoard();
  board.district = "south-night-city";
  board.draw();
  const active = board.root.find(node => node.attributes.class?.includes("nd-active-zone"));
  const halo = board.root.find(node => node.attributes.class === "nd-district-halo");
  assert.ok(active);
  assert.ok(halo);
  assert.equal(halo.attributes.points, active.attributes.points);
  const footer = board.root.find(node => node.className === "nd-route-footer");
  const legal = footer.find(node => node.className === "nd-legal");
  const credit = footer.find(node => node.className === "nd-map-credit");
  assert.equal(legal.find(node => node === credit), credit);
  assert.equal(credit.attributes.href, "https://www.reddit.com/r/cyberpunkred/comments/z1744r/night_city_2045_map_cleaned_and_updated/");
  assert.ok(credit.textContent.includes("Ced23Ric"));
  await board.close();
});

test("blank and custom maps start empty without leaking places from another image", async () => {
  const previous = settings.get("mapImage");
  settings.set("mapImage", BLANK_MAP);
  const board = newBoard();
  board.draw();
  assert.equal(board.root.find(node => node.textContent === en.examples), null);
  assert.ok(board.root.find(node => node.className === "nd-map-credit" && node.textContent === en.customMapCredit));
  const legacy = await JournalEntry.create({ name: "Former map", ownership: { default: 2 },
    flags: { [ID]: { place: { ...EXAMPLES[0], title: "Former map" } } } });
  board.draw();
  assert.equal(contains(board.root, "Former map"), false);
  const ownMap = "worlds/campaign/my-map.webp";
  settings.set("mapImage", ownMap);
  registered.get("mapImage")?.onChange();
  board.draw();
  assert.equal(contains(board.root, "Former map"), false);
  await findButton(board.root, en.addPlace).fire("click");
  const form = board.root.querySelector("form");
  form.elements.namedItem("title").value = "My place";
  await form.fire("submit");
  const created = game.journal.get(board.selected);
  assert.equal(created.getFlag(ID, "place").mapImage, ownMap);
  assert.equal(contains(board.root, "My place"), true);
  settings.set("mapImage", BLANK_MAP);
  board.draw();
  assert.equal(contains(board.root, "My place"), false);
  assert.ok(game.journal.get(created.id), "switching maps preserves the underlying dossier");
  await created.delete(); await legacy.delete(); await board.close();
  settings.set("mapImage", previous);
});

test("v12 lifecycle, GM CRUD, sharing and player revocation with mocked DOM/core", async () => {
  hooks.get("init")();
  assert.equal(registered.get("mapImage").scope, "world");
  assert.equal(registered.get("mapImage").default, BLANK_MAP);
  assert.equal(registered.get("mapImage").config, true);
  assert.equal(registered.get("mapImage").filePicker, "image");
  assert.equal(registered.get("categories").scope, "world");
  assert.deepEqual(registered.get("categories").default, DEFAULT_CATEGORIES);
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
  assert.equal(game.journal.contents.length, 7);
  assert.ok(game.journal.contents.every(entry => entry.ownership.default === 0));
  await findButton(gm.root, en.examples).fire("click");
  assert.equal(game.journal.contents.length, 7, "example creation is idempotent");

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
  const atlas = structuredClone(DEFAULT_ATLAS);
  settings.set("atlases", { [DEFAULT_MAP]: atlas });
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
  const routePanel = board.root.find(node => node.className === "nd-sidebar nd-route-sidebar");
  assert.ok(contains(routePanel, en.routeEstimate), "route status remains visible in the fixed right band");
  assert.ok(!contains(panel, en.campaignDefaults), "normal player dossiers do not display campaign/editor guidance");
  assert.ok(board.root.find(node => node.attributes.class === "nd-route-line nd-route-flow"), "flow follows the ordered route");
  assert.ok(board.routeSummary.includes("→"), "the summary identifies start and destination");
  settings.set("atlases", { [DEFAULT_MAP]: { ...presetAtlas(DEFAULT_MAP), nodes: [], edges: [] } });
  board.draw();
  assert.ok(contains(board.root.find(node => node.className === "nd-sidebar nd-route-sidebar"), en.noRoads),
    "route errors remain visible in the right band");
  settings.set("atlases", { [DEFAULT_MAP]: atlas });
  board.district = "the-glen";
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

test("Community examples stay idempotent and configuration stays a draft", async () => {
  game.user = { id: "gm", isGM: true };
  const board = newBoard();
  settings.set("mapImage", COMMUNITY_MAP);
  board.draw();
  await findButton(board.root, en.examples).fire("click");
  const count = () => game.journal.contents.filter(entry => entry.getFlag(ID, "example") !== undefined &&
    entry.getFlag(ID, "place")?.mapImage === COMMUNITY_MAP).length;
  assert.equal(count(), 7);
  board.draw();
  await findButton(board.root, en.examples).fire("click");
  assert.equal(count(), 7, "existing examples are not duplicated");
  const originalConfirm = Dialog.confirm;
  Dialog.confirm = async () => false;
  try { await findButton(board.root, en.examples).fire("click"); }
  finally { Dialog.confirm = originalConfirm; }
  assert.equal(count(), 7, "declining the example action never changes journals");
  await findButton(board.root, en.configureAtlas).fire("click");
  let form = board.root.querySelector("form");
  assert.equal(form.querySelector("textarea"), null, "configuration does not expose structured data");
  form.elements.namedItem("kmAcross").value = "14";
  await form.elements.namedItem("kmAcross").fire("input");
  assert.notEqual(settings.get("atlases")?.[COMMUNITY_MAP]?.kmAcross, 14, "edits remain a draft until saved");
  await form.fire("submit");
  assert.equal(settings.get("atlases")[COMMUNITY_MAP].kmAcross, 14);
  assert.equal(board.root.find(node => node.attributes["aria-label"] === en.mapPreset), null, "no map selection");
  assert.equal(board.root.find(node => node.textContent === en.mapImage), null, "no map replacement picker");
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
  settings.set("atlases", { [COMMUNITY_MAP]: { ...presetAtlas(COMMUNITY_MAP), width: 0 } });
  const originalConsole = console.error;
  console.error = () => {};
  try { board.draw(); } finally { console.error = originalConsole; settings.delete("atlases"); }
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

test("district corners drag live, insert/delete, undo/redo and cancel without changing saved geometry", async () => {
  game.user = { id: "gm", isGM: true };
  settings.delete("atlases");
  const original = presetAtlas(COMMUNITY_MAP).districts[0].polygon;
  const board = newBoard();
  board.draw();
  await findButton(board.root, en.configureAtlas).fire("click");
  const chooser = board.root.querySelector("form").find(node => node.tag === "select" && node.attributes["aria-label"] === en.districts);
  chooser.value = board.atlasDraft.districts[0].id;
  await chooser.fire("change");
  const district = board.atlasDraft.districts[0];
  const corner = () => board.root.find(node => node.className?.includes("nd-district-point"));
  board.mapElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
  const p = original[0];
  await corner().fire("pointerdown", { button: 0, pointerId: 3, clientX: p.x * 1000, clientY: p.y * 1000 });
  documentEvents.get("pointermove")({ pointerId: 3, clientX: p.x * 1000 + 50, clientY: p.y * 1000 + 50 });
  assert.ok(Math.abs(district.polygon[0].x - (p.x + .05)) < 1e-10, "corner previews before release");
  const active = board.root.find(node => node.attributes["data-district"] === district.id);
  const halo = board.root.find(node => node.attributes["data-district-halo"] === district.id);
  assert.equal(halo.attributes.points, active.attributes.points, "halo follows the live district preview");
  assert.ok(active.attributes.points.startsWith(`${district.polygon[0].x * board.atlasDraft.width},`));
  assert.deepEqual(presetAtlas(COMMUNITY_MAP).districts[0].polygon, original, "preview cannot mutate the preset");
  documentEvents.get("pointerup")({ pointerId: 3 });
  const dragged = structuredClone(district.polygon);
  board.mapElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
  await corner().fire("pointerdown", { button: 0, pointerId: 4, clientX: 400, clientY: 400 });
  documentEvents.get("pointermove")({ pointerId: 4, clientX: 450, clientY: 450 });
  documentEvents.get("pointercancel")({ pointerId: 4 });
  assert.deepEqual(district.polygon, dragged, "pointer cancellation restores the last completed edit");
  await findButton(board.root, en.undo).fire("click");
  assert.deepEqual(district.polygon, original);
  await findButton(board.root, en.redo).fire("click");
  assert.deepEqual(district.polygon, dragged);
  const midpoint = board.root.find(node => node.className?.includes("nd-district-midpoint"));
  await midpoint.fire("click");
  assert.equal(district.polygon.length, original.length + 1);
  await findButton(board.root, en.deleteDistrictPoint).fire("click");
  assert.deepEqual(district.polygon, dragged);
  while (district.polygon.length > 3) {
    await corner().fire("click");
    await findButton(board.root, en.deleteDistrictPoint).fire("click");
  }
  await corner().fire("click");
  assert.equal(findButton(board.root, en.deleteDistrictPoint).disabled, true, "closed shapes retain at least three corners");
  await findButton(board.root, en.cancel).fire("click");
  assert.equal(settings.get("atlases"), undefined, "cancel never persists the district draft");
  assert.deepEqual(presetAtlas(COMMUNITY_MAP).districts[0].polygon, original);
  board.configuring = true; board.atlasDraft = { districts: [district] };
  board.districtEditing = district.id; board.districtDrawing = true;
  district.polygon = Array.from({ length: 100 }, () => ({ x: .5, y: .5 }));
  board.pickPoint({ x: .6, y: .6 });
  assert.equal(district.polygon.length, 100);
  assert.equal(notifications.at(-1)[1], en.districtPointLimit, "limit produces visible feedback");
  await board.close();
  assert.equal(documentEvents.has("pointerup"), false);
  game.user = { id: "player", isGM: false };
  assert.throws(() => board.changeDistrictPolygon(district, []), /Only a GM/);
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
  const roadNode = atlas.nodes[0].id;
  await findButton(board.root, roadNode).fire("click");
  assert.equal(board.tracingAccess, false);
  assert.equal(board.editing.access.length, 3);
  const form = board.root.querySelector("form");
  assert.equal(board.editing.roadNode, roadNode);
  await form.fire("submit");
  const saved = game.journal.get(board.selected).flags[ID].place;
  assert.equal(saved.title, "Traced place");
  assert.equal(saved.roadNode, roadNode);
  assert.deepEqual(saved.access, [{ x: 0.25, y: 0.3 }, { x: 0.22, y: 0.3 }, { x: atlas.nodes[0].x, y: atlas.nodes[0].y }]);
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
  const atlas = presetAtlas(DEFAULT_MAP);
  const node = atlas.nodes[0];
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
  assert.equal(board.editing.x, 0.25 + 10 / atlas.width);
  const form = board.root.querySelector("form");
  form.elements.namedItem("description").value = "Updated description";
  await form.elements.namedItem("description").fire("input");
  await form.fire("submit");
  const saved = entry.getFlag(ID, "place");
  assert.equal(saved.x, 0.25 + 10 / atlas.width);
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
  await findButton(board.root, en.closePanel).fire("click");
  assert.equal(board.root.find(node => node.className?.startsWith("nd-dossier-drawer")).attributes.hidden, "");
  await module.api.open({ placeId: b.id });
  assert.equal(board.root.find(node => node.className?.startsWith("nd-dossier-drawer")).attributes.hidden, undefined,
    "opening a core journal reopens a previously closed drawer");
  new (registered.get("open").type)().render(true);
  assert.equal(board.sceneMode, true);
  assert.equal(ticks.size, 1, "opening repeatedly does not add tickers");
  assert.ok(board.mapElement.children.every(node => node.tag !== "img"), "native canvas background is not duplicated");
  assert.deepEqual(
    ["top", "left", "width", "height"].map(key => board.mapElement.parentElement.style[key]),
    ["0px", "0px", "1000px", "800px"],
    "overlay viewport covers the renderer, not just the layout"
  );
  const previousViewport = board.mapElement.parentElement;
  board.draw();
  assert.notEqual(board.mapElement.parentElement, previousViewport);
  assert.equal(board.mapElement.parentElement.style.width, "1000px", "redraw sizes the replacement viewport");
  canvas.app.view.getBoundingClientRect = () => ({ left: 20, top: 40, width: 900, height: 600 });
  board.updateSceneTransform();
  assert.deepEqual(
    ["top", "left", "width", "height"].map(key => board.mapElement.parentElement.style[key]),
    ["40px", "20px", "900px", "600px"],
    "renderer resize moves and resizes the overlay viewport"
  );
  canvas.app.view.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
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
  settings.set("atlases", { [DEFAULT_MAP]: customized });
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

test("GM tool actions close the menu before redrawing or awaiting a dialog", async () => {
  game.user = { id: "gm", isGM: true };
  for (const action of [en.addPlace, en.configureAtlas, en.editNetwork, en.manageCategories]) {
    const board = newBoard();
    board.gmToolsOpen = true;
    board.draw();
    const menu = board.root.find(node => node.className === "nd-gm-tools");
    assert.equal(menu.open, true);
    await findButton(menu, action).fire("click");
    assert.equal(menu.open, false);
    assert.equal(board.gmToolsOpen, false);
    assert.equal(board.root.find(node => node.className === "nd-gm-tools").open, false);
    await board.close();
  }
  const board = newBoard();
  board.gmToolsOpen = true;
  board.draw();
  const menu = board.root.find(node => node.className === "nd-gm-tools");
  const originalConfirm = Dialog.confirm;
  Dialog.confirm = async () => {
    assert.equal(menu.open, false, "async actions close before opening their confirmation");
    return false;
  };
  try { await findButton(menu, en.examples).fire("click"); }
  finally { Dialog.confirm = originalConfirm; await board.close(); }
});

test("GM categories stay drafts, preserve assignments and style filters, dossiers and editor markers", async () => {
  game.user = { id: "gm", isGM: true };
  const board = newBoard();
  const legacy = await JournalEntry.create({ name: "Retained legacy dossier", ownership: { default: 0 },
    flags: { [ID]: { place: { ...EXAMPLES[0], category: "community", mapImage: "worlds/legacy/map.webp" } } } });
  board.draw();
  await findButton(board.root, en.manageCategories).fire("click");
  const communityGroup = board.root.find(node => node.tag === "fieldset");
  assert.equal(findButton(communityGroup, en.deleteCategory).disabled, true, "retained private dossiers count as usage");
  await findButton(board.root, en.addCategory).fire("click");
  const customId = board.categoryDraft.at(-1).id;
  let form = board.root.querySelector("form");
  const name = form.elements.namedItem(`category-name-${customId}`);
  const color = form.elements.namedItem(`category-color-${customId}`);
  name.value = "Clinics <not markup>";
  await name.fire("input");
  color.value = "#aaff00";
  await color.fire("input");
  const prefix = form.elements.namedItem(`category-prefix-${customId}`);
  prefix.value = "pu";
  await prefix.fire("input");
  assert.equal(settings.get("categories"), undefined, "category edits stay local until saved");
  await form.fire("submit");
  assert.equal(board.categoryDraft, null);
  assert.equal(settings.get("categories").at(-1).name, "Clinics <not markup>");
  assert.equal(settings.get("categories").at(-1).prefix, "PU");
  assert.equal(legacy.getFlag(ID, "place").category, "community");

  await findButton(board.root, en.pickStart).fire("click");
  assert.equal(board.pickingOrigin, true);
  await findButton(board.root, en.addPlace).fire("click");
  assert.equal(board.pickingOrigin, false, "adding a place cancels route-origin picking");
  assert.ok(board.root.find(node => node.className?.startsWith("nd-dossier-drawer") && node.attributes.hidden === undefined));
  form = board.root.querySelector("form");
  assert.equal(form.elements.namedItem("category").value, DEFAULT_CATEGORIES[0].id);
  const chooser = form.elements.namedItem("category");
  chooser.value = customId;
  await chooser.fire("change");
  assert.equal(board.dossierMarker.style["--nd-category"], "#aaff00");
  form.elements.namedItem("title").value = "Custom category clinic";
  await form.fire("submit");
  const entry = game.journal.get(board.selected);
  assert.equal(entry.getFlag(ID, "place").category, customId);
  const categoryText = board.root.find(node => node.className === `nd-category nd-cat-${customId}`);
  assert.equal(categoryText.textContent, "Clinics <not markup>");
  assert.equal(categoryText.style["--nd-category"], "#aaff00");
  const marker = board.root.find(node => node.attributes["aria-label"] === entry.name);
  assert.equal(marker.style["--nd-category"], "#aaff00");
  assert.equal(marker.textContent, "PU01");
  await findButton(board.root, en.share).fire("click");

  await findButton(board.root, en.manageCategories).fire("click");
  form = board.root.querySelector("form");
  form.elements.namedItem(`category-name-${customId}`).value = "Medical";
  await form.elements.namedItem(`category-name-${customId}`).fire("input");
  form.elements.namedItem(`category-color-${customId}`).value = "#bb99ff";
  await form.elements.namedItem(`category-color-${customId}`).fire("input");
  await form.fire("submit");
  assert.equal(entry.getFlag(ID, "place").category, customId, "renaming never rewrites dossier IDs");
  const tab = board.root.find(node => node.textContent.startsWith("Medical ·"));
  assert.equal(tab.style["--nd-category"], "#bb99ff");
  await tab.fire("click");
  assert.equal(board.category, customId);

  await findButton(board.root, en.manageCategories).fire("click");
  board.categoryDraft.at(-1).name = "Unsaved name";
  await findButton(board.root, en.cancel).fire("click");
  assert.equal(settings.get("categories").at(-1).name, "Medical");
  await findButton(board.root, en.manageCategories).fire("click");
  game.user = { id: "player", isGM: false };
  hooks.get("updateUser")();
  assert.equal(board.categoryDraft, null);
  assert.equal(board.root.find(node => node.textContent === en.manageCategories), null);
  assert.throws(() => board.drawCategoryEditor(new Node("section")), /Only a GM/);
  assert.ok(board.root.find(node => node.textContent.startsWith("Medical ·")));
  assert.equal(board.root.find(node => node.attributes["aria-label"] === entry.name).style["--nd-category"], "#bb99ff");
  assert.equal(contains(board.root, "Retained legacy dossier"), false);
  game.user = { id: "gm", isGM: true };
  await entry.delete();
  await legacy.delete();
  await board.close();
  settings.delete("categories");
});

test("category deletion checks late usage; saving rejects conflicts and keeps failed drafts", async () => {
  game.user = { id: "gm", isGM: true };
  const unused = { id: "unused", name: "Unused", color: "#aaff00" };
  settings.set("categories", [...structuredClone(DEFAULT_CATEGORIES), unused]);
  const board = newBoard();
  board.category = unused.id;
  board.draw();
  await findButton(board.root, en.manageCategories).fire("click");
  const unusedGroup = board.root.find(node => node.attributes.name === "category-name-unused").parentElement.parentElement;
  await findButton(unusedGroup, en.deleteCategory).fire("click");
  const entry = await JournalEntry.create({ name: "Late assignment", ownership: { default: 0 },
    flags: { [ID]: { place: { ...EXAMPLES[0], category: unused.id } } } });
  const originalConsole = console.error;
  console.error = () => {};
  try {
    await board.root.querySelector("form").fire("submit");
    assert.equal(notifications.at(-1)[1], `${en.error} ${en.categoryInUse}`);
    assert.ok(settings.get("categories").some(category => category.id === unused.id));
    await entry.delete();
    await board.root.querySelector("form").fire("submit");
    assert.equal(settings.get("categories").some(category => category.id === unused.id), false);
    assert.equal(board.category, "", "a deleted active filter resets to all categories");

    await findButton(board.root, en.manageCategories).fire("click");
    settings.set("categories", [...settings.get("categories"), unused]);
    await board.root.querySelector("form").fire("submit");
    assert.equal(notifications.at(-1)[1], `${en.error} ${en.categoryConflict}`);
    assert.ok(board.categoryDraft, "concurrent edits are not overwritten");
    await findButton(board.root, en.cancel).fire("click");
    await findButton(board.root, en.manageCategories).fire("click");
    const originalSet = game.settings.set;
    game.settings.set = async () => { throw new Error("Write failed"); };
    try { await board.root.querySelector("form").fire("submit"); }
    finally { game.settings.set = originalSet; }
    assert.equal(notifications.at(-1)[1], `${en.error} Write failed`);
    assert.ok(board.categoryDraft);
    assert.equal(board.root.querySelector("form").querySelector('[type="submit"]').disabled, false);
    settings.set("categories", [unused]);
    board.categoryDraft = structuredClone([unused]);
    board.draw();
    assert.equal(findButton(board.root, en.deleteCategory).disabled, true, "last category cannot be deleted");
  } finally {
    console.error = originalConsole;
    await board.close();
    settings.delete("categories");
  }
});

test("example dossiers use configured categories when original defaults were removed", async () => {
  game.user = { id: "gm", isGM: true };
  settings.set("categories", [{ id: "custom", name: "Custom places", color: "#aaff00" }]);
  const journals = game.journal.contents;
  game.journal.contents = [];
  const board = newBoard();
  try {
    board.draw();
    await findButton(board.root, en.examples).fire("click");
    assert.equal(game.journal.contents.length, 7);
    assert.ok(game.journal.contents.every(entry => entry.getFlag(ID, "place").category === "custom"));
    assert.equal(notifications.at(-1)[1], en.exampleCategoriesReassigned);
    await findButton(board.root, en.examples).fire("click");
    assert.equal(game.journal.contents.length, 7, "remapped examples are still idempotent");
  } finally {
    await board.close();
    game.journal.contents = journals;
    settings.delete("categories");
  }
});

test("full-height sidebands use a separate dossier drawer and filter places by district geometry without renumbering", async () => {
  game.user = { id: "gm", isGM: true };
  const atlas = presetAtlas(DEFAULT_MAP);
  const { x, y } = EXAMPLES[0];
  atlas.districts[0].polygon = [{ x: x - .005, y: y - .005 }, { x: x + .005, y: y - .005 },
    { x: x + .005, y: y + .005 }, { x: x - .005, y: y + .005 }];
  settings.set("atlases", { [DEFAULT_MAP]: atlas });
  settings.set("categories", [{ id: "public-services", name: "Public Services", color: "#aaff00", prefix: "PU" }]);
  const a = await JournalEntry.create({ name: "Visible clinic", ownership: { default: 2 },
    flags: { [ID]: { place: { ...EXAMPLES[0], district: "stale-district", title: "Visible clinic", category: "public-services", markerNumber: 3 } } } });
  const b = await JournalEntry.create({ name: "Visible library", ownership: { default: 2 },
    flags: { [ID]: { place: { ...EXAMPLES[1], district: atlas.districts[0].id, title: "Visible library", category: "public-services", markerNumber: 98 } } } });
  const secret = await JournalEntry.create({ name: "Private clinic", ownership: { default: 0 },
    flags: { [ID]: { place: { ...EXAMPLES[2], title: "Private clinic", category: "public-services", markerNumber: 9 } } } });
  game.user = { id: "player", isGM: false };
  const board = newBoard();
  board.mode = "av";
  board.draw();
  const left = () => board.root.find(node => node.className?.startsWith("nd-places-sidebar"));
  const right = () => board.root.find(node => node.className === "nd-sidebar nd-route-sidebar");
  const drawer = () => board.root.find(node => node.className?.startsWith("nd-dossier-drawer"));
  assert.equal(left().children.length, 2);
  assert.deepEqual(left().children.map(node => node.className), ["nd-district-section", "nd-places-section"]);
  assert.equal(drawer().attributes.hidden, "");
  assert.ok(right());
  assert.equal(right().attributes.hidden, undefined);
  assert.equal(right().find(node => node.className === "nd-list"), null, "right route band has no place directory");
  for (const className of ["nd-map-controls", "nd-statusbar", "nd-legal"]) {
    assert.ok(right().find(node => node.className === className), `${className} belongs to the right band`);
  }
  assert.equal(board.root.find(node => node.textContent === en.navigationPlaces), null, "no combined menu toggle remains");
  const codeFor = name => left().children[1].find(node => node.textContent === name)?.attributes["data-index"];
  assert.equal(codeFor(a.name), "PU03");
  assert.equal(codeFor(b.name), "PU98");
  assert.equal(codeFor(secret.name), undefined);
  assert.equal(board.root.find(node => node.attributes["aria-label"] === a.name).textContent, "PU03");
  const districtRow = left().children[0].find(node => node.attributes["data-index"] === "D-01");
  assert.ok(districtRow);
  assert.equal(board.root.find(node => node.className?.includes("nd-district-marker")), null);

  await findButton(left().children[1], a.name).fire("click");
  assert.equal(drawer().attributes.hidden, undefined);
  assert.ok(drawer().className.includes("nd-opening"));
  const origin = right().find(node => node.attributes["aria-label"] === en.start);
  origin.value = b.id;
  await origin.fire("change");
  assert.equal(board.destination, a.id);
  assert.ok(board.routeSummary);
  assert.ok(drawer().find(node => node.tag === "h2" && node.textContent === a.name));
  assert.equal(drawer().className.includes("nd-opening"), false, "route redraws do not restart the drawer animation");
  const initialRoute = board.routeSummary;
  await findButton(left().children[0], districtRow.textContent).fire("click");
  assert.equal(board.selected, null);
  assert.equal(board.destination, a.id);
  assert.equal(board.routeSummary, initialRoute, "district browsing does not erase the route target");
  assert.equal(codeFor(a.name), "PU03", "coordinates determine membership despite stale district metadata");
  assert.equal(codeFor(b.name), undefined, "a district assignment cannot include an outside marker");
  await findButton(drawer(), en.closePanel).fire("click");
  assert.equal(drawer().attributes.hidden, "");
  assert.equal(board.district, atlas.districts[0].id, "closing the dossier preserves the district filter");
  assert.equal(codeFor(b.name), undefined);
  await findButton(left().children[0], en.allDistricts).fire("click");
  assert.equal(codeFor(b.name), "PU98", "all districts restores the directory");
  const search = board.root.find(node => node.attributes.type === "search");
  search.value = a.name;
  await search.fire("input");
  assert.equal(codeFor(a.name), "PU03");
  assert.equal(codeFor(b.name), undefined);
  search.value = "";
  await search.fire("input");
  assert.equal(codeFor(b.name), "PU98", "search never renumbers markers");
  settings.set("categories", [{ id: "public-services", name: "Services", color: "#bb99ff", prefix: "PS" }]);
  registered.get("categories").onChange();
  assert.equal(codeFor(a.name), "PS03", "editing the prefix changes the label, not the number");
  assert.equal(a.getFlag(ID, "place").markerNumber, 3);
  a.ownership = { default: 0 };
  hooks.get("updateJournalEntry")(a);
  assert.equal(board.destination, null);
  assert.equal(board.routeSummary, "");
  assert.equal(codeFor(a.name), undefined);
  game.user = { id: "gm", isGM: true };
  await a.delete(); await b.delete(); await secret.delete();
  await board.close();
  settings.delete("categories");
  settings.delete("atlases");
});
