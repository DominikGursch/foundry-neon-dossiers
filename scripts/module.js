import { ID, DEFAULT_MAP, CATEGORIES, imagePath, placeData, noteText, readablePlaces, filterPlaces, EXAMPLES } from "./model.js";

const t = key => game.i18n.localize(`ND.${key}`);
const windows = new Set();
const invalidEntries = new Set();

function element(tag, options = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
}

function button(label, action, disabled = false) {
  const node = element("button", { type: "button", text: label });
  node.disabled = disabled;
  node.addEventListener("click", () => {
    Promise.resolve().then(action).catch(report);
  });
  return node;
}

function report(error) {
  console.error(`${ID}:`, error);
  ui.notifications.error(`${t("error")} ${error.message}`);
}

function requireGM() {
  if (!game.user.isGM) throw new Error(t("gmOnly"));
}

function allPlaces() {
  return readablePlaces(game.journal.contents, game.user, (entry, error) => {
    if (invalidEntries.has(entry.id)) return;
    invalidEntries.add(entry.id);
    console.error(`${ID}: invalid place ${entry.id}`, error);
    ui.notifications.warn(t("invalidPlace"));
  });
}

function privateNote(placeId) {
  requireGM();
  return game.journal.contents.find(entry => entry.getFlag(ID, "noteFor") === placeId);
}

async function saveNote(placeId, value) {
  requireGM();
  const text = noteText(value);
  const existing = privateNote(placeId);
  if (existing) {
    await existing.update({
      flags: { [ID]: { noteFor: placeId, note: text } }, ownership: { default: 0 }
    }, { diff: false, recursive: false });
  } else if (text) {
    await JournalEntry.create({
      name: `${t("gmNotes")} (${placeId})`,
      ownership: { default: 0 },
      flags: { [ID]: { noteFor: placeId, note: text } }
    });
  }
}

async function createPlace(data) {
  requireGM();
  const place = placeData(data);
  return JournalEntry.create({
    name: place.title,
    ownership: { default: 0 },
    flags: { [ID]: { place } }
  });
}

export class DossierBoard extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: ID, title: "Neon Dossiers", template: `modules/${ID}/templates/board.hbs`,
      width: 1000, height: 720, resizable: true, classes: ["neon-dossiers"]
    });
  }

  constructor(...args) {
    super(...args);
    this.query = "";
    this.category = "";
    this.selected = null;
    this.editing = null;
    this.saving = false;
    windows.add(this);
  }

  async close(options) {
    windows.delete(this);
    return super.close(options);
  }

  activateListeners(html) {
    super.activateListeners(html);
    this.root = html[0].querySelector(".nd-root");
    this.draw();
  }

  refresh() {
    if (this.root?.isConnected) this.draw();
  }

  draw() {
    const places = allPlaces();
    const selected = places.find(place => place.id === this.selected);
    if (!selected) this.selected = null;
    // Permission changes discard the entire rendered dossier, not just its marker.
    this.root.replaceChildren();
    const search = element("input", { type: "search", placeholder: t("search"), "aria-label": t("search"), value: this.query });
    const category = element("select", { "aria-label": t("category") });
    category.append(element("option", { value: "", text: t("allCategories") }));
    for (const key of CATEGORIES) category.append(element("option", { value: key, text: t(key) }));
    category.value = this.category;
    const list = element("div", { class: "nd-list", "aria-label": t("places") });
    const map = element("div", { class: "nd-map" });
    const picture = element("img", { alt: t("mapAlt"), draggable: "false" });
    try {
      picture.src = imagePath(game.settings.get(ID, "mapImage"), false);
    } catch (error) {
      report(error);
    }
    picture.addEventListener("error", () => {
      ui.notifications.error(t("imageError"));
    }, { once: true });
    map.append(picture);
    const markers = element("div", { class: "nd-markers" });
    map.append(markers);
    const updateResults = () => {
      list.replaceChildren();
      markers.replaceChildren();
      const results = filterPlaces(places, this.query, this.category);
      if (!results.length) list.append(element("p", { text: t("noPlaces") }));
      for (const place of results) {
        const select = () => { this.editing = null; this.selected = place.id; this.draw(); };
        list.append(button(place.title, select));
        const marker = button(place.title, select);
        marker.className = "nd-marker";
        marker.setAttribute("aria-label", place.title);
        marker.style.left = `${place.x * 100}%`;
        marker.style.top = `${place.y * 100}%`;
        markers.append(marker);
      }
    };
    search.addEventListener("input", () => { this.query = search.value; updateResults(); });
    category.addEventListener("change", () => { this.category = category.value; updateResults(); });
    const tools = element("div", { class: "nd-tools" }, search, category);
    if (game.user.isGM) {
      tools.append(button(t("addPlace"), () => {
        this.editing = { title: "", category: "community", description: "", image: "", x: 0.5, y: 0.5 };
        this.draw();
      }), button(t("mapImage"), () => {
        return new FilePicker({ type: "image", current: game.settings.get(ID, "mapImage"), callback: path => {
          Promise.resolve().then(() => game.settings.set(ID, "mapImage", imagePath(path, false))).catch(report);
        } }).browse();
      }), button(t("examples"), async () => {
        for (const [index, example] of EXAMPLES.entries()) {
          const exists = game.journal.contents.some(entry => entry.getFlag(ID, "example") === index);
          if (exists) continue;
          const entry = await createPlace(example);
          await entry.setFlag(ID, "example", index);
        }
        ui.notifications.info(t("examplesReady"));
      }));
    }
    const panel = element("section", { class: "nd-panel", "aria-label": t("dossier") });
    this.root.append(tools, element("div", { class: "nd-layout" },
      element("nav", { class: "nd-sidebar" }, list),
      element("div", { class: "nd-map-scroll" }, map), panel));
    this.root.append(element("footer", { class: "nd-disclaimer", text: t("disclaimer") }));
    updateResults();
    if (this.editing && game.user.isGM) this.drawEditor(panel);
    else if (selected) this.drawDossier(panel, selected);
    else panel.append(element("p", { text: t("choosePlace") }));
    map.addEventListener("click", event => {
      if (!game.user.isGM || !this.editing || event.target !== picture) return;
      const rect = picture.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      this.editing.x = x;
      this.editing.y = y;
      const form = panel.querySelector("form");
      if (form) {
        form.elements.namedItem("x").value = String(x);
        form.elements.namedItem("y").value = String(y);
      }
    });
  }

  drawDossier(panel, place) {
    panel.append(element("h2", { text: place.title }), element("p", { class: "nd-category", text: t(place.category) }));
    if (place.image) {
      const image = element("img", { src: place.image, alt: place.title, class: "nd-illustration" });
      image.addEventListener("error", () => ui.notifications.error(t("imageError")), { once: true });
      panel.append(image);
    }
    panel.append(element("p", { class: "nd-description", text: place.description }));
    if (!game.user.isGM) return;
    const entry = game.journal.get(place.id);
    const shared = entry.ownership.default >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    panel.append(element("p", { text: t(shared ? "shared" : "private") }));
    panel.append(button(t("edit"), () => {
      this.editing = { ...place };
      this.draw();
    }), button(t(shared ? "unshare" : "share"), async () => {
      requireGM();
      // Replace all grants so "private" also revokes individually assigned access.
      await entry.update({ ownership: { default: shared ? 0 : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } },
        { diff: false, recursive: false });
    }), button(t("permissions"), () => {
      requireGM();
      new DocumentOwnershipConfig(entry).render(true);
    }), button(t("delete"), async () => {
      requireGM();
      if (!await Dialog.confirm({ title: t("delete"), content: `<p>${t("confirmDelete")}</p>` })) return;
      const note = privateNote(place.id);
      if (note) await note.delete();
      await entry.delete();
      this.selected = null;
      this.draw();
    }));
    const notes = privateNote(place.id)?.getFlag(ID, "note") ?? "";
    panel.append(element("h3", { text: t("gmNotes") }), element("p", { class: "nd-description", text: notes }));
  }

  drawEditor(panel) {
    const data = this.editing;
    const form = element("form", { class: "nd-editor" });
    const field = (name, label, options = {}) => {
      const input = element(options.multiline ? "textarea" : "input", { name, ...options });
      input.removeAttribute("multiline");
      input.value = String(data[name] ?? "");
      form.append(element("label", {}, element("span", { text: t(label) }), input));
      return input;
    };
    panel.append(element("h2", { text: t(data.id ? "edit" : "addPlace") }), form);
    field("title", "title", { required: true, maxlength: 100 });
    const category = element("select", { name: "category" });
    for (const key of CATEGORIES) category.append(element("option", { value: key, text: t(key) }));
    category.value = data.category;
    form.append(element("label", {}, element("span", { text: t("category") }), category));
    field("description", "description", { multiline: true, maxlength: 12000, rows: 6 });
    const image = field("image", "image", { maxlength: 512 });
    form.append(button(t("browse"), () => {
      return new FilePicker({ type: "image", current: image.value, callback: path => {
        try { image.value = imagePath(path); } catch (error) { report(error); }
      } }).browse();
    }));
    form.append(element("p", { text: t("positionHelp") }));
    field("x", "x", { type: "number", min: 0, max: 1, step: "any", required: true });
    field("y", "y", { type: "number", min: 0, max: 1, step: "any", required: true });
    data.notes = data.id ? privateNote(data.id)?.getFlag(ID, "note") ?? "" : "";
    field("notes", "gmNotes", { multiline: true, maxlength: 12000, rows: 4 });
    form.append(element("button", { type: "submit", text: t("save") }), button(t("cancel"), () => {
      this.editing = null;
      this.draw();
    }));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      this.saving = true;
      try {
        requireGM();
        const values = Object.fromEntries(new FormData(form));
        const place = placeData({ ...values, x: Number(values.x), y: Number(values.y) });
        const notes = noteText(values.notes);
        let entry;
        if (data.id) {
          entry = game.journal.get(data.id);
          if (!entry) throw new Error(t("missingPlace"));
          await entry.update({ name: place.title, [`flags.${ID}.place`]: place });
        } else entry = await createPlace(place);
        // Keep the new id if the private note save fails, so a retry cannot duplicate the place.
        data.id = entry.id;
        await saveNote(entry.id, notes);
        this.selected = entry.id;
        this.editing = null;
        this.draw();
      } catch (error) {
        report(error);
      } finally {
        this.saving = false;
        submit.disabled = false;
      }
    });
  }
}

// Foundry v12 settings menus require a FormApplication constructor.
class DossierMenu extends FormApplication {
  render() {
    game.modules.get(ID).api.open();
    return this;
  }
}

Hooks.once("init", () => {
  game.settings.register(ID, "mapImage", {
    name: "ND.mapImage", hint: "ND.mapHint", scope: "world", config: true,
    type: String, default: DEFAULT_MAP,
    onChange: () => { for (const board of windows) board.refresh(); }
  });
  game.settings.registerMenu(ID, "open", {
    name: "ND.open", label: "ND.open", hint: "ND.openHint",
    icon: "fas fa-map-marked-alt", type: DossierMenu, restricted: false
  });
  game.modules.get(ID).api = Object.freeze({ open: () => new DossierBoard().render(true) });
});

Hooks.on("getSceneControlButtons", controls => {
  const notes = controls.find(control => control.name === "notes");
  if (notes) notes.tools.push({
    name: ID, title: "ND.open", icon: "fas fa-map-marked-alt", button: true, visible: true,
    onClick: () => game.modules.get(ID).api.open()
  });
});

for (const hook of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "updateUser"]) {
  Hooks.on(hook, () => {
    for (const board of windows) {
      if (board.saving) continue;
      // Never retain an edit form or private notes across ownership/user changes.
      board.editing = null;
      board.refresh();
    }
  });
}
