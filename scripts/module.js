import { ID, COMMUNITY_MAP, DEFAULT_CATEGORIES, categoriesData, imagePath, placeData, noteText, readablePlaces, filterPlaces, placesOnMap, mapFamily } from "./model.js";
import { MODES, atlasData, findRoute, roadAccess } from "./atlas.js";
import { MAP_PRESETS, starterPlaces, ATLAS_SOURCE, presetAtlas } from "./city.js";
import { currentAtlas, synchronizeScene, migrateCommunityMap } from "./scene.js";
import { sceneTransform, scenePoint } from "./canvas.js";
import { inspectNetwork } from "./network.js";
import { RoadDraft } from "./road-draft.js";

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

function currentCategories() {
  return categoriesData(game.settings.get(ID, "categories") ?? DEFAULT_CATEGORIES);
}

function categoryInfo(id, definitions = currentCategories()) {
  return definitions.find(category => category.id === id) ?? { id, name: id, color: "#a7a7b5" };
}

function categoryLabel(category) {
  return category.name || t(category.id);
}

function colorCategory(node, id, definitions = currentCategories()) {
  node.style.setProperty("--nd-category", categoryInfo(id, definitions).color);
  return node;
}

function categoryUsage(id) {
  return game.journal.contents.filter(entry => entry.getFlag(ID, "place")?.category === id).length;
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
  }), COMMUNITY_MAP);
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
  if (!currentCategories().some(category => category.id === data.category)) throw new Error(t("invalidCategory"));
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
    this.categoryDraft = null;
    this.roadDraft = null;
    this.tracingAccess = false;
    this.reviewing = false;
    this.reviewMode = "car";
    this.networkDraft = null;
    this.zoom = 1;
    this.sidebarOpen = false;
    windows.add(this);
  }

  async close(options) {
    this.dossierDragCleanup?.();
    this.districtDragCleanup?.();
    this.districtPreviewCleanup?.();
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
    this.dossierDragCleanup?.();
    this.districtDragCleanup?.();
    this.districtPreviewCleanup?.();
    this.dossierMarker = null;
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
    let categoryDefinitions;
    try { atlas = currentAtlas(); }
    catch (error) {
      this.root.replaceChildren(element("p", { role: "alert", text: t("invalidAtlas") }));
      report(error);
      return;
    }
    try { categoryDefinitions = currentCategories(); }
    catch (error) {
      this.root.replaceChildren(element("p", { role: "alert", text: t("invalidCategories") }));
      report(error);
      return;
    }
    if (!atlas.districts.some(district => district.id === this.district)) this.district = "";
    if (this.category && !categoryDefinitions.some(category => category.id === this.category)) this.category = "";
    const navigationLocked = Boolean(this.networkDraft || this.configuring || this.categoryDraft);
    if (this.origin?.id && !places.some(place => place.id === this.origin.id)) this.origin = null;
    else if (this.origin?.id) this.origin = places.find(place => place.id === this.origin.id);
    const selected = places.find(place => place.id === this.selected);
    if (!selected) this.selected = null;
    // Permission changes discard the entire rendered dossier, not just its marker.
    this.root.replaceChildren();
    const search = element("input", { type: "search", placeholder: t("search"), "aria-label": t("search"), value: this.query });
    const categories = element("nav", { class: "nd-categories", "aria-label": t("category") });
    for (const category of [{ id: "", name: t("allCategories"), color: "#ff6b76" }, ...categoryDefinitions]) {
      const key = category.id;
      const tab = button(`${categoryLabel(category)} · ${places.filter(place => !key || place.category === key).length}`, () => {
        this.category = key;
        this.draw();
      });
      tab.className = `nd-category-tab nd-cat-${key || "all"}`;
      tab.style.setProperty("--nd-category", category.color);
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
    const overlay = svg("svg", { class: "nd-overlay", viewBox: `0 0 ${atlas.width} ${atlas.height}`, preserveAspectRatio: "none" });
    for (const district of (this.configuring && this.atlasDraft ? this.atlasDraft.districts : atlas.districts)) {
      const points = district.polygon.map(p => `${p.x * atlas.width},${p.y * atlas.height}`).join(" ");
      const active = this.configuring
        ? this.districtEditing === district.id && !this.districtDrawing : this.district === district.id;
      if (active) overlay.append(svg("polygon", { points, "data-district-halo": district.id, class: "nd-district-halo" }));
      overlay.append(svg("polygon", {
        points,
        "data-district": district.id,
        class: `nd-district-zone nd-threat-${district.threat}${active ? " nd-active-zone" : ""}`
      }));
    }
    const markers = element("div", { class: "nd-markers" });
    if (this.networkDraft || this.editing || this.configuring) markers.setAttribute("hidden", "");
    map.append(overlay, markers);
    const updateResults = () => {
      list.replaceChildren();
      markers.replaceChildren();
      const results = filterPlaces(places, this.query, this.category).filter(place => !this.district || place.district === this.district);
      if (!results.length) list.append(element("p", { text: t("noPlaces") }));
      for (const place of results) {
        const select = () => {
          if (this.editing || this.roadDraft || this.networkDraft || this.categoryDraft) return;
          this.configuring = false; this.reviewing = false; this.sidebarOpen = false; this.selected = place.id; this.draw();
        };
        const index = String(places.indexOf(place) + 1).padStart(2, "0");
        const row = button(place.title, select);
        row.className = `nd-place-row nd-cat-${place.category}${place.id === this.selected ? " nd-selected" : ""}`;
        colorCategory(row, place.category, categoryDefinitions);
        row.setAttribute("data-index", index);
        list.append(row);
        const marker = button(index, select);
        marker.className = `nd-marker nd-cat-${place.category}${place.id === this.selected ? " nd-selected" : ""}`;
        colorCategory(marker, place.category, categoryDefinitions);
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
    districts.disabled = navigationLocked;
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
    toggle.disabled = navigationLocked;
    toggle.setAttribute("aria-expanded", String(this.sidebarOpen));
    const tools = element("div", { class: "nd-tools" }, search, districts, toggle);
    if (game.user.isGM) {
      const gmTools = element("details", { class: "nd-gm-tools" }, element("summary", { text: t("gmTools") }));
      gmTools.open = this.gmToolsOpen ?? false;
      gmTools.addEventListener("toggle", () => { this.gmToolsOpen = gmTools.open; });
      const gmActions = element("div", { class: "nd-gm-actions" });
      gmTools.append(gmActions);
      tools.append(gmTools);
      const gmAction = (label, action) => button(label, () => {
        requireGM();
        gmTools.open = false;
        this.gmToolsOpen = false;
        return action();
      });
      gmActions.append(gmAction(t("addPlace"), () => {
        this.configuring = false;
        this.reviewing = false;
        this.roadDraft = null;
        this.tracingAccess = false;
        this.editing = { title: "", category: categoryDefinitions[0].id, description: "", image: "", x: 0.5, y: 0.5 };
        this.draw();
      }), gmAction(t("examples"), async () => {
        const examples = starterPlaces(atlas.image);
        if (!examples.length) throw new Error(t("noStarterData"));
        if (!await Dialog.confirm({ title: t("examples"), content: `<p>${t("confirmExamples")}</p>` })) return;
        const definitions = currentCategories();
        let reassigned = false;
        for (const [index, example] of examples.entries()) {
          const key = `${atlas.image}:${index}`;
          const exists = game.journal.contents.some(entry => entry.getFlag(ID, "example") === key);
          if (exists) continue;
          const category = definitions.some(category => category.id === example.category) ? example.category : definitions[0].id;
          if (category !== example.category) reassigned = true;
          const entry = await createPlace({ ...example, category });
          await entry.setFlag(ID, "example", key);
        }
        ui.notifications.info(t("examplesReady"));
        if (reassigned) ui.notifications.info(t("exampleCategoriesReassigned"));
      }), gmAction(t("manageCategories"), () => {
        this.editing = null;
        this.reviewing = false;
        this.roadDraft = null;
        this.pickingOrigin = false;
        this.sidebarOpen = false;
        this.categoryDraft = currentCategories();
        this.categoryOriginal = JSON.stringify(this.categoryDraft);
        this.draw();
      }), gmAction(t("configureAtlas"), () => {
        this.editing = null;
        this.reviewing = false;
        this.roadDraft = null;
        this.pickingOrigin = false;
        this.districtEditing = ""; this.districtDrawing = false;
        this.districtPoint = null; this.districtHistory = []; this.districtFuture = [];
        this.atlasDraft = null;
        this.configuring = true;
        this.sidebarOpen = false;
        this.draw();
      }), gmAction(t("editNetwork"), () => {
        this.editing = null;
        this.configuring = false;
        this.reviewing = false;
        this.networkDraft = new RoadDraft(atlas);
        this.networkOriginal = JSON.stringify(atlas);
        this.networkSelection = null;
        this.networkTool = "select";
        this.networkLastNode = null;
        this.pickingOrigin = false;
        this.sidebarOpen = false;
        this.draw();
      }), gmAction(t("scene"), async () => {
        requireGM();
        const scene = await synchronizeScene(true);
        await scene.view();
        ui.notifications.info(t("sceneReady"));
      }));
      if (navigationLocked) for (const action of gmActions.children) action.disabled = true;
    }
    const panel = element("section", { class: "nd-panel", "aria-label": t("dossier") });
    const closePanel = button(t("closePanel"), () => {
      if (this.networkDraft) return this.cancelNetwork();
      if (this.configuring) this.atlasDraft = null;
      this.categoryDraft = null;
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
    origin.disabled = navigationLocked;
    origin.addEventListener("change", () => { this.origin = places.find(place => place.id === origin.value) ?? null; this.draw(); });
    const mode = element("select", { "aria-label": t("travelMode") });
    for (const key of Object.keys(MODES)) mode.append(element("option", { value: key, text: t(key) }));
    mode.value = this.mode;
    mode.disabled = navigationLocked;
    mode.addEventListener("change", () => { this.mode = mode.value; this.draw(); });
    const destination = element("select", { "aria-label": t("destination") });
    destination.append(element("option", { value: "", text: t("chooseDestination") }));
    for (const place of places) destination.append(element("option", { value: place.id, text: place.title }));
    destination.value = this.selected ?? "";
    destination.disabled = navigationLocked;
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
    this.routeAccessSummary = "";
    this.routeError = "";
    if (this.origin && selected && !this.editing && !this.roadDraft && !this.configuring && !this.reviewing && !this.networkDraft && !this.categoryDraft) {
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
      element("div", { class: "nd-legal-content" }, credits, element("p", { text: t("disclaimer") })));
    this.root.append(element("header", { class: "nd-heading" },
      element("div", { class: "nd-wordmark" }, element("strong", { text: "NIGHT CITY" }),
        element("span", { text: "NEON DOSSIERS / CITYNET 2045" })),
      element("div", { class: "nd-connection" }, element("span", { text: t("cityLink") }),
        element("strong", { text: t(game.user.isGM ? "gmView" : "playerView") }))),
    tools, categories, element("div", { class: `nd-layout${this.sidebarOpen ? " nd-sidebar-open" : ""}` },
      mapScroll, sidebar, panel, zoom),
    element("footer", { class: "nd-statusbar" }, element("span", { text: `${places.length} ${t("places")} / ${atlas.districts.length} ${t("districts")}` }), legal));
    updateResults();
    if (this.categoryDraft && game.user.isGM) this.drawCategoryEditor(panel);
    else if (this.networkDraft && game.user.isGM) this.drawInteractiveNetwork(panel, overlay, roadMarkers);
    else if (this.reviewing && game.user.isGM) this.drawNetworkReview(panel, overlay, atlas);
    else if (this.roadDraft && game.user.isGM) this.drawRoadEditor(panel, overlay, roadMarkers, atlas);
    else if (this.configuring && game.user.isGM) this.drawAtlasEditor(panel, atlas, overlay, roadMarkers);
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
    if (game.user.isGM && (this.networkDraft || this.configuring || this.editing)) {
      panel.append(element("p", { class: "nd-data-note", text: t("campaignDefaults") }));
    }
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
      if (event.button !== 0 || this.pickingOrigin || this.roadDraft) return;
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
    } else if (game.user.isGM && this.configuring && this.districtDrawing) {
      const district = this.atlasDraft.districts.find(item => item.id === this.districtEditing);
      if (district && district.polygon.length >= 100) ui.notifications.warn(t("districtPointLimit"));
      else if (district) {
        this.changeDistrictPolygon(district, [...district.polygon, p]);
      }
    } else if (game.user.isGM && this.networkDraft && this.networkTool === "draw") {
      this.networkDrawPoint(p);
    } else if (game.user.isGM && this.roadDraft) {
      this.roadDraft.points.push({ ...p, id: `nd-${foundry.utils.randomID()}` });
      this.draw();
    } else if (game.user.isGM && this.editing) {
      if (this.tracingAccess) {
        this.editing.access.push(p);
      } else {
        this.moveDossier(p);
      }
      this.draw();
    }
  }

  moveDossier(point) {
    requireGM();
    if (!this.editing || this.tracingAccess) return;
    if (Number(this.editing.x) === point.x && Number(this.editing.y) === point.y) return;
    Object.assign(this.editing, point);
    delete this.editing.access;
    delete this.editing.roadNode;
  }

  drawDossierMarker(markers, atlas) {
    const data = this.editing;
    const marker = element("button", { type: "button", class: `nd-marker nd-cat-${data.category} nd-dossier-draft`,
      "aria-label": t("moveDossierMarker"), title: t("moveDossierMarker"), "data-label": t("moveDossierMarker"), text: "✥" });
    colorCategory(marker, data.category);
    marker.style.left = `${Number(data.x) * 100}%`;
    marker.style.top = `${Number(data.y) * 100}%`;
    this.dossierMarker = marker;
    marker.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !game.user.isGM || this.tracingAccess) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      const origin = { x: Number(data.x), y: Number(data.y) };
      const pointAt = (x, y) => this.mapPoint(x, y);
      const start = pointAt(event.clientX, event.clientY);
      let next = null;
      const move = current => {
        if (current.pointerId !== pointerId || Math.hypot(current.clientX - event.clientX, current.clientY - event.clientY) < 3) return;
        const point = pointAt(current.clientX, current.clientY);
        next = { x: Math.max(0, Math.min(1, origin.x + point.x - start.x)),
          y: Math.max(0, Math.min(1, origin.y + point.y - start.y)) };
        marker.style.left = `${next.x * 100}%`;
        marker.style.top = `${next.y * 100}%`;
      };
      const cleanup = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", cancel);
        this.dossierDragCleanup = null;
      };
      const finish = current => {
        if (current.pointerId !== pointerId) return;
        cleanup();
        if (next && this.editing === data && game.user.isGM && !this.tracingAccess) this.moveDossier(next);
        if (this.editing === data) this.draw();
      };
      const cancel = current => {
        if (current.pointerId !== pointerId) return;
        cleanup();
        if (this.editing === data) this.draw();
      };
      this.dossierDragCleanup?.();
      this.dossierDragCleanup = cleanup;
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", cancel);
    });
    marker.addEventListener("keydown", event => {
      const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!offsets[event.key] || !game.user.isGM) return;
      event.preventDefault();
      event.stopPropagation();
      const [dx, dy] = offsets[event.key];
      const step = event.shiftKey ? 10 : 1;
      this.moveDossier({ x: Math.max(0, Math.min(1, Number(data.x) + dx * step / atlas.width)),
        y: Math.max(0, Math.min(1, Number(data.y) + dy * step / atlas.height)) });
      this.draw();
      this.dossierMarker?.focus();
    });
    markers.append(marker);
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
    if (!this.tracingAccess) this.drawDossierMarker(markers, atlas);
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

  networkApply(result) {
    if (!result.ok) throw new Error(result.error.message);
    this.draw();
    return result;
  }

  async cancelNetwork() {
    if (this.networkDraft?.canUndo && !await Dialog.confirm({
      title: t("discardNetwork"), content: `<p>${t("confirmDiscardNetwork")}</p>`
    })) return;
    this.networkDraft = null;
    this.networkSelection = null;
    this.networkLastNode = null;
    this.draw();
  }

  networkDrawPoint(point, existingId = null) {
    const last = this.networkLastNode;
    const result = this.networkDraft.transact(atlas => {
      const id = existingId ?? `nd-${foundry.utils.randomID()}`;
      if (!existingId) atlas.nodes.push({ id, ...point });
      if (last && last !== id) {
        if (atlas.edges.some(edge => (edge.from === last && edge.to === id) || (edge.from === id && edge.to === last))) {
          throw new Error(t("existingSegment"));
        }
        atlas.edges.push({ from: last, to: id, modes: ["walk", "bike", "car"] });
      }
      return id;
    });
    if (!result.ok) throw new Error(result.error.message);
    this.networkLastNode = result.value;
    this.networkSelection = { type: "node", id: result.value };
    this.draw();
  }

  async deleteNetworkSelection() {
    requireGM();
    const selection = this.networkSelection;
    if (!selection || !this.networkDraft) return;
    const atlas = this.networkDraft.atlas;
    const count = selection.type === "node"
      ? atlas.edges.filter(edge => edge.from === selection.id || edge.to === selection.id).length : 0;
    if (!await Dialog.confirm({ title: t("deleteSelection"),
      content: `<p>${t(selection.type === "node" ? "confirmDeleteNode" : "confirmDeleteSegment")} ${count || ""}</p>` })) return;
    const result = selection.type === "node" ? this.networkDraft.deleteNode(selection.id)
      : this.networkDraft.transact(data => {
        data.edges = data.edges.filter(edge => !((edge.from === selection.from && edge.to === selection.to) ||
          (edge.from === selection.to && edge.to === selection.from)));
      });
    this.networkSelection = null;
    this.networkLastNode = null;
    this.networkApply(result);
  }

  async saveInteractiveNetwork() {
    requireGM();
    const draft = this.networkDraft;
    const original = JSON.parse(this.networkOriginal);
    const current = currentAtlas();
    if (JSON.stringify(current) !== this.networkOriginal) throw new Error(t("networkConflict"));
    const next = draft.atlas;
    const changedNodes = new Set(original.nodes.filter(node => {
      const updated = next.nodes.find(item => item.id === node.id);
      return !updated || updated.x !== node.x || updated.y !== node.y;
    }).map(node => node.id));
    const affected = allPlaces().filter(place => {
      if (!place.roadNode) return false;
      if (changedNodes.has(place.roadNode)) return true;
      for (const mode of ["walk", "bike", "car"]) {
        try { roadAccess(original, place, mode); } catch { continue; }
        try { roadAccess(next, place, mode); } catch { return true; }
      }
      return false;
    });
    const affectedNames = affected.map(place => place.title).join(", ");
    const escapedNames = affectedNames.replace(/[&<>"']/g, character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    if (affected.length && !await Dialog.confirm({ title: t("accessWarning"),
      content: `<p>${t("accessWarningText")} ${affected.length}</p><p>${escapedNames}</p>` })) return;
    if (JSON.stringify(currentAtlas()) !== this.networkOriginal) throw new Error(t("networkConflict"));
    await game.settings.set(ID, "atlases", { ...game.settings.get(ID, "atlases"), [mapFamily(next.image)]: next });
    this.networkDraft = null;
    this.networkSelection = null;
    this.networkLastNode = null;
    if (affected.length) ui.notifications.warn(t("accessWarningText"));
    this.draw();
  }

  drawInteractiveNetwork(panel, overlay, markers) {
    const draft = this.networkDraft;
    const atlas = draft.atlas;
    const nodes = new Map(atlas.nodes.map(node => [node.id, node]));
    panel.append(element("h2", { text: t("editNetwork") }), element("p", { text: t("interactiveNetworkHelp") }));
    const actions = element("div", { class: "nd-road-actions" });
    for (const [tool, label] of [["select", "selectRoad"], ["draw", "drawRoad"]]) {
      const control = button(t(label), () => { this.networkTool = tool; this.networkLastNode = null; this.draw(); });
      control.setAttribute("aria-pressed", String(this.networkTool === tool));
      actions.append(control);
    }
    actions.append(button(t("undo"), () => { this.networkSelection = null; this.networkLastNode = null; this.networkApply(draft.undo()); }, !draft.canUndo),
      button(t("redo"), () => { this.networkSelection = null; this.networkLastNode = null; this.networkApply(draft.redo()); }, !draft.canRedo));
    panel.append(actions);
    const reviewToggle = button(t(this.networkInspect ? "hideNetworkCheck" : "showNetworkCheck"), () => {
      this.networkInspect = !this.networkInspect; this.draw();
    });
    reviewToggle.setAttribute("aria-pressed", String(Boolean(this.networkInspect)));
    panel.append(reviewToggle);
    if (this.networkInspect) {
      const mode = element("select", { "aria-label": t("reviewMode") });
      for (const key of ["walk", "bike", "car"]) mode.append(element("option", { value: key, text: t(key) }));
      mode.value = this.reviewMode;
      mode.addEventListener("change", () => { this.reviewMode = mode.value; this.draw(); });
      const inspection = inspectNetwork(atlas, this.reviewMode);
      panel.append(mode, element("p", { class: "nd-muted", text:
        `${t("components")}: ${inspection.components.length} · ${t("deadEnds")}: ${inspection.deadEnds.length} · ${t("unjoinedCrossings")}: ${inspection.crossings.length}` }),
      element("p", { class: "nd-muted", text:
        `${t("duplicateEdges")}: ${inspection.duplicateEdges.length} · ${t("zeroLengthEdges")}: ${inspection.zeroLengthEdges.length}` }),
      element("p", { class: "nd-muted", text: t("checkHelp") }));
      for (const crossing of inspection.crossings) overlay.append(svg("circle", {
        cx: crossing.x * atlas.width, cy: crossing.y * atlas.height, r: 7, class: "nd-network-crossing"
      }));
      for (const id of inspection.deadEnds) {
        const node = nodes.get(id);
        overlay.append(svg("circle", { cx: node.x * atlas.width, cy: node.y * atlas.height, r: 5, class: "nd-network-end" }));
      }
    }
    if (this.networkTool === "draw") panel.append(element("p", { text: t("drawInteractiveHelp") }),
      button(t("finishRoad"), () => { this.networkLastNode = null; this.networkTool = "select"; this.draw(); }));
    const seen = new Set();
    for (const edge of atlas.edges) {
      const key = [edge.from, edge.to].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = nodes.get(edge.from), b = nodes.get(edge.to);
      const selected = this.networkSelection?.type === "edge" && [this.networkSelection.from, this.networkSelection.to].sort().join(":") === key;
      const line = svg("polyline", { class: `nd-road-review${selected ? " nd-road-selected" : ""}`,
        points: `${a.x * atlas.width},${a.y * atlas.height} ${b.x * atlas.width},${b.y * atlas.height}`,
        stroke: "#62e5ee", tabindex: "0", role: "button", "aria-label": t("selectSegment"),
        "data-from": edge.from, "data-to": edge.to });
      const hit = svg("polyline", { class: "nd-road-hit",
        points: `${a.x * atlas.width},${a.y * atlas.height} ${b.x * atlas.width},${b.y * atlas.height}`,
        "data-from": edge.from, "data-to": edge.to });
      const select = event => {
        event.stopPropagation();
        this.networkSelection = { type: "edge", from: edge.from, to: edge.to };
        this.networkTool = "select"; this.networkLastNode = null; this.draw();
      };
      let clickTimer;
      const click = event => {
        event.stopPropagation();
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { if (line.isConnected && this.networkDraft === draft) select(event); }, 400);
      };
      line.addEventListener("click", click);
      hit.addEventListener("click", click);
      line.addEventListener("keydown", event => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(event); }
      });
      const split = event => {
        clearTimeout(clickTimer);
        event.preventDefault(); event.stopPropagation();
        const rect = this.mapElement.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        const dx = (b.x - a.x) * atlas.width, dy = (b.y - a.y) * atlas.height;
        const denominator = dx * dx + dy * dy;
        const ratio = denominator ? Math.max(0.001, Math.min(0.999,
          ((x - a.x) * atlas.width * dx + (y - a.y) * atlas.height * dy) / denominator)) : 0.5;
        const result = draft.splitSegment(edge.from, edge.to, { x: a.x + ratio * (b.x - a.x), y: a.y + ratio * (b.y - a.y) });
        if (!result.ok) return report(new Error(result.error.message));
        this.networkSelection = { type: "node", id: result.value };
        this.draw();
      };
      line.addEventListener("dblclick", split);
      hit.addEventListener("dblclick", split);
      overlay.append(hit, line);
      if (selected) {
        const mx = (a.x + b.x) * atlas.width / 2, my = (a.y + b.y) * atlas.height / 2;
        const angle = Math.atan2((b.y - a.y) * atlas.height, (b.x - a.x) * atlas.width) * 180 / Math.PI;
        overlay.append(svg("path", { class: "nd-road-direction", d: "M -7 -5 L 7 0 L -7 5 Z",
          transform: `translate(${mx} ${my}) rotate(${angle})` }));
      }
    }
    for (const node of atlas.nodes) {
      const marker = element("button", { type: "button", class: `nd-road-node nd-road-editor-node${this.networkSelection?.id === node.id ? " nd-selected" : ""}`,
        "aria-label": t("roadPoint"), title: t("roadPoint") });
      marker.style.left = `${node.x * 100}%`; marker.style.top = `${node.y * 100}%`;
      marker.addEventListener("click", event => {
        event.stopPropagation();
        if (this.networkTool === "draw") {
          try { this.networkDrawPoint(node, node.id); } catch (error) { report(error); }
        }
        else { this.networkSelection = { type: "node", id: node.id }; this.draw(); }
      });
      marker.addEventListener("keydown", event => {
        const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (!offsets[event.key]) return;
        event.preventDefault(); event.stopPropagation();
        const [dx, dy] = offsets[event.key];
        this.networkSelection = { type: "node", id: node.id };
        try {
          this.networkApply(draft.moveNode(node.id, {
            x: Math.max(0, Math.min(1, node.x + dx / atlas.width)),
            y: Math.max(0, Math.min(1, node.y + dy / atlas.height))
          }));
        } catch (error) { report(error); }
        this.root.querySelector(".nd-road-editor-node.nd-selected")?.focus();
      });
      marker.addEventListener("pointerdown", event => {
        if (event.button !== 0 || this.networkTool !== "select") return;
        event.preventDefault(); event.stopPropagation();
        const startX = event.clientX, startY = event.clientY;
        let last = null;
        const move = next => {
          if (Math.hypot(next.clientX - startX, next.clientY - startY) < 3) return;
          const rect = this.mapElement.getBoundingClientRect();
          last = { x: Math.max(0, Math.min(1, (next.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (next.clientY - rect.top) / rect.height)) };
          marker.style.left = `${last.x * 100}%`; marker.style.top = `${last.y * 100}%`;
          for (const line of overlay.querySelectorAll(".nd-road-review, .nd-road-hit")) {
            const from = line.getAttribute("data-from"), to = line.getAttribute("data-to");
            if (from !== node.id && to !== node.id) continue;
            const a = from === node.id ? last : nodes.get(from), b = to === node.id ? last : nodes.get(to);
            line.setAttribute("points", `${a.x * atlas.width},${a.y * atlas.height} ${b.x * atlas.width},${b.y * atlas.height}`);
          }
        };
        const finish = next => {
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", finish);
          document.removeEventListener("pointercancel", cancel);
          if (!last || next.type === "pointercancel") return;
          this.networkSelection = { type: "node", id: node.id };
          try { this.networkApply(draft.moveNode(node.id, last)); } catch (error) { report(error); this.draw(); }
        };
        const cancel = event => finish(event);
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", finish);
        document.addEventListener("pointercancel", cancel);
      });
      markers.append(marker);
    }
    const selected = this.networkSelection;
    if (selected?.type === "node" && nodes.has(selected.id)) {
      const links = atlas.edges.filter(edge => edge.from === selected.id || edge.to === selected.id).length;
      panel.append(element("h3", { text: t("selectedPoint") }), element("p", { text: `${t("connectedSegments")}: ${links}` }),
        button(t("deleteSelection"), () => this.deleteNetworkSelection()));
    }
    if (selected?.type === "edge") {
      const edges = atlas.edges.filter(edge => (edge.from === selected.from && edge.to === selected.to) ||
        (edge.from === selected.to && edge.to === selected.from));
      if (edges.length) {
        panel.append(element("h3", { text: t("selectedSegment") }), element("p", { text: t("directionHelp") }));
        const options = element("div", { class: "nd-road-options" });
        for (const mode of ["walk", "bike", "car"]) {
          const matching = edges.filter(edge => edge.modes.includes(mode));
          const forward = matching.some(edge => !edge.oneWay || edge.from === selected.from);
          const reverse = matching.some(edge => !edge.oneWay || edge.from === selected.to);
          const control = element("select", { "aria-label": t(mode) });
          for (const [value, label] of [["closed", "directionClosed"], ["both", "directionBoth"], ["forward", "directionForward"], ["reverse", "directionReverse"]])
            control.append(element("option", { value, text: t(label) }));
          control.value = forward && reverse ? "both" : forward ? "forward" : reverse ? "reverse" : "closed";
          control.addEventListener("change", () => {
            try { this.networkApply(draft.editModeDirection(selected.from, selected.to, mode, control.value)); }
            catch (error) { report(error); this.draw(); }
          });
          options.append(element("label", {}, element("span", { text: t(mode) }), control));
        }
        panel.append(options, button(t("insertPoint"), () => {
          const a = nodes.get(selected.from), b = nodes.get(selected.to);
          const result = draft.splitSegment(selected.from, selected.to, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          if (!result.ok) throw new Error(result.error.message);
          this.networkSelection = { type: "node", id: result.value };
          this.draw();
        }), button(t("deleteSelection"), () => this.deleteNetworkSelection()));
      }
    }
    panel.append(element("p", { class: "nd-muted", text: t("networkDraftNotice") }),
      button(t("saveNetwork"), () => this.saveInteractiveNetwork(), !draft.canUndo),
      button(t("cancel"), () => this.cancelNetwork()));
    const preset = presetAtlas(atlas.image);
    if (preset) panel.append(button(t("loadPresetRoads"), async () => {
      if (!await Dialog.confirm({ title: t("loadPresetRoads"), content: `<p>${t("confirmPresetRoads")}</p>` })) return;
      this.networkSelection = null; this.networkLastNode = null;
      this.networkApply(draft.transact(data => { data.nodes = structuredClone(preset.nodes); data.edges = structuredClone(preset.edges); }));
    }));
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
      this.routeSummary = `${this.origin.title ?? t("mapStart")} → ${destination.title} · ${route.distanceKm.toFixed(2)} km · ${t("eta")} ${Math.ceil(route.minutes)} min`;
      const polyline = (points, className) => overlay.append(svg("polyline", {
        points: points.map(p => `${p.x * atlas.width},${p.y * atlas.height}`).join(" "), class: className
      }));
      overlay.setAttribute("data-route-mode", this.mode);
      if (this.mode === "av") polyline(route.points, "nd-route-line nd-route-flight");
      else {
        polyline(route.roadPoints, "nd-route-line");
        for (const path of route.accessPaths) if (path.length) polyline(path, "nd-route-line nd-route-access");
      }
      const arrowId = `nd-route-arrow-${foundry.utils.randomID()}`;
      const arrow = svg("marker", { id: arrowId, viewBox: "0 0 10 10", refX: 9, refY: 5,
        markerWidth: 4, markerHeight: 4, orient: "auto", markerUnits: "strokeWidth" });
      arrow.append(svg("path", { d: "M 0 0 L 10 5 L 0 10 Z", fill: "#fff" }));
      const definitions = svg("defs");
      definitions.append(arrow);
      overlay.append(definitions);
      overlay.append(svg("polyline", {
        points: route.points.map(p => `${p.x * atlas.width},${p.y * atlas.height}`).join(" "),
        class: "nd-route-line nd-route-flow", "marker-end": `url(#${arrowId})`
      }));
      panel.append(element("strong", { class: "nd-route-summary", text: this.routeSummary }),
        element("p", { class: "nd-muted", text: t(this.mode === "av" ? "flightEstimate" : "routeEstimate") }));
      if (["car", "bike"].includes(this.mode) && route.accessKm > 0) {
        this.routeAccessSummary = `${t("walkingTransfer")}: ${Math.round(route.accessKm * 1000)} m`;
        panel.append(element("p", { class: "nd-muted", text: this.routeAccessSummary }));
      }
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

  mapPoint(clientX, clientY) {
    if (this.sceneMode) return scenePoint(canvas.stage.worldTransform, canvas.dimensions,
      canvas.app.view.getBoundingClientRect(), clientX, clientY);
    const rect = this.mapElement.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }

  changeDistrictPolygon(district, polygon, drawing = this.districtDrawing) {
    requireGM();
    this.districtHistory ??= [];
    this.districtHistory.push({ polygon: structuredClone(district.polygon), drawing: this.districtDrawing });
    this.districtFuture = [];
    district.polygon = structuredClone(polygon);
    this.districtDrawing = drawing;
    this.draw();
  }

  restoreDistrictPolygon(redo) {
    requireGM();
    const district = this.atlasDraft?.districts.find(item => item.id === this.districtEditing);
    const source = redo ? this.districtFuture : this.districtHistory;
    if (!district || !source?.length) return;
    const target = redo ? (this.districtHistory ??= []) : (this.districtFuture ??= []);
    target.push({ polygon: structuredClone(district.polygon), drawing: this.districtDrawing });
    const state = source.pop();
    district.polygon = state.polygon; this.districtDrawing = state.drawing;
    this.districtPoint = null;
    this.draw();
  }

  deleteDistrictPoint() {
    requireGM();
    const district = this.atlasDraft?.districts.find(item => item.id === this.districtEditing);
    if (!district || !Number.isInteger(this.districtPoint) || (!this.districtDrawing && district.polygon.length <= 3)) return;
    const polygon = district.polygon.filter((_, index) => index !== this.districtPoint);
    this.districtPoint = null;
    this.changeDistrictPolygon(district, polygon);
  }

  drawAtlasEditor(panel, atlas, overlay, markers) {
    panel.append(element("h2", { text: t("configureAtlas") }), element("p", { text: t("atlasHelp") }));
    const form = element("form", { class: "nd-editor" });
    this.atlasDraft ??= structuredClone(atlas);
    const draft = this.atlasDraft;
    for (const [name, label, min, max] of [["width", "mapWidth", 100, 20000], ["height", "mapHeight", 100, 20000], ["kmAcross", "mapKilometers", 0.001, 1000]]) {
      const input = element("input", { name, type: "number", min, max, step: name === "kmAcross" ? "any" : "1", required: true });
      input.value = draft[name];
      input.addEventListener("input", () => { draft[name] = Number(input.value); });
      form.append(element("label", {}, element("span", { text: t(label) }), input));
    }
    const chooser = element("select", { "aria-label": t("districts") });
    chooser.append(element("option", { value: "", text: t("chooseDistrictEdit") }));
    for (const district of draft.districts) chooser.append(element("option", { value: district.id, text: district.name }));
    chooser.value = this.districtEditing ?? "";
    chooser.disabled = Boolean(this.districtDrawing);
    chooser.addEventListener("change", () => {
      this.districtEditing = chooser.value; this.districtDrawing = false;
      this.districtPoint = null; this.districtHistory = []; this.districtFuture = []; this.draw();
    });
    form.append(element("label", {}, element("span", { text: t("editDistrict") }), chooser),
      button(t("addDistrict"), () => {
        const district = { id: `nd-${foundry.utils.randomID()}`, name: t("newDistrict"), threat: "moderate",
          description: "", gangs: [], polygon: [] };
        draft.districts.push(district); this.districtEditing = district.id; this.districtDrawing = true;
        this.districtPoint = null; this.districtHistory = []; this.districtFuture = []; this.draw();
      }, Boolean(this.districtDrawing)));
    const district = draft.districts.find(item => item.id === this.districtEditing);
    if (district) {
      for (const [name, label] of [["name", "title"], ["description", "description"], ["gangs", "gangs"]]) {
        const input = element(name === "description" ? "textarea" : "input", { "aria-label": t(label) });
        input.value = name === "gangs" ? district.gangs.join(", ") : district[name];
        input.addEventListener("input", () => {
          district[name] = name === "gangs" ? input.value.split(",").map(value => value.trim()).filter(Boolean) : input.value;
        });
        form.append(element("label", {}, element("span", { text: t(label) }), input));
      }
      const threat = element("select", { "aria-label": t("threat") });
      for (const level of ["low", "moderate", "high", "extreme"]) threat.append(element("option", { value: level, text: t(level) }));
      threat.value = district.threat;
      threat.addEventListener("change", () => { district.threat = threat.value; });
      form.append(element("label", {}, element("span", { text: t("threat") }), threat),
        element("p", { text: t("districtShapeHelp") }),
        element("p", { class: "nd-muted", text: `${t("pathPoints")}: ${district.polygon.length}` }));
      const finish = button(t(this.districtDrawing ? "finishDistrictShape" : "drawDistrictShape"), async () => {
        if (this.districtDrawing) {
          this.districtDrawing = false; this.draw();
        } else if (await Dialog.confirm({ title: t("drawDistrictShape"), content: `<p>${t("confirmRedrawDistrict")}</p>` })) {
          this.changeDistrictPolygon(district, [], true);
        }
      });
      finish.disabled = this.districtDrawing && district.polygon.length < 3;
      const undo = button(t("undo"), () => this.restoreDistrictPolygon(false));
      undo.disabled = !this.districtHistory?.length;
      const redo = button(t("redo"), () => this.restoreDistrictPolygon(true));
      redo.disabled = !this.districtFuture?.length;
      const remove = button(t("deleteDistrictPoint"), () => this.deleteDistrictPoint());
      remove.disabled = this.districtPoint === null || this.districtPoint === undefined ||
        (!this.districtDrawing && district.polygon.length <= 3);
      form.append(element("div", { class: "nd-road-actions" }, finish, undo, redo, remove),
        button(t("deleteDistrict"), async () => {
          if (!await Dialog.confirm({ title: t("deleteDistrict"), content: `<p>${t("confirmDeleteDistrict")}</p>` })) return;
          draft.districts = draft.districts.filter(item => item.id !== district.id);
          this.districtEditing = ""; this.districtDrawing = false; this.draw();
        }));
      if (district.polygon.length) {
        const outline = svg("polyline", { class: "nd-route-line nd-district-outline" });
        const updateOutline = () => {
          const points = district.polygon.map(point => `${point.x * atlas.width},${point.y * atlas.height}`);
          outline.setAttribute("points", [...points, ...(!this.districtDrawing && points.length > 2 ? [points[0]] : [])].join(" "));
          overlay.querySelector(`[data-district="${district.id}"]`)?.setAttribute("points", points.join(" "));
          overlay.querySelector(`[data-district-halo="${district.id}"]`)?.setAttribute("points", points.join(" "));
        };
        updateOutline();
        overlay.append(outline);
        if (this.districtDrawing) {
          const preview = svg("polyline", { class: "nd-road-guide nd-district-cursor" });
          overlay.append(preview);
          const follow = event => {
            if (event.target !== (this.sceneMode ? canvas.app.view : this.mapElement.querySelector("img"))) {
              preview.setAttribute("points", ""); return;
            }
            const p = this.mapPoint(event.clientX, event.clientY);
            if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) { preview.setAttribute("points", ""); return; }
            const path = [district.polygon.at(-1), p, ...(district.polygon.length > 1 ? [district.polygon[0]] : [])];
            preview.setAttribute("points", path.map(point => `${point.x * atlas.width},${point.y * atlas.height}`).join(" "));
          };
          document.addEventListener("pointermove", follow, true);
          this.districtPreviewCleanup = () => {
            document.removeEventListener("pointermove", follow, true);
            this.districtPreviewCleanup = null;
          };
        }
        const segments = this.districtDrawing ? district.polygon.length - 1 : district.polygon.length;
        for (let index = 0; index < segments; index++) {
          const a = district.polygon[index], b = district.polygon[(index + 1) % district.polygon.length];
          const midpoint = element("button", { type: "button", class: "nd-road-node nd-district-midpoint",
            "aria-label": t("insertDistrictPoint"), title: t("insertDistrictPoint") });
          midpoint.style.left = `${(a.x + b.x) * 50}%`; midpoint.style.top = `${(a.y + b.y) * 50}%`;
          midpoint.disabled = district.polygon.length >= 100;
          midpoint.addEventListener("click", () => {
            this.districtPoint = index + 1;
            const polygon = [...district.polygon];
            polygon.splice(index + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            this.changeDistrictPolygon(district, polygon);
          });
          markers.append(midpoint);
        }
        district.polygon.forEach((point, index) => {
          const marker = element("button", { type: "button",
            class: `nd-road-node nd-road-editor-node nd-district-point${this.districtPoint === index ? " nd-selected" : ""}`,
            "aria-label": `${t("districtPoint")} ${index + 1}`,
            title: this.districtDrawing && index === 0 ? t("finishDistrictShape") : `${t("districtPoint")} ${index + 1}` });
          marker.style.left = `${point.x * 100}%`; marker.style.top = `${point.y * 100}%`;
          marker.addEventListener("click", () => {
            if (this.districtDrawing && index === 0 && district.polygon.length >= 3) {
              this.districtDrawing = false;
            }
            this.districtPoint = index; this.draw();
          });
          marker.addEventListener("pointerdown", event => {
            if (event.button !== 0 || !game.user.isGM) return;
            event.preventDefault(); event.stopPropagation();
            this.districtDragCleanup?.();
            const pointerId = event.pointerId, before = structuredClone(district.polygon);
            const start = this.mapPoint(event.clientX, event.clientY);
            let moved = false;
            const move = next => {
              if (next.pointerId !== pointerId || !game.user.isGM || !this.configuring) return;
              if (!moved && Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) < 3) return;
              moved = true;
              const p = this.mapPoint(next.clientX, next.clientY);
              district.polygon[index] = { x: Math.max(0, Math.min(1, point.x + p.x - start.x)),
                y: Math.max(0, Math.min(1, point.y + p.y - start.y)) };
              marker.style.left = `${district.polygon[index].x * 100}%`;
              marker.style.top = `${district.polygon[index].y * 100}%`;
              updateOutline();
            };
            const cleanup = () => {
              document.removeEventListener("pointermove", move);
              document.removeEventListener("pointerup", finish);
              document.removeEventListener("pointercancel", cancel);
              this.districtDragCleanup = null;
            };
            const finish = next => {
              if (next.pointerId !== pointerId) return;
              cleanup();
              this.districtPoint = index;
              if (moved) {
                const polygon = structuredClone(district.polygon);
                district.polygon = before;
                this.changeDistrictPolygon(district, polygon);
              } else {
                if (this.districtDrawing && index === 0 && district.polygon.length >= 3) this.districtDrawing = false;
                this.draw();
              }
              this.root.querySelector(`[aria-label="${t("districtPoint")} ${index + 1}"]`)?.focus();
            };
            const cancel = next => {
              if (next.pointerId !== pointerId) return;
              cleanup(); district.polygon = before; this.draw();
            };
            this.districtDragCleanup = () => { cleanup(); district.polygon = before; };
            document.addEventListener("pointermove", move);
            document.addEventListener("pointerup", finish);
            document.addEventListener("pointercancel", cancel);
          });
          marker.addEventListener("keydown", event => {
            const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (!offsets[event.key] || !game.user.isGM) return;
            event.preventDefault(); event.stopPropagation();
            const [dx, dy] = offsets[event.key], step = event.shiftKey ? 10 : 1;
            const polygon = structuredClone(district.polygon);
            polygon[index] = { x: Math.max(0, Math.min(1, point.x + dx * step / atlas.width)),
              y: Math.max(0, Math.min(1, point.y + dy * step / atlas.height)) };
            this.districtPoint = index; this.changeDistrictPolygon(district, polygon);
            this.root.querySelector(`[aria-label="${t("districtPoint")} ${index + 1}"]`)?.focus();
          });
          markers.append(marker);
        });
      }
    }
    form.append(element("button", { type: "submit", text: t("saveAtlas") }), button(t("cancel"), () => {
      this.atlasDraft = null;
      this.districtEditing = ""; this.districtDrawing = false;
      this.configuring = false; this.draw();
    }));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        requireGM();
        const data = atlasData(draft);
        if (data.image !== COMMUNITY_MAP) throw new Error(t("mapMismatch"));
        await game.settings.set(ID, "atlases", { ...game.settings.get(ID, "atlases"), [mapFamily(data.image)]: data });
        this.atlasDraft = null; this.districtEditing = ""; this.districtDrawing = false; this.configuring = false;
        this.draw();
      } catch (error) { report(error); }
      finally { submit.disabled = false; }
    });
    panel.append(form);
  }

  drawDossier(panel, place) {
    panel.append(element("p", { class: "nd-eyebrow", text: "LOCATION // DOSSIER" }),
      element("h2", { text: place.title }), colorCategory(element("p", {
        class: `nd-category nd-cat-${place.category}`, text: categoryLabel(categoryInfo(place.category))
      }), place.category));
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
    if (this.routeAccessSummary) panel.append(element("p", { class: "nd-muted", text: this.routeAccessSummary }));
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

  drawCategoryEditor(panel) {
    requireGM();
    const form = element("form", { class: "nd-editor nd-category-editor" });
    panel.append(element("h2", { text: t("manageCategories") }), element("p", { text: t("categoriesHelp") }), form);
    for (const category of this.categoryDraft) {
      const group = element("fieldset", { class: "nd-category-fields" });
      group.style.setProperty("--nd-category", category.color);
      const name = element("input", { name: `category-name-${category.id}`, type: "text", required: true, maxlength: 100 });
      name.value = categoryLabel(category);
      name.addEventListener("input", () => { category.name = name.value; });
      const color = element("input", { name: `category-color-${category.id}`, type: "color", value: category.color });
      color.addEventListener("input", () => {
        category.color = color.value;
        group.style.setProperty("--nd-category", color.value);
      });
      const usage = categoryUsage(category.id);
      const remove = button(t("deleteCategory"), () => {
        requireGM();
        if (categoryUsage(category.id)) throw new Error(t("categoryInUse"));
        if (this.categoryDraft.length < 2) throw new Error(t("lastCategory"));
        this.categoryDraft = this.categoryDraft.filter(item => item.id !== category.id);
        this.draw();
      }, usage > 0 || this.categoryDraft.length < 2);
      remove.setAttribute("title", t(usage ? "categoryInUse" : "deleteCategory"));
      group.append(element("label", {}, element("span", { text: t("categoryName") }), name),
        element("label", {}, element("span", { text: t("categoryColor") }), color),
        element("p", { class: "nd-muted", text: `${usage} ${t("places")}` }), remove);
      form.append(group);
    }
    form.append(button(t("addCategory"), () => {
      requireGM();
      this.categoryDraft.push({ id: `category-${foundry.utils.randomID()}`, name: t("newCategory"), color: "#62e5ee" });
      this.draw();
    }), element("button", { type: "submit", text: t("saveCategories") }), button(t("cancel"), () => {
      this.categoryDraft = null;
      this.draw();
    }));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (this.categorySaving) return;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      this.categorySaving = true;
      try {
        requireGM();
        const next = categoriesData(this.categoryDraft);
        const current = currentCategories();
        if (JSON.stringify(current) !== this.categoryOriginal) throw new Error(t("categoryConflict"));
        for (const category of current) {
          if (!next.some(item => item.id === category.id) && categoryUsage(category.id)) throw new Error(t("categoryInUse"));
        }
        await game.settings.set(ID, "categories", next);
        this.categoryDraft = null;
        this.draw();
      } catch (error) { report(error); }
      finally {
        this.categorySaving = false;
        submit.disabled = false;
      }
    });
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
    const definitions = currentCategories();
    if (!definitions.some(item => item.id === data.category)) {
      category.append(element("option", { value: data.category, text: categoryLabel(categoryInfo(data.category)) }));
      form.append(element("p", { class: "nd-route-error", text: t("invalidCategory") }));
    }
    for (const item of definitions) category.append(element("option", { value: item.id, text: categoryLabel(item) }));
    category.value = data.category;
    category.addEventListener("change", () => {
      data.category = category.value;
      if (this.dossierMarker) colorCategory(this.dossierMarker, data.category);
    });
    form.append(element("label", {}, element("span", { text: t("category") }), category));
    field("description", "description", { multiline: true, maxlength: 12000, rows: 6 });
    const district = element("select", { name: "district" });
    district.append(element("option", { value: "", text: t("noDistrict") }));
    for (const item of currentAtlas().districts) district.append(element("option", { value: item.id, text: item.name }));
    district.value = data.district ?? "";
    district.addEventListener("change", () => { data.district = district.value; });
    form.append(element("label", {}, element("span", { text: t("district") }), district));
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
        delete data.access; delete data.roadNode; this.tracingAccess = false;
        const value = Number(coordinate.value);
        if (this.dossierMarker && coordinate.value !== "" && Number.isFinite(value) && value >= 0 && value <= 1) {
          this.dossierMarker.style[axis === "x" ? "left" : "top"] = `${value * 100}%`;
        }
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
        const place = placeData({ ...values, ...(data.roadNode ? { roadNode: data.roadNode } : {}), ...(data.access ? { access: data.access } : {}),
          mapImage: currentAtlas().image, x: Number(values.x), y: Number(values.y) });
        if (!currentCategories().some(category => category.id === place.category)) throw new Error(t("invalidCategory"));
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
    this.networkKey = event => {
      if (this.configuring && this.districtEditing && game.user.isGM &&
          !event.target?.matches?.("input,textarea,select,[contenteditable=true]")) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault(); this.restoreDistrictPolygon(event.shiftKey);
        } else if (["Delete", "Backspace"].includes(event.key) && Number.isInteger(this.districtPoint)) {
          event.preventDefault(); this.deleteDistrictPoint();
        } else if (event.key === "Escape" && this.districtDrawing) {
          event.preventDefault();
          const district = this.atlasDraft.districts.find(item => item.id === this.districtEditing);
          if (district.polygon.length >= 3) { this.districtDrawing = false; this.draw(); }
        }
        return;
      }
      if (!this.networkDraft || !game.user.isGM || event.target?.matches?.("input,textarea,select,[contenteditable=true]")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const draft = this.networkDraft;
        if (event.shiftKey ? draft.canRedo : draft.canUndo) {
          this.networkSelection = null; this.networkLastNode = null;
          this.networkApply(event.shiftKey ? draft.redo() : draft.undo());
        }
      } else if (["Delete", "Backspace"].includes(event.key) && this.networkSelection) {
        event.preventDefault(); this.deleteNetworkSelection().catch(report);
      }
    };
    this.pick = event => {
      if (event.button !== 0 || event.target !== canvas.app.view ||
          (!this.pickingOrigin && (!game.user.isGM || (!this.editing && !this.roadDraft && !(this.networkDraft && this.networkTool === "draw") && !(this.configuring && this.districtDrawing))))) return;
      try {
        const p = scenePoint(canvas.stage.worldTransform, canvas.dimensions,
          canvas.app.view.getBoundingClientRect(), event.clientX, event.clientY);
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (game.user.isGM && (this.editing || (this.configuring && this.districtDrawing)) && !this.pickingOrigin) {
          this.beginDossierCanvasGesture(event);
          return;
        }
        this.pickPoint(p);
      } catch (error) { report(error); }
    };
  }

  beginDossierCanvasGesture(event) {
    this.scenePickCleanup?.();
    const data = this.editing;
    const districtDraft = this.configuring && this.districtDrawing ? this.atlasDraft : null;
    const active = () => districtDraft ? this.configuring && this.districtDrawing && this.atlasDraft === districtDraft : this.editing === data;
    const pointerId = event.pointerId;
    const rect = canvas.app.view.getBoundingClientRect();
    const { a, b, c, d, tx, ty } = canvas.stage.worldTransform;
    const matrix = { a, b, c, d, tx, ty };
    const dimensions = canvas.dimensions;
    const center = scenePoint(matrix, dimensions, rect, rect.left + rect.width / 2, rect.top + rect.height / 2);
    const centerX = center.x * dimensions.sceneWidth + (dimensions.sceneX ?? 0);
    const centerY = center.y * dimensions.sceneHeight + (dimensions.sceneY ?? 0);
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    let dragged = false;
    const cleanup = () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", cancel, true);
      this.scenePickCleanup = null;
    };
    const move = current => {
      if (current.pointerId !== pointerId) return;
      if (!active() || !game.user.isGM || !canvas.ready) { cleanup(); return; }
      const dx = current.clientX - event.clientX, dy = current.clientY - event.clientY;
      if (!dragged && Math.hypot(dx, dy) < 5) return;
      dragged = true;
      current.preventDefault();
      current.stopImmediatePropagation();
      try {
        canvas.pan({ x: centerX - (matrix.d * dx - matrix.c * dy) / determinant,
          y: centerY - (matrix.a * dy - matrix.b * dx) / determinant, scale: canvas.stage.scale.x });
      } catch (error) { cleanup(); report(error); }
    };
    const finish = current => {
      if (current.pointerId !== pointerId) return;
      cleanup();
      current.preventDefault();
      current.stopImmediatePropagation();
      if (dragged || !active() || !game.user.isGM || !canvas.ready) return;
      try {
        const point = scenePoint(canvas.stage.worldTransform, canvas.dimensions,
          canvas.app.view.getBoundingClientRect(), current.clientX, current.clientY);
        if (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) this.pickPoint(point);
      } catch (error) { report(error); }
    };
    const cancel = current => {
      if (current.pointerId === pointerId) cleanup();
    };
    this.scenePickCleanup = cleanup;
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", cancel, true);
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
      document.addEventListener("keydown", this.networkKey, true);
    }
    this.draw();
    return this;
  }

  draw() {
    if (canvas.scene.background.src !== COMMUNITY_MAP) {
      this.dossierDragCleanup?.();
      this.districtDragCleanup?.();
      this.districtPreviewCleanup?.();
      this.dossierMarker = null;
      this.mapElement = null;
      this.root.replaceChildren(element("p", { class: "nd-route-error", role: "status", text: t("sceneUpdating") }));
      return;
    }
    super.draw();
  }

  async close() {
    this.dossierDragCleanup?.();
    this.districtDragCleanup?.();
    this.districtPreviewCleanup?.();
    this.scenePickCleanup?.();
    if (this.networkDraft?.canUndo) ui.notifications.warn(t("networkDraftLost"));
    this.ticker?.remove(this.tick);
    document.removeEventListener("pointerdown", this.pick, true);
    document.removeEventListener("keydown", this.networkKey, true);
    this.host?.remove();
    this.root = null;
    windows.delete(this);
  }

  updateSceneTransform() {
    if (!this.mapElement || !this.root?.isConnected || !canvas.ready) return;
    const rendererRect = canvas.app.view.getBoundingClientRect();
    const mapViewport = this.mapElement.parentElement;
    const bounds = `${rendererRect.top},${rendererRect.left},${rendererRect.width},${rendererRect.height}`;
    if (this.sceneViewport !== mapViewport || this.sceneViewportBounds !== bounds) {
      Object.assign(mapViewport.style, {
        top: `${rendererRect.top}px`, left: `${rendererRect.left}px`,
        width: `${rendererRect.width}px`, height: `${rendererRect.height}px`
      });
      this.sceneViewport = mapViewport;
      this.sceneViewportBounds = bounds;
    }
    const transform = sceneTransform(canvas.stage.worldTransform, canvas.dimensions,
      rendererRect, mapViewport.getBoundingClientRect());
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
  game.settings.register(ID, "categories", {
    scope: "world", config: false, type: Array, default: structuredClone(DEFAULT_CATEGORIES),
    onChange: () => { for (const board of windows) board.refresh(); }
  });
  game.settings.register(ID, "mapImage", {
    name: "ND.mapImage", hint: "ND.mapHint", scope: "world", config: false,
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
        board.categoryDraft = null;
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
      if (!game.user.isGM) board.categoryDraft = null;
      board.configuring = false;
      board.reviewing = false;
      board.roadDraft = null;
      board.tracingAccess = false;
      if (!game.user.isGM && board.networkDraft) {
        board.networkDraft = null; board.networkSelection = null; board.networkLastNode = null;
      }
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

Hooks.once("ready", async () => {
  try { await migrateCommunityMap(); syncIfGM(); mountSceneBoard(); }
  catch (error) { report(error); }
});
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
