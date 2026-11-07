import { ID, DEFAULT_MAP, CITY_MAP, COMMUNITY_MAP, CATEGORIES, imagePath, placeData, noteText, readablePlaces, filterPlaces, placesOnMap, mapFamily, EXAMPLES } from "./model.js";
import { MODES, atlasData, findRoute, roadAccess } from "./atlas.js";
import { MAP_PRESETS, starterPlaces, ATLAS_SOURCE, presetAtlas } from "./city.js";
import { currentAtlas, synchronizeScene } from "./scene.js";
import { sceneTransform, scenePoint } from "./canvas.js";
import { inspectNetwork } from "./network.js";

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

function svg(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function allPlaces() {
  return placesOnMap(readablePlaces(game.journal.contents, game.user, (entry, error) => {
    if (invalidEntries.has(entry.id)) return;
    invalidEntries.add(entry.id);
    console.error(`${ID}: invalid place ${entry.id}`, error);
    ui.notifications.warn(t("invalidPlace"));
  }), game.settings.get(ID, "mapImage"));
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
  const place = placeData({ ...data, mapImage: data.mapImage ?? currentAtlas().image });
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
      width: 1280, height: 820, resizable: true, classes: ["neon-dossiers"]
    });
  }

  constructor(...args) {
    super(...args);
    this.query = "";
    this.category = "";
    this.selected = null;
    this.editing = null;
    this.saving = false;
    this.district = "";
    this.origin = null;
    this.mode = "walk";
    this.pickingOrigin = false;
    this.configuring = false;
    this.roadDraft = null;
    this.tracingAccess = false;
    this.reviewing = false;
    this.reviewMode = "car";
    this.zoom = 1;
    this.sidebarOpen = false;
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
    if (this.mapScroll?.isConnected && !this.resetViewport) {
      const ratio = this.zoom / (this.renderedZoom ?? this.zoom);
      this.viewport = {
        left: (this.mapScroll.scrollLeft + this.mapScroll.clientWidth / 2) * ratio - this.mapScroll.clientWidth / 2,
        top: (this.mapScroll.scrollTop + this.mapScroll.clientHeight / 2) * ratio - this.mapScroll.clientHeight / 2
      };
    }
    this.renderedZoom = this.zoom;
    const places = allPlaces();
    let atlas;
    try { atlas = currentAtlas(); }
    catch (error) {
      this.root.replaceChildren(element("p", { role: "alert", text: t("invalidAtlas") }));
      report(error);
      return;
    }
    if (!atlas.districts.some(district => district.id === this.district)) this.district = "";
    if (this.origin?.id && !places.some(place => place.id === this.origin.id)) this.origin = null;
    else if (this.origin?.id) this.origin = places.find(place => place.id === this.origin.id);
    const selected = places.find(place => place.id === this.selected);
    if (!selected) this.selected = null;
    // Permission changes discard the entire rendered dossier, not just its marker.
    this.root.replaceChildren();
    const search = element("input", { type: "search", placeholder: t("search"), "aria-label": t("search"), value: this.query });
    const categories = element("nav", { class: "nd-categories", "aria-label": t("category") });
    for (const key of ["", ...CATEGORIES]) {
      const tab = button(`${t(key || "allCategories")} · ${places.filter(place => !key || place.category === key).length}`, () => {
        this.category = key;
        this.draw();
      });
      tab.className = `nd-category-tab nd-cat-${key || "all"}`;
      tab.setAttribute("aria-pressed", String(this.category === key));
      categories.append(tab);
    }
    const list = element("div", { class: "nd-list", "aria-label": t("places") });
    const map = element("div", { class: "nd-map" });
    map.style.width = this.sceneMode ? `${atlas.width}px` : `${this.zoom * 100}%`;
    if (this.sceneMode) map.style.height = `${atlas.height}px`;
    this.mapElement = map;
    const picture = element("img", { src: atlas.image, alt: t("mapAlt"), draggable: "false" });
    picture.addEventListener("error", () => {
      ui.notifications.error(t("imageError"));
    }, { once: true });
    if (!this.sceneMode) map.append(picture);
    const overlay = svg("svg", { class: "nd-overlay", viewBox: `0 0 ${atlas.width} ${atlas.height}`, preserveAspectRatio: "none", "aria-hidden": "true" });
    for (const district of atlas.districts) {
      overlay.append(svg("polygon", {
        points: district.polygon.map(p => `${p.x * atlas.width},${p.y * atlas.height}`).join(" "),
        class: `nd-district-zone nd-threat-${district.threat}${this.district === district.id ? " nd-active-zone" : ""}`
      }));
    }
    const markers = element("div", { class: "nd-markers" });
    map.append(overlay, markers);
    const updateResults = () => {
      list.replaceChildren();
      markers.replaceChildren();
      const results = filterPlaces(places, this.query, this.category).filter(place => !this.district || place.district === this.district);
      if (!results.length) list.append(element("p", { text: t("noPlaces") }));
      for (const place of results) {
        const select = () => {
          if (this.editing || this.roadDraft) return;
          this.configuring = false; this.reviewing = false; this.sidebarOpen = false; this.selected = place.id; this.draw();
        };
        const index = String(places.indexOf(place) + 1).padStart(2, "0");
        const row = button(place.title, select);
        row.className = `nd-place-row nd-cat-${place.category}${place.id === this.selected ? " nd-selected" : ""}`;
        row.setAttribute("data-index", index);
        list.append(row);
        const marker = button(index, select);
        marker.className = `nd-marker nd-cat-${place.category}${place.id === this.selected ? " nd-selected" : ""}`;
        marker.setAttribute("aria-label", place.title);
        marker.setAttribute("title", place.title);
        marker.setAttribute("data-label", place.title);
        marker.style.left = `${place.x * 100}%`;
        marker.style.top = `${place.y * 100}%`;
        markers.append(marker);
      }
    };
    const roadMarkers = element("div", { class: "nd-markers" });
    map.append(roadMarkers);
    search.addEventListener("input", () => { this.query = search.value; updateResults(); });
    const districts = element("select", { "aria-label": t("districts") });
    districts.append(element("option", { value: "", text: t("allDistricts") }));
    for (const district of atlas.districts) districts.append(element("option", { value: district.id, text: district.name }));
    districts.value = this.district;
    districts.addEventListener("change", () => {
      this.district = districts.value;
      this.selected = null;
      this.editing = null;
      this.configuring = false;
      this.reviewing = false;
      this.roadDraft = null;
      this.tracingAccess = false;
      this.sidebarOpen = false;
      this.draw();
    });
    const toggle = button(t("navigationPlaces"), () => { this.sidebarOpen = !this.sidebarOpen; this.draw(); });
    toggle.setAttribute("aria-expanded", String(this.sidebarOpen));
    const tools = element("div", { class: "nd-tools" }, search, districts, toggle);
    if (game.user.isGM) {
      const mapChoice = element("select", { "aria-label": t("mapPreset") });
      for (const preset of MAP_PRESETS) mapChoice.append(element("option", { value: preset.image, text: t(preset.label) }));
      if (!MAP_PRESETS.some(preset => preset.image === atlas.image)) {
        mapChoice.append(element("option", { value: atlas.image, text: t("customMap") }));
      }
      mapChoice.value = atlas.image;
      mapChoice.addEventListener("change", () => {
        Promise.resolve().then(() => { requireGM(); return game.settings.set(ID, "mapImage", mapChoice.value); }).catch(report);
      });
      const gmTools = element("details", { class: "nd-gm-tools" }, element("summary", { text: t("gmTools") }));
      gmTools.open = this.gmToolsOpen ?? false;
      gmTools.addEventListener("toggle", () => { this.gmToolsOpen = gmTools.open; });
      const gmActions = element("div", { class: "nd-gm-actions" });
      gmTools.append(gmActions);
      tools.append(mapChoice, gmTools);
      gmActions.append(button(t("addPlace"), () => {
        this.configuring = false;
        this.reviewing = false;
        this.roadDraft = null;
        this.tracingAccess = false;
        this.editing = { title: "", category: "community", description: "", image: "", x: 0.5, y: 0.5 };
        this.draw();
      }), button(t("mapImage"), () => {
        return new FilePicker({ type: "image", current: game.settings.get(ID, "mapImage"), callback: path => {
          Promise.resolve().then(() => game.settings.set(ID, "mapImage", imagePath(path, false))).catch(report);
        } }).browse();
      }), button(t("examples"), async () => {
        const examples = atlas.image === DEFAULT_MAP ? EXAMPLES : starterPlaces(atlas.image);
        if (!examples.length) throw new Error(t("noStarterData"));
        for (const [index, example] of examples.entries()) {
          const key = atlas.image === DEFAULT_MAP ? index : `${mapFamily(atlas.image)}:${index}`;
          const exists = game.journal.contents.some(entry => entry.getFlag(ID, "example") === key);
          if (exists) continue;
          const entry = await createPlace(example);
          await entry.setFlag(ID, "example", key);
        }
        ui.notifications.info(t("examplesReady"));
      }), button(t("configureAtlas"), () => {
        this.editing = null;
        this.reviewing = false;
        this.roadDraft = null;
        this.atlasDraft = null;
        this.configuring = true;
        this.draw();
      }), button(t("drawRoad"), () => {
        this.editing = null;
        this.configuring = false;
        this.reviewing = false;
        this.roadDraft = { points: [], modes: ["walk", "bike", "car"] };
        this.draw();
      }), button(t("reviewNetwork"), () => {
        this.editing = null; this.configuring = false; this.roadDraft = null; this.tracingAccess = false;
        this.reviewing = true; this.reviewEdge = null; this.draw();
      }), button(t("scene"), async () => {
        requireGM();
        const scene = await synchronizeScene(true);
        await scene.view();
        ui.notifications.info(t("sceneReady"));
      }));
    }
    const panel = element("section", { class: "nd-panel", "aria-label": t("dossier") });
    const closePanel = button(t("closePanel"), () => {
      this.selected = null; this.district = ""; this.editing = null; this.configuring = false;
      this.reviewing = false;
      this.roadDraft = null; this.tracingAccess = false;
      this.welcomeDismissed = true; this.draw();
    });
    closePanel.className = "nd-close-panel";
    panel.append(closePanel);
    const routeControls = element("section", { class: "nd-route-controls" }, element("h3", { text: t("navigation") }));
    const origin = element("select", { "aria-label": t("start") });
    origin.append(element("option", { value: "", text: this.origin && !this.origin.id ? t("mapStart") : t("chooseStart") }));
    for (const place of places) origin.append(element("option", { value: place.id, text: place.title }));
    origin.value = this.origin?.id ?? "";
    origin.addEventListener("change", () => { this.origin = places.find(place => place.id === origin.value) ?? null; this.draw(); });
    const mode = element("select", { "aria-label": t("travelMode") });
    for (const key of Object.keys(MODES)) mode.append(element("option", { value: key, text: t(key) }));
    mode.value = this.mode;
    mode.addEventListener("change", () => { this.mode = mode.value; this.draw(); });
    const destination = element("select", { "aria-label": t("destination") });
    destination.append(element("option", { value: "", text: t("chooseDestination") }));
    for (const place of places) destination.append(element("option", { value: place.id, text: place.title }));
    destination.value = this.selected ?? "";
    destination.addEventListener("change", () => {
      this.selected = destination.value || null;
      this.editing = null; this.configuring = false; this.roadDraft = null; this.tracingAccess = false;
      this.reviewing = false;
      this.draw();
    });
    routeControls.append(element("label", {}, element("span", { text: t("start") }), origin), mode,
      element("label", {}, element("span", { text: t("destination") }), destination),
      button(t(this.pickingOrigin ? "cancel" : "pickStart"), () => { this.pickingOrigin = !this.pickingOrigin; this.draw(); }),
      button(t("clearRoute"), () => { this.origin = null; this.pickingOrigin = false; this.draw(); }));
    if (this.pickingOrigin) routeControls.append(element("p", { text: t("pickStartHelp") }));
    if (this.origin) {
      overlay.append(svg("circle", { cx: this.origin.x * atlas.width, cy: this.origin.y * atlas.height, r: 10, class: "nd-origin" }));
    }
    this.routeSummary = "";
    this.routeError = "";
    if (this.origin && selected && !this.editing && !this.roadDraft && !this.configuring && !this.reviewing) {
      this.drawRoute(routeControls, overlay, atlas, selected);
    }
    const sidebar = element("nav", { class: "nd-sidebar", "aria-label": t("navigationPlaces") }, routeControls,
      element("h3", { text: `${t("places")} // ${places.length}` }), list);
    if (!this.sidebarOpen) sidebar.setAttribute("hidden", "");
    const mapScroll = element("div", { class: "nd-map-scroll", tabindex: "0", "aria-label": t("mapControls") }, map);
    this.mapScroll = this.sceneMode ? null : mapScroll;
    const zoom = element("div", { class: "nd-map-controls" },
      button("+", () => this.changeZoom(0.25), !this.sceneMode && this.zoom >= 4),
      element("span", { text: `${Math.round(this.zoom * 100)}%` }),
      button("-", () => this.changeZoom(-0.25), !this.sceneMode && this.zoom <= 0.5),
      button(t("resetView"), () => this.centerMap(atlas)));
    zoom.children[0].setAttribute("aria-label", t("zoomIn"));
    zoom.children[2].setAttribute("aria-label", t("zoomOut"));
    this.zoomLabel = zoom.children[1];
    const preset = MAP_PRESETS.find(preset => preset.image === atlas.image);
    const credits = element("a", { href: preset?.url ?? ATLAS_SOURCE, target: "_blank", rel: "noopener noreferrer",
      text: preset?.credit ?? t("customMap"), class: "nd-map-credit" });
    const legal = element("details", { class: "nd-legal" }, element("summary", { text: t("credits") }),
      element("p", { text: t("disclaimer") }));
    const city = [CITY_MAP, COMMUNITY_MAP].includes(mapFamily(atlas.image));
    this.root.append(element("header", { class: "nd-heading" },
      element("div", { class: "nd-wordmark" }, element("strong", { text: city ? "NIGHT CITY" : "HARBOR GRID" }),
        element("span", { text: "NEON DOSSIERS / CITYNET 2045" })),
      element("div", { class: "nd-connection" }, element("span", { text: t("cityLink") }),
        element("strong", { text: t(game.user.isGM ? "gmView" : "playerView") }))),
    tools, categories, element("div", { class: `nd-layout${this.sidebarOpen ? " nd-sidebar-open" : ""}` },
      mapScroll, sidebar, panel, zoom),
    element("footer", { class: "nd-statusbar" }, element("span", { text: `${places.length} ${t("places")} / ${atlas.districts.length} ${t("districts")}` }), credits, legal));
    updateResults();
    if (this.reviewing && game.user.isGM) this.drawNetworkReview(panel, overlay, atlas);
    else if (this.roadDraft && game.user.isGM) this.drawRoadEditor(panel, overlay, roadMarkers, atlas);
    else if (this.configuring && game.user.isGM) this.drawAtlasEditor(panel, atlas);
    else if (this.editing && game.user.isGM) this.drawEditor(panel);
    else if (selected) this.drawDossier(panel, selected);
    else if (this.district) this.drawDistrict(panel, atlas.districts.find(district => district.id === this.district), places);
    else {
      panel.className += " nd-welcome";
      if (this.welcomeDismissed) panel.setAttribute("hidden", "");
      panel.append(element("p", { class: "nd-eyebrow", text: "CITY ARCHIVE // 2045" }),
        element("h2", { text: t("welcomeTitle") }), element("p", { text: t("choosePlace") }),
        element("p", { class: "nd-muted", text: t("mapHelp") }));
    }
    if (city) panel.append(element("p", { class: "nd-data-note", text: t("campaignDefaults") }));
    if (this.editing && game.user.isGM) this.drawAccess(overlay, roadMarkers, atlas);
    if (this.sceneMode) {
      this.updateSceneTransform();
      return;
    }
    const restoreViewport = () => {
      if (!mapScroll.isConnected) return;
      if (this.viewport && !this.resetViewport) {
        mapScroll.scrollLeft = this.viewport.left;
        mapScroll.scrollTop = this.viewport.top;
      } else {
        mapScroll.scrollLeft = Math.max(0, picture.clientWidth * 0.5 - mapScroll.clientWidth / 2);
        mapScroll.scrollTop = Math.max(0, picture.clientHeight * 0.47 - mapScroll.clientHeight / 2);
      }
      this.resetViewport = false;
    };
    picture.addEventListener("load", restoreViewport, { once: true });
    if (picture.complete) restoreViewport();
    let drag;
    let dragged = false;
    picture.addEventListener("pointerdown", event => {
      if (event.button !== 0 || this.pickingOrigin || this.editing || this.roadDraft) return;
      drag = { x: event.clientX, y: event.clientY, left: mapScroll.scrollLeft, top: mapScroll.scrollTop };
      dragged = false;
      picture.setPointerCapture(event.pointerId);
    });
    picture.addEventListener("pointermove", event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 5) dragged = true;
      mapScroll.scrollLeft = drag.left - dx;
      mapScroll.scrollTop = drag.top - dy;
    });
    picture.addEventListener("pointerup", () => { drag = null; });
    picture.addEventListener("pointercancel", () => { drag = null; dragged = false; });
    map.addEventListener("click", event => {
      if (dragged || event.target !== picture) return;
      const rect = picture.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      this.pickPoint({ x, y });
    });
  }

  changeZoom(delta) {
    this.zoom = Math.max(0.5, Math.min(4, this.zoom + delta));
    this.draw();
  }

  centerMap() {
    this.zoom = 1; this.viewport = null; this.resetViewport = true; this.draw();
  }

  pickPoint(p) {
    if (this.pickingOrigin) {
      this.origin = p;
      this.pickingOrigin = false;
      this.draw();
    } else if (game.user.isGM && this.roadDraft) {
      this.roadDraft.points.push({ ...p, id: `nd-${foundry.utils.randomID()}` });
      this.draw();
    } else if (game.user.isGM && this.editing) {
      if (this.tracingAccess) {
        this.editing.access.push(p);
      } else {
        Object.assign(this.editing, p);
        delete this.editing.access;
        delete this.editing.roadNode;
      }
      this.draw();
    }
  }

  drawRoads(overlay, atlas) {
    const nodes = new Map(atlas.nodes.map(node => [node.id, node]));
    for (const edge of atlas.edges) {
      overlay.append(svg("polyline", {
        class: "nd-road-guide",
        points: [nodes.get(edge.from), nodes.get(edge.to)].map(p => `${p.x * atlas.width},${p.y * atlas.height}`).join(" ")
      }));
    }
  }

  roadNodes(markers, atlas, action) {
    for (const node of atlas.nodes) {
      const marker = button(node.id, () => action(node));
      marker.className = "nd-road-node";
      marker.setAttribute("title", node.id);
      marker.setAttribute("aria-label", node.id);
      marker.style.left = `${node.x * 100}%`;
      marker.style.top = `${node.y * 100}%`;
      markers.append(marker);
    }
  }

  drawAccess(overlay, markers, atlas) {
    this.drawRoads(overlay, atlas);
    if (this.editing.access?.length) overlay.append(svg("polyline", {
      class: "nd-route-line nd-route-access",
      points: this.editing.access.map(p => `${p.x * atlas.width},${p.y * atlas.height}`).join(" ")
    }));
    overlay.append(svg("circle", {
      cx: Number(this.editing.x) * atlas.width, cy: Number(this.editing.y) * atlas.height, r: 12, class: "nd-origin"
    }));
    if (this.tracingAccess) this.roadNodes(markers, atlas, node => {
      this.editing.access.push({ x: node.x, y: node.y });
      this.editing.roadNode = node.id;
      this.tracingAccess = false;
      this.draw();
    });
  }

  drawRoadEditor(panel, overlay, markers, atlas) {
    const draft = this.roadDraft;
    panel.append(element("h2", { text: t("drawRoad") }), element("p", { text: t("drawRoadHelp") }));
    this.drawRoads(overlay, atlas);
    this.roadNodes(markers, atlas, node => { draft.points.push({ ...node }); this.draw(); });
    overlay.append(svg("polyline", {
      class: "nd-route-line",
      points: draft.points.map(p => `${p.x * atlas.width},${p.y * atlas.height}`).join(" ")
    }));
    for (const p of draft.points) overlay.append(svg("circle", {
      cx: p.x * atlas.width, cy: p.y * atlas.height, r: 8, class: "nd-draft-point"
    }));
    for (const key of ["walk", "bike", "car"]) {
      const input = element("input", { type: "checkbox" });
      input.checked = draft.modes.includes(key);
      input.addEventListener("change", () => {
        draft.modes = input.checked ? [...draft.modes, key] : draft.modes.filter(mode => mode !== key);
      });
      panel.append(element("label", { class: "nd-mode-choice" }, input, element("span", { text: t(key) })));
    }
    const oneWay = element("input", { type: "checkbox" });
    oneWay.checked = draft.oneWay ?? false;
    oneWay.addEventListener("change", () => { draft.oneWay = oneWay.checked; });
    panel.append(element("label", { class: "nd-mode-choice" }, oneWay, element("span", { text: t("oneWay") })));
    panel.append(element("p", { text: `${t("pathPoints")}: ${draft.points.length}` }),
      button(t("undoPoint"), () => { draft.points.pop(); this.draw(); }, !draft.points.length),
      button(t("saveRoad"), async () => {
        requireGM();
        if (draft.points.length < 2 || !draft.modes.length) throw new Error(t("invalidRoad"));
        const nodes = [...atlas.nodes];
        const edges = [...atlas.edges];
        for (const p of draft.points) if (!nodes.some(node => node.id === p.id)) nodes.push(p);
        for (let i = 1; i < draft.points.length; i++) {
          const from = draft.points[i - 1].id, to = draft.points[i].id;
          if (from === to) throw new Error(t("invalidRoad"));
          edges.push({ from, to, modes: draft.modes, ...(draft.oneWay ? { oneWay: true } : {}) });
        }
        const data = atlasData({ ...atlas, nodes, edges });
        await game.settings.set(ID, "atlases", { ...game.settings.get(ID, "atlases"), [mapFamily(data.image)]: data });
        this.roadDraft = null;
        this.draw();
      }),
      button(t("cancel"), () => { this.roadDraft = null; this.draw(); }));
  }

  async saveRoadNetwork(atlas, edges, nodes = atlas.nodes) {
    requireGM();
    const data = atlasData({ ...atlas, nodes, edges });
    await game.settings.set(ID, "atlases", { ...game.settings.get(ID, "atlases"), [mapFamily(data.image)]: data });
    this.reviewEdge = null;
    this.draw();
  }

  drawNetworkReview(panel, overlay, atlas) {
    const review = inspectNetwork(atlas, this.reviewMode);
    panel.append(element("h2", { text: t("reviewNetwork") }), element("p", { text: t("networkHelp") }));
    const mode = element("select", { "aria-label": t("reviewMode") });
    for (const key of ["walk", "bike", "car"]) mode.append(element("option", { value: key, text: t(key) }));
    mode.value = this.reviewMode;
    mode.addEventListener("change", () => { this.reviewMode = mode.value; this.reviewEdge = null; this.draw(); });
    panel.append(mode, element("p", { text: `${atlas.nodes.length} ${t("roadNodes")} / ${review.edges.length} ${t("roadEdges")}` }),
      element("p", { class: review.components.length > 1 ? "nd-route-error" : "nd-muted",
        text: `${t("components")}: ${review.components.length} · ${t("deadEnds")}: ${review.deadEnds.length}` }),
      element("p", { text: `${t("isolatedNodes")}: ${review.isolated.length} · ${t("unjoinedCrossings")}: ${review.crossings.length}` }),
      element("p", { text: `${t("duplicateEdges")}: ${review.duplicateEdges.length} · ${t("zeroLengthEdges")}: ${review.zeroLengthEdges.length}` }));
    const nodes = new Map(atlas.nodes.map(node => [node.id, node]));
    const colors = ["#62e5ee", "#ffb16b", "#c998ff", "#96dfb0", "#ff6571"];
    for (const edge of review.edges) {
      const line = svg("polyline", {
        class: `nd-road-review${this.reviewEdge === edge.index ? " nd-road-selected" : ""}`,
        points: [nodes.get(edge.from), nodes.get(edge.to)].map(p => `${p.x * atlas.width},${p.y * atlas.height}`).join(" "),
        stroke: colors[review.componentByNode.get(edge.from) % colors.length],
        tabindex: "0", role: "button", "aria-label": `${edge.from} ${edge.oneWay ? ">" : "↔"} ${edge.to}`
      });
      const select = () => { this.reviewEdge = edge.index; this.draw(); };
      line.addEventListener("click", select);
      line.addEventListener("keydown", event => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(); }
      });
      overlay.append(line);
    }
    for (const id of review.deadEnds) {
      const node = nodes.get(id);
      overlay.append(svg("circle", { cx: node.x * atlas.width, cy: node.y * atlas.height, r: 5, class: "nd-network-end" }));
    }
    for (const crossing of review.crossings) overlay.append(svg("circle", {
      cx: crossing.x * atlas.width, cy: crossing.y * atlas.height, r: 7, class: "nd-network-crossing"
    }));
    const selected = atlas.edges[this.reviewEdge];
    if (selected) {
      const modes = new Set(selected.modes);
      panel.append(element("h3", { text: `${selected.from} → ${selected.to}` }));
      for (const key of ["walk", "bike", "car"]) {
        const input = element("input", { type: "checkbox" });
        input.checked = modes.has(key);
        input.addEventListener("change", () => input.checked ? modes.add(key) : modes.delete(key));
        panel.append(element("label", { class: "nd-mode-choice" }, input, element("span", { text: t(key) })));
      }
      const direction = element("input", { type: "checkbox" });
      direction.checked = selected.oneWay ?? false;
      panel.append(element("label", { class: "nd-mode-choice" }, direction, element("span", { text: t("oneWay") })),
        button(t("saveRoad"), () => {
          if (!modes.size) throw new Error(t("invalidRoad"));
          const edges = atlas.edges.map((edge, index) => index === this.reviewEdge
            ? { ...edge, modes: [...modes], oneWay: direction.checked } : edge);
          return this.saveRoadNetwork(atlas, edges);
        }),
        button(t("deleteRoad"), async () => {
          if (!await Dialog.confirm({ title: t("deleteRoad"), content: `<p>${t("confirmDeleteRoad")}</p>` })) return;
          return this.saveRoadNetwork(atlas, atlas.edges.filter((_edge, index) => index !== this.reviewEdge));
        }));
    }
    if (presetAtlas(atlas.image)) panel.append(button(t("loadPresetRoads"), async () => {
      requireGM();
      if (!await Dialog.confirm({ title: t("loadPresetRoads"), content: `<p>${t("confirmPresetRoads")}</p>` })) return;
      const preset = presetAtlas(atlas.image);
      await this.saveRoadNetwork(atlas, preset.edges, preset.nodes);
      ui.notifications.info(t("presetRoadsReady"));
    }));
    panel.append(button(t("closePanel"), () => { this.reviewing = false; this.draw(); }));
  }

  drawRoute(panel, overlay, atlas, destination) {
    try {
      const route = findRoute(atlas, this.origin, destination, this.mode);
      this.routeSummary = `${destination.title}: ${route.distanceKm.toFixed(2)} km · ${Math.ceil(route.minutes)} min`;
      const polyline = (points, className) => overlay.append(svg("polyline", {
        points: points.map(p => `${p.x * atlas.width},${p.y * atlas.height}`).join(" "), class: className
      }));
      overlay.setAttribute("data-route-mode", this.mode);
      if (this.mode === "av") polyline(route.points, "nd-route-line nd-route-flight");
      else {
        polyline(route.roadPoints, "nd-route-line");
        for (const path of route.accessPaths) if (path.length) polyline(path, "nd-route-line nd-route-access");
      }
      panel.append(element("strong", { class: "nd-route-summary", text: this.routeSummary }),
        element("p", { class: "nd-muted", text: t(this.mode === "av" ? "flightEstimate" : "routeEstimate") }));
    } catch (error) {
      if (!["noRoads", "noRoute", "invalidAccess", "unconnectedPlace"].includes(error.message)) throw error;
      this.routeError = t(error.message);
      panel.append(element("p", { class: "nd-route-error", role: "status", text: this.routeError }));
    }
  }

  drawDistrict(panel, district, places) {
    panel.append(element("p", { class: "nd-eyebrow", text: "DISTRICT // INTELLIGENCE" }), element("h2", { text: district.name }),
      element("p", { class: `nd-threat nd-threat-${district.threat}`, text: `${t("threat")}: ${t(district.threat)}` }),
      element("p", { class: "nd-description", text: district.description }),
      element("h3", { text: t("gangs") }), element("p", { text: district.gangs.join(", ") || t("noneKnown") }),
      element("h3", { text: t("districtPlaces") }));
    const visible = places.filter(place => place.district === district.id);
    if (!visible.length) panel.append(element("p", { text: t("noPlaces") }));
    for (const place of visible) panel.append(button(place.title, () => { this.selected = place.id; this.draw(); }));
  }

  drawAtlasEditor(panel, atlas) {
    panel.append(element("h2", { text: t("configureAtlas") }), element("p", { text: t("atlasHelp") }));
    const form = element("form", { class: "nd-editor" });
    const config = element("textarea", { rows: 22, required: true, "aria-label": t("atlasJson"), maxlength: 1000000 });
    config.value = this.atlasDraft ?? JSON.stringify(atlas, null, 2);
    config.addEventListener("input", () => { this.atlasDraft = config.value; });
    form.append(config, element("button", { type: "submit", text: t("saveAtlas") }), button(t("cancel"), () => {
      this.configuring = false; this.draw();
    }));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        requireGM();
        const data = atlasData(JSON.parse(config.value));
        if (data.image !== game.settings.get(ID, "mapImage")) throw new Error(t("mapMismatch"));
        await game.settings.set(ID, "atlases", { ...game.settings.get(ID, "atlases"), [mapFamily(data.image)]: data });
        this.configuring = false;
        this.draw();
      } catch (error) { report(error); }
      finally { submit.disabled = false; }
    });
    panel.append(form);
  }

  drawDossier(panel, place) {
    panel.append(element("p", { class: "nd-eyebrow", text: "LOCATION // DOSSIER" }),
      element("h2", { text: place.title }), element("p", { class: `nd-category nd-cat-${place.category}`, text: t(place.category) }));
    if (place.image) {
      const image = element("img", { src: place.image, alt: place.title, class: "nd-illustration" });
      image.addEventListener("error", () => ui.notifications.error(t("imageError")), { once: true });
      panel.append(image);
    } else {
      const cover = element("div", { class: "nd-map-cover", "aria-hidden": "true" });
      cover.style.backgroundImage = `url("${currentAtlas().image}")`;
      cover.style.backgroundPosition = `${place.x * 100}% ${place.y * 100}%`;
      cover.append(element("span", { text: "NC / LOCATION ARCHIVE" }));
      panel.append(cover);
    }
    panel.append(element("p", { class: "nd-description", text: place.description }));
    if (this.routeSummary) panel.append(element("p", { class: "nd-route-summary", text: this.routeSummary }),
      element("p", { class: "nd-muted", text: t(this.mode === "av" ? "flightEstimate" : "routeEstimate") }));
    if (this.routeError) panel.append(element("p", { class: "nd-route-error", role: "status", text: this.routeError }));
    const district = currentAtlas().districts.find(district => district.id === place.district);
    if (district) panel.append(button(`${t("district")}: ${district.name}`, () => {
      this.district = district.id; this.selected = null; this.draw();
    }));
    panel.append(button(t("useAsStart"), () => { this.origin = place; this.draw(); }));
    if (!game.user.isGM) return;
    const entry = game.journal.get(place.id);
    const shared = entry.ownership.default >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    panel.append(element("p", { text: t(shared ? "shared" : "private") }));
    panel.append(button(t("edit"), () => {
      this.editing = structuredClone(place);
      this.tracingAccess = false;
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
      input.addEventListener("input", () => { data[name] = input.value; });
      form.append(element("label", {}, element("span", { text: t(label) }), input));
      return input;
    };
    panel.append(element("h2", { text: t(data.id ? "edit" : "addPlace") }), form);
    field("title", "title", { required: true, maxlength: 100 });
    const category = element("select", { name: "category" });
    for (const key of CATEGORIES) category.append(element("option", { value: key, text: t(key) }));
    category.value = data.category;
    category.addEventListener("change", () => { data.category = category.value; });
    form.append(element("label", {}, element("span", { text: t("category") }), category));
    field("description", "description", { multiline: true, maxlength: 12000, rows: 6 });
    const district = element("select", { name: "district" });
    district.append(element("option", { value: "", text: t("noDistrict") }));
    for (const item of currentAtlas().districts) district.append(element("option", { value: item.id, text: item.name }));
    district.value = data.district ?? "";
    district.addEventListener("change", () => { data.district = district.value; });
    form.append(element("label", {}, element("span", { text: t("district") }), district));
    const roadNode = field("roadNode", "roadNode", { maxlength: 64 });
    roadNode.addEventListener("input", () => { delete data.access; this.tracingAccess = false; });
    form.append(element("p", { text: t("accessHelp") }),
      button(t(this.tracingAccess ? "cancelAccess" : "traceAccess"), () => {
        this.tracingAccess = !this.tracingAccess;
        delete data.roadNode;
        if (this.tracingAccess) data.access = [{ x: Number(data.x), y: Number(data.y) }];
        else delete data.access;
        this.draw();
      }),
      button(t("clearAccess"), () => {
        delete data.access; delete data.roadNode; this.tracingAccess = false; this.draw();
      }));
    if (data.access) form.append(element("p", { text: `${t("pathPoints")}: ${data.access.length}` }));
    if (this.tracingAccess) form.append(button(t("undoPoint"), () => {
      data.access.pop(); this.draw();
    }, data.access.length < 2));
    const image = field("image", "image", { maxlength: 512 });
    form.append(button(t("browse"), () => {
      return new FilePicker({ type: "image", current: image.value, callback: path => {
        try { image.value = imagePath(path); data.image = image.value; } catch (error) { report(error); }
      } }).browse();
    }));
    form.append(element("p", { text: t("positionHelp") }));
    for (const axis of ["x", "y"]) {
      const coordinate = field(axis, axis, { type: "number", min: 0, max: 1, step: "any", required: true });
      coordinate.addEventListener("input", () => {
        delete data.access; delete data.roadNode; roadNode.value = ""; this.tracingAccess = false;
      });
    }
    data.notes ??= data.id ? privateNote(data.id)?.getFlag(ID, "note") ?? "" : "";
    field("notes", "gmNotes", { multiline: true, maxlength: 12000, rows: 4 });
    form.append(element("button", { type: "submit", text: t("save") }), button(t("cancel"), () => {
      this.editing = null;
      this.tracingAccess = false;
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
        if (this.tracingAccess) throw new Error(t("finishAccess"));
        const place = placeData({ ...values, ...(data.access ? { access: data.access } : {}),
          mapImage: currentAtlas().image, x: Number(values.x), y: Number(values.y) });
        const atlas = currentAtlas();
        if (place.district && !atlas.districts.some(item => item.id === place.district)) throw new Error(t("invalidDistrict"));
        if (place.roadNode && !atlas.nodes.some(item => item.id === place.roadNode)) throw new Error(t("invalidAccess"));
        if (place.access) roadAccess(atlas, place, "walk");
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

export class SceneDossierBoard extends DossierBoard {
  constructor(...args) {
    super(...args);
    this.sceneMode = true;
    this.welcomeDismissed = true;
    this.tick = () => this.updateSceneTransform();
    this.pick = event => {
      if (event.button !== 0 || event.target !== canvas.app.view ||
          (!this.pickingOrigin && (!game.user.isGM || (!this.editing && !this.roadDraft)))) return;
      try {
        const p = scenePoint(canvas.stage.worldTransform, canvas.dimensions,
          canvas.app.view.getBoundingClientRect(), event.clientX, event.clientY);
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.pickPoint(p);
      } catch (error) { report(error); }
    };
  }

  get rendered() { return Boolean(this.root?.isConnected); }

  render() {
    if (!this.root) {
      this.host = element("div", { class: "neon-dossiers nd-scene-hud" });
      this.root = element("div", { class: "nd-root" });
      this.host.append(this.root);
      document.body.append(this.host);
      this.ticker = canvas.app.ticker;
      this.ticker.add(this.tick);
      document.addEventListener("pointerdown", this.pick, true);
    }
    this.draw();
    return this;
  }

  draw() {
    if (canvas.scene.background.src !== game.settings.get(ID, "mapImage")) {
      this.mapElement = null;
      this.root.replaceChildren(element("p", { class: "nd-route-error", role: "status", text: t("sceneUpdating") }));
      return;
    }
    super.draw();
  }

  async close() {
    this.ticker?.remove(this.tick);
    document.removeEventListener("pointerdown", this.pick, true);
    this.host?.remove();
    this.root = null;
    windows.delete(this);
  }

  updateSceneTransform() {
    if (!this.mapElement || !this.root?.isConnected || !canvas.ready) return;
    const transform = sceneTransform(canvas.stage.worldTransform, canvas.dimensions,
      canvas.app.view.getBoundingClientRect(), this.mapElement.parentElement.getBoundingClientRect());
    const { a, b, c, d, tx, ty } = transform;
    this.mapElement.style.transform = `matrix(${a},${b},${c},${d},${tx},${ty})`;
    this.mapElement.style.setProperty("--nd-inverse-scale", String(1 / Math.hypot(a, b)));
    this.zoomLabel.textContent = `${Math.round(Math.hypot(a, b) * 100)}%`;
  }

  changeZoom(delta) {
    const scale = canvas.stage.scale.x;
    canvas.animatePan({ scale: scale * (1 + delta) }).catch(report);
  }

  centerMap() {
    const dimensions = canvas.dimensions;
    canvas.animatePan({
      x: dimensions.sceneX + dimensions.sceneWidth / 2,
      y: dimensions.sceneY + dimensions.sceneHeight / 2,
      scale: canvas.scene.initial?.scale ?? 1
    }).catch(report);
  }
}

let sceneBoard;
const managedCanvas = () => Boolean(globalThis.canvas?.ready && canvas.scene?.getFlag(ID, "atlasScene"));

function mountSceneBoard() {
  if (!managedCanvas()) return null;
  sceneBoard ??= new SceneDossierBoard();
  return sceneBoard.render();
}

// Foundry v12 settings menus require a FormApplication constructor.
class DossierMenu extends FormApplication {
  render() {
    game.modules.get(ID).api.open().catch(report);
    return this;
  }
}

Hooks.once("init", () => {
  game.settings.register(ID, "mapImage", {
    name: "ND.mapImage", hint: "ND.mapHint", scope: "world", config: true,
    type: String, default: COMMUNITY_MAP,
    onChange: () => {
      for (const board of windows) {
        board.origin = null; board.selected = null; board.district = ""; board.editing = null;
        board.roadDraft = null; board.tracingAccess = false;
        board.reviewing = false;
        board.configuring = false; board.viewport = null; board.resetViewport = true; board.refresh();
      }
      syncIfGM();
    }
  });
  game.settings.register(ID, "atlas", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => { for (const board of windows) board.refresh(); syncIfGM(); }
  });
  game.settings.register(ID, "atlases", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => { for (const board of windows) board.refresh(); syncIfGM(); }
  });
  game.settings.registerMenu(ID, "open", {
    name: "ND.open", label: "ND.open", hint: "ND.openHint",
    icon: "fas fa-map-marked-alt", type: DossierMenu, restricted: false
  });
  game.modules.get(ID).api = Object.freeze({
    open: async ({ placeId } = {}) => {
      if (!managedCanvas()) {
        if (!game.user.isGM) {
          ui.notifications.warn(t("sceneUnavailable"));
          return null;
        }
        const scene = await synchronizeScene(true);
        await scene.view();
      }
      const board = mountSceneBoard();
      if (!board) throw new Error(t("sceneUnavailable"));
      if (placeId) {
        board.selected = placeId;
        board.query = "";
        board.category = "";
        board.district = "";
        board.editing = null;
        board.configuring = false;
        board.reviewing = false;
        board.roadDraft = null;
        board.tracingAccess = false;
      }
      return board.render(true);
    },
    createScene: () => synchronizeScene(true)
  });
  game.keybindings.register(ID, "open", {
    name: "ND.open", editable: [{ key: "KeyM", modifiers: ["Shift"] }],
    onDown: () => { game.modules.get(ID).api.open().catch(report); return true; }
  });
});

Hooks.on("getSceneControlButtons", controls => {
  const notes = controls.find(control => control.name === "notes");
  if (notes) notes.tools.push({
    name: ID, title: "ND.open", icon: "fas fa-map-marked-alt", button: true, visible: true,
    onClick: () => game.modules.get(ID).api.open().catch(report)
  });
});

for (const hook of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "updateUser"]) {
  Hooks.on(hook, () => {
    for (const board of windows) {
      if (board.saving) continue;
      // Never retain an edit form or private notes across ownership/user changes.
      board.editing = null;
      board.configuring = false;
      board.reviewing = false;
      board.roadDraft = null;
      board.tracingAccess = false;
      board.refresh();
    }
    syncIfGM();
  });
}

function syncIfGM() {
  if (game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id)) {
    synchronizeScene().catch(report);
  }
}

Hooks.once("ready", () => { syncIfGM(); mountSceneBoard(); });
Hooks.on("canvasReady", () => {
  mountSceneBoard();
  if (managedCanvas()) {
    for (const note of canvas.notes?.placeables ?? []) {
      if (note.document.getFlag(ID, "placeId")) note.visible = false;
    }
  }
});
Hooks.on("canvasTearDown", () => {
  const previous = sceneBoard;
  sceneBoard = null;
  previous?.close().catch(report);
});
// Keep core scene notes for interoperability, but draw and click our own permission-filtered markers.
Hooks.on("drawNote", note => {
  if (note.document.getFlag(ID, "placeId") && managedCanvas()) note.visible = false;
});
Hooks.on("refreshNote", note => {
  if (note.document.getFlag(ID, "placeId") && managedCanvas()) note.visible = false;
});
Hooks.on("renderJournalSheet", (sheet) => {
  if (!sheet.document.getFlag(ID, "place") || !sheet.document.testUserPermission(game.user, "OBSERVER")) return;
  Promise.resolve(sheet.close()).then(() => game.modules.get(ID).api.open({ placeId: sheet.document.id })).catch(report);
});
