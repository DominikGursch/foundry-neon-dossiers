import { ID, CITY_MAP } from "./modules/neon-dossiers/scripts/model.js";
import { NIGHT_CITY_ATLAS, CITY_EXAMPLES, MAP_PRESETS } from "./modules/neon-dossiers/scripts/city.js";

// Only this adapter is simulated. The actual module, renderer and routing code are shared.
const storageKey = "neon-dossiers-preview-v2";
const hooks = new Map();
const translations = {};
let board;
let language = "de";
const notify = (kind, message) => {
  const node = document.createElement("p");
  node.className = kind;
  node.textContent = message;
  document.querySelector("#notifications").append(node);
  setTimeout(() => node.remove(), 10000);
};
const fire = (name, ...args) => { for (const action of hooks.get(name) ?? []) action(...args); };
const save = () => {
  localStorage.setItem(storageKey, JSON.stringify({
    settings: Object.fromEntries(settings),
    journals: game.journal.contents.map(({ id, name, ownership, flags }) => ({ id, name, ownership, flags }))
  }));
};
const settings = new Map([["mapImage", CITY_MAP], ["atlas", structuredClone(NIGHT_CITY_ATLAS)]]);
const configs = new Map();

function journal(data) {
  return {
    ...structuredClone(data),
    getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
    testUserPermission(user) { return user.isGM || (this.ownership[user.id] ?? this.ownership.default) >= 2; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key.startsWith(`flags.${ID}.`)) this.flags[ID][key.slice(`flags.${ID}.`.length)] = structuredClone(value);
        else this[key] = structuredClone(value);
      }
      save(); fire("updateJournalEntry", this); return this;
    },
    async setFlag(namespace, key, value) {
      this.flags[namespace] ??= {};
      this.flags[namespace][key] = structuredClone(value);
      save(); fire("updateJournalEntry", this);
    },
    async delete() {
      game.journal.contents = game.journal.contents.filter(entry => entry !== this);
      save(); fire("deleteJournalEntry", this);
    }
  };
}

Object.assign(globalThis, {
  Hooks: {
    on(name, action) { if (!hooks.has(name)) hooks.set(name, []); hooks.get(name).push(action); },
    once(name, action) { this.on(name, action); }
  },
  Application: class {
    static get defaultOptions() { return {}; }
    activateListeners() {}
    render() {
      if (board && board !== this) board.close();
      board = this;
      this.rendered = true;
      this.root = document.querySelector(".nd-root");
      this.draw();
      return this;
    }
    async close() { this.rendered = false; }
  },
  foundry: { utils: { mergeObject: (base, extra) => ({ ...base, ...extra }) } },
  CONST: { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } },
  ui: { notifications: Object.fromEntries(["info", "warn", "error"].map(kind => [kind, message => notify(kind, message)])) },
  game: {
    user: { id: "gm", isGM: true },
    modules: new Map([[ID, {}]]),
    keybindings: {
      register(_id, _name, options) {
        document.addEventListener("keydown", event => {
          if (event.shiftKey && event.code === "KeyM" && !event.target.matches("input,textarea,select")) {
            event.preventDefault(); options.onDown();
          }
        });
      }
    },
    i18n: { localize: key => translations[language]?.ND[key.replace("ND.", "")] ?? key },
    settings: {
      register(_id, name, config) { configs.set(name, config); },
      registerMenu() {},
      get: (_id, name) => settings.get(name),
      async set(_id, name, value) {
        if (!game.user.isGM) throw new Error("GM only");
        settings.set(name, structuredClone(value)); save(); configs.get(name)?.onChange?.(value); return value;
      }
    },
    journal: { contents: [], get(id) { return this.contents.find(entry => entry.id === id); } },
    scenes: { contents: [] }
  },
  JournalEntry: {
    async create(data) {
      if (!game.user.isGM) throw new Error("GM only");
      const entry = journal({ ...data, id: crypto.randomUUID() });
      game.journal.contents.push(entry); save(); fire("createJournalEntry", entry); return entry;
    }
  },
  Dialog: { confirm: async ({ title }) => window.confirm(title) },
  FilePicker: class {
    constructor(options) { this.options = options; }
    browse() {
      const dialog = document.createElement("dialog");
      const help = document.createElement("p");
      help.textContent = "Demo: bundled images only. Upload additional authorized maps through Foundry's file picker.";
      dialog.append(help);
      for (const preset of [...MAP_PRESETS, ...["exchange", "commons", "relay"].map(name => ({ label: name, image: `modules/${ID}/assets/${name}.svg` }))]) {
        const choice = document.createElement("button");
        choice.textContent = game.i18n.localize(`ND.${preset.label}`);
        choice.addEventListener("click", () => { this.options.callback(preset.image); dialog.close(); });
        dialog.append(choice);
      }
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => dialog.close());
      dialog.append(cancel);
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog); dialog.showModal();
    }
  },
  DocumentOwnershipConfig: class {
    render() { notify("info", "Demo: use Share / Make private. Individual permissions are configured in Foundry."); }
  }
});
globalThis.FormApplication = class extends Application {};

function renderScene(scene) {
  const container = document.querySelector("#scene-map");
  container.replaceChildren();
  const image = document.createElement("img");
  image.src = scene.background.src;
  image.alt = "Scene map preview";
  container.append(image);
  for (const note of scene.notes.contents) {
    if (!game.journal.get(note.entryId)?.testUserPermission(game.user)) continue;
    const marker = document.createElement("button");
    marker.textContent = note.text;
    marker.style.left = `${note.x / scene.width * 100}%`;
    marker.style.top = `${note.y / scene.height * 100}%`;
    marker.addEventListener("click", () => game.modules.get(ID).api.open({ placeId: note.entryId }));
    container.append(marker);
  }
}

globalThis.Scene = {
  async create(data) {
    const scene = {
      ...data, notes: { contents: [] },
      getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
      async update(data) { Object.assign(this, data); renderScene(this); },
      async createEmbeddedDocuments(_type, data) {
        this.notes.contents.push(...data.map(note => ({ ...note, id: crypto.randomUUID(), getFlag(namespace, key) { return this.flags[namespace][key]; } })));
        renderScene(this);
      },
      async updateEmbeddedDocuments(_type, data) {
        for (const item of data) Object.assign(this.notes.contents.find(note => note.id === item._id), item);
        renderScene(this);
      },
      async deleteEmbeddedDocuments(_type, ids) {
        this.notes.contents = this.notes.contents.filter(note => !ids.includes(note.id)); renderScene(this);
      },
      async view() {
        document.querySelector("#scene-preview").hidden = false;
        renderScene(this); document.querySelector("#scene-preview").scrollIntoView({ behavior: "smooth" });
      }
    };
    game.scenes.contents.push(scene); return scene;
  }
};

async function main() {
  for (const lang of ["de", "en"]) {
    const response = await fetch(`modules/${ID}/lang/${lang}.json`);
    if (!response.ok) throw new Error(`Translation load failed: ${response.status}`);
    translations[lang] = await response.json();
  }
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    const value = JSON.parse(stored);
    for (const [key, data] of Object.entries(value.settings)) settings.set(key, data);
    game.journal.contents = value.journals.map(journal);
  } else {
    game.journal.contents = CITY_EXAMPLES.map((place, index) => journal({
      id: `example-${index}`, name: place.title, ownership: { default: 2 },
      flags: { [ID]: { place, example: `${CITY_MAP}:${index}` } }
    }));
    game.journal.contents.push(journal({
      id: "private-place", name: "Unlisted safehouse", ownership: { default: 0 },
      flags: { [ID]: { place: { title: "Unlisted safehouse", category: "mystery", description: "Private demo POI. Share it as GM, then switch to Player to see it appear.", image: "", x: 0.44, y: 0.53, district: "the-glen", mapImage: CITY_MAP } } }
    }));
    save();
  }
  await import(`./modules/${ID}/scripts/module.js`);
  fire("init");
  game.modules.get(ID).api.open();
  fire("ready");
  document.querySelector("#role").addEventListener("change", event => {
    game.user = { id: event.target.value, isGM: event.target.value === "gm" };
    fire("updateUser", game.user);
    for (const scene of game.scenes.contents) renderScene(scene);
  });
  document.querySelector("#language").addEventListener("change", event => {
    language = event.target.value; document.documentElement.lang = language; board.draw();
  });
}

document.querySelector("#reset").addEventListener("click", () => {
  if (!window.confirm("Reset local demo data?")) return;
  try { localStorage.removeItem(storageKey); location.reload(); }
  catch (error) { console.error(error); notify("error", `Reset failed: ${error.message}`); }
});
main().catch(error => { console.error(error); notify("error", `Preview failed: ${error.message}`); });
