import { ID, DEFAULT_MAP } from "./modules/neon-dossiers/scripts/model.js";

// Only this adapter is simulated. The actual module, renderer and routing code are shared.
const storageKey = "neon-dossiers-preview-v2";
const hooks = new Map();
const translations = {};
let language = "de";
const notify = (kind, message) => {
  const node = document.createElement("p");
  node.className = kind;
  node.textContent = message;
  document.querySelector("#notifications").append(node);
  setTimeout(() => node.remove(), 10000);
};
const fire = (name, ...args) => Promise.all((hooks.get(name) ?? []).map(action => action(...args)));
const save = () => {
  localStorage.setItem(storageKey, JSON.stringify({
    settings: Object.fromEntries(settings),
    journals: game.journal.contents.map(({ id, name, ownership, flags, folder }) => ({ id, name, ownership, flags, folder })),
    folders: game.folders.contents.map(({ id, name, type, flags }) => ({ id, name, type, flags }))
  }));
};
const settings = new Map([["mapImage", DEFAULT_MAP]]);
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
      save(); fire("updateJournalEntry", this, changes); return this;
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
      throw new Error("The demo uses the scene HUD, not application windows.");
    }
    async close() { this.rendered = false; }
  },
  foundry: { utils: {
    mergeObject: (base, extra) => ({ ...base, ...extra }),
    randomID: () => crypto.randomUUID().replaceAll("-", "").slice(0, 16)
  } },
  CONST: { DOCUMENT_OWNERSHIP_LEVELS: { LIMITED: 1, OBSERVER: 2 } },
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
    folders: { contents: [] },
    scenes: { contents: [] }
  },
  Folder: {
    async create(data) {
      if (!game.user.isGM) throw new Error("GM only");
      const folder = { ...structuredClone(data), id: crypto.randomUUID(),
        getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; } };
      game.folders.contents.push(folder); save(); return folder;
    }
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
      help.textContent = "Demo: no images are bundled. Upload authorized images through Foundry's file picker.";
      dialog.append(help);
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

const view = document.querySelector("#preview-canvas");
const context = view.getContext("2d");
const ticks = new Set();
let background;
globalThis.canvas = {
  ready: false, scene: null, notes: { placeables: [] },
  app: { view, ticker: { add: action => ticks.add(action), remove: action => ticks.delete(action) } },
  stage: { scale: { x: 1 }, worldTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } },
  pan({ x, y, scale = this.stage.scale.x }) {
    const matrix = this.stage.worldTransform;
    const rect = view.getBoundingClientRect();
    x ??= (rect.width / 2 - matrix.tx) / matrix.a;
    y ??= (rect.height / 2 - matrix.ty) / matrix.d;
    scale = Math.max(0.1, Math.min(4, scale));
    Object.assign(matrix, { a: scale, d: scale, tx: rect.width / 2 - x * scale, ty: rect.height / 2 - y * scale });
    this.stage.scale.x = scale;
  },
  async animatePan(options) {
    this.pan(options);
  }
};

async function showScene(scene) {
  fire("canvasTearDown");
  canvas.ready = false;
  background = new Image();
  background.src = scene.background.src;
  await background.decode();
  canvas.scene = scene;
  canvas.dimensions = { sceneX: 0, sceneY: 0, sceneWidth: scene.width, sceneHeight: scene.height };
  const rect = view.getBoundingClientRect();
  const scale = Math.min(rect.width / scene.width, rect.height / scene.height) * 1.5;
  scene.initial = { scale };
  await canvas.animatePan({ x: scene.width / 2, y: scene.height * 0.55, scale });
  canvas.ready = true;
  fire("canvasReady");
}

function frame() {
  const rect = view.getBoundingClientRect();
  const ratio = devicePixelRatio;
  if (view.width !== Math.round(rect.width * ratio) || view.height !== Math.round(rect.height * ratio)) {
    view.width = Math.round(rect.width * ratio); view.height = Math.round(rect.height * ratio);
  }
  context.resetTransform();
  context.clearRect(0, 0, view.width, view.height);
  if (canvas.ready) {
    const { a, b, c, d, tx, ty } = canvas.stage.worldTransform;
    context.setTransform(a * ratio, b * ratio, c * ratio, d * ratio, tx * ratio, ty * ratio);
    context.drawImage(background, 0, 0, canvas.scene.width, canvas.scene.height);
    for (const tick of ticks) tick();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
let drag;
view.addEventListener("pointerdown", event => {
  if (event.button !== 0) return;
  const { tx, ty } = canvas.stage.worldTransform;
  drag = { x: event.clientX, y: event.clientY, tx, ty };
  view.setPointerCapture(event.pointerId);
});
view.addEventListener("pointermove", event => {
  if (!drag) return;
  canvas.stage.worldTransform.tx = drag.tx + event.clientX - drag.x;
  canvas.stage.worldTransform.ty = drag.ty + event.clientY - drag.y;
});
for (const name of ["pointerup", "pointercancel"]) view.addEventListener(name, () => { drag = null; });
view.addEventListener("wheel", event => {
  event.preventDefault();
  canvas.animatePan({ scale: canvas.stage.scale.x * (event.deltaY < 0 ? 1.15 : 1 / 1.15) });
}, { passive: false });

globalThis.Scene = {
  async create(data) {
    const scene = {
      ...data, id: crypto.randomUUID(), notes: { contents: [] },
      getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
      async update(data) {
        const changed = this.background.src !== data.background.src || this.width !== data.width || this.height !== data.height;
        Object.assign(this, data);
        if (changed && canvas.scene === this) await showScene(this);
      },
      async createEmbeddedDocuments(_type, data) {
        this.notes.contents.push(...data.map(note => ({ ...note, id: crypto.randomUUID(), getFlag(namespace, key) { return this.flags[namespace][key]; } })));
      },
      async updateEmbeddedDocuments(_type, data) {
        for (const item of data) Object.assign(this.notes.contents.find(note => note.id === item._id), item);
      },
      async deleteEmbeddedDocuments(_type, ids) {
        this.notes.contents = this.notes.contents.filter(note => !ids.includes(note.id));
      },
      async view() {
        await showScene(this);
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
    game.folders.contents = (value.folders ?? []).map(data => ({
      ...data, getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; }
    }));
  } else {
    save();
  }
  await import(`./modules/${ID}/scripts/module.js`);
  await fire("init");
  await fire("ready");
  await game.modules.get(ID).api.open();
  document.querySelector("#role").addEventListener("change", event => {
    game.user = { id: event.target.value, isGM: event.target.value === "gm" };
    fire("updateUser", game.user);
  });
  document.querySelector("#language").addEventListener("change", event => {
    language = event.target.value; document.documentElement.lang = language;
    game.modules.get(ID).api.open().catch(error => notify("error", error.message));
  });
}

document.querySelector("#reset").addEventListener("click", () => {
  if (!window.confirm("Reset local demo data?")) return;
  try { localStorage.removeItem(storageKey); location.reload(); }
  catch (error) { console.error(error); notify("error", `Reset failed: ${error.message}`); }
});
main().catch(error => { console.error(error); notify("error", `Preview failed: ${error.message}`); });
